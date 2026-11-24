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

### Prowlarr

The Prowlarr adapter uses the same JSON endpoint as LAMPA's built-in parser:
`/api/v1/search?apikey=...&query=...`. It filters to torrent protocol results,
then retains only 3D releases with a usable `downloadUrl`. The LAMPA plugin
automatically reuses `prowlarr_url`, `prowlarr_key`, and their `_two` variants.

## Runtime provider registry

Create provider instances with unique, stable IDs and register them once at
application startup. The registry does not persist API keys or endpoint
configuration; keep those in the host application's local settings.

```js
import { ProviderRegistry } from './src/services/provider-registry.js';
import { JackettProvider } from './src/providers/jackett-provider.js';
import { TorznabProvider } from './src/providers/torznab-provider.js';
import { SearchService } from './src/services/search-service.js';

const providers = new ProviderRegistry([
  new JackettProvider({
    id: 'jackett-home',
    baseUrl: process.env.JACKETT_URL,
    apiKey: process.env.JACKETT_API_KEY,
  }),
  new TorznabProvider({
    id: 'prowlarr-home',
    baseUrl: process.env.PROWLARR_TORZNAB_URL,
    apiKey: process.env.PROWLARR_API_KEY,
  }),
]);

const searchService = new SearchService(providers.list());
const result = await searchService.search('Avatar');
```

Use `register` and `unregister` to change the active provider set. A
`SearchService` receives a snapshot from `list()`; construct a new service
after changing the registry if the new provider set should take effect.

Search aggregation deduplicates matching 40-character hexadecimal torrent
info hashes across providers. Other provider-local release IDs remain scoped
to their provider to avoid incorrectly merging unrelated results.

## LAMPA integration

The plugin entry point is src/lampa/entry.js. Build it into one browser-ready
IIFE script:

```sh
npm install
npm run build
```

The output is dist/lampa-3d-movies.js. Install that generated file in LAMPA
using the normal plugin URL/file mechanism. Every push to `main` and every pull
request targeting `main` also runs tests and builds the plugin; the workflow
publishes the bundle as the `lampa-3d-movies` artifact. The workflow can also
be started manually from the repository's Actions tab.

The plugin registers a dedicated **3D Movies** menu item and Activity. It
reuses LAMPA's existing Jackett and Prowlarr settings (including both configured
endpoints) and adds optional Torznab endpoint/key fields under the **3D Movies**
settings section. The Prowlarr adapter uses the same /api/v1/search endpoint and
torrent-result filtering as LAMPA's built-in parser. Credentials remain in the
local LAMPA settings store; do not commit them to this repository.

Search results are displayed with their detected stereoscopic layout. Selecting
a release delegates playback to Lampa.Torrent.start(); the plugin does not
implement TorrServer requests or a media player.

See [the integration contract](docs/lampa-integration-design.md) for the
host API research, adapter boundaries, and remaining runtime verification.

## Development

Requirements: Node.js 20 or newer.

```sh
npm install
npm test
npm run build
```

## Build verification

This branch exists to run the automated build and publish the installable bundle.

## Development workflow

The project follows TDD:

1. Add a failing test (Red).
2. Implement the smallest change that makes it pass (Green).
3. Refactor without changing behavior.
4. Commit the completed increment.
