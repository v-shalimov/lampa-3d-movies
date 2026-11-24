import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { detect3DFormat } from '../domain/format-detector.js';
import { createRelease } from '../domain/release.js';

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  cdataPropName: '#cdata',
  parseAttributeValue: false,
  trimValues: true,
  processEntities: true,
  isArray: (_tagName, path) => (
    path === 'rss.channel.item' || path === 'rss.channel.item.torznab:attr'
  ),
});

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Torznab ${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function getText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (value && typeof value === 'object') {
    const text = value['#text'] ?? value['#cdata'];
    return typeof text === 'string' ? text.trim() : null;
  }

  return null;
}

function getTorznabAttribute(item, name) {
  const attributes = item['torznab:attr'] ?? item.attr ?? [];
  const list = Array.isArray(attributes) ? attributes : [attributes];
  const match = list.find((attribute) => (
    attribute?.['@_name']?.toLowerCase() === name.toLowerCase()
  ));

  return match?.['@_value'] ?? null;
}

function optionalNonNegativeInteger(value) {
  if (value == null || String(value).trim() === '') {
    return null;
  }

  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function detectResolution(title) {
  const match = title.match(/(?:^|[^a-z0-9])(4320p|2160p|1440p|1080p|720p|576p|480p)(?=$|[^a-z0-9])/i);
  return match ? match[1].toLowerCase() : null;
}

function mapItem(item, providerId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const title = getText(item.title);
  if (!title) {
    return null;
  }

  const detection = detect3DFormat(title);
  if (!detection.is3D) {
    return null;
  }

  const guid = getText(item.guid);
  const link = getText(item.link);
  const enclosure = item.enclosure ?? {};
  const enclosureUrl = enclosure['@_url'] ?? null;
  const magnetUrl = getTorznabAttribute(item, 'magneturl');
  const infoHash = getTorznabAttribute(item, 'infohash');
  const providerReleaseId = infoHash || guid || enclosureUrl || link;

  if (!providerReleaseId) {
    return null;
  }

  const magnet = [magnetUrl, enclosureUrl, link]
    .find((value) => typeof value === 'string' && value.startsWith('magnet:')) ?? null;
  const size = getTorznabAttribute(item, 'size') ?? enclosure['@_length'];

  return createRelease({
    providerId,
    providerReleaseId,
    title,
    format: detection.format,
    resolution: detectResolution(title),
    sizeBytes: optionalNonNegativeInteger(size),
    seeders: optionalNonNegativeInteger(getTorznabAttribute(item, 'seeders')),
    url: magnet || link || null,
  });
}

function parseFeed(xml, providerId) {
  if (typeof xml !== 'string' || XMLValidator.validate(xml) !== true) {
    throw new TypeError('Torznab response must be a valid RSS XML feed');
  }

  const parsed = xmlParser.parse(xml);
  const channel = parsed?.rss?.channel;

  if (!channel || typeof channel !== 'object') {
    throw new TypeError('Torznab response must be a valid RSS XML feed');
  }

  const items = channel.item ?? [];
  const list = Array.isArray(items) ? items : [items];

  return list
    .map((item) => mapItem(item, providerId))
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
