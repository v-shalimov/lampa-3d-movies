import { createRelease } from '../domain/release.js';

const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

function createAbortError() {
  const error = new Error('Search aborted');
  error.name = 'AbortError';
  return error;
}

async function searchProvider(provider, query, controller, timeoutMs) {
  let timeoutId;
  let abortListener;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`Provider search timed out after ${timeoutMs}ms`);
      error.name = 'TimeoutError';
      reject(error);
      controller.abort(error);
    }, timeoutMs);
  });

  const abortPromise = new Promise((_, reject) => {
    abortListener = () => reject(controller.signal.reason ?? createAbortError());
    controller.signal.addEventListener('abort', abortListener, { once: true });
  });

  try {
    const providerResult = await Promise.race([
      Promise.resolve().then(() => provider.search(query, {
        signal: controller.signal,
      })),
      timeoutPromise,
      abortPromise,
    ]);

    if (!Array.isArray(providerResult)) {
      throw new TypeError('Provider search must return an array');
    }

    const releases = providerResult.map((item) => {
      const normalized = createRelease(item);

      if (normalized.providerId !== provider.id) {
        throw new TypeError(
          'Provider returned a release with a mismatched providerId',
        );
      }

      return normalized;
    });

    return { providerId: provider.id, releases };
  } catch (error) {
    return {
      providerId: provider.id,
      error: normalizeError(error),
    };
  } finally {
    clearTimeout(timeoutId);
    controller.signal.removeEventListener('abort', abortListener);
  }
}

/**
 * Coordinates searches across independent release providers.
 *
 * Providers expose a stable id and search(query, { signal }), returning
 * provider-neutral Release objects. A provider timeout is isolated; an
 * explicit caller abort rejects the entire search.
 */
export class SearchService {
  constructor(providers = [], options = {}) {
    if (!Array.isArray(providers)) {
      throw new TypeError('Providers must be an array');
    }

    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('SearchService options must be an object');
    }

    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
      throw new TypeError('timeoutMs must be a positive finite number');
    }

    const providerIds = new Set();

    for (const provider of providers) {
      if (
        provider === null
        || typeof provider !== 'object'
        || typeof provider.id !== 'string'
        || provider.id.trim().length === 0
        || typeof provider.search !== 'function'
      ) {
        throw new TypeError(
          'Each provider must have a non-empty id and a search function',
        );
      }

      const providerId = provider.id.trim();
      if (providerIds.has(providerId)) {
        throw new TypeError(`Duplicate provider id: ${providerId}`);
      }

      providerIds.add(providerId);
    }

    this.providers = providers.map((provider) => ({
      ...provider,
      id: provider.id.trim(),
    }));
    this.timeoutMs = timeoutMs;
  }

  async search(query, options = {}) {
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new TypeError('Search query must be a non-empty string');
    }

    if (options === null || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Search options must be an object');
    }

    const { signal } = options;
    if (signal !== undefined && (
      signal === null
      || typeof signal.aborted !== 'boolean'
      || typeof signal.addEventListener !== 'function'
    )) {
      throw new TypeError('signal must be an AbortSignal');
    }

    if (signal?.aborted) {
      throw createAbortError();
    }

    const controllers = this.providers.map(() => new AbortController());
    let abortListener;

    const abortPromise = signal
      ? new Promise((_, reject) => {
        abortListener = () => {
          reject(createAbortError());
          controllers.forEach((controller) => controller.abort());
        };
        signal.addEventListener('abort', abortListener, { once: true });
      })
      : null;

    try {
      const providerSearch = Promise.all(this.providers.map((provider, index) => (
        searchProvider(
          provider,
          query.trim(),
          controllers[index],
          this.timeoutMs,
        )
      )));

      const outcomes = abortPromise
        ? await Promise.race([providerSearch, abortPromise])
        : await providerSearch;

      const releases = [];
      const seenReleaseIds = new Set();
      const errors = [];

      for (const outcome of outcomes) {
        if (outcome.error !== undefined) {
          errors.push({
            providerId: outcome.providerId,
            message: outcome.error,
          });
          continue;
        }

        for (const release of outcome.releases) {
          const key = `${release.providerId}\u0000${release.providerReleaseId}`;

          if (!seenReleaseIds.has(key)) {
            seenReleaseIds.add(key);
            releases.push(release);
          }
        }
      }

      return { releases, errors };
    } finally {
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
    }
  }
}
