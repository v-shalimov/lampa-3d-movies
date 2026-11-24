function validateProvider(provider) {
  if (
    provider === null
    || typeof provider !== 'object'
    || typeof provider.id !== 'string'
    || provider.id.trim().length === 0
    || typeof provider.search !== 'function'
  ) {
    throw new TypeError(
      'Provider must have a non-empty id and a search function',
    );
  }

  return Object.freeze({
    ...provider,
    id: provider.id.trim(),
  });
}

/**
 * Runtime registry for configured search providers.
 *
 * The registry owns provider instances, not provider configuration or secrets.
 * IDs are stable identifiers supplied when a provider is constructed.
 */
export class ProviderRegistry {
  #providers = new Map();

  constructor(providers = []) {
    if (!Array.isArray(providers)) {
      throw new TypeError('Providers must be an array');
    }

    for (const provider of providers) {
      this.register(provider);
    }
  }

  get size() {
    return this.#providers.size;
  }

  register(provider) {
    const normalized = validateProvider(provider);

    if (this.#providers.has(normalized.id)) {
      throw new TypeError(`Provider already registered: ${normalized.id}`);
    }

    this.#providers.set(normalized.id, normalized);
    return this;
  }

  unregister(providerId) {
    if (typeof providerId !== 'string' || providerId.trim().length === 0) {
      throw new TypeError('Provider ID must be a non-empty string');
    }

    return this.#providers.delete(providerId.trim());
  }

  get(providerId) {
    if (typeof providerId !== 'string' || providerId.trim().length === 0) {
      throw new TypeError('Provider ID must be a non-empty string');
    }

    return this.#providers.get(providerId.trim()) ?? null;
  }

  list() {
    return [...this.#providers.values()];
  }

  has(providerId) {
    if (typeof providerId !== 'string' || providerId.trim().length === 0) {
      return false;
    }

    return this.#providers.has(providerId.trim());
  }
}
