# LAMPA integration design

Status: implementation committed; automated tests and real-device compatibility remain unverified.

## Research basis

The public Android wrapper repository `lampa-app/LAMPA` describes the Android client, while the web application API and its implementation are visible in the `yumata/lampa-source` source mirror. The latter contains both plugin documentation and the relevant application code. Treat its API details as a compatibility baseline and verify against the exact LAMPA web build used for deployment.

Useful source files:

- [Plugin bootstrap and global API export](https://github.com/yumata/lampa-source/blob/main/src/app.js)
- [Plugin lifecycle documentation](https://github.com/yumata/lampa-source/blob/main/docs/ru/01-getting-started.md)
- [Activity navigation](https://github.com/yumata/lampa-source/blob/main/docs/ru/07-navigation.md)
- [Manifest and menu integration](https://github.com/yumata/lampa-source/blob/main/docs/ru/09-manifest-menu.md)
- [Network wrapper](https://github.com/yumata/lampa-source/blob/main/docs/ru/04-storage-network.md)
- [Torrent source parser](https://github.com/yumata/lampa-source/blob/main/src/core/api/sources/parser.js)
- [Torrent lifecycle and playback](https://github.com/yumata/lampa-source/blob/main/src/interaction/torrent.js)
- [TorrServer adapter](https://github.com/yumata/lampa-source/blob/main/src/interaction/torserver.js)

## Verified LAMPA plugin contract

### Loading and lifecycle

A plugin is a standalone JavaScript file injected by LAMPA. It must:

1. Guard against duplicate execution with a plugin-specific `window.*_ready` flag.
2. Wait for `app:ready` through `Lampa.Listener.follow('app', ...)`, unless `window.appready` is already true.
3. Register templates, components, and menu entries only after the app is ready.
4. Register an Activity component with `Lampa.Component.add(name, Constructor)`.
5. Open it with `Lampa.Activity.push({ url: '', title, component, page: 1, ...customData })`.
6. Return a DOM/jQuery element synchronously from component `create()`.
7. Cancel pending requests and remove listeners/DOM in `destroy()`.

The documented component lifecycle is `create → start/stop → destroy`. A component can remain in the activity stack while another screen is open, so `stop()` is not a destruction hook.

### Catalog entry point

For this product, use a dedicated side-menu entry that opens a plugin-owned Activity. Do not register a global `Manifest.plugins` context-menu action as the primary entry point: that API is intended for actions on an existing LAMPA movie card, whereas the requested experience is a standalone 3D catalog.

### Public playback API

The source mirror's `src/app.js:initClass()` explicitly exports both `Torrent` and `Torserver` on `window.Lampa`. The built-in Jackett/Prowlarr parser calls:

```js
Lampa.Torrent.start(resultElement, movieMetadata)
```

The built-in torrent flow then:

- uses `resultElement.MagnetUri || resultElement.Link` as the torrent source;
- calls `Lampa.Torserver.connected()`;
- adds the torrent through the TorrServer `/torrents` endpoint;
- retrieves its files and creates stream URLs through the existing Torserver module;
- starts playback through LAMPA's own Player and playlist APIs.

Therefore, the 3D plugin must not implement TorrServer HTTP calls, stream URL construction, file selection, or its own player. It should call the exported `Lampa.Torrent.start()` with a compatible torrent-result object. The exact installed LAMPA build must still be checked before release because the web-core API can evolve independently of the Android wrapper.

## Proposed adapter boundary

Keep all LAMPA-specific code under `src/lampa/`. No domain or provider module may import or reference `window.Lampa`.

```text
LAMPA plugin bootstrap
  └── LampaCatalogActivity
        ├── Lampa UI / navigation / lifecycle
        ├── Lampa network transport adapter
        ├── SearchService
        │     ├── ProviderRegistry
        │     └── JackettProvider / ProwlarrProvider / TorznabProvider
        ├── Release → LAMPA torrent result mapper
        └── Lampa.Torrent.start(mappedResult, movieMetadata)
```

### Release-to-LAMPA mapping

The mapping is a pure function and must have unit tests independent of LAMPA:

| Domain Release | LAMPA torrent-result field | Rule |
|---|---|---|
| `title` | `title`, `Title` | Preserve full release title; both fields are required by the inspected torrent flow |
| `url` beginning with `magnet:` | `MagnetUri` | Use as magnet source |
| other non-empty `url` | `Link` | Use as torrent download URL |
| `seeders` | `Seeders` | Pass through, or omit when null |
| `sizeBytes` | `Size` | Pass bytes as numeric size |
| `providerId` | plugin metadata only | Do not overload LAMPA's source fields |
| `format` | plugin display metadata | Keep format badge in our UI; do not alter playback URL |

The mapper must reject a release without a usable `url`. It must not silently fabricate a magnet link from an info hash. The LAMPA API accepts either `MagnetUri` or `Link`, as confirmed by the built-in parser and `Torrent.start → Torserver.hash` flow.

For movie metadata, initially pass a minimal LAMPA-compatible object with `title` and, when available, `original_title`, `release_date`, `poster_path`, `id`, and `media_type`. This metadata is for LAMPA history/TorrServer metadata and is not part of the independent Release domain model.

## Network compatibility

The current providers accept an injected `fetchImpl`. Do not assume the target LAMPA browser has native `fetch`, `AbortController`, or modern module support.

Implement a LAMPA transport adapter using `new Lampa.Reguest()` and its `native(url, success, error, postData, params)` method. Wrap it in the small Fetch-compatible response shape required by our providers (`ok`, `status`, `text()`, `json()`). On abort, call that request instance's `clear()`. The inspected `Reguest.clear()` implementation removes the request callback from its internal callback list; it does **not** expose or invoke the underlying XHR abort handle. Therefore the adapter can reject immediately and suppress late callbacks, but cannot guarantee that the network transfer itself stops. This keeps provider code independent of LAMPA and gives the host a compatibility path for older WebViews.

The plugin build bundles the ES modules and dependencies into a single IIFE script suitable for LAMPA's script-injection model. The repository build currently targets ES2017; verify this target against the actual LAMPA runtime/browser versions before release.

## First vertical slice — implementation status

The first catalog slice is now present in the repository:

- `src/lampa/entry.js` is the browser entry point; `npm run build` bundles it into `dist/lampa-3d-movies.js`.
- `src/lampa/plugin.js` guards duplicate loading, waits for `app:ready`, registers the Activity, injects styles, and adds the side-menu entry.
- `src/lampa/catalog-activity.js` provides a search prompt and selectable result rows with 3D layout, resolution, size, and seeders.
- `src/lampa/search-service.js` reuses LAMPA's existing Jackett and Prowlarr settings and adds one optional Torznab endpoint configured in the plugin settings.
- `src/lampa/release-mapper.js` maps playable releases to the LAMPA torrent result shape.
- Selecting a result calls `Lampa.Torrent.back()` to restore catalog focus after closing the torrent view, then delegates playback to `Lampa.Torrent.start()`.
- Activity destruction aborts the search signal, suppresses late callbacks, and destroys the LAMPA scroll container.

The current UI is deliberately small: no pagination, advanced filters, favorites, or automatic format conversion. A minimal settings section exists only for the optional Torznab endpoint and API key; Jackett/Prowlarr credentials are read from the existing LAMPA settings.

## TDD coverage added

### Pure mapper tests

- magnet URL maps to `MagnetUri`, with `Link` absent;
- HTTP(S) torrent URL maps to `Link`, with `MagnetUri` absent;
- title, seeders, and byte size are mapped without unit conversion;
- null optional values are omitted;
- missing/blank URL is rejected;
- mapper does not mutate the frozen Release.

### LAMPA boundary tests

The repository now contains Vitest coverage for plugin bootstrap, menu registration, settings-to-provider wiring, network response adaptation, Activity search/playback, and Activity destruction. These tests use a fake `Lampa` host object and injected dependencies; they are not a substitute for a real LAMPA runtime test.

- bootstrap waits for `app:ready` when `appready` is false;
- bootstrap initializes immediately when `appready` is true;
- Activity is registered once and opens through the menu entry;
- selecting a result calls `Lampa.Torrent.start` exactly once with mapped result and movie metadata;
- destroying Activity aborts the active search and removes listeners/DOM;
- provider failure still allows successful providers' partial results to render.

### Runtime verification still required

Unit tests with fakes prove our adapter contract, not compatibility with a real TV/WebView. Before declaring the integration complete, install the built plugin in the target LAMPA client and verify: menu entry, search, result selection, TorrServer add/file-list flow, and playback. Test the Meta Quest 3S / 4XVR path separately; it is not established merely by the existence of `Lampa.Torrent.start()`.
