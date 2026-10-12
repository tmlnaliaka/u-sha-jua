export type AdminLandingView = 'overview' | 'map' | 'alerts';
export type WeatherLayer = '' | 'precipitation_new' | 'clouds_new' | 'temp_new' | 'wind_new' | 'pressure_new';

export interface UserPreferences {
  soundAlerts: boolean;
  lowBandwidth: boolean;
  reducedMotion: boolean;
  largerText: boolean;
  defaultAdminView: AdminLandingView;
  mapSatellite: boolean;
  weatherLayer: WeatherLayer;
  alertRefreshMinutes: 5 | 15 | 30;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  soundAlerts: true,
  lowBandwidth: false,
  reducedMotion: false,
  largerText: false,
  defaultAdminView: 'overview',
  mapSatellite: false,
  weatherLayer: '',
  alertRefreshMinutes: 5,
};

export const preferenceStorageKey = (userId: string, role: string) =>
  `usha-jua:preferences:${role}:${userId}`;

export function loadUserPreferences(key: string): { preferences: UserPreferences; error: string | null } {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return { preferences: DEFAULT_PREFERENCES, error: null };

    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') {
      return { preferences: DEFAULT_PREFERENCES, error: 'Saved preferences were unreadable and have been reset.' };
    }

    const stored = value as Partial<UserPreferences>;
    const preferences: UserPreferences = {
      soundAlerts: typeof stored.soundAlerts === 'boolean' ? stored.soundAlerts : DEFAULT_PREFERENCES.soundAlerts,
      lowBandwidth: typeof stored.lowBandwidth === 'boolean' ? stored.lowBandwidth : DEFAULT_PREFERENCES.lowBandwidth,
      reducedMotion: typeof stored.reducedMotion === 'boolean' ? stored.reducedMotion : DEFAULT_PREFERENCES.reducedMotion,
      largerText: typeof stored.largerText === 'boolean' ? stored.largerText : DEFAULT_PREFERENCES.largerText,
      defaultAdminView: stored.defaultAdminView === 'map' || stored.defaultAdminView === 'alerts' || stored.defaultAdminView === 'overview'
        ? stored.defaultAdminView
        : DEFAULT_PREFERENCES.defaultAdminView,
      mapSatellite: typeof stored.mapSatellite === 'boolean' ? stored.mapSatellite : DEFAULT_PREFERENCES.mapSatellite,
      weatherLayer: stored.weatherLayer === 'precipitation_new' || stored.weatherLayer === 'clouds_new' || stored.weatherLayer === 'temp_new' || stored.weatherLayer === 'wind_new' || stored.weatherLayer === 'pressure_new'
        ? stored.weatherLayer
        : DEFAULT_PREFERENCES.weatherLayer,
      alertRefreshMinutes: stored.alertRefreshMinutes === 15 || stored.alertRefreshMinutes === 30 || stored.alertRefreshMinutes === 5
        ? stored.alertRefreshMinutes
        : DEFAULT_PREFERENCES.alertRefreshMinutes,
    };
    return { preferences, error: null };
  } catch {
    return {
      preferences: DEFAULT_PREFERENCES,
      error: 'Browser storage is unavailable; preferences are temporary for this session.',
    };
  }
}
