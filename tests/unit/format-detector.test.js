import { describe, expect, it } from 'vitest';
import { detect3DFormat } from '../../src/domain/format-detector.js';

describe('detect3DFormat', () => {
  it.each([
    ['Avatar.2009.1080p.BluRay.3D.Half-SBS.mkv', 'HALF_SBS'],
    ['Avatar.2009.1080p.BluRay.3D.Full-SBS.mkv', 'FULL_SBS'],
    ['Avatar.2009.1080p.BluRay.3D.Half-OU.mkv', 'HALF_OU'],
    ['Avatar.2009.1080p.BluRay.3D.Full-OU.mkv', 'FULL_OU'],
  ])('detects %s as %s', (releaseName, format) => {
    expect(detect3DFormat(releaseName)).toEqual({
      is3D: true,
      format,
      confidence: 1,
    });
  });

  it.each([
    ['Avatar (2009) [HSBS].mkv', 'HALF_SBS'],
    ['Avatar.2009.1080p.BluRay.3D.FSBS.mkv', 'FULL_SBS'],
    ['Avatar (2009) [HOU].mkv', 'HALF_OU'],
    ['Avatar.2009.1080p.BluRay.3D.FOU.mkv', 'FULL_OU'],
  ])('recognizes the common shorthand in %s as %s', (releaseName, format) => {
    expect(detect3DFormat(releaseName)).toEqual({
      is3D: true,
      format,
      confidence: 1,
    });
  });

  it('recognizes an explicitly 3D release when its stereo layout is unknown', () => {
    expect(detect3DFormat('Avatar.2009.1080p.BluRay.3D.mkv')).toEqual({
      is3D: true,
      format: 'UNKNOWN',
      confidence: 0.5,
    });
  });

  it.each([
    'Avatar.2009.1080p.BluRay.3D.SBS.mkv',
    'Avatar.2009.1080p.BluRay.3D.OU.mkv',
  ])('does not guess a layout from an ambiguous marker in %s', (releaseName) => {
    expect(detect3DFormat(releaseName)).toEqual({
      is3D: true,
      format: 'UNKNOWN',
      confidence: 0.5,
    });
  });

  it('returns UNKNOWN when multiple incompatible layout markers are present', () => {
    expect(detect3DFormat('Movie.3D.HSBS.FOU.mkv')).toEqual({
      is3D: true,
      format: 'UNKNOWN',
      confidence: 0.5,
    });
  });

  it('does not classify an ordinary Blu-ray release as 3D', () => {
    expect(detect3DFormat('Avatar.2009.1080p.BluRay.mkv')).toEqual({
      is3D: false,
      format: null,
      confidence: 0,
    });
  });

  it('matches format markers case-insensitively', () => {
    expect(detect3DFormat('movie.3d.half-sbs.mkv')).toEqual({
      is3D: true,
      format: 'HALF_SBS',
      confidence: 1,
    });
  });

  it.each([null, undefined, '', 123, {}, []])(
    'returns not-3D for invalid input: %s',
    (releaseName) => {
      expect(detect3DFormat(releaseName)).toEqual({
        is3D: false,
        format: null,
        confidence: 0,
      });
    },
  );

  it('does not treat 3D as a marker when it is part of a larger token', () => {
    expect(detect3DFormat('Movie.3DTV.1080p.mkv')).toEqual({
      is3D: false,
      format: null,
      confidence: 0,
    });
  });
});
