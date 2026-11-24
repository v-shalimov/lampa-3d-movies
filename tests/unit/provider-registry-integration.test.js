import { describe, expect, it, vi } from 'vitest';
import { createRelease } from '../../src/domain/release.js';
import { ProviderRegistry } from '../../src/services/provider-registry.js';
import { SearchService } from '../../src/services/search-service.js';

describe('ProviderRegistry + SearchService', () => {
  it('runs registered class-based providers through SearchService', async () => {
    const expected = createRelease({
      providerId: 'class-provider',
      providerReleaseId: 'release-1',
      title: 'Avatar 3D Half-SBS',
      format: 'HALF_SBS',
    });

    class ClassProvider {
      constructor() {
        this.id = 'class-provider';
        this.calls = 0;
      }

      async search(query) {
        this.calls += 1;
        expect(query).toBe('Avatar');
        return [expected];
      }
    }

    const provider = new ClassProvider();
    const registry = new ProviderRegistry([provider]);
    const service = new SearchService(registry.list());

    await expect(service.search('Avatar')).resolves.toEqual({
      releases: [expected],
      errors: [],
    });
    expect(provider.calls).toBe(1);
  });

  it('keeps provider instances as the receiver when called from registry', async () => {
    const search = vi.fn(async function search() {
      this.calls += 1;
      return [];
    });
    const provider = { id: 'stateful', calls: 0, search };
    const registry = new ProviderRegistry([provider]);

    await registry.get('stateful').search('Movie');

    expect(provider.calls).toBe(1);
    expect(search).toHaveBeenCalledOnce();
  });
});
