import React, { useState } from 'react';
import { Activity, LogOut, MapPin, RefreshCw, Send } from 'lucide-react';
import { AuthUser, CivilianReportInput, Incident } from '../types';
import { ReportModal } from './ReportModal';

interface SurvivorPortalProps {
  user: AuthUser;
  incidents: Incident[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onSignOut: () => void;
  onSubmitReport: (report: CivilianReportInput) => Promise<void>;
}

export const SurvivorPortal: React.FC<SurvivorPortalProps> = ({
  user,
  incidents,
  loading,
  error,
  onRefresh,
  onSignOut,
  onSubmitReport,
}) => {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#0B0F17] text-slate-100">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 bg-[#0E1522] px-4 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-950 text-blue-300">
            <Activity className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-base font-bold">u-SHA-jua · Survivor portal</h1>
            <p className="text-xs text-slate-400">Signed in as {user.display_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <h2 className="text-2xl font-bold">Your incident reports</h2>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">
              Follow response updates for reports submitted from this account. Emergency teams may need time to review each report.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="flex min-h-11 items-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          >
            <Send className="h-4 w-4" />
            Send a report
          </button>
        </section>

        <p className="mt-5 rounded-lg border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm leading-6 text-amber-100">
          If there is immediate danger, contact local emergency services now. A report here is not an emergency call.
        </p>

        {error && <p role="alert" className="mt-5 rounded-lg bg-red-950/70 px-4 py-3 text-sm text-red-200">{error}</p>}

        <section aria-label="Your reports" className="mt-6">
          {loading && <p className="py-10 text-center text-sm text-slate-400">Loading your reports…</p>}
          {!loading && incidents.length === 0 && (
            <div className="py-14 text-center">
              <h3 className="text-lg font-semibold">No reports from this account</h3>
              <p className="mt-2 text-sm text-slate-400">Submitted reports and status updates will appear here.</p>
            </div>
          )}
          {!loading && incidents.length > 0 && (
            <ol className="divide-y divide-white/10">
              {incidents.map((incident) => (
                <li key={incident.id} className="py-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-300" />
                      <h3 className="font-semibold">{incident.location_name}</h3>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      incident.status === 'Resolved'
                        ? 'bg-emerald-950 text-emerald-200'
                        : incident.status === 'Dispatched'
                          ? 'bg-blue-950 text-blue-200'
                          : 'bg-amber-950 text-amber-200'
                    }`}>{incident.status}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{incident.raw_text}</p>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                    <span>{incident.incident_type} · {incident.urgency_level}</span>
                    <span>{new Date(incident.timestamp).toLocaleString()}</span>
                    <span>Verification: {incident.verification_status}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      </main>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        onSubmit={onSubmitReport}
        defaultPhone={user.phone_number ?? ''}
      />
    </div>
  );
};
