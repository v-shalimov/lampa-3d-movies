import { describe, expect, it } from 'vitest';
import { parseReleaseMetadata } from '../../src/domain/release-metadata.js';

describe('parseReleaseMetadata', () => {
  it('extracts codecs, audio languages, bitrate, source and HDR', () => {
    expect(parseReleaseMetadata(
      'Avatar 3D Half-SBS 1080p BluRay x265 DTS-HD MA',
      'Russian English audio, HDR10, video bitrate 18.5 Mbps',
    )).toEqual({
      videoCodec: 'HEVC / H.265',
      audioCodec: 'DTS-HD MA',
      audioLanguages: ['Russian', 'English'],
      bitrateMbps: 18.5,
      source: 'Blu-ray',
      hdr: 'HDR10',
    });
  });

  it('does not invent bitrate or language when absent', () => {
    expect(parseReleaseMetadata('Avatar 3D 1080p')).toEqual({
      videoCodec: null,
      audioCodec: null,
      audioLanguages: [],
      bitrateMbps: null,
      source: null,
      hdr: null,
    });
  });
});
