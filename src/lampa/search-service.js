import { JackettProvider } from '../providers/jackett-provider.js';
import { TorznabProvider } from '../providers/torznab-provider.js';
import { ProwlarrProvider } from '../providers/prowlarr-provider.js';
import { ProviderRegistry } from '../services/provider-registry.js';
import { SearchService } from '../services/search-service.js';
import { createLampaFetch } from './lampa-fetch.js';

function readString(readSetting, key) {
  const value = readSetting(key);
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLampaUrl(value) {
  const url = value.replace('jacred.xyz', 'jac.red');
  if (/^https?:\/\//i.test(url)) return url;
  const protocol = globalThis.location?.protocol === 'https:' ? 'https://' : 'http://';
  return protocol + url;
}

function selectedLinks(readSetting, type) {
  const use = readString(readSetting, 'parser_use_link') || 'one';
  const pairs = type === 'jackett'
    ? [
      { urlKey: 'jackett_url', keyKey: 'jackett_key', id: 'jackett-primary' },
      { urlKey: 'jackett_url_two', keyKey: 'jackett_key_two', id: 'jackett-secondary' },
    ]
    : [
      { urlKey: 'prowlarr_url', keyKey: 'prowlarr_key', id: 'prowlarr-primary' },
      { urlKey: 'prowlarr_url_two', keyKey: 'prowlarr_key_two', id: 'prowlarr-secondary' },
    ];

  const available = pairs
    .map((pair) => ({
      ...pair,
      baseUrl: readString(readSetting, pair.urlKey),
      apiKey: readString(readSetting, pair.keyKey),
    }))
    .filter((pair) => pair.baseUrl);

  if (use === 'one') return available.filter((pair) => pair.id.endsWith('primary'));
  if (use === 'two') return available.filter((pair) => pair.id.endsWith('secondary'));
  return available;
}

/**
 * Builds providers from the same parser settings that LAMPA itself uses.
 * The plugin follows parser_torrent_type and parser_use_link, rather than
 * activating every configured provider or requiring duplicate credentials.
 */
export function createLampaSearchService({ readSetting, fetchImpl }) {
  if (typeof readSetting !== 'function') {
    throw new TypeError('readSetting must be a function');
  }
  if (typeof fetchImpl !== 'function') {
    throw new TypeError('fetchImpl must be a function');
  }

  const providers = [];
  const parserType = readString(readSetting, 'parser_torrent_type') || 'jackett';

  if (parserType === 'jackett') {
    const indexer = readString(readSetting, 'jackett_interview') === 'healthy'
      ? 'status:healthy'
      : 'all';

    selectedLinks(readSetting, 'jackett').forEach((link) => {
      providers.push(new JackettProvider({
        id: link.id,
        baseUrl: normalizeLampaUrl(link.baseUrl),
        apiKey: link.apiKey,
        indexer,
        fetchImpl,
      }));
    });
  } else if (parserType === 'prowlarr') {
    selectedLinks(readSetting, 'prowlarr').forEach((link) => {
      providers.push(new ProwlarrProvider({
        id: link.id,
        baseUrl: normalizeLampaUrl(link.baseUrl),
        apiKey: link.apiKey,
        fetchImpl,
      }));
    });
  } else if (parserType === 'torrserver') {
    // LAMPA's TorrServer parser is a separate search API, not a Torznab URL.
    // It is intentionally not treated as Jackett or Prowlarr.
  }

  // Keep the optional standalone Torznab endpoint as an additional provider.
  const torznabUrl = readString(readSetting, 'lampa_3d_torznab_url');
  const torznabApiKey = readString(readSetting, 'lampa_3d_torznab_api_key');

  if (torznabUrl && torznabApiKey) {
    providers.push(new TorznabProvider({
      id: 'torznab-custom',
      baseUrl: normalizeLampaUrl(torznabUrl),
      apiKey: torznabApiKey,
      fetchImpl,
    }));
  }

  const registry = new ProviderRegistry(providers);

  return {
    registry,
    searchService: new SearchService(registry.list()),
    async listSources(options = {}) {
      const sources = await Promise.all(providers
        .filter((provider) => typeof provider.listIndexers === 'function')
        .map((provider) => provider.listIndexers(options)));
      const unique = new Map();
      sources.flat().forEach((source) => {
        if (!unique.has(source.id)) unique.set(source.id, source);
      });
      return [...unique.values()];
    },
  };
}

export function createLampaSearchServiceFromHost(Lampa) {
  if (!Lampa?.Storage || typeof Lampa.Reguest !== 'function') {
    throw new TypeError('LAMPA Storage and Reguest APIs are required');
  }

  return createLampaSearchService({
    readSetting: (key) => Lampa.Storage.field(key),
    fetchImpl: createLampaFetch(Lampa.Reguest),
  });
}
