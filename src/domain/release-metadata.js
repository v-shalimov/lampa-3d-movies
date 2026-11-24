const LANGUAGE_PATTERNS = [
  ['Russian', /\b(?:rus|russian|русский|рус)\b/i],
  ['English', /\b(?:eng|english)\b/i],
  ['Ukrainian', /\b(?:ukr|ukrainian|украинский|українська)\b/i],
  ['Polish', /\b(?:pol|polish|польский|polski)\b/i],
  ['German', /\b(?:ger|german|deu)\b/i],
  ['French', /\b(?:fre|french|fra)\b/i],
  ['Spanish', /\b(?:spa|spanish|esp)\b/i],
  ['Italian', /\b(?:ita|italian)\b/i],
];

function firstMatch(text, patterns) {
  for (const [value, pattern] of patterns) {
    if (pattern.test(text)) return value;
  }
  return null;
}

/** Extracts only metadata explicitly present in release title/description. */
export function parseReleaseMetadata(title, description = '') {
  const text = [title, description].filter(Boolean).join(' ');
  const languages = LANGUAGE_PATTERNS
    .filter(([, pattern]) => pattern.test(text))
    .map(([language]) => language);
  const bitrateMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(?:mbps|mb\/s|mbit\/s)\b/i);
  const audioCodec = firstMatch(text, [
    ['Dolby Atmos', /\batmos\b/i], ['TrueHD', /\btruehd\b/i],
    ['DTS-HD MA', /\bdts[- .]?hd(?:[- .]?ma| master audio)\b/i],
    ['DTS', /\bdts\b/i], ['E-AC-3', /\b(?:eac3|e-ac-3|ddp)\b/i],
    ['AC-3', /\b(?:ac3|ac-3|dd)\b/i], ['AAC', /\baac\b/i], ['FLAC', /\bflac\b/i],
  ]);
  const videoCodec = firstMatch(text, [
    ['AV1', /\bav1\b/i], ['HEVC / H.265', /\b(?:hevc|h\.?265|x265)\b/i],
    ['AVC / H.264', /\b(?:avc|h\.?264|x264)\b/i],
    ['VC-1', /\bvc-?1\b/i], ['MPEG-2', /\bmpeg-?2\b/i],
  ]);
  const source = firstMatch(text, [
    ['Blu-ray', /\b(?:blu.?ray|bdrip|bdremux)\b/i], ['WEB-DL', /\bweb[- .]?dl\b/i],
    ['WEBRip', /\bwebrip\b/i], ['HDTV', /\bhdtv\b/i], ['Remux', /\bremux\b/i],
  ]);
  const hdr = firstMatch(text, [
    ['Dolby Vision', /\bdolby.?vision\b/i], ['HDR10+', /\bhdr10\+\b/i],
    ['HDR10', /\bhdr10\b/i], ['HDR', /\bhdr\b/i],
  ]);
  return {
    videoCodec, audioCodec, audioLanguages: languages,
    bitrateMbps: bitrateMatch ? Number(bitrateMatch[1].replace(',', '.')) : null,
    source, hdr,
  };
}
