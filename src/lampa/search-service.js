import { JackettProvider } from '../providers/jackett-provider.js';
import { TorznabProvider } from '../providers/torznab-provider.js';
import { ProviderRegistry } from '../services/provider-registry.js';
import { SearchService } from '../services/search-service.js';
import { createLampaFetch } from './lampa-fetch.js';

function readString(readSetting, key) {
  const value = readSetting(key);
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * Builds a provider registry from LAMPA's existing Jackett settings plus
 * optional dedicated Torznab settings owned by this plugin.
 *
 * @param {{ readSetting: (key: string) => unknown, fetchImpl: Function }} options
 */
export function createLampaSearchService({ readSetting, fetchImpl }) {
  if (typeof readSetting !== 'function') {
    throw new TypeError('readSetting must be a function');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function');
  }

  const providers = [];
  const jackettPairs = [
    { urlKey: 'jackett_url', apiKeyKey: 'jackett_key', id: 'jackett-primary' },
    { urlKey: 'jackett_url_two', apiKeyKey: 'jackett_key_two', id: 'jackett-secondary' },
  ];

  for (const pair of jackettPairs) {
    const baseUrl = readString(readSetting, pair.urlKey);
    const apiKey = readString(readSetting, pair.apiKeyKey);

    if (baseUrl && apiKey) {
      providers.push(new JackettProvider({
        id: pair.id,
        baseUrl,
        apiKey,
        fetchImpl,
      }));
    }
  }

  const torznabUrl = readString(readSetting, 'lampa_3d_torznab_url');
  const torznabApiKey = readString(readSetting, 'lampa_3d_torznab_api_key');

  if (torznabUrl && torznabApiKey) {
    providers.push(new TorznabProvider({
      id: 'torznab-custom',
      baseUrl: torznabUrl,
      apiKey: torznabApiKey,
      fetchImpl,
    }));
  }

  const registry = new ProviderRegistry(providers);

  return {
    registry,
    searchService: new SearchService(registry.list()),
  };
}

/**
 * Convenience factory for the actual LAMPA host.
 */
export function createLampaSearchServiceFromHost(Lampa) {
  if (!Lampa?.Storage || typeof Lampa.Reguest !== 'function') {
    throw new TypeError('LAMPA Storage and Reguest APIs are required');
  }

  return createLampaSearchService({
    readSetting: (key) => Lampa.Storage.field(key),
    fetchImpl: createLampaFetch(Lampa.Reguest),
  });
}
