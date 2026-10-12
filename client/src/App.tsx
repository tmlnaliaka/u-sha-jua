import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, BellRing, LayoutDashboard, Map, RefreshCw, Settings2 } from 'lucide-react';
import { Incident, CivilianReportInput, IncidentStatus, AuthResponse, AuthUser, UserRole, HazardAlert, HazardFeedResponse } from './types';
import { api } from './services/api';
import { hasAccessToken, setAccessToken } from './services/api';
import { AuthScreen } from './components/AuthScreen';
import { SurvivorPortal } from './components/SurvivorPortal';
import { Header } from './components/Header';
import { StatCards } from './components/StatCards';
import { DisasterMap } from './components/DisasterMap';
import { DispatchBoard } from './components/DispatchBoard';
import { IncidentInspector } from './components/IncidentInspector';
import { HazardAlertsPage, HazardAlertInspector } from './components/HazardAlertsPage';
import { ReportModal } from './components/ReportModal';
import { PreferencesPage } from './components/PreferencesPage';
import { DEFAULT_PREFERENCES, preferenceStorageKey, loadUserPreferences, UserPreferences } from './preferences';

type AdminView = 'overview' | 'map' | 'alerts' | 'incident' | 'preferences';

const NavButton: React.FC<{
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  mobileLabel: string;
}> = ({ active, children, onClick, label, mobileLabel }) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? 'page' : undefined}
    aria-label={label}
    className={`inline-flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-2 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-700 sm:px-3 ${
      active ? 'border-sky-900 text-sky-950' : 'border-transparent text-slate-600 hover:text-slate-950'
    }`}
  >
    {children}<span className="hidden sm:inline">{label}</span><span className="sm:hidden">{mobileLabel}</span>
  </button>
);

export const App: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [selectedAlert, setSelectedAlert] = useState<HazardAlert | null>(null);
  const [activeView, setActiveView] = useState<AdminView>('overview');
  const [wsConnected, setWsConnected] = useState(false);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);
  const [preferencesReadyFor, setPreferencesReadyFor] = useState<string | null>(null);
  const [preferenceStorageError, setPreferenceStorageError] = useState<string | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [incidentsLoading, setIncidentsLoading] = useState(false);
  const [incidentError, setIncidentError] = useState<string | null>(null);
  const [hazardFeed, setHazardFeed] = useState<HazardFeedResponse | null>(null);
  const [hazardsLoading, setHazardsLoading] = useState(false);
  const [hazardError, setHazardError] = useState<string | null>(null);
  const preferenceKey = currentUser ? preferenceStorageKey(currentUser.id, currentUser.role) : null;

  const playAlertSound = useCallback(() => {
    if (!preferences.soundAlerts) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch {
      // Audio playback can be blocked until the user interacts with the page.
    }
  }, [preferences.soundAlerts]);

  const showToast = (message: string) => {
    setToastMessage(message);
    window.setTimeout(() => setToastMessage(null), 4000);
  };

  useEffect(() => {
    let active = true;
    if (!hasAccessToken()) {
      setAuthLoading(false);
      return () => { active = false; };
    }
    api.getCurrentUser()
      .then((user) => { if (active) setCurrentUser(user); })
      .catch(() => { if (active) setAccessToken(null); })
      .finally(() => { if (active) setAuthLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!preferenceKey || !currentUser) {
      setPreferencesReadyFor(null);
      setPreferences(DEFAULT_PREFERENCES);
      setPreferenceStorageError(null);
      return;
    }

    const result = loadUserPreferences(preferenceKey);
    setPreferences(result.preferences);
    setPreferenceStorageError(result.error);
    setPreferencesReadyFor(preferenceKey);
    if (currentUser.role === 'admin') setActiveView(result.preferences.defaultAdminView);
  }, [currentUser?.role, preferenceKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('preferences-larger-text', Boolean(currentUser && preferences.largerText));
    root.classList.toggle('preferences-reduced-motion', Boolean(currentUser && preferences.reducedMotion));
  }, [currentUser, preferences.largerText, preferences.reducedMotion]);

  useEffect(() => {
    if (!preferenceKey || preferencesReadyFor !== preferenceKey) return;
    try {
      window.localStorage.setItem(preferenceKey, JSON.stringify(preferences));
      setPreferenceStorageError(null);
    } catch (error) {
      console.error('Failed to save user preferences', error);
      setPreferenceStorageError('Browser storage is unavailable; changes apply for this session only.');
    }
  }, [preferenceKey, preferences, preferencesReadyFor]);

  const loadIncidents = useCallback(async () => {
    setIncidentsLoading(true);
    setIncidentError(null);
    try {
      setIncidents(await api.getIncidents());
    } catch (err) {
      console.error('Failed to load incidents', err);
      setIncidentError(err instanceof Error ? err.message : 'Could not load your reports.');
    } finally {
      setIncidentsLoading(false);
    }
  }, []);

  const loadHazards = useCallback(async () => {
    setHazardsLoading(true);
    setHazardError(null);
    try {
      setHazardFeed(await api.getHazardAlerts());
    } catch (err) {
      console.error('Failed to load public hazard alerts', err);
      setHazardError(err instanceof Error ? err.message : 'Could not load public hazard alerts.');
    } finally {
      setHazardsLoading(false);
    }
  }, []);

  const handleSignOut = useCallback(() => {
    setAccessToken(null);
    setCurrentUser(null);
    setIncidents([]);
    setSelectedIncident(null);
    setSelectedAlert(null);
    setHazardFeed(null);
    setWsConnected(false);
    setActiveView('overview');
  }, []);

  useEffect(() => {
    if (!currentUser) return;
    loadIncidents();
  }, [currentUser, loadIncidents]);

  useEffect(() => {
    if (currentUser?.role !== 'admin') return;
    loadHazards();
    const refresh = window.setInterval(loadHazards, preferences.alertRefreshMinutes * 60 * 1000);
    return () => window.clearInterval(refresh);
  }, [currentUser?.role, loadHazards, preferences.alertRefreshMinutes]);

  useEffect(() => {
    if (currentUser?.role !== 'admin') {
      setWsConnected(false);
      return;
    }
    const cleanupWs = api.createWebSocket(
      (event, data) => {
        if (event === 'incident_reported' || event === 'incident_created') {
          const newIncident = data as Incident;
          setIncidents((previous) => [newIncident, ...previous.filter((incident) => incident.id !== newIncident.id)]);
          showToast(`New ${newIncident.urgency_level.toLowerCase()} ${newIncident.incident_type.toLowerCase()} report: ${newIncident.location_name}`);
          if (newIncident.urgency_level === 'Critical') playAlertSound();
        } else if (event === 'status_updated' || event === 'verification_updated') {
          const updated = data as Incident;
          setIncidents((previous) => previous.map((incident) => incident.id === updated.id ? updated : incident));
          setSelectedIncident((selected) => selected?.id === updated.id ? updated : selected);
          showToast(`${event === 'status_updated' ? 'Status' : 'Verification'} updated: ${updated.location_name}`);
        } else if (event === 'incident_deleted') {
          const deleted = data as { id: string };
          setIncidents((previous) => previous.filter((incident) => incident.id !== deleted.id));
          setSelectedIncident((selected) => selected?.id === deleted.id ? null : selected);
        }
      },
      setWsConnected,
      handleSignOut,
    );
    return cleanupWs;
  }, [currentUser?.role, handleSignOut, playAlertSound]);

  const handleAuthenticate = (response: AuthResponse, _portal: UserRole) => {
    setAccessToken(response.access_token);
    setCurrentUser(response.user);
    setIncidents([]);
    setIncidentError(null);
  };

  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences((current) => ({ ...current, [key]: value }));
  };

  const resetPreferences = () => setPreferences(DEFAULT_PREFERENCES);

  const handleAuthSubmit = (values: {
    mode: 'login' | 'register';
    email: string;
    password: string;
    display_name?: string;
    phone_number?: string;
  }) => {
    if (values.mode === 'register') {
      return api.signUp({
        email: values.email,
        password: values.password,
        display_name: values.display_name ?? '',
        phone_number: values.phone_number,
      });
    }
    return api.signIn({ email: values.email, password: values.password });
  };

  const handleUpdateStatus = async (id: string, status: IncidentStatus) => {
    try {
      const updated = await api.updateStatus(id, status);
      setIncidents((previous) => previous.map((incident) => incident.id === updated.id ? updated : incident));
      setSelectedIncident((selected) => selected?.id === id ? updated : selected);
    } catch (err) {
      console.error('Error updating status', err);
      showToast('Status update failed. Check the connection and try again.');
    }
  };

  const handleUpdateVerification = async (id: string, status: 'Confirmed' | 'Rejected') => {
    try {
      const updated = await api.updateVerification(id, status);
      setIncidents((previous) => previous.map((incident) => incident.id === updated.id ? updated : incident));
      setSelectedIncident((selected) => selected?.id === id ? updated : selected);
      showToast(`${status}: ${updated.location_name}`);
    } catch (err) {
      console.error('Error updating incident verification', err);
      showToast('Verification update failed. Check the connection and try again.');
    }
  };

  const handleSubmitReport = async (report: CivilianReportInput) => {
    try {
      const created = await api.reportIncident(report);
      setIncidents((previous) => [created, ...previous.filter((incident) => incident.id !== created.id)]);
      setSelectedIncident(created);
      setActiveView('map');
      showToast(`Report received: ${created.location_name}`);
    } catch (err) {
      console.error('Error submitting report', err);
      throw err;
    }
  };

  const selectIncident = (incident: Incident) => {
    setSelectedAlert(null);
    setSelectedIncident(incident);
  };

  const selectAlert = (alert: HazardAlert) => {
    setSelectedIncident(null);
    setSelectedAlert(alert);
  };

  const criticalCount = incidents.filter((incident) => incident.urgency_level === 'Critical' && incident.status !== 'Resolved').length;
  const activeAlerts = hazardFeed?.alerts ?? [];
  const alertSummary = hazardFeed?.sources ?? [];

  if (authLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#0B0F17] text-sm text-slate-300">Checking your secure session…</main>;
  }
  if (!currentUser) return <AuthScreen onAuthenticate={handleAuthenticate} onSubmit={handleAuthSubmit} />;
  if (currentUser.role === 'survivor') {
    return (
      <SurvivorPortal
        user={currentUser}
        incidents={incidents}
        loading={incidentsLoading}
        error={incidentError}
        onRefresh={loadIncidents}
        onSignOut={handleSignOut}
        onSubmitReport={handleSubmitReport}
        preferences={preferences}
        storageError={preferenceStorageError}
        hasMapboxKey={Boolean(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN)}
        hasOpenWeatherKey={Boolean(import.meta.env.VITE_OPENWEATHER_API_KEY)}
        onChangePreference={updatePreference}
        onResetPreferences={resetPreferences}
      />
    );
  }

  return (
    <div className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden bg-[#f4f6f5] text-slate-900">
      <Header
        connected={wsConnected}
        lowBandwidth={preferences.lowBandwidth}
        onToggleLowBandwidth={() => updatePreference('lowBandwidth', !preferences.lowBandwidth)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        soundEnabled={preferences.soundAlerts}
        onToggleSound={() => updatePreference('soundAlerts', !preferences.soundAlerts)}
        criticalCount={criticalCount}
        userName={currentUser.display_name}
        onSignOut={handleSignOut}
      />

      <nav aria-label="Administrator pages" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-300 bg-white px-2 sm:px-6">
        <NavButton active={activeView === 'overview'} onClick={() => setActiveView('overview')} label="Overview" mobileLabel="Overview"><LayoutDashboard className="h-4 w-4" /></NavButton>
        <NavButton active={activeView === 'map'} onClick={() => setActiveView('map')} label="Incident map" mobileLabel="Map"><Map className="h-4 w-4" /></NavButton>
        <NavButton active={activeView === 'alerts'} onClick={() => setActiveView('alerts')} label="Public alerts" mobileLabel="Alerts"><BellRing className="h-4 w-4" /><span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums">{activeAlerts.length}</span></NavButton>
        <NavButton active={activeView === 'preferences'} onClick={() => setActiveView('preferences')} label="Preferences" mobileLabel="Settings"><Settings2 className="h-4 w-4" /></NavButton>
      </nav>

      {activeView === 'overview' && (
        <main key="overview" className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex flex-wrap items-end justify-between gap-3 px-4 pb-4 pt-6 sm:px-7">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-950">Response overview</h1>
              <p className="mt-1 text-sm text-slate-600">Triage community reports, then coordinate response from the map.</p>
            </div>
            <button onClick={loadIncidents} disabled={incidentsLoading} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-800 disabled:opacity-60">
              <RefreshCw className={`h-4 w-4 ${incidentsLoading ? 'animate-spin' : ''}`} /> Refresh reports
            </button>
          </div>
          <StatCards incidents={incidents} />
          {incidentError && <p role="alert" className="mx-4 mt-4 rounded-md bg-rose-50 px-4 py-3 text-sm text-rose-900 sm:mx-7">{incidentError}</p>}
          {incidentsLoading && incidents.length === 0 && <p className="px-4 py-6 text-sm text-slate-600 sm:px-7">Loading community reports…</p>}
          <div className="grid min-h-[520px] gap-5 p-4 sm:p-7 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
            <div className="min-h-[520px] overflow-hidden border border-slate-300 bg-white">
              <DispatchBoard
                incidents={incidents}
                selectedIncident={selectedIncident}
                onSelectIncident={(incident) => { selectIncident(incident); setActiveView('map'); }}
                onUpdateStatus={handleUpdateStatus}
              />
            </div>

            <aside className="min-w-0 border border-slate-300 bg-white p-5">
              <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
                <div>
                  <h2 className="text-lg font-bold text-slate-950">Public warning watch</h2>
                  <p className="mt-1 text-sm text-slate-600">GDACS and Kenya Meteorological Department</p>
                </div>
                <BellRing className="mt-1 h-5 w-5 shrink-0 text-sky-900" />
              </div>
              {hazardError && <p role="alert" className="mt-4 text-sm leading-6 text-rose-900">{hazardError}</p>}
              {!hazardFeed && hazardsLoading && <p className="py-5 text-sm text-slate-600">Checking public alert sources…</p>}
              {alertSummary.map((source) => (
                <div key={source.source} className="flex items-start justify-between gap-3 border-b border-slate-200 py-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{source.source}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">{source.message}</p>
                  </div>
                  <span className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${source.status === 'ok' ? 'bg-emerald-100 text-emerald-900' : source.status === 'stale' ? 'bg-amber-100 text-amber-950' : 'bg-rose-100 text-rose-900'}`}>{source.status}</span>
                </div>
              ))}
              {activeAlerts.slice(0, 3).map((alert) => (
                <button key={`${alert.source}-${alert.id}`} onClick={() => { selectAlert(alert); setActiveView('map'); }} className="block w-full border-b border-slate-200 py-3 text-left hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-sky-800">
                  <span className="text-xs font-semibold text-sky-900">{alert.source} · {alert.severity}</span>
                  <span className="mt-1 block text-sm font-semibold leading-5 text-slate-900">{alert.headline}</span>
                  <span className="mt-1 block text-xs text-slate-600">{alert.areas.join(', ') || 'Regional alert'}</span>
                </button>
              ))}
              {!hazardsLoading && hazardFeed && activeAlerts.length === 0 && (
                <p className="py-4 text-sm leading-6 text-slate-600">No active public alerts were returned. This is not a safety guarantee; check local authorities.</p>
              )}
              <button onClick={() => setActiveView('alerts')} className="mt-4 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-sky-900 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-800">
                Open alert center <span aria-hidden="true">→</span>
              </button>
              <div className="mt-5 border-t border-slate-200 pt-4 text-sm">
                <p className="font-semibold text-slate-900">Map and key status</p>
                <p className="mt-1 leading-6 text-slate-600">OpenStreetMap and these public alert feeds work without provider keys. Weather and satellite layers are optional and available from the map page when configured.</p>
                <button onClick={() => setActiveView('map')} className="mt-3 min-h-10 rounded-md border border-slate-300 px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-800">
                  Open incident map
                </button>
              </div>
            </aside>
          </div>
        </main>
      )}

      {activeView === 'map' && (
        <main key="map" className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <section aria-label="Incident and warning map" className="relative min-h-[42vh] shrink-0 flex-1 md:min-h-0">
            <DisasterMap
              incidents={incidents}
              alerts={activeAlerts}
              selectedIncident={selectedIncident}
              selectedAlert={selectedAlert}
              onSelectIncident={selectIncident}
              onSelectAlert={selectAlert}
              lowBandwidth={preferences.lowBandwidth}
              satelliteView={preferences.mapSatellite}
              weatherLayer={preferences.weatherLayer}
              reducedMotion={preferences.reducedMotion}
              onChangeSatellite={(value) => updatePreference('mapSatellite', value)}
              onChangeWeatherLayer={(value) => updatePreference('weatherLayer', value)}
            />
          </section>
          <div className="h-[46vh] min-h-[320px] w-full shrink-0 border-t border-slate-300 md:h-full md:w-[390px] md:border-l md:border-t-0">
            {selectedIncident ? (
              <IncidentInspector
                incident={selectedIncident}
                onClose={() => setSelectedIncident(null)}
                onFullDetails={() => setActiveView('incident')}
                onUpdateStatus={handleUpdateStatus}
                onUpdateVerification={handleUpdateVerification}
              />
            ) : selectedAlert ? (
              <HazardAlertInspector alert={selectedAlert} onClose={() => setSelectedAlert(null)} />
            ) : (
              <DispatchBoard
                incidents={incidents}
                selectedIncident={selectedIncident}
                onSelectIncident={selectIncident}
                onUpdateStatus={handleUpdateStatus}
              />
            )}
          </div>
        </main>
      )}

      {activeView === 'alerts' && (
        <div className="min-h-0 flex-1">
          <HazardAlertsPage
            feed={hazardFeed}
            loading={hazardsLoading}
            error={hazardError}
            onRefresh={loadHazards}
            onOpenMap={(id) => {
              const alert = activeAlerts.find((item) => item.id === id);
              if (alert) selectAlert(alert);
              setActiveView('map');
            }}
          />
        </div>
      )}

      {activeView === 'preferences' && (
        <div className="min-h-0 flex-1">
          <PreferencesPage
            role="admin"
            preferences={preferences}
            storageError={preferenceStorageError}
            hasMapboxKey={Boolean(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN)}
            hasOpenWeatherKey={Boolean(import.meta.env.VITE_OPENWEATHER_API_KEY)}
            onChange={updatePreference}
            onReset={resetPreferences}
          />
        </div>
      )}

      {activeView === 'incident' && selectedIncident && (
        <div className="min-h-0 flex-1">
          <IncidentInspector
            incident={selectedIncident}
            fullPage
            onBack={() => setActiveView('map')}
            onUpdateStatus={handleUpdateStatus}
            onUpdateVerification={handleUpdateVerification}
          />
        </div>
      )}

      {activeView === 'incident' && !selectedIncident && (
        <main className="flex min-h-0 flex-1 flex-col items-center justify-center p-6 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-800" />
          <h1 className="mt-3 text-lg font-bold text-slate-950">Report no longer available</h1>
          <p className="mt-1 text-sm text-slate-600">The incident may have been removed or the selection was cleared.</p>
          <button onClick={() => setActiveView('overview')} className="mt-4 min-h-11 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800">Return to overview</button>
        </main>
      )}

      {toastMessage && (
        <div role="status" aria-live="polite" className="fixed bottom-5 left-1/2 z-[3000] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-md bg-slate-950 px-4 py-3 text-sm font-semibold text-white shadow-lg">
          {toastMessage}
        </div>
      )}

      <ReportModal isOpen={isReportModalOpen} onClose={() => setIsReportModalOpen(false)} onSubmit={handleSubmitReport} />
    </div>
  );
};

export default App;
