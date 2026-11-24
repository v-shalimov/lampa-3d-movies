function requireNonBlankString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`LAMPA torrent ${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

/**
 * Converts a provider-neutral Release into the result shape consumed by
 * Lampa.Torrent.start(). This adapter deliberately contains no LAMPA globals.
 *
 * @param {object} release
 * @returns {object}
 */
export function mapReleaseToLampaTorrent(release) {
  if (release === null || typeof release !== 'object' || Array.isArray(release)) {
    throw new TypeError('Release must be an object');
  }

  const title = requireNonBlankString(release.title, 'title');
  const url = requireNonBlankString(release.url, 'url');

  const result = {
    // The built-in parser uses Title in result cards, while Torrent.start()
    // also reads the lower-case title field when adding the torrent.
    title,
    Title: title,
  };

  if (/^magnet:/i.test(url)) {
    result.MagnetUri = url;
  } else {
    result.Link = url;
  }

  if (release.seeders != null) {
    if (!Number.isSafeInteger(release.seeders) || release.seeders < 0) {
      throw new TypeError('Release seeders must be a non-negative safe integer or null');
    }

    result.Seeders = release.seeders;
  }

  if (release.sizeBytes != null) {
    if (!Number.isSafeInteger(release.sizeBytes) || release.sizeBytes < 0) {
      throw new TypeError('Release sizeBytes must be a non-negative safe integer or null');
    }

    result.Size = release.sizeBytes;
  }

  return result;
}
