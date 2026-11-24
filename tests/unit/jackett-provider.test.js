import { describe, expect, it, vi } from 'vitest';
import { jackettSearchResponse } from '../fixtures/jackett-search-response.js';
import { JackettProvider } from '../../src/providers/jackett-provider.js';

function createResponse(body, options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: vi.fn().mockResolvedValue(body),
  };
}

function createProvider(fetchImpl) {
  return new JackettProvider({
    baseUrl: 'http://localhost:9117/',
    apiKey: 'secret-key',
    fetchImpl,
  });
}

describe('JackettProvider', () => {
  it('searches Jackett JSON API and maps only stereoscopic 3D releases', async () => {
    const response = createResponse(jackettSearchResponse);
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const provider = createProvider(fetchImpl);

    const releases = await provider.search('Avatar');

    expect(fetchImpl).toHaveBeenCalledOnce();
    const [requestUrl, requestOptions] = fetchImpl.mock.calls[0];
    const url = new URL(requestUrl);

    expect(url.pathname).toBe('/api/v2.0/indexers/all/results');
    expect(url.searchParams.get('apikey')).toBe('secret-key');
    expect(url.searchParams.get('Query')).toBe('Avatar');
    expect(requestOptions.method).toBe('GET');

    expect(releases).toHaveLength(3);
    expect(releases.map(({ format }) => format)).toEqual([
      'HALF_SBS',
      'FULL_SBS',
      'HALF_OU',
    ]);
    expect(releases[0]).toMatchObject({
      providerId: 'jackett',
      providerReleaseId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      title: 'Avatar (2009) 3D Half-SBS 1080p BluRay',
      format: 'HALF_SBS',
      resolution: '1080p',
      sizeBytes: 12_345_678_901,
      seeders: 42,
      tracker: 'Example Tracker',
      url: 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });
  });

  it('supports an AbortSignal passed by SearchService', async () => {
    const response = createResponse({ Results: [] });
    const fetchImpl = vi.fn().mockResolvedValue(response);
    const provider = createProvider(fetchImpl);
    const controller = new AbortController();

    await provider.search('Avatar', { signal: controller.signal });

    expect(fetchImpl.mock.calls[0][1].signal).toBe(controller.signal);
  });

  it('supports a selected indexer and a custom provider ID', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(createResponse({ Results: [] }));
    const provider = new JackettProvider({
      baseUrl: 'https://jackett.example',
      apiKey: 'key',
      indexer: 'rutracker',
      id: 'home-jackett',
      fetchImpl,
    });

    await provider.search('Dune');

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe('/api/v2.0/indexers/rutracker/results');
    expect(provider.id).toBe('home-jackett');
  });

  it('returns an empty array when Jackett has no results', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse({ Results: [] })),
    );

    await expect(provider.search('Unknown')).resolves.toEqual([]);
  });

  it('rejects an unsuccessful HTTP response', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse({}, { ok: false, status: 503 })),
    );

    await expect(provider.search('Avatar')).rejects.toThrow(
      'Jackett request failed with HTTP 503',
    );
  });

  it('rejects a malformed response payload', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse({ Results: 'not-an-array' })),
    );

    await expect(provider.search('Avatar')).rejects.toThrow(
      'Jackett response must contain a Results array',
    );
  });

  it('rejects invalid configuration', () => {
    expect(() => new JackettProvider({
      baseUrl: 'file:///tmp/jackett',
      apiKey: 'key',
    })).toThrow('Jackett baseUrl must use HTTP or HTTPS');

    expect(() => new JackettProvider({
      baseUrl: 'http://localhost:9117',
      apiKey: '',
    })).not.toThrow();
  });

  it('does not treat a Guid details page as a playable torrent URL', async () => {
    const provider = createProvider(vi.fn().mockResolvedValue(createResponse({
      Results: [{
        Title: 'Dune (2021) 3D HSBS',
        Guid: 'https://tracker.example/details/42',
      }],
    })));

    await expect(provider.search('Dune')).resolves.toEqual([]);
  });
  it('works with SearchService as a real provider adapter', async () => {
    const provider = createProvider(
      vi.fn().mockResolvedValue(createResponse(jackettSearchResponse)),
    );
    const { SearchService } = await import('../../src/services/search-service.js');
    const service = new SearchService([provider]);

    const result = await service.search('Avatar');

    expect(result.errors).toEqual([]);
    expect(result.releases).toHaveLength(3);
    expect(result.releases.every((release) => release.providerId === 'jackett')).toBe(true);
  });

});
