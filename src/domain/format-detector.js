const FORMAT_PATTERNS = [
  {
    format: 'HALF_SBS',
    pattern: /(?:^|[^a-z0-9])half[\s._-]*sbs(?=$|[^a-z0-9])/i,
  },
  {
    format: 'FULL_SBS',
    pattern: /(?:^|[^a-z0-9])full[\s._-]*sbs(?=$|[^a-z0-9])/i,
  },
  {
    format: 'HALF_OU',
    pattern: /(?:^|[^a-z0-9])half[\s._-]*ou(?=$|[^a-z0-9])/i,
  },
  {
    format: 'FULL_OU',
    pattern: /(?:^|[^a-z0-9])full[\s._-]*ou(?=$|[^a-z0-9])/i,
  },
];

const THREE_D_PATTERN = /(?:^|[^a-z0-9])3d(?=$|[^a-z0-9])/i;

const NOT_3D = Object.freeze({
  is3D: false,
  format: null,
  confidence: 0,
});

const UNKNOWN_3D = Object.freeze({
  is3D: true,
  format: 'UNKNOWN',
  confidence: 0.5,
});

/**
 * Detects a stereoscopic 3D layout from a release filename or title.
 *
 * A recognized layout marker is sufficient to classify a release as 3D.
 * An explicit "3D" marker without a recognized layout is classified as
 * 3D with an unknown layout.
 *
 * @param {string} releaseName
 * @returns {{ is3D: boolean, format: string | null, confidence: number }}
 */
export function detect3DFormat(releaseName) {
  if (typeof releaseName !== 'string' || releaseName.length === 0) {
    return NOT_3D;
  }

  const matches = FORMAT_PATTERNS
    .filter(({ pattern }) => pattern.test(releaseName))
    .map(({ format }) => format);

  const uniqueFormats = [...new Set(matches)];

  if (uniqueFormats.length === 1) {
    return {
      is3D: true,
      format: uniqueFormats[0],
      confidence: 1,
    };
  }

  if (uniqueFormats.length > 1 || THREE_D_PATTERN.test(releaseName)) {
    return UNKNOWN_3D;
  }

  return NOT_3D;
}
