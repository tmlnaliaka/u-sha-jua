import React from 'react';
import { RotateCcw, Settings2 } from 'lucide-react';
import { UserRole } from '../types';
import { AdminLandingView, UserPreferences, WeatherLayer } from '../preferences';

interface PreferencesPageProps {
  role: UserRole;
  preferences: UserPreferences;
  storageError: string | null;
  hasMapboxKey: boolean;
  hasOpenWeatherKey: boolean;
  onChange: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  onReset: () => void;
}

const Switch: React.FC<{
  id: string;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}> = ({ id, title, description, checked, onChange }) => (
  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 py-4 last:border-b-0">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-950">{title}</label>
      <p id={`${id}-description`} className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-label={title}
      aria-describedby={`${id}-description`}
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors ${
        checked ? 'border-sky-900 bg-sky-900' : 'border-slate-400 bg-slate-200'
      }`}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

const SelectRow: React.FC<{
  id: string;
  title: string;
  description: string;
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  children: React.ReactNode;
}> = ({ id, title, description, value, disabled, onChange, children }) => (
  <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 py-4 last:border-b-0">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-semibold text-slate-950">{title}</label>
      <p id={`${id}-description`} className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
    </div>
    <select
      id={id}
      value={value}
      aria-describedby={`${id}-description`}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="min-h-11 min-w-44 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
    >
      {children}
    </select>
  </div>
);

export const PreferencesPage: React.FC<PreferencesPageProps> = ({
  role,
  preferences,
  storageError,
  hasMapboxKey,
  hasOpenWeatherKey,
  onChange,
  onReset,
}) => {
  const setWeatherLayer = (value: string) => {
    if (value === '' || value === 'precipitation_new' || value === 'clouds_new' || value === 'temp_new' || value === 'wind_new' || value === 'pressure_new') {
      onChange('weatherLayer', value as WeatherLayer);
    }
  };
  const setLandingView = (value: string) => {
    if (value === 'overview' || value === 'map' || value === 'alerts') onChange('defaultAdminView', value as AdminLandingView);
  };

  return (
    <main className="h-full overflow-y-auto bg-[#f4f6f5]">
      <div className="mx-auto max-w-4xl px-4 py-7 sm:px-7">
        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-300 pb-5">
          <div className="flex items-start gap-3">
            <Settings2 className="mt-1 h-5 w-5 shrink-0 text-sky-900" aria-hidden="true" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Preferences</h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
                Choose how u-SHA-jua behaves on this device. These settings are saved in this browser for your account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onReset}
            className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            <RotateCcw className="h-4 w-4" />
            Restore defaults
          </button>
        </header>

        {storageError ? (
          <p role="status" className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">{storageError}</p>
        ) : (
          <p role="status" className="mt-5 text-xs font-medium text-emerald-800">Preferences saved in this browser</p>
        )}

        <section aria-labelledby="accessibility-heading" className="mt-5 border-y border-slate-300 bg-white px-4 sm:px-6">
          <h2 id="accessibility-heading" className="pt-2 text-base font-bold text-slate-950">Display and accessibility</h2>
          <Switch
            id="pref-larger-text"
            title="Larger text"
            description="Increase the interface text size to make labels and report details easier to read."
            checked={preferences.largerText}
            onChange={(value) => onChange('largerText', value)}
          />
          <Switch
            id="pref-reduced-motion"
            title="Reduce motion"
            description="Limit interface transitions and map camera animation."
            checked={preferences.reducedMotion}
            onChange={(value) => onChange('reducedMotion', value)}
          />
        </section>

        <section aria-labelledby="connectivity-heading" className="mt-5 border-y border-slate-300 bg-white px-4 sm:px-6">
          <h2 id="connectivity-heading" className="pt-2 text-base font-bold text-slate-950">Connectivity</h2>
          <Switch
            id="pref-low-bandwidth"
            title="Low-bandwidth mode"
            description="Pause optional satellite and weather map tiles. The OpenStreetMap base layer and essential reports remain available."
            checked={preferences.lowBandwidth}
            onChange={(value) => onChange('lowBandwidth', value)}
          />
        </section>

        {role === 'admin' && (
          <>
            <section aria-labelledby="dispatch-heading" className="mt-5 border-y border-slate-300 bg-white px-4 sm:px-6">
              <h2 id="dispatch-heading" className="pt-2 text-base font-bold text-slate-950">Dispatch and alerts</h2>
              <Switch
                id="pref-sound-alerts"
                title="Critical incident sound"
                description="Play a short audio cue when a new critical community report arrives in the administrator portal."
                checked={preferences.soundAlerts}
                onChange={(value) => onChange('soundAlerts', value)}
              />
              <SelectRow
                id="pref-alert-refresh"
                title="Public warning refresh"
                description="How often this portal checks GDACS and Kenya Meteorological Department feeds."
                value={String(preferences.alertRefreshMinutes)}
                onChange={(value) => onChange('alertRefreshMinutes', Number(value) as UserPreferences['alertRefreshMinutes'])}
              >
                <option value="5">Every 5 minutes</option>
                <option value="15">Every 15 minutes</option>
                <option value="30">Every 30 minutes</option>
              </SelectRow>
              <SelectRow
                id="pref-admin-view"
                title="Administrator start page"
                description="Choose the page shown when you next sign in."
                value={preferences.defaultAdminView}
                onChange={setLandingView}
              >
                <option value="overview">Response overview</option>
                <option value="map">Incident map</option>
                <option value="alerts">Public alerts</option>
              </SelectRow>
            </section>

            <section aria-labelledby="map-heading" className="mt-5 border-y border-slate-300 bg-white px-4 sm:px-6">
              <h2 id="map-heading" className="pt-2 text-base font-bold text-slate-950">Map defaults</h2>
              <Switch
                id="pref-map-satellite"
                title="Start with satellite context"
                description={hasMapboxKey
                  ? 'Use optional Mapbox satellite tiles as the map base. Imagery is not live incident evidence.'
                  : 'Requires VITE_MAPBOX_ACCESS_TOKEN. OpenStreetMap remains the default map without it.'}
                checked={preferences.mapSatellite}
                onChange={(value) => onChange('mapSatellite', value)}
              />
              <SelectRow
                id="pref-weather-layer"
                title="Default weather overlay"
                description={hasOpenWeatherKey
                  ? 'Choose an optional OpenWeather map layer to show when you open the incident map.'
                  : 'Requires VITE_OPENWEATHER_API_KEY. No weather tiles are loaded without it.'}
                value={preferences.weatherLayer}
                disabled={!hasOpenWeatherKey}
                onChange={setWeatherLayer}
              >
                <option value="">Off</option>
                <option value="precipitation_new">Precipitation</option>
                <option value="clouds_new">Clouds</option>
                <option value="temp_new">Temperature</option>
                <option value="wind_new">Wind</option>
                <option value="pressure_new">Pressure</option>
              </SelectRow>
              {(preferences.mapSatellite || preferences.weatherLayer) && (
                <p className="pb-4 text-xs leading-5 text-slate-600">
                  {preferences.lowBandwidth
                    ? 'Optional overlays are paused while low-bandwidth mode is on.'
                    : 'Optional layers load only when you open the map. They do not change report verification.'}
                </p>
              )}
            </section>
          </>
        )}

        <p className="mt-5 text-xs leading-5 text-slate-600">
          These are device-specific display and refresh preferences, not emergency contact or SMS settings. SMS updates require consent when a report is submitted.
        </p>
      </div>
    </main>
  );
};
