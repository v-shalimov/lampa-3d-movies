import { createRelease } from '../domain/release.js';

function normalizeError(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Coordinates searches across independent release providers.
 *
 * Providers must expose a stable non-empty id and a search(query) method
 * returning an array of provider-neutral Release objects.
 */
export class SearchService {
  constructor(providers = []) {
    if (!Array.isArray(providers)) {
      throw new TypeError('Providers must be an array');
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
  }

  async search(query) {
    if (typeof query !== 'string' || query.trim().length === 0) {
      throw new TypeError('Search query must be a non-empty string');
    }

    const normalizedQuery = query.trim();

    const outcomes = await Promise.all(this.providers.map(async (provider) => {
      try {
        const providerReleases = await provider.search(normalizedQuery);

        if (!Array.isArray(providerReleases)) {
          throw new TypeError('Provider search must return an array');
        }

        const releases = providerReleases.map((item) => {
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
      }
    }));

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
  }
}
