import { createLampaCatalogActivity } from './catalog-activity.js';
import { createLampaSearchServiceFromHost } from './search-service.js';
import { registerLampa3DMoviesSettings } from './settings.js';

const COMPONENT_ID = 'lampa_3d_movies';

function registerMenuItem(Lampa, $) {
  const button = $(`
    <li class="menu__item selector lampa-3d-movies-menu">
      <div class="menu__ico">3D</div>
      <div class="menu__text">3D Movies</div>
    </li>
  `);

  button.on('hover:enter', () => {
    Lampa.Activity.push({
      url: '',
      title: '3D Movies',
      component: COMPONENT_ID,
      page: 1,
    });
  });

  $('.menu .menu__list').eq(0).append(button);
}

function registerStyles(Lampa) {
  Lampa.Template.add('lampa_3d_movies_style', `
    <style>
      .lampa-3d-movies__scroll { padding: 1.5em; }
      .lampa-3d-movies__search,
      .lampa-3d-movies__result {
        padding: 1em;
        margin-bottom: .6em;
        border-radius: .35em;
        background: rgba(255,255,255,.06);
      }
      .lampa-3d-movies__search-title,
      .lampa-3d-movies__result-title { font-size: 1.15em; }
      .lampa-3d-movies__search-query,
      .lampa-3d-movies__result-meta,
      .lampa-3d-movies__message {
        margin-top: .35em;
        opacity: .7;
        font-size: .9em;
      }
      .lampa-3d-movies-menu .menu__ico {
        font-size: 1.1em;
        font-weight: bold;
      }
    </style>
  `);

  $('body').append(Lampa.Template.get('lampa_3d_movies_style', {}, true));
}

export function initializeLampa3DMovies(Lampa, $) {
  if (!Lampa || typeof $ !== 'function') {
    throw new TypeError('LAMPA and jQuery are required');
  }

  registerLampa3DMoviesSettings(Lampa);

  const Activity = createLampaCatalogActivity(
    Lampa,
    () => createLampaSearchServiceFromHost(Lampa),
    $,
  );

  if (!Lampa.Component.get(COMPONENT_ID)) {
    Lampa.Component.add(COMPONENT_ID, Activity);
  }

  registerStyles(Lampa);
  registerMenuItem(Lampa, $);
}

export function startLampa3DMoviesPlugin(windowObject, Lampa, $) {
  if (windowObject.lampa_3d_movies_ready) return false;

  windowObject.lampa_3d_movies_ready = true;

  const initialize = () => initializeLampa3DMovies(Lampa, $);

  if (windowObject.appready) {
    initialize();
  } else {
    Lampa.Listener.follow('app', (event) => {
      if (event.type === 'ready') initialize();
    });
  }

  return true;
}
