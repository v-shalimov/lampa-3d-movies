const SUPPORTED_FORMATS = new Set([
  'HALF_SBS',
  'FULL_SBS',
  'HALF_OU',
  'FULL_OU',
  'UNKNOWN',
]);

function requireNonBlankString(value, fieldName) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError(`Release ${fieldName} must be a non-empty string`);
  }

  return value.trim();
}

function optionalString(value, fieldName) {
  if (value == null || value === '') {
    return null;
  }

  if (typeof value !== 'string') {
    throw new TypeError(`Release ${fieldName} must be a string or null`);
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function optionalNonNegativeInteger(value, fieldName) {
  if (value == null) {
    return null;
  }

  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`Release ${fieldName} must be a non-negative safe integer or null`);
  }

  return value;
}

/**
 * Creates an immutable, provider-neutral release model.
 *
 * @param {object} input
 * @returns {{
 *   providerId: string,
 *   providerReleaseId: string,
 *   title: string,
 *   format: string,
 *   resolution: string | null,
 *   sizeBytes: number | null,
 *   seeders: number | null,
 *   url: string | null
 * }}
 */
export function createRelease(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Release input must be an object');
  }

  const providerId = requireNonBlankString(input.providerId, 'providerId');
  const providerReleaseId = requireNonBlankString(
    input.providerReleaseId,
    'providerReleaseId',
  );
  const title = requireNonBlankString(input.title, 'title');

  if (!SUPPORTED_FORMATS.has(input.format)) {
    throw new TypeError(
      `Release format must be one of: ${[...SUPPORTED_FORMATS].join(', ')}`,
    );
  }

  return Object.freeze({
    providerId,
    providerReleaseId,
    title,
    format: input.format,
    resolution: optionalString(input.resolution, 'resolution'),
    sizeBytes: optionalNonNegativeInteger(input.sizeBytes, 'sizeBytes'),
    seeders: optionalNonNegativeInteger(input.seeders, 'seeders'),
    url: optionalString(input.url, 'url'),
  });
}
