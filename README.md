# LAMPA 3D Movies

A LAMPA extension for discovering stereoscopic 3D movie releases.

## Initial scope

- Dedicated 3D movie catalog in LAMPA.
- Hybrid discovery architecture: adapters for existing LAMPA sources and independent providers.
- Supported layouts: Half-SBS, Full-SBS, Half-OU, Full-OU.
- MVC / Blu-ray 3D is out of scope for the initial version.

## Architecture principles

- Domain logic must not depend on LAMPA globals or UI APIs.
- Provider-specific results are normalized into a common release model.
- 3D layout detection is independent from provider implementations.
- Playback is delegated to the existing LAMPA / TorrServer integration.

## Providers

The first provider adapter targets the Jackett JSON search API. It can also be
used with compatible services that expose the same endpoint contract.

```js
import { JackettProvider } from './src/providers/jackett-provider.js';
import { SearchService } from './src/services/search-service.js';

const jackett = new JackettProvider({
  baseUrl: 'http://localhost:9117',
  apiKey: process.env.JACKETT_API_KEY,
  indexer: 'all',
});

const searchService = new SearchService([jackett], {
  timeoutMs: 15_000,
});

const { releases, errors } = await searchService.search('Avatar');
```

The adapter uses `/api/v2.0/indexers/{indexer}/results`, keeps only
stereoscopic 3D results, detects the supported layout, and maps Jackett
metadata into the domain `Release` model. Configure a stable provider `id`
when registering more than one Jackett-compatible endpoint.

Credentials must be supplied by runtime configuration and must not be
committed to the repository. Browser deployments may require a same-origin
backend/proxy because Jackett instances do not necessarily enable CORS.


The generic `TorznabProvider` supports standard Torznab RSS/XML search
endpoints. Pass the complete API endpoint as `baseUrl` (not just the server
root):

```js
import { TorznabProvider } from './src/providers/torznab-provider.js';
import { SearchService } from './src/services/search-service.js';

const torznab = new TorznabProvider({
  baseUrl: 'https://indexer.example/api',
  apiKey: process.env.TORZNAB_API_KEY,
  category: 'Movies/3D', // optional Torznab category ID
  id: 'my-torznab-indexer',
});

const { releases, errors } = await new SearchService([torznab])
  .search('Blade Runner 2049');
```

The adapter reads RSS `item` entries and Torznab `attr` metadata
(`infohash`, `seeders`, `size`, `magneturl`), and supports magnet URLs
from the enclosure or link. It intentionally does not assume a particular
indexer vendor's endpoint URL; configure the exact Torznab API endpoint
provided by that service.

## Development

Requirements: Node.js 20 or newer.

```sh
npm install
npm test
```

## Development workflow

The project follows TDD:

1. Add a failing test (Red).
2. Implement the smallest change that makes it pass (Green).
3. Refactor without changing behavior.
4. Commit the completed increment.
