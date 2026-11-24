import { describe, expect, it } from 'vitest';
import { createRelease } from '../../src/domain/release.js';

const validRelease = {
  providerId: 'example-tracker',
  providerReleaseId: 'release-123',
  title: 'Avatar (2009) 3D Half-SBS',
  format: 'HALF_SBS',
};

describe('createRelease', () => {
  it('creates a normalized release and fills absent metadata with null', () => {
    expect(createRelease(validRelease)).toEqual({
      providerId: 'example-tracker',
      providerReleaseId: 'release-123',
      title: 'Avatar (2009) 3D Half-SBS',
      format: 'HALF_SBS',
      resolution: null,
      sizeBytes: null,
      seeders: null,
      url: null,
      videoCodec: null,
      audioCodec: null,
      audioLanguages: [],
      bitrateMbps: null,
      source: null,
      hdr: null,
      tracker: null,
      trackerId: null,
    });
  });

  it('preserves supplied optional metadata', () => {
    expect(createRelease({
      ...validRelease,
      resolution: '1080p',
      sizeBytes: 12_345_678,
      seeders: 42,
      url: 'https://tracker.example/torrent/123',
    })).toMatchObject({
      resolution: '1080p',
      sizeBytes: 12_345_678,
      seeders: 42,
      url: 'https://tracker.example/torrent/123',
    });
  });

  it('trims required string fields', () => {
    expect(createRelease({
      providerId: ' example-tracker ',
      providerReleaseId: ' release-123 ',
      title: ' Avatar ',
      format: 'FULL_SBS',
    })).toMatchObject({
      providerId: 'example-tracker',
      providerReleaseId: 'release-123',
      title: 'Avatar',
    });
  });

  it.each(['HALF_SBS', 'FULL_SBS', 'HALF_OU', 'FULL_OU', 'UNKNOWN'])(
    'accepts supported format %s',
    (format) => {
      expect(createRelease({ ...validRelease, format }).format).toBe(format);
    },
  );

  it('returns an immutable release object', () => {
    const release = createRelease(validRelease);

    expect(Object.isFrozen(release)).toBe(true);
  });

  it.each([null, undefined, 'invalid', 42])(
    'rejects a non-object input: %s',
    (input) => {
      expect(() => createRelease(input)).toThrow(TypeError);
    },
  );

  it.each(['providerId', 'providerReleaseId', 'title', 'format'])(
    'rejects a missing required field: %s',
    (field) => {
      const input = { ...validRelease };
      delete input[field];

      expect(() => createRelease(input)).toThrow(TypeError);
    },
  );

  it.each(['providerId', 'providerReleaseId', 'title'])(
    'rejects a blank required field: %s',
    (field) => {
      expect(() => createRelease({ ...validRelease, [field]: '   ' })).toThrow(TypeError);
    },
  );

  it('rejects an unsupported 3D format', () => {
    expect(() => createRelease({ ...validRelease, format: 'MVC' })).toThrow(TypeError);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1024'])(
    'rejects an invalid sizeBytes value: %s',
    (sizeBytes) => {
      expect(() => createRelease({ ...validRelease, sizeBytes })).toThrow(TypeError);
    },
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '10'])(
    'rejects an invalid seeders value: %s',
    (seeders) => {
      expect(() => createRelease({ ...validRelease, seeders })).toThrow(TypeError);
    },
  );

  it('rejects non-string resolution metadata', () => {
    expect(() => createRelease({ ...validRelease, resolution: 1080 })).toThrow(TypeError);
  });

  it('rejects non-string URLs', () => {
    expect(() => createRelease({ ...validRelease, url: 123 })).toThrow(TypeError);
  });
});
