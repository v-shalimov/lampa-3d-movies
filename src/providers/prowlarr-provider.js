import { detect3DFormat } from '../domain/format-detector.js';
import { createRelease } from '../domain/release.js';

function requiredString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Prowlarr ${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function optionalNonNegativeInteger(value) {
  if (value == null || String(value).trim() === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function extractInfoHash(url) {
  const match = url.match(/btih:([a-f0-9]{40})/i);
  return match ? match[1].toLowerCase() : null;
}

function detectResolution(title) {
  const match = title.match(/(?:^|[^a-z0-9])(4320p|2160p|1440p|1080p|720p|576p|480p)(?=$|[^a-z0-9])/i);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Prowlarr adapter using the same /api/v1/search endpoint as LAMPA's built-in
 * Prowlarr parser. It intentionally keeps only torrent results with a usable
 * download URL and a detected stereoscopic 3D layout.
 */
export class ProwlarrProvider {
  constructor({
    baseUrl,
    apiKey,
    id = 'prowlarr',
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.baseUrl = requiredString(baseUrl, 'baseUrl').replace(/\/+$/, '');
    let parsedBaseUrl;

    try {
      parsedBaseUrl = new URL(this.baseUrl);
    } catch {
      throw new TypeError('Prowlarr baseUrl must be a valid URL');
    }

    if (parsedBaseUrl.protocol !== 'http:' && parsedBaseUrl.protocol !== 'https:') {
      throw new TypeError('Prowlarr baseUrl must use HTTP or HTTPS');
    }

    this.apiKey = typeof apiKey === 'string' ? apiKey.trim() : '';
    this.id = requiredString(id, 'id');

    if (typeof fetchImpl !== 'function') {
      throw new TypeError('Prowlarr fetch implementation must be a function');
    }

    this.fetchImpl = fetchImpl;
  }

  async search(query, { signal } = {}) {
    const normalizedQuery = requiredString(query, 'query');
    const url = `${this.baseUrl}/api/v1/search?apikey=${encodeURIComponent(this.apiKey)}&query=${encodeURIComponent(normalizedQuery)}`;

    const response = await this.fetchImpl(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
    });

    if (!response || response.ok !== true) {
      const status = response?.status ?? 'unknown';
      throw new Error(`Prowlarr request failed with HTTP ${status}`);
    }

    const payload = await response.json();
    if (!Array.isArray(payload)) {
      throw new TypeError('Prowlarr response must be an array');
    }

    return payload.reduce((releases, item) => {
      if (!item || typeof item !== 'object' || item.protocol !== 'torrent') return releases;

      const title = typeof item.title === 'string' ? item.title.trim() : '';
      const downloadUrl = typeof item.downloadUrl === 'string' ? item.downloadUrl.trim() : '';
      if (!title || !downloadUrl) return releases;

      const detection = detect3DFormat(title);
      if (!detection.is3D) return releases;

      const providerReleaseId = extractInfoHash(downloadUrl) || (
        typeof item.guid === 'string' && item.guid.trim()
      ) || downloadUrl;

      releases.push(createRelease({
        providerId: this.id,
        providerReleaseId,
        title,
        format: detection.format,
        resolution: detectResolution(title),
        sizeBytes: optionalNonNegativeInteger(item.size),
        seeders: optionalNonNegativeInteger(item.seeders),
        url: downloadUrl,
      }));

      return releases;
    }, []);
  }
}
