import { describe, expect, it, vi } from 'vitest';
import { ProviderRegistry } from '../../src/services/provider-registry.js';

function provider(id, search = vi.fn().mockResolvedValue([])) {
  return { id, search };
}

describe('ProviderRegistry', () => {
  it('registers providers and returns an immutable list snapshot', () => {
    const first = provider('jackett');
    const registry = new ProviderRegistry([first]);

    const listed = registry.list();

    expect(registry.size).toBe(1);
    expect(registry.get('jackett')).toBeDefined();
    expect(registry.has('jackett')).toBe(true);
    expect(listed).toHaveLength(1);
    expect(Object.isFrozen(listed[0])).toBe(true);

    listed.push(provider('unexpected'));
    expect(registry.size).toBe(1);
  });

  it('supports incremental registration and chaining', () => {
    const registry = new ProviderRegistry();

    expect(registry.register(provider('jackett'))).toBe(registry);
    registry.register(provider('torznab'));

    expect(registry.list().map(({ id }) => id)).toEqual(['jackett', 'torznab']);
  });

  it('rejects duplicate IDs', () => {
    const registry = new ProviderRegistry([provider('jackett')]);

    expect(() => registry.register(provider('jackett')))
      .toThrow('Provider already registered: jackett');
  });

  it('rejects invalid provider contracts', () => {
    const registry = new ProviderRegistry();

    expect(() => registry.register({ id: 'missing-search' }))
      .toThrow('Provider must have a non-empty id and a search function');
    expect(() => new ProviderRegistry({}))
      .toThrow('Providers must be an array');
  });

  it('normalizes IDs and preserves the provider method receiver', async () => {
    class StatefulProvider {
      constructor() {
        this.id = '  stateful  ';
        this.calls = 0;
      }

      async search() {
        this.calls += 1;
        return [];
      }
    }

    const original = new StatefulProvider();
    const registry = new ProviderRegistry([original]);

    await registry.get('stateful').search('Movie');

    expect(registry.get(' stateful ').id).toBe('stateful');
    expect(original.calls).toBe(1);
  });

  it('unregisters providers and reports whether one existed', () => {
    const registry = new ProviderRegistry([provider('jackett')]);

    expect(registry.unregister('jackett')).toBe(true);
    expect(registry.unregister('jackett')).toBe(false);
    expect(registry.has('jackett')).toBe(false);
    expect(registry.get('jackett')).toBeNull();
    expect(registry.size).toBe(0);
  });

  it('validates provider IDs for lookup and removal', () => {
    const registry = new ProviderRegistry();

    expect(() => registry.get(' ')).toThrow('Provider ID must be a non-empty string');
    expect(() => registry.unregister(' ')).toThrow('Provider ID must be a non-empty string');
    expect(registry.has(' ')).toBe(false);
  });
});
