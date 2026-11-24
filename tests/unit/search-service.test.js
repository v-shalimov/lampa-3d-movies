import { describe, expect, it, vi } from 'vitest';
import { createRelease } from '../../src/domain/release.js';
import { SearchService } from '../../src/services/search-service.js';

function release(providerId, providerReleaseId, title = 'Avatar 3D Half-SBS') {
  return createRelease({
    providerId,
    providerReleaseId,
    title,
    format: 'HALF_SBS',
  });
}

describe('SearchService', () => {
  it('searches all providers in parallel and aggregates releases', async () => {
    const first = vi.fn().mockResolvedValue([release('first', '1')]);
    const second = vi.fn().mockResolvedValue([release('second', '2')]);
    const service = new SearchService([
      { id: 'first', search: first },
      { id: 'second', search: second },
    ]);

    const result = await service.search('Avatar');

    expect(first).toHaveBeenCalledWith('Avatar', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(second).toHaveBeenCalledWith('Avatar', expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    expect(result).toEqual({
      releases: [release('first', '1'), release('second', '2')],
      errors: [],
    });
  });

  it('keeps successful results when one provider fails', async () => {
    const service = new SearchService([
      { id: 'working', search: vi.fn().mockResolvedValue([release('working', '1')]) },
      { id: 'broken', search: vi.fn().mockRejectedValue(new Error('Tracker unavailable')) },
    ]);

    const result = await service.search('Avatar');

    expect(result.releases).toEqual([release('working', '1')]);
    expect(result.errors).toEqual([
      { providerId: 'broken', message: 'Tracker unavailable' },
    ]);
  });

  it('returns an empty result when there are no providers', async () => {
    await expect(new SearchService([]).search('Avatar')).resolves.toEqual({
      releases: [],
      errors: [],
    });
  });

  it('removes duplicate release IDs returned by the same provider', async () => {
    const duplicate = release('tracker', 'same-id');
    const service = new SearchService([
      { id: 'tracker', search: vi.fn().mockResolvedValue([duplicate, duplicate]) },
    ]);

    expect((await service.search('Avatar')).releases).toEqual([duplicate]);
  });

  it('reports a provider that returns a non-array result as failed', async () => {
    const service = new SearchService([
      { id: 'malformed', search: vi.fn().mockResolvedValue(null) },
    ]);

    expect(await service.search('Avatar')).toEqual({
      releases: [],
      errors: [
        { providerId: 'malformed', message: 'Provider search must return an array' },
      ],
    });
  });

  it('rejects an invalid query', async () => {
    await expect(new SearchService([]).search('  ')).rejects.toThrow(
      'Search query must be a non-empty string',
    );
  });

  it('rejects an invalid provider definition', () => {
    expect(() => new SearchService([{ id: 'missing-search' }])).toThrow(
      'Each provider must have a non-empty id and a search function',
    );
  });

  it('rejects a release that belongs to a different provider', async () => {
    const service = new SearchService([
      { id: 'provider-a', search: vi.fn().mockResolvedValue([release('provider-b', '1')]) },
    ]);

    expect(await service.search('Avatar')).toEqual({
      releases: [],
      errors: [
        {
          providerId: 'provider-a',
          message: 'Provider returned a release with a mismatched providerId',
        },
      ],
    });
  });

  it('rejects duplicate provider IDs', () => {
    expect(() => new SearchService([
      { id: 'same', search: vi.fn() },
      { id: ' same ', search: vi.fn() },
    ])).toThrow('Duplicate provider id: same');
  });

  it('turns a provider timeout into a partial failure and aborts its signal', async () => {
    vi.useFakeTimers();
    try {
      let providerSignal;
      const service = new SearchService([
        {
          id: 'slow',
          search: vi.fn((_query, { signal }) => {
            providerSignal = signal;
            return new Promise(() => {});
          }),
        },
      ], { timeoutMs: 25 });

      const searchPromise = service.search('Avatar');
      await vi.advanceTimersByTimeAsync(25);

      await expect(searchPromise).resolves.toEqual({
        releases: [],
        errors: [
          { providerId: 'slow', message: 'Provider search timed out after 25ms' },
        ],
      });
      expect(providerSignal.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects the whole search when the caller aborts', async () => {
    const controller = new AbortController();
    let providerSignal;
    const service = new SearchService([
      {
        id: 'slow',
        search: vi.fn((_query, { signal }) => {
          providerSignal = signal;
          return new Promise(() => {});
        }),
      },
    ]);

    const searchPromise = service.search('Avatar', { signal: controller.signal });
    controller.abort();

    await expect(searchPromise).rejects.toMatchObject({ name: 'AbortError' });
    expect(providerSignal.aborted).toBe(true);
  });

  it('rejects immediately when the caller signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await expect(
      new SearchService([]).search('Avatar', { signal: controller.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('validates the configured timeout', () => {
    expect(() => new SearchService([], { timeoutMs: 0 })).toThrow(
      'timeoutMs must be a positive finite number',
    );
  });
  it('deduplicates matching torrent info hashes across different providers', async () => {
    const infoHash = 'ABCDEF0123456789ABCDEF0123456789ABCDEF01';
    const firstRelease = release('jackett-home', infoHash);
    const secondRelease = release('prowlarr-home', infoHash.toLowerCase());
    const service = new SearchService([
      { id: 'jackett-home', search: vi.fn().mockResolvedValue([firstRelease]) },
      { id: 'prowlarr-home', search: vi.fn().mockResolvedValue([secondRelease]) },
    ]);

    expect((await service.search('Avatar')).releases).toEqual([firstRelease]);
  });

  it('does not deduplicate provider-local IDs across different providers', async () => {
    const firstRelease = release('jackett-home', 'release-42');
    const secondRelease = release('prowlarr-home', 'release-42');
    const service = new SearchService([
      { id: 'jackett-home', search: vi.fn().mockResolvedValue([firstRelease]) },
      { id: 'prowlarr-home', search: vi.fn().mockResolvedValue([secondRelease]) },
    ]);

    expect((await service.search('Avatar')).releases).toEqual([
      firstRelease,
      secondRelease,
    ]);
  });

});
