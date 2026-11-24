const SETTINGS_COMPONENT = 'lampa_3d_movies_settings';

export function registerLampa3DMoviesSettings(Lampa) {
  if (!Lampa?.SettingsApi) {
    throw new TypeError('LAMPA SettingsApi is required');
  }

  Lampa.SettingsApi.addComponent({
    component: SETTINGS_COMPONENT,
    name: '3D Movies',
    icon: '',
  });

  Lampa.SettingsApi.addParam({
    component: SETTINGS_COMPONENT,
    param: {
      name: 'lampa_3d_torznab_url',
      type: 'input',
      default: '',
    },
    field: {
      name: 'Torznab API endpoint',
      description: 'Full Torznab API URL, for example https://indexer.example/api',
    },
  });

  Lampa.SettingsApi.addParam({
    component: SETTINGS_COMPONENT,
    param: {
      name: 'lampa_3d_torznab_api_key',
      type: 'input',
      default: '',
    },
    field: {
      name: 'Torznab API key',
      description: 'API key for the Torznab endpoint. Stored in local LAMPA settings.',
    },
  });
}
