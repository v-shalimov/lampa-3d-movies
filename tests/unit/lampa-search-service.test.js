import { describe, expect, it, vi } from 'vitest';
import {
  createLampaSearchService,
  createLampaSearchServiceFromHost,
} from '../../src/lampa/search-service.js';

function makeReadSetting(values) {
  return (key) => values[key];
}

describe('createLampaSearchService', () => {
  it('reuses the primary Jackett settings already configured in LAMPA', () => {
    const fetchImpl = vi.fn();
    const { registry } = createLampaSearchService({
      readSetting: makeReadSetting({
        jackett_url: 'http://jackett.local:9117/',
        jackett_key: 'primary-key',
      }),
      fetchImpl,
    });

    expect(registry.size).toBe(1);
    expect(registry.get('jackett-primary')).not.toBeNull();
  });

  it('registers both existing Jackett endpoints and a custom Torznab endpoint', () => {
    const { registry } = createLampaSearchService({
      readSetting: makeReadSetting({
        jackett_url: 'http://jackett-one.local',
        jackett_key: 'key-one',
        jackett_url_two: 'http://jackett-two.local',
        jackett_key_two: 'key-two',
        lampa_3d_torznab_url: 'https://indexer.example/api',
        lampa_3d_torznab_api_key: 'torznab-key',
      }),
      fetchImpl: vi.fn(),
    });

    expect(registry.size).toBe(3);
    expect(registry.has('jackett-primary')).toBe(true);
    expect(registry.has('jackett-secondary')).toBe(true);
    expect(registry.has('torznab-custom')).toBe(true);
  });

  it('ignores incomplete provider settings instead of constructing invalid providers', () => {
    const { registry, searchService } = createLampaSearchService({
      readSetting: makeReadSetting({
        jackett_url: 'http://jackett.local',
        jackett_key: '',
        lampa_3d_torznab_url: 'https://indexer.example/api',
      }),
      fetchImpl: vi.fn(),
    });

    expect(registry.size).toBe(0);
    expect(searchService.providers).toHaveLength(0);
  });

  it('rejects invalid host dependencies', () => {
    expect(() => createLampaSearchService({
      readSetting: null,
      fetchImpl: vi.fn(),
    })).toThrow(TypeError);

    expect(() => createLampaSearchService({
      readSetting: vi.fn(),
      fetchImpl: null,
    })).toThrow(TypeError);
  });

  it('creates a search service from the public LAMPA host APIs', () => {
    const Lampa = {
      Storage: { field: vi.fn(() => '') },
      Reguest: function Reguest() {
        this.native = vi.fn();
        this.clear = vi.fn();
      },
    };

    const { registry, searchService } = createLampaSearchServiceFromHost(Lampa);

    expect(registry.size).toBe(0);
    expect(searchService).toBeDefined();
    expect(Lampa.Storage.field).toHaveBeenCalledWith('jackett_url');
  });

  it('rejects hosts without Storage or Reguest', () => {
    expect(() => createLampaSearchServiceFromHost({})).toThrow(TypeError);
  });
});
