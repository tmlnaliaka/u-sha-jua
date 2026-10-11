import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowUpRight, Check, CheckCircle2, Clock3, Image as ImageIcon, MapPin, Send, ShieldAlert, ShieldCheck, X, XCircle } from 'lucide-react';
import { Incident, IncidentStatus } from '../types';
import { api } from '../services/api';

interface IncidentInspectorProps {
  incident: Incident;
  fullPage?: boolean;
  onClose?: () => void;
  onBack?: () => void;
  onFullDetails?: () => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
  onUpdateVerification: (id: string, status: 'Confirmed' | 'Rejected') => void;
}

const RESPONSE_PROTOCOLS = {
  Flood: [
    'Move to higher ground using a route away from moving water.',
    'Do not walk, swim, or drive through floodwater; avoid bridges and drainage channels.',
    'Keep clear of fallen power lines and follow responder instructions.',
  ],
  Fire: [
    'Leave by the nearest safe exit; stay low if smoke is present.',
    'Do not use lifts or re-enter the building for belongings.',
    'Warn others only if safe, then follow fire and rescue personnel directions.',
  ],
  Collapse: [
    'Move away from the unstable structure and keep access routes clear.',
    'Do not enter rubble or move debris; hidden voids and further collapse are dangerous.',
    'Tell rescuers where people may be trapped and follow their directions.',
  ],
} as const;

const SecureEvidence: React.FC<{ incident: Incident }> = ({ incident }) => {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [unavailable, setUnavailable] = useState<string[]>([]);

  useEffect(() => {
    let active = true;
    const objectUrls: string[] = [];
    Promise.all(incident.evidence.map(async (item) => {
      try {
        const blob = await api.getEvidence(item.url);
        const objectUrl = URL.createObjectURL(blob);
        objectUrls.push(objectUrl);
        return [item.id, objectUrl] as const;
      } catch {
        return [item.id, null] as const;
      }
    })).then((results) => {
      if (!active) return;
      setUrls(Object.fromEntries(results.filter((result): result is readonly [string, string] => result[1] !== null)));
      setUnavailable(results.filter((result) => result[1] === null).map(([id]) => id));
    });
    return () => {
      active = false;
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [incident.evidence]);

  if (incident.evidence.length === 0) return <p className="text-sm text-slate-500">No files were attached to this report.</p>;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {incident.evidence.map((item) => {
        const url = urls[item.id];
        if (unavailable.includes(item.id)) {
          return <p key={item.id} className="col-span-2 text-sm text-slate-500 sm:col-span-3">Evidence could not be loaded. Check the connection and retry.</p>;
        }
        if (!url) {
          return <p key={item.id} className="text-sm text-slate-500">Loading {item.filename}…</p>;
        }
        return (
          <a key={item.id} href={url} target="_blank" rel="noreferrer" className="group rounded-lg border border-slate-200 bg-white p-2 focus:outline-none focus:ring-2 focus:ring-sky-600">
            {item.content_type.startsWith('image/')
              ? <img src={url} alt={`Evidence: ${item.filename}`} className="h-32 w-full rounded-md object-cover" />
              : <span className="flex h-32 items-center justify-center rounded-md bg-slate-100 text-sky-800"><ImageIcon className="h-7 w-7" /></span>}
            <span className="mt-2 block truncate text-xs font-medium text-slate-700 group-hover:text-sky-800">{item.filename}</span>
          </a>
        );
      })}
    </div>
  );
};

export const IncidentInspector: React.FC<IncidentInspectorProps> = ({
  incident,
  fullPage = false,
  onClose,
  onBack,
  onFullDetails,
  onUpdateStatus,
  onUpdateVerification,
}) => {
  const Wrapper = fullPage ? 'main' : 'aside';
  const verification = incident.verification_status;
  const confirmed = verification === 'Confirmed';
  const pendingVerification = verification === 'Unverified' || verification === 'Provisional';

  return (
    <Wrapper className={`flex min-h-0 flex-col bg-white text-slate-800 ${fullPage ? 'h-full overflow-y-auto' : 'h-full border-l border-slate-200'}`}>
      <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          {fullPage && (
            <button onClick={onBack} className="mb-3 inline-flex min-h-10 items-center gap-2 rounded-md text-sm font-semibold text-sky-800 hover:text-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-600">
              <ArrowLeft className="h-4 w-4" /> Back to operations
            </button>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-md px-2.5 py-1 text-xs font-bold uppercase tracking-wide ${
              incident.urgency_level === 'Critical' ? 'bg-red-100 text-red-800' :
              incident.urgency_level === 'Medium' ? 'bg-amber-100 text-amber-900' : 'bg-emerald-100 text-emerald-900'
            }`}>{incident.urgency_level} priority</span>
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{incident.incident_type}</span>
          </div>
          <h2 className="mt-3 text-xl font-bold leading-tight tracking-tight text-slate-950">{incident.location_name}</h2>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="h-4 w-4 shrink-0 text-sky-800" />
            {incident.coordinates.latitude.toFixed(5)}, {incident.coordinates.longitude.toFixed(5)}
          </p>
          {!fullPage && onFullDetails && (
            <button onClick={onFullDetails} className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-800 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700">
              Full incident details <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {!fullPage && onClose && (
          <button onClick={onClose} aria-label="Close incident inspector" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-600">
            <X className="h-5 w-5" />
          </button>
        )}
      </header>

      <div className={`min-h-0 flex-1 space-y-5 overflow-y-auto p-5 ${fullPage ? 'mx-auto w-full max-w-4xl' : ''}`}>
        <section className={`rounded-lg p-4 ${confirmed ? 'bg-emerald-50' : verification === 'Rejected' ? 'bg-slate-100' : 'bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            {confirmed ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-800" /> :
              verification === 'Rejected' ? <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" /> :
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-amber-800" />}
            <div>
              <h3 className="text-sm font-bold text-slate-950">{confirmed ? 'Confirmed by a dispatcher' : verification === 'Rejected' ? 'Rejected by a dispatcher' : 'Community report · not verified'}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-700">
                {confirmed
                  ? 'A dispatcher confirmed this report. Continue to follow local emergency authorities and field responders.'
                  : verification === 'Rejected'
                    ? 'This report was marked unconfirmed. Do not treat it as an active incident.'
                    : 'This is a self-reported situation. Location, submitted media, and any AI review are context only—not proof that an incident is occurring.'}
              </p>
              {incident.verification_note && <p className="mt-2 text-sm text-slate-700">Dispatcher note: {incident.verification_note}</p>}
            </div>
          </div>
        </section>

        <section>
          <h3 className="text-sm font-bold text-slate-950">What was reported</h3>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{incident.raw_text}</p>
        </section>

        {incident.ai_assessment && (
          <section className="rounded-lg bg-sky-50 p-4">
            <h3 className="text-sm font-bold text-slate-950">Automated evidence note · not verification</h3>
            <p className="mt-2 text-sm leading-6 text-slate-700">{incident.ai_assessment}</p>
          </section>
        )}

        <section>
          <div className="mb-3 flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-bold text-slate-950">Reporter evidence</h3>
          </div>
          <SecureEvidence incident={incident} />
        </section>

        {confirmed && (
          <section className="rounded-lg bg-emerald-50 p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-800" />
              <h3 className="text-sm font-bold text-slate-950">{incident.incident_type} safety guidance</h3>
            </div>
            <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-700">
              {RESPONSE_PROTOCOLS[incident.incident_type].map((instruction) => <li key={instruction}>{instruction}</li>)}
            </ol>
            <p className="mt-3 text-xs leading-5 text-emerald-950">General safety guidance only; follow instructions from on-scene emergency services.</p>
          </section>
        )}

        <section className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Response status</span>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock3 className="h-4 w-4 text-slate-500" />{incident.status}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reported</span>
            <p className="mt-1 text-sm font-semibold text-slate-800">{new Date(incident.timestamp).toLocaleString()}</p>
          </div>
        </section>

        <section className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
          {pendingVerification && (
            <>
              <button onClick={() => onUpdateVerification(incident.id, 'Confirmed')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2">
                <Check className="h-4 w-4" /> Confirm report
              </button>
              <button onClick={() => onUpdateVerification(incident.id, 'Rejected')} className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 px-4 text-sm font-semibold text-slate-800 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-500">
                <XCircle className="h-4 w-4" /> Reject report
              </button>
            </>
          )}
          {incident.status === 'Pending' && (
            <button onClick={() => onUpdateStatus(incident.id, 'Dispatched')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-sky-800 px-4 text-sm font-semibold text-white hover:bg-sky-900 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2">
              <Send className="h-4 w-4" /> Dispatch response
            </button>
          )}
          {incident.status === 'Dispatched' && (
            <button onClick={() => onUpdateStatus(incident.id, 'Resolved')} className="inline-flex min-h-11 items-center gap-2 rounded-md bg-emerald-800 px-4 text-sm font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2">
              <CheckCircle2 className="h-4 w-4" /> Mark resolved
            </button>
          )}
        </section>
      </div>
    </Wrapper>
  );
};
