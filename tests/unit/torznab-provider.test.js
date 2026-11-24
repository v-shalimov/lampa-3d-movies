import { describe, expect, it, vi } from 'vitest';
import { torznabSearchResponse } from '../fixtures/torznab-search-response.js';
import { TorznabProvider } from '../../src/providers/torznab-provider.js';

function createResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    text: vi.fn().mockResolvedValue(body),
  };
}

function createProvider(fetchImpl, options = {}) {
  return new TorznabProvider({
    baseUrl: 'https://indexer.example/api',
    apiKey: 'torznab-secret',
    fetchImpl,
    ...options,
  });
}

describe('TorznabProvider', () => {
  it('searches the Torznab API and maps only stereoscopic 3D releases', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse(torznabSearchResponse));
    const provider = createProvider(fetchImpl);

    const releases = await provider.search('Blade Runner 2049');

    const [requestUrl, requestOptions] = fetchImpl.mock.calls[0];
    const url = new URL(requestUrl);

    expect(url.pathname).toBe('/api');
    expect(url.searchParams.get('t')).toBe('search');
    expect(url.searchParams.get('apikey')).toBe('torznab-secret');
    expect(url.searchParams.get('q')).toBe('Blade Runner 2049');
    expect(requestOptions.headers.Accept).toContain('application/rss+xml');

    expect(releases).toHaveLength(4);
    expect(releases.map(({ format }) => format)).toEqual([
      'HALF_SBS',
      'FULL_OU',
      'HALF_OU',
      'UNKNOWN',
    ]);
    expect(releases[0]).toMatchObject({
      providerId: 'torznab',
      providerReleaseId: 'dddddddddddddddddddddddddddddddddddddddd',
      title: 'Blade Runner 2049 3D Half-SBS 1080p BluRay',
      format: 'HALF_SBS',
      resolution: '1080p',
      sizeBytes: 14_500_000_000,
      seeders: 31,
      url: 'magnet:?xt=urn:btih:dddddddddddddddddddddddddddddddddddddddd',
    });
  });

  it('supports a custom provider ID and optional category', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse('<rss><channel></channel></rss>'));
    const provider = createProvider(fetchImpl, {
      id: 'prowlarr-indexer',
      category: 'Movies/3D',
    });

    await provider.search('Dune');

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get('cat')).toBe('Movies/3D');
    expect(provider.id).toBe('prowlarr-indexer');
  });

  it('passes AbortSignal to fetch', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse('<rss><channel></channel></rss>'));
    const provider = createProvider(fetchImpl);
    const controller = new AbortController();

    await provider.search('Dune', { signal: controller.signal });

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('returns an empty array for an empty feed', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse('<rss><channel></channel></rss>')),
    );

    await expect(provider.search('Unknown')).resolves.toEqual([]);
  });

  it('preserves CDATA text in titles', async () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[Film & Film 3D HSBS 1080p]]></title>
      <guid>urn:release:one</guid>
    </item></channel></rss>`;
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse(xml)),
    );

    const [release] = await provider.search('Film');

    expect(release.title).toBe('Film & Film 3D HSBS 1080p');
    expect(release.format).toBe('HALF_SBS');
  });

  it('rejects unsuccessful HTTP responses', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse('', { ok: false, status: 401 })),
    );

    await expect(provider.search('Dune')).rejects.toThrow(
      'Torznab request failed with HTTP 401',
    );
  });

  it('rejects a non-RSS or malformed XML response', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse('<not-rss/>')),
    );

    await expect(provider.search('Dune')).rejects.toThrow(
      'Torznab response must be a valid RSS XML feed',
    );
  });

  it('rejects invalid configuration', () => {
    expect(() => new TorznabProvider({
      baseUrl: 'ftp://indexer.example/api',
      apiKey: 'key',
    })).toThrow('Torznab baseUrl must use HTTP or HTTPS');

    expect(() => new TorznabProvider({
      baseUrl: 'https://indexer.example/api',
      apiKey: '',
    })).toThrow('Torznab apiKey must be a non-empty string');
  });

  it('integrates with SearchService', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse(torznabSearchResponse)),
    );
    const { SearchService } = await import('../../src/services/search-service.js');
    const service = new SearchService([provider]);

    const result = await service.search('Blade Runner 2049');

    expect(result.errors).toEqual([]);
    expect(result.releases).toHaveLength(4);
    expect(result.releases.every((release) => release.providerId === 'torznab')).toBe(true);
  });
  it('decodes XML entities in ordinary element text', async () => {
    const xml = '<rss><channel><item><title>Film &amp; Film 3D HSBS</title><guid>urn:release:two</guid></item></channel></rss>';
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse(xml)),
    );

    const [release] = await provider.search('Film');

    expect(release.title).toBe('Film & Film 3D HSBS');
  });

  it('rejects an incomplete RSS document', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse('<rss><channel></channel>')),
    );

    await expect(provider.search('Dune')).rejects.toThrow(
      'Torznab response must be a valid RSS XML feed',
    );
  });

});
