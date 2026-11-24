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
    const first = vi.fn().mockResolvedValue([
      release('first', '1'),
    ]);
    const second = vi.fn().mockResolvedValue([
      release('second', '2'),
    ]);
    const service = new SearchService([
      { id: 'first', search: first },
      { id: 'second', search: second },
    ]);

    const result = await service.search('Avatar');

    expect(first).toHaveBeenCalledWith('Avatar');
    expect(second).toHaveBeenCalledWith('Avatar');
    expect(result).toEqual({
      releases: [
        release('first', '1'),
        release('second', '2'),
      ],
      errors: [],
    });
  });

  it('keeps successful results when one provider fails', async () => {
    const service = new SearchService([
      {
        id: 'working',
        search: vi.fn().mockResolvedValue([release('working', '1')]),
      },
      {
        id: 'broken',
        search: vi.fn().mockRejectedValue(new Error('Tracker unavailable')),
      },
    ]);

    const result = await service.search('Avatar');

    expect(result.releases).toEqual([release('working', '1')]);
    expect(result.errors).toEqual([
      { providerId: 'broken', message: 'Tracker unavailable' },
    ]);
  });

  it('returns an empty result when there are no providers', async () => {
    const service = new SearchService([]);

    await expect(service.search('Avatar')).resolves.toEqual({
      releases: [],
      errors: [],
    });
  });

  it('removes duplicate release IDs returned by the same provider', async () => {
    const duplicate = release('tracker', 'same-id');
    const service = new SearchService([
      {
        id: 'tracker',
        search: vi.fn().mockResolvedValue([duplicate, duplicate]),
      },
    ]);

    const result = await service.search('Avatar');

    expect(result.releases).toEqual([duplicate]);
  });

  it('reports a provider that returns a non-array result as failed', async () => {
    const service = new SearchService([
      {
        id: 'malformed',
        search: vi.fn().mockResolvedValue(null),
      },
    ]);

    const result = await service.search('Avatar');

    expect(result).toEqual({
      releases: [],
      errors: [
        { providerId: 'malformed', message: 'Provider search must return an array' },
      ],
    });
  });

  it('rejects an invalid query', async () => {
    const service = new SearchService([]);

    await expect(service.search('  ')).rejects.toThrow(
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
      {
        id: 'provider-a',
        search: vi.fn().mockResolvedValue([release('provider-b', '1')]),
      },
    ]);

    const result = await service.search('Avatar');

    expect(result).toEqual({
      releases: [],
      errors: [
        { providerId: 'provider-a', message: 'Provider returned a release with a mismatched providerId' },
      ],
    });
  });
});
