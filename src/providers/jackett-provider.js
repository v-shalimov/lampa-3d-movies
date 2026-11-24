import { detect3DFormat } from '../domain/format-detector.js';
import { createRelease } from '../domain/release.js';
import { parseReleaseMetadata } from '../domain/release-metadata.js';

const DEFAULT_INDEXER = 'all';

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Jackett ${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function optionalNonNegativeInteger(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const number = typeof value === 'number' ? value : Number(value);

  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function detectResolution(title) {
  const match = title.match(/(?:^|[^a-z0-9])(4320p|2160p|1440p|1080p|720p|576p|480p)(?=$|[^a-z0-9])/i);
  return match ? match[1].toLowerCase() : null;
}

function mapResult(item, providerId) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return null;
  }

  const title = typeof item.Title === 'string' ? item.Title.trim() : '';
  if (!title) {
    return null;
  }

  const detection = detect3DFormat(title);
  if (!detection.is3D) {
    return null;
  }

  const magnetUri = typeof item.MagnetUri === 'string' ? item.MagnetUri.trim() : '';
  const link = typeof item.Link === 'string' ? item.Link.trim() : '';
  const guid = typeof item.Guid === 'string' ? item.Guid.trim() : '';
  const infoHash = typeof item.InfoHash === 'string' ? item.InfoHash.trim() : '';
  const providerReleaseId = infoHash || guid || magnetUri || link;

  if (!providerReleaseId || (!magnetUri && !link)) {
    return null;
  }

  return createRelease({
    providerId,
    providerReleaseId,
    title,
    format: detection.format,
    resolution: detectResolution(title),
    ...parseReleaseMetadata(title, item.Description),
    tracker: typeof item.Tracker === 'string' ? item.Tracker : null,
    trackerId: typeof item.TrackerId === 'string' ? item.TrackerId : null,
    sizeBytes: optionalNonNegativeInteger(item.Size),
    seeders: optionalNonNegativeInteger(item.Seeders),
    url: magnetUri || link,
  });
}

/**
 * Jackett adapter using its JSON search endpoint.
 *
 * baseUrl is the Jackett server URL (for example http://localhost:9117).
 * API credentials are kept in configuration and are never included in errors.
 */
export class JackettProvider {
  constructor({
    baseUrl,
    apiKey,
    indexer = DEFAULT_INDEXER,
    id = 'jackett',
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.baseUrl = requiredString(baseUrl, 'baseUrl').replace(/\/+$/, '');
    let parsedBaseUrl;

    try {
      parsedBaseUrl = new URL(this.baseUrl);
    } catch {
      throw new TypeError('Jackett baseUrl must be a valid URL');
    }

    if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
      throw new TypeError('Jackett baseUrl must use HTTP or HTTPS');
    }

    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.indexer = requiredString(indexer, 'indexer');
    this.id = requiredString(id, 'id');

    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Jackett fetch implementation must be a function');
    }

    this.fetchImpl = fetchImpl;
  }

  async listIndexers({ signal } = {}) {
    const url = new URL(`${this.baseUrl}/api/v2.0/indexers`);
    if (this.apiKey) url.searchParams.set('apikey', this.apiKey);

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response || response.ok !== true) {
      const status = response?.status ?? 'unknown';
      throw new Error(`Jackett indexer list failed with HTTP ${status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new TypeError('Jackett indexer list must be an array');
    }

    return payload
      .filter((item) => item && typeof item === 'object')
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        name: typeof item.name === 'string' ? item.name : (
          typeof item.title === 'string' ? item.title : ''
        ),
        configured: item.configured !== false,
        status: typeof item.status === 'string' ? item.status : null,
      }))
      .filter((item) => item.id && item.name);
  }

  async search(query, { signal } = {}) {
    const normalizedQuery = requiredString(query, 'query');
    const url = new URL(
      `${this.baseUrl}/api/v2.0/indexers/${encodeURIComponent(this.indexer)}/results`,
    );

    url.searchParams.set('apikey', this.apiKey);
    url.searchParams.set('Query', normalizedQuery);

    const response = await this.fetchImpl(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response || response.ok !== true) {
      const status = response?.status ?? 'unknown';
      throw new Error(`Jackett request failed with HTTP ${status}`);
    }

    const payload = await response.json();
    if (!payload || !Array.isArray(payload.Results)) {
      throw new TypeError('Jackett response must contain a Results array');
    }

    return payload.Results
      .map((item) => mapResult(item, this.id))
      .filter(Boolean);
  }
}
