import { describe, expect, it, vi } from 'vitest';
import { createLampaCatalogActivity } from '../../src/lampa/catalog-activity.js';

class FakeElement {
  constructor(markup = '') {
    this.markup = markup;
    this.events = {};
    this.children = [];
    this.values = {};
  }

  addClass() { return this; }
  append(child) { this.children.push(child); return this; }
  remove() { this.removed = true; return this; }
  detach() { return this; }
  text(value) { this.textValue = value; return this; }
  find(selector) {
    if (!this.values[selector]) this.values[selector] = new FakeElement(selector);
    return this.values[selector];
  }
  on(event, handler) { this.events[event] = handler; return this; }
  trigger(event) { this.events[event]?.(); return this; }
}

function makeHost() {
  const elements = [];
  const $ = (markup) => {
    const element = new FakeElement(markup);
    elements.push(element);
    return element;
  };

  const scroll = {
    body: () => new FakeElement('scroll-body'),
    append: vi.fn(),
    render: () => new FakeElement('scroll-root'),
    destroy: vi.fn(),
  };

  const Lampa = {
    Scroll: vi.fn(() => scroll),
    Input: { edit: vi.fn() },
    Controller: {
      enabled: () => ({ name: 'content' }),
      toggle: vi.fn(),
      add: vi.fn(),
    },
    Torrent: { start: vi.fn(), back: vi.fn() },
    Activity: { backward: vi.fn() },
    Noty: { show: vi.fn() },
  };

  return { Lampa, $, scroll, elements };
}

const release = {
  providerId: 'jackett-primary',
  providerReleaseId: 'release-1',
  title: 'Avatar 3D Half-SBS 1080p',
  format: 'HALF_SBS',
  resolution: '1080p',
  sizeBytes: 1024,
  seeders: 12,
  url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567',
};

describe('createLampaCatalogActivity', () => {
  it('does not override the native LAMPA content controller', () => {
    const host = makeHost();
    const Activity = createLampaCatalogActivity(host.Lampa, () => ({
      registry: { size: 0 },
      searchService: { search: vi.fn() },
    }), host.$);
    const activity = new Activity({});
    activity.activity = { loader: vi.fn(), toggle: vi.fn() };

    activity.create();

    // ActivitySlide owns the native content controller and header back action.
    // The catalog component must not replace it.
    expect(host.Lampa.Controller.add).not.toHaveBeenCalled();
  });


  it('searches configured providers and starts playback through LAMPA', async () => {
    const host = makeHost();
    const search = vi.fn().mockResolvedValue({ releases: [release], errors: [] });
    const searchServiceFactory = () => ({
      registry: { size: 1 },
      searchService: { search },
    });
    const Activity = createLampaCatalogActivity(host.Lampa, searchServiceFactory, host.$);
    const activity = new Activity({});
    activity.activity = { loader: vi.fn(), toggle: vi.fn() };

    activity.create();

    const searchButton = host.elements.find((element) => (
      typeof element.markup === 'string' && element.markup.includes('lampa-3d-movies__search')
    ));
    searchButton.trigger('hover:enter');

    const onInput = host.Lampa.Input.edit.mock.calls[0][1];
    onInput('Avatar');
    await Promise.resolve();
    await Promise.resolve();

    expect(search).toHaveBeenCalledWith('Avatar', {
      signal: expect.any(AbortSignal),
    });

    const resultElement = host.elements.find((element) => (
      typeof element.markup === 'string' && element.markup.includes('lampa-3d-movies__result selector')
    ));
    expect(resultElement).toBeDefined();
    resultElement.trigger('hover:enter');

    expect(host.Lampa.Torrent.back).toHaveBeenCalledWith(expect.any(Function));
    host.Lampa.Torrent.back.mock.calls[0][0]();
    expect(host.Lampa.Controller.toggle).toHaveBeenCalledWith('content');
    expect(host.Lampa.Torrent.start).toHaveBeenCalledWith({
      title: release.title,
      Title: release.title,
      MagnetUri: release.url,
      Seeders: 12,
      Size: 1024,
    }, { title: release.title });
  });

  it('aborts an active search when the Activity is destroyed', async () => {
    const host = makeHost();
    let capturedSignal;
    const search = vi.fn((_query, { signal }) => {
      capturedSignal = signal;
      return new Promise(() => {});
    });
    const Activity = createLampaCatalogActivity(host.Lampa, () => ({
      registry: { size: 1 },
      searchService: { search },
    }), host.$);
    const activity = new Activity({});
    activity.activity = { loader: vi.fn(), toggle: vi.fn() };

    activity.create();
    const searchButton = host.elements.find((element) => (
      typeof element.markup === 'string' && element.markup.includes('lampa-3d-movies__search')
    ));
    searchButton.trigger('hover:enter');
    host.Lampa.Input.edit.mock.calls[0][1]('Avatar');
    await Promise.resolve();

    expect(capturedSignal.aborted).toBe(false);
    activity.destroy();
    expect(capturedSignal.aborted).toBe(true);
    expect(host.scroll.destroy).toHaveBeenCalledOnce();
  });

  it('shows a setup hint when no providers are configured', async () => {
    const host = makeHost();
    const Activity = createLampaCatalogActivity(host.Lampa, () => ({
      registry: { size: 0 },
      searchService: { search: vi.fn() },
    }), host.$);
    const activity = new Activity({});
    activity.activity = { loader: vi.fn(), toggle: vi.fn() };

    activity.create();
    const searchButton = host.elements.find((element) => (
      typeof element.markup === 'string' && element.markup.includes('lampa-3d-movies__search')
    ));
    searchButton.trigger('hover:enter');
    host.Lampa.Input.edit.mock.calls[0][1]('Avatar');

    expect(host.elements.some((element) => (
      element.textValue === 'Configure Jackett or Prowlarr in LAMPA settings, or add a Torznab endpoint in 3D Movies settings'
    ))).toBe(true);
  });
});
