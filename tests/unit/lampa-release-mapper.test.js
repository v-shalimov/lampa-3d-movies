import { describe, expect, it } from 'vitest';
import { mapReleaseToLampaTorrent } from '../../src/lampa/release-mapper.js';

const release = Object.freeze({
  providerId: 'jackett-home',
  providerReleaseId: 'release-123',
  title: 'Avatar (2009) 3D Half-SBS 1080p',
  format: 'HALF_SBS',
  resolution: '1080p',
  sizeBytes: 12_345_678,
  seeders: 42,
  url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
});

describe('mapReleaseToLampaTorrent', () => {
  it('maps a magnet URI to MagnetUri and preserves the display title', () => {
    expect(mapReleaseToLampaTorrent(release)).toEqual({
      title: release.title,
      Title: release.title,
      MagnetUri: release.url,
      Seeders: 42,
      Size: 12_345_678,
    });
  });

  it('maps a torrent download URL to Link instead of MagnetUri', () => {
    const mapped = mapReleaseToLampaTorrent({
      ...release,
      url: 'https://tracker.example/download/123.torrent',
    });

    expect(mapped).toMatchObject({
      title: release.title,
      Title: release.title,
      Link: 'https://tracker.example/download/123.torrent',
    });
    expect(mapped).not.toHaveProperty('MagnetUri');
  });

  it('omits optional metadata when it is null', () => {
    const mapped = mapReleaseToLampaTorrent({
      ...release,
      seeders: null,
      sizeBytes: null,
    });

    expect(mapped).not.toHaveProperty('Seeders');
    expect(mapped).not.toHaveProperty('Size');
  });

  it('rejects a release without a usable URL', () => {
    expect(() => mapReleaseToLampaTorrent({ ...release, url: null })).toThrow(TypeError);
    expect(() => mapReleaseToLampaTorrent({ ...release, url: '   ' })).toThrow(TypeError);
  });

  it('does not mutate the immutable domain release', () => {
    expect(() => mapReleaseToLampaTorrent(release)).not.toThrow();
    expect(Object.isFrozen(release)).toBe(true);
    expect(release).toEqual({
      providerId: 'jackett-home',
      providerReleaseId: 'release-123',
      title: 'Avatar (2009) 3D Half-SBS 1080p',
      format: 'HALF_SBS',
      resolution: '1080p',
      sizeBytes: 12_345_678,
      seeders: 42,
      url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
    });
  });

  it('rejects an invalid release input', () => {
    expect(() => mapReleaseToLampaTorrent(null)).toThrow(TypeError);
    expect(() => mapReleaseToLampaTorrent({ title: 'No URL' })).toThrow(TypeError);
  });
});
