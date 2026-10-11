import React from 'react';
import { AlertTriangle, ArrowUpRight, CloudRain, ExternalLink, Info, MapPin, RefreshCw, ShieldCheck, WifiOff, X } from 'lucide-react';
import { HazardAlert, HazardFeedResponse, HazardSourceState, HazardSourceStatus } from '../types';

interface HazardAlertsPageProps {
  feed: HazardFeedResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onOpenMap: (alertId: string) => void;
}

const sourceTone: Record<HazardSourceState, string> = {
  ok: 'bg-emerald-100 text-emerald-900',
  stale: 'bg-amber-100 text-amber-950',
  degraded: 'bg-orange-100 text-orange-950',
  error: 'bg-rose-100 text-rose-900',
};

const SourceStatus: React.FC<{ status: HazardSourceStatus }> = ({ status }) => (
  <div className="flex min-w-0 flex-col gap-2 border-b border-slate-200 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-bold text-slate-950">{status.source}</p>
        <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${sourceTone[status.status]}`}>{status.status}</span>
      </div>
      <p className="mt-1 text-sm leading-5 text-slate-600">{status.message}</p>
    </div>
    <div className="shrink-0 text-xs text-slate-500 sm:text-right">
      <p>Checked {new Date(status.fetched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
      {status.published_at && <p>Feed updated {new Date(status.published_at).toLocaleString()}</p>}
    </div>
  </div>
);

export const HazardAlertsPage: React.FC<HazardAlertsPageProps> = ({ feed, loading, error, onRefresh, onOpenMap }) => {
  const weatherConfigured = Boolean(import.meta.env.VITE_OPENWEATHER_API_KEY);
  const satelliteConfigured = Boolean(import.meta.env.VITE_MAPBOX_ACCESS_TOKEN);

  return (
    <main className="h-full overflow-y-auto bg-[#f4f6f5] text-slate-800">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-7 sm:py-8">
        <header className="flex flex-col gap-4 border-b border-slate-300 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Public hazard alerts</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Official regional warnings alongside global disaster monitoring. These feeds are separate from community reports and never verify them.</p>
          </div>
          <button onClick={onRefresh} disabled={loading} className="inline-flex min-h-11 items-center justify-center gap-2 self-start rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700 disabled:cursor-wait disabled:opacity-60 sm:self-auto">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh alerts
          </button>
        </header>

        <section aria-labelledby="source-status-heading" className="mt-6 border-y border-slate-300 bg-white px-4 sm:px-5">
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 py-4">
            <h2 id="source-status-heading" className="text-sm font-bold text-slate-950">Feed status and freshness</h2>
            {feed && <span className="text-xs text-slate-500">Checked {new Date(feed.fetched_at).toLocaleString()}</span>}
          </div>
          {loading && !feed && <p className="py-5 text-sm text-slate-600">Connecting to public alert feeds…</p>}
          {error && (
            <p role="alert" className="flex items-start gap-2 py-4 text-sm leading-6 text-rose-900">
              <WifiOff className="mt-1 h-4 w-4 shrink-0" /> {error}
            </p>
          )}
          {feed?.sources.map((source) => <SourceStatus key={source.source} status={source} />)}
        </section>

        <section className="mt-8">
          <div className="flex items-end justify-between gap-3 border-b border-slate-300 pb-3">
            <div>
              <h2 className="text-lg font-bold text-slate-950">Active notices</h2>
              <p className="mt-1 text-sm text-slate-600">Expired, cancelled, or non-public KMD notices are excluded.</p>
            </div>
            <span className="text-sm font-semibold text-slate-600">{feed?.alerts.length ?? 0} current</span>
          </div>

          {loading && !feed && <p className="py-8 text-sm text-slate-600">Loading current notices…</p>}
          {!loading && !error && feed?.alerts.length === 0 && (
            <div className="py-10">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" />
                <div>
                  <h3 className="font-semibold text-slate-950">No active notices were returned</h3>
                  <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">This means the responding feeds reported no current alerts; it does not mean conditions are safe. Check the source status above and local authorities for current instructions.</p>
                </div>
              </div>
            </div>
          )}
          <div className="divide-y divide-slate-300">
            {feed?.alerts.map((alert) => (
              <article key={`${alert.source}-${alert.id}`} className="py-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-sky-100 px-2 py-1 text-xs font-bold text-sky-950">{alert.source}</span>
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{alert.severity} severity</span>
                      {alert.alert_level && alert.alert_level !== alert.severity && <span className="text-xs text-slate-500">{alert.alert_level} alert</span>}
                    </div>
                    <h3 className="mt-2 text-lg font-bold leading-6 text-slate-950">{alert.headline}</h3>
                    <p className="mt-1 text-sm text-slate-600">{alert.event}{alert.areas.length > 0 ? ` · ${alert.areas.join(', ')}` : ''}</p>
                    {alert.description && <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-700">{alert.description}</p>}
                    {alert.instruction && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-sm leading-6 text-amber-950"><strong>Official instruction: </strong>{alert.instruction}</p>}
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      <span>Issued {alert.issued_at ? new Date(alert.issued_at).toLocaleString() : 'time not provided'}</span>
                      {alert.expires_at && <span>Expires {new Date(alert.expires_at).toLocaleString()}</span>}
                      {alert.coordinates && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> Approximate alert area</span>}
                    </div>
                    {alert.coordinates && <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-500">Alert coordinates are a representative point for a warning area, not an exact incident location.</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2 sm:flex-col">
                    {alert.coordinates && (
                      <button onClick={() => onOpenMap(alert.id)} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-slate-900 px-3 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2">
                        View on map <ArrowUpRight className="h-4 w-4" />
                      </button>
                    )}
                    <a href={alert.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700">
                      Source notice <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="mt-8 border-t border-slate-300 pt-5">
          <div className="flex items-start gap-3">
            <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-900" />
            <div>
              <h2 className="text-sm font-bold text-slate-950">Configuration audit</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">OpenStreetMap, GDACS, and KMD CAP public warnings do not need provider API keys. OpenWeather overlays and Mapbox satellite context are optional. Gemini, Google Maps reverse geocoding, and Africa’s Talking SMS are optional server integrations; their credentials belong in server configuration. Authentication requires server auth/admin settings, not a mapping API key. Never enter credentials in this screen.</p>
              <div className="mt-4 grid gap-x-6 gap-y-2 text-xs font-medium text-slate-700 sm:grid-cols-2">
                <p className="inline-flex items-center gap-1.5"><CloudRain className="h-3.5 w-3.5 text-sky-800" /> OpenWeather overlays · {weatherConfigured ? 'key detected in client config' : 'key not configured (optional)'}</p>
                <p className="inline-flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-600" /> Mapbox satellite · {satelliteConfigured ? 'token detected in client config' : 'token not configured (optional)'}</p>
                <p className="inline-flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5 text-amber-800" /> OSM, GDACS and KMD · no key needed</p>
                <p className="text-slate-600">Server-side credentials are not exposed to this browser view; see deployment configuration.</p>
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
};

export const HazardAlertInspector: React.FC<{ alert: HazardAlert; onClose: () => void }> = ({ alert, onClose }) => (
  <aside className="flex h-full min-h-0 flex-col border-l border-slate-200 bg-white text-slate-800">
    <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
      <div>
        <span className="rounded bg-sky-100 px-2 py-1 text-xs font-bold text-sky-950">{alert.source}</span>
        <h2 className="mt-3 text-lg font-bold leading-6 text-slate-950">{alert.headline}</h2>
        <p className="mt-1 text-sm text-slate-600">{alert.event}</p>
      </div>
      <button onClick={onClose} aria-label="Close warning details" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-700">
        <X className="h-5 w-5" />
      </button>
    </header>
    <div className="flex-1 space-y-5 overflow-y-auto p-5">
      <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-700">{alert.severity} severity · {alert.urgency} urgency · {alert.certainty} certainty</p>
      {alert.areas.length > 0 && <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Areas named by source</h3><p className="mt-1 text-sm leading-6 text-slate-800">{alert.areas.join(', ')}</p></section>}
      {alert.description && <section><h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">Notice</h3><p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-700">{alert.description}</p></section>}
      {alert.instruction && <section className="rounded-md bg-amber-50 p-3"><h3 className="text-sm font-bold text-amber-950">Official instruction</h3><p className="mt-1 text-sm leading-6 text-amber-950">{alert.instruction}</p></section>}
      {alert.coordinates && <section className="rounded-md bg-sky-50 p-3"><h3 className="text-sm font-bold text-sky-950">Approximate warning area</h3><p className="mt-1 text-sm text-sky-950">{alert.coordinates.latitude.toFixed(4)}, {alert.coordinates.longitude.toFixed(4)}</p><p className="mt-2 text-xs leading-5 text-sky-900">This representative point is not an exact incident location and does not verify a community report.</p></section>}
      <section className="space-y-1 border-t border-slate-200 pt-4 text-xs leading-5 text-slate-600">
        <p>Issued: {alert.issued_at ? new Date(alert.issued_at).toLocaleString() : 'Not provided'}</p>
        <p>Effective: {alert.effective_at ? new Date(alert.effective_at).toLocaleString() : 'Not provided'}</p>
        <p>Expires: {alert.expires_at ? new Date(alert.expires_at).toLocaleString() : 'Not provided'}</p>
      </section>
      <a href={alert.source_url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2">
        Open official notice <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  </aside>
);
