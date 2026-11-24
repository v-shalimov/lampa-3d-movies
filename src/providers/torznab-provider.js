import { detect3DFormat } from '../domain/format-detector.js';
import { createRelease } from '../domain/release.js';

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Torznab ${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function decodeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

function extractText(xml, tagName) {
  const expression = new RegExp(
    `<(?:[\\w.-]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tagName}\\s*>`,
    'i',
  );
  const match = xml.match(expression);

  if (!match) {
    return null;
  }

  const content = match[1].trim();
  const cdata = content.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);

  return cdata ? cdata[1] : decodeXml(content);
}

function extractAttribute(xml, tagName, attributeName) {
  const tag = new RegExp(
    `<(?:[\\w.-]+:)?${tagName}\\b([^>]*)/?>`,
    'i',
  ).exec(xml);

  if (!tag) {
    return null;
  }

  const attribute = new RegExp(
    `(?:^|\\s)${attributeName}\\s*=\\s*(["'])([\\s\\S]*?)\\1`,
    'i',
  ).exec(tag[1]);

  return attribute ? decodeXml(attribute[2]) : null;
}

function extractTorznabAttribute(itemXml, name) {
  const attributes = [...itemXml.matchAll(
    /<(?:[\w.-]+:)?attr\b([^>]*)\/?\s*>/gi,
  )];

  for (const match of attributes) {
    const attrName = extractAttribute(match[0], 'attr', 'name');
    if (attrName?.toLowerCase() === name.toLowerCase()) {
      return extractAttribute(match[0], 'attr', 'value');
    }
  }

  return null;
}

function optionalNonNegativeInteger(value) {
  if (value == null || value.trim() === '') {
    return null;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function detectResolution(title) {
  const match = title.match(/(?:^|[^a-z0-9])(4320p|2160p|1440p|1080p|720p|576p|480p)(?=$|[^a-z0-9])/i);
  return match ? match[1].toLowerCase() : null;
}

function mapItem(itemXml, providerId) {
  const title = extractText(itemXml, 'title');
  if (!title) {
    return null;
  }

  const detection = detect3DFormat(title);
  if (!detection.is3D) {
    return null;
  }

  const guid = extractText(itemXml, 'guid');
  const link = extractText(itemXml, 'link');
  const enclosureUrl = extractAttribute(itemXml, 'enclosure', 'url');
  const magnetUrl = extractTorznabAttribute(itemXml, 'magneturl');
  const infoHash = extractTorznabAttribute(itemXml, 'infohash');
  const providerReleaseId = infoHash || guid || enclosureUrl || link;

  if (!providerReleaseId) {
    return null;
  }

  const magnet = [magnetUrl, enclosureUrl, link]
    .find((value) => typeof value === 'string' && value.startsWith('magnet:')) ?? null;
  const size = extractTorznabAttribute(itemXml, 'size')
    ?? extractAttribute(itemXml, 'enclosure', 'length');

  return createRelease({
    providerId,
    providerReleaseId,
    title,
    format: detection.format,
    resolution: detectResolution(title),
    sizeBytes: optionalNonNegativeInteger(size),
    seeders: optionalNonNegativeInteger(extractTorznabAttribute(itemXml, 'seeders')),
    url: magnet || link || guid || null,
  });
}

function parseFeed(xml, providerId) {
  if (
    typeof xml !== 'string'
    || !/<rss\b[^>]*>/i.test(xml)
    || !/<\/rss\s*>/i.test(xml)
    || !/<channel\b[^>]*>/i.test(xml)
    || !/<\/channel\s*>/i.test(xml)
  ) {
    throw new TypeError('Torznab response must be a valid RSS XML feed');
  }

  const items = [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item\s*>/gi)];
  return items
    .map(([fullMatch]) => mapItem(fullMatch, providerId))
    .filter(Boolean);
}

/**
 * Generic Torznab RSS/XML search adapter.
 *
 * baseUrl is the complete Torznab API endpoint, for example
 * https://indexer.example/api. API credentials are supplied at runtime.
 */
export class TorznabProvider {
  constructor({
    baseUrl,
    apiKey,
    id = 'torznab',
    category,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.baseUrl = requiredString(baseUrl, 'baseUrl').replace(/\/+$/, '');
    let parsedBaseUrl;

    try {
      parsedBaseUrl = new URL(this.baseUrl);
    } catch {
      throw new TypeError('Torznab baseUrl must be a valid URL');
    }

    if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
      throw new TypeError('Torznab baseUrl must use HTTP or HTTPS');
    }

    this.apiKey = requiredString(apiKey, 'apiKey');
    this.id = requiredString(id, 'id');

    if (category !== undefined && (
      typeof category !== 'string' || category.trim().length === 0
    )) {
      throw new TypeError('Torznab category must be a non-empty string when provided');
    }
    this.category = category?.trim() ?? null;

    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Torznab fetch implementation must be a function');
    }
    this.fetchImpl = fetchImpl;
  }

  async search(query, { signal } = {}) {
    const normalizedQuery = requiredString(query, 'query');
    const url = new URL(this.baseUrl);
    url.searchParams.set('t', 'search');
    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('q', normalizedQuery);

    if (this.category) {
      url.searchParams.set('cat', this.category);
    }

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: {
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
      signal,
    });

    if (!response || response.ok !== true) {
      const status = response?.status ?? 'unknown';
      throw new Error(`Torznab request failed with HTTP ${status}`);
    }

    return parseFeed(await response.text(), this.id);
  }
}
