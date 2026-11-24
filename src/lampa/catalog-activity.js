import { mapReleaseToLampaTorrent } from './release-mapper.js';
import { createAbortController } from '../utils/abort-controller.js';

function formatSize(sizeBytes) {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes < 0) return '';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = sizeBytes;
  let unit = 0;

  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }

  const digits = unit === 0 ? 0 : 1;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function createResultElement($, release, Lampa, scroll) {
  const item = $(`
    <div class="lampa-3d-movies__result selector">
      <div class="lampa-3d-movies__result-title"></div>
      <div class="lampa-3d-movies__result-meta"></div>
    </div>
  `);

  const formatLabel = ({
    HALF_SBS: 'Half-SBS',
    FULL_SBS: 'Full-SBS',
    HALF_OU: 'Half-OU',
    FULL_OU: 'Full-OU',
    UNKNOWN: '3D · layout unspecified',
  })[release.format] || '3D';

  const technical = [
    release.videoCodec,
    release.audioCodec,
    release.audioLanguages?.length ? release.audioLanguages.join(' / ') : '',
    release.bitrateMbps ? `${release.bitrateMbps} Mbps` : '',
    release.source,
    release.hdr,
    release.tracker ? 'Source: ' + release.tracker : '',
  ].filter(Boolean);

  const meta = [
    formatLabel,
    release.resolution,
    formatSize(release.sizeBytes),
    release.seeders == null ? '' : `${release.seeders} seeders`,
  ].filter(Boolean).join(' · ');

  item.find('.lampa-3d-movies__result-title').text(release.title);
  item.find('.lampa-3d-movies__result-meta').text([meta, technical.join(' · ')].filter(Boolean).join('  |  '));

  item.on('hover:focus', () => scroll.update(item));

  item.on('hover:enter', () => {
    const torrent = Lampa.Torrent;
    if (!torrent || typeof torrent.start !== 'function') {
      Lampa.Noty.show('LAMPA torrent playback API is unavailable', { style: 'error' });
      return;
    }

    let mapped;
    try {
      mapped = mapReleaseToLampaTorrent(release);
    } catch (error) {
      Lampa.Noty.show(error.message || 'Release cannot be played', { style: 'error' });
      return;
    }

    if (typeof torrent.back === 'function') {
      torrent.back(() => Lampa.Controller.toggle('content'));
    }

    torrent.start(mapped, { title: release.title });
  });

  return item;
}

/**
 * Creates the LAMPA Activity constructor. All provider/domain dependencies
 * are supplied from the outside; this module only owns host UI lifecycle.
 *
 * @param {object} Lampa
 * @param {Function} searchServiceFactory Returns { searchService, registry }
 * @param {Function} $
 */
export function createLampaCatalogActivity(Lampa, searchServiceFactory, $) {
  if (!Lampa || typeof searchServiceFactory !== 'function' || typeof $ !== 'function') {
    throw new TypeError('LAMPA, searchServiceFactory and jQuery are required');
  }

  return function Lampa3DMoviesActivity(activityParams = {}) {
    const scroll = new Lampa.Scroll({ mask: true, over: true });
    const root = $('<div class="lampa-3d-movies"></div>');
    const searchButton = $(`
      <div class="lampa-3d-movies__search selector">
        <div class="lampa-3d-movies__search-title">Search 3D movies</div>
        <div class="lampa-3d-movies__search-query"></div>
      </div>
    `);

    let disposed = false;
    let activeController = null;
    let searchSequence = 0;
    let lastQuery = typeof activityParams.search === 'string' ? activityParams.search : '';
    let allReleases = [];
    let activeTracker = 'all';

    scroll.body().addClass('lampa-3d-movies__scroll');
    const scrollNode = scroll.render() && scroll.render()[0];
    const handleMacWheel = (event) => {
      if (!scrollNode || !scrollNode.contains(event.target) || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      const multiplier = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? scrollNode.clientHeight : 1;
      scroll.wheel(Math.sign(event.deltaY) * Math.min(Math.abs(event.deltaY * multiplier), 600));
    };
    // Capture at document level: trackpads dispatch WheelEvents with deltaY,
    // while LAMPA's legacy Scroll handler only understands wheelDelta.
    if (typeof document !== 'undefined') {
      document.addEventListener('wheel', handleMacWheel, { capture: true, passive: false });
    }
    root.append(searchButton);
    scroll.append(root);

    const updateSearchLabel = () => {
      searchButton.find('.lampa-3d-movies__search-query')
        .text(lastQuery || 'Select to enter a movie title');
    };

    const clearResults = () => {
      root.find('.lampa-3d-movies__result, .lampa-3d-movies__message, .lampa-3d-movies__source-filter, .lampa-3d-movies__source-summary').remove();
    };

    const showMessage = (message) => {
      const element = $('<div class="lampa-3d-movies__message"></div>');
      element.text(message);
      root.append(element);
    };

    const renderReleaseItems = () => {
      root.find('.lampa-3d-movies__result').remove();
      const visible = activeTracker === 'all' ? allReleases : allReleases.filter((release) => release.tracker === activeTracker);
      visible.forEach((release) => root.append(createResultElement($, release, Lampa, scroll)));
    };

    const renderReleases = (releases, sources = []) => {
      clearResults();
      allReleases = releases;
      activeTracker = 'all';
      if (releases.length === 0) { showMessage('No 3D releases found'); return; }
      const trackers = [...new Set(releases.map((release) => release.tracker).filter(Boolean))].sort();
      if (trackers.length > 0) {
        const filters = $('<div class="lampa-3d-movies__source-filters"></div>');
        const addFilter = (id, label, count) => {
          const filter = $('<div class="lampa-3d-movies__source-filter selector"></div>');
          filter.text(label + ' (' + count + ')');
          filter.on('hover:enter', () => { activeTracker = id; renderReleaseItems(); scroll.update(filter); });
          filters.append(filter);
        };
        trackers.forEach((tracker) => addFilter(tracker, tracker, releases.filter((release) => release.tracker === tracker).length));
        root.append(filters);
      }
      renderReleaseItems();
    };

    const runSearch = async (query) => {
      const normalizedQuery = typeof query === 'string' ? query.trim() : '';
      lastQuery = normalizedQuery;
      updateSearchLabel();
      clearResults();
      if (this.activity) this.activity.loader(false);

      if (!normalizedQuery) {
        showMessage('Enter a movie title to search');
        return;
      }

      if (activeController) activeController.abort();
      activeController = createAbortController();
      const controller = activeController;
      const currentSequence = ++searchSequence;

      let configured;
      try {
        configured = searchServiceFactory();
      } catch (error) {
        showMessage(error.message || 'Unable to initialize search providers');
        return;
      }

      if (!configured.registry || configured.registry.size === 0) {
        showMessage('Configure Jackett or Prowlarr in LAMPA settings, or add a Torznab endpoint in 3D Movies settings');
        return;
      }

      this.activity.loader(true);

      try {
        const result = await configured.searchService.search(normalizedQuery, {
          signal: controller.signal,
        });

        if (disposed || currentSequence !== searchSequence) return;

        let sources = [];
        if (typeof configured.listSources === 'function') {
          try { sources = await configured.listSources({ signal: controller.signal }); }
          catch (_error) { /* Search results still include per-release tracker names. */ }
        }
        if (disposed || currentSequence !== searchSequence) return;
        renderReleases(result.releases, sources);

        if (result.errors.length > 0) {
          const failed = result.errors.map((entry) => entry.providerId).join(', ');
          showMessage(`Some providers failed: ${failed}`);
        }
      } catch (error) {
        if (disposed || currentSequence !== searchSequence || error.name === 'AbortError') return;
        showMessage(error.message || 'Search failed');
      } finally {
        if (!disposed && currentSequence === searchSequence) {
          this.activity.loader(false);
          this.activity.toggle();
        }
      }
    };

    searchButton.on('hover:enter', () => {
      const controllerName = Lampa.Controller.enabled().name;

      Lampa.Input.edit({
        title: 'Search 3D movies',
        value: lastQuery,
        free: true,
        nosave: true,
      }, (value) => {
        Lampa.Controller.toggle(controllerName);
        runSearch(value);
      });
    });

    updateSearchLabel();

    this.create = function create() {
      return this.render();
    };

    this.render = function render() {
      return scroll.render();
    };

    // ActivitySlide requires every component to expose start(). Keep this hook
    // intentionally empty: the native ActivitySlide owns header/back navigation.
    this.start = function start() {};

    this.stop = function stop() {};

    this.destroy = function destroy() {
      disposed = true;
      searchSequence += 1;
      if (activeController) activeController.abort();
      if (typeof document !== 'undefined') document.removeEventListener('wheel', handleMacWheel, true);
      scroll.destroy();
      root.remove();
    };

    this.search = runSearch;
  };
}
