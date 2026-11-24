import { describe, expect, it, vi } from 'vitest';
import { ProwlarrProvider } from '../../src/providers/prowlarr-provider.js';

const response = [
  {
    protocol: 'torrent',
    title: 'Dune Part Two 2024 3D Half-SBS 1080p',
    guid: 'https://indexer.example/guid/1',
    downloadUrl: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    size: 12_345_678,
    seeders: 24,
  },
  {
    protocol: 'usenet',
    title: 'Dune Part Two 2024 3D Half-SBS 1080p',
    guid: 'usenet-guid',
    downloadUrl: 'https://indexer.example/nzb/1',
  },
  {
    protocol: 'torrent',
    title: 'Dune Part Two 2024 1080p',
    guid: 'ordinary-movie',
    downloadUrl: 'magnet:?xt=urn:btih:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  },
  {
    protocol: 'torrent',
    title: 'Dune Part Two 2024 3D Half-SBS 1080p',
    guid: 'missing-url',
  },
];

function makeResponse(payload, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => payload,
  };
}

describe('ProwlarrProvider', () => {
  it('uses the built-in LAMPA Prowlarr search endpoint and maps 3D torrent results', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse(response));
    const provider = new ProwlarrProvider({
      id: 'prowlarr-primary',
      baseUrl: 'http://prowlarr.local:9696/',
      apiKey: 'secret-key',
      fetchImpl,
    });

    const releases = await provider.search('Dune Part Two');

    expect(fetchImpl).toHaveBeenCalledWith(
      'http://prowlarr.local:9696/api/v1/search?apikey=secret-key&query=Dune%20Part%20Two',
      expect.objectContaining({ method: 'GET', signal: undefined }),
    );
    expect(releases).toHaveLength(1);
    expect(releases[0]).toMatchObject({
      providerId: 'prowlarr-primary',
      providerReleaseId: '0123456789abcdef0123456789abcdef01234567',
      title: 'Dune Part Two 2024 3D Half-SBS 1080p',
      format: 'HALF_SBS',
      resolution: '1080p',
      sizeBytes: 12_345_678,
      seeders: 24,
      url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    });
  });

  it('preserves a reverse-proxy subpath in the configured base URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([]));
    const provider = new ProwlarrProvider({
      baseUrl: 'https://media.example/prowlarr/',
      apiKey: 'key',
      fetchImpl,
    });

    await provider.search('Avatar');

    expect(fetchImpl.mock.calls[0][0]).toBe(
      'https://media.example/prowlarr/api/v1/search?apikey=key&query=Avatar',
    );
  });

  it('falls back to the Prowlarr GUID when the download URL has no BTIH hash', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(makeResponse([{
      protocol: 'torrent',
      title: 'Avatar 2009 3D Full-OU 1080p',
      guid: 'https://indexer.example/release/42',
      downloadUrl: 'https://indexer.example/download/42',
    }]));
    const provider = new ProwlarrProvider({
      baseUrl: 'https://prowlarr.example',
      apiKey: 'key',
      fetchImpl,
    });

    const [release] = await provider.search('Avatar');

    expect(release.providerReleaseId).toBe('https://indexer.example/release/42');
    expect(release.url).toBe('https://indexer.example/download/42');
  });

  it('rejects non-array responses and HTTP errors', async () => {
    const invalid = new ProwlarrProvider({
      baseUrl: 'https://prowlarr.example',
      apiKey: 'key',
      fetchImpl: vi.fn().mockResolvedValue(makeResponse({ results: [] })),
    });

    await expect(invalid.search('Avatar')).rejects.toThrow(/must be an array/);

    const failed = new ProwlarrProvider({
      baseUrl: 'https://prowlarr.example',
      apiKey: 'key',
      fetchImpl: vi.fn().mockResolvedValue(makeResponse(null, false, 503)),
    });

    await expect(failed.search('Avatar')).rejects.toThrow(/HTTP 503/);
  });

  it('validates its configuration', () => {
    expect(() => new ProwlarrProvider()).toThrow(TypeError);
    expect(() => new ProwlarrProvider({
      baseUrl: 'ftp://prowlarr.example',
      apiKey: 'key',
    })).toThrow(TypeError);
  });
});
