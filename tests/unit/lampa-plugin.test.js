import { describe, expect, it, vi } from 'vitest';
import {
  initializeLampa3DMovies,
  startLampa3DMoviesPlugin,
} from '../../src/lampa/plugin.js';

function makeElement() {
  return {
    handlers: {},
    append: vi.fn(),
    on(event, handler) { this.handlers[event] = handler; return this; },
    eq: vi.fn(() => this),
  };
}

function makeHost() {
  const components = new Map();
  const menuList = makeElement();
  const body = makeElement();
  const elements = [];

  const $ = vi.fn((markup) => {
    const element = makeElement();
    element.markup = markup;
    elements.push(element);
    if (markup === 'body') return body;
    if (markup === '.menu .menu__list') return { eq: () => menuList };
    return element;
  });

  const Lampa = {
    SettingsApi: {
      addComponent: vi.fn(),
      addParam: vi.fn(),
    },
    Component: {
      get: vi.fn((id) => components.get(id) || null),
      add: vi.fn((id, constructor) => components.set(id, constructor)),
    },
    Template: {
      add: vi.fn(),
      get: vi.fn(() => makeElement()),
    },
    Listener: { follow: vi.fn() },
    Activity: { push: vi.fn() },
  };

  return { Lampa, $, menuList, body, elements };
}

describe('startLampa3DMoviesPlugin', () => {
  it('initializes immediately when LAMPA is already ready', () => {
    const host = makeHost();
    const windowObject = { appready: true };

    expect(startLampa3DMoviesPlugin(windowObject, host.Lampa, host.$)).toBe(true);
    expect(windowObject.lampa_3d_movies_ready).toBe(true);
    expect(host.Lampa.Component.add).toHaveBeenCalledWith(
      'lampa_3d_movies',
      expect.any(Function),
    );
    expect(host.Lampa.SettingsApi.addComponent).toHaveBeenCalledOnce();
    expect(host.menuList.append).toHaveBeenCalledOnce();
  });

  it('waits for app:ready before registering UI', () => {
    const host = makeHost();
    const windowObject = { appready: false };

    startLampa3DMoviesPlugin(windowObject, host.Lampa, host.$);

    expect(host.Lampa.Component.add).not.toHaveBeenCalled();
    expect(host.Lampa.Listener.follow).toHaveBeenCalledWith('app', expect.any(Function));

    const onReady = host.Lampa.Listener.follow.mock.calls[0][1];
    onReady({ type: 'ready' });

    expect(host.Lampa.Component.add).toHaveBeenCalledOnce();
  });

  it('does not register the plugin twice', () => {
    const host = makeHost();
    const windowObject = { appready: true };

    startLampa3DMoviesPlugin(windowObject, host.Lampa, host.$);
    expect(startLampa3DMoviesPlugin(windowObject, host.Lampa, host.$)).toBe(false);

    expect(host.Lampa.Component.add).toHaveBeenCalledOnce();
    expect(host.Lampa.SettingsApi.addComponent).toHaveBeenCalledOnce();
  });

  it('opens the dedicated catalog Activity from the menu', () => {
    const host = makeHost();
    initializeLampa3DMovies(host.Lampa, host.$);

    const menuButton = host.elements.find((element) => (
      typeof element.markup === 'string' && element.markup.includes('lampa-3d-movies-menu')
    ));
    menuButton.handlers['hover:enter']();

    expect(host.Lampa.Activity.push).toHaveBeenCalledWith({
      url: '',
      title: '3D Movies',
      component: 'lampa_3d_movies',
      page: 1,
    });
  });
});
