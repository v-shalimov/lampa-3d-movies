import { startLampa3DMoviesPlugin } from './plugin.js';

if (typeof window !== 'undefined' && window.Lampa) {
  startLampa3DMoviesPlugin(window, window.Lampa, window.jQuery || window.$);
}
