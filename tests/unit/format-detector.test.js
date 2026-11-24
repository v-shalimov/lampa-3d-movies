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

  it('recognizes an explicitly 3D release when its stereo layout is unknown', () => {
    expect(detect3DFormat('Avatar.2009.1080p.BluRay.3D.mkv')).toEqual({
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
});
