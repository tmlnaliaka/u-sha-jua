import React, { useMemo, useState } from 'react';
import { Incident, IncidentStatus, IncidentType } from '../types';
import { Search, Send, CheckCircle2, MapPin, AlertOctagon, Flame, Waves, Building2, ShieldCheck } from 'lucide-react';

interface DispatchBoardProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
}

export const DispatchBoard: React.FC<DispatchBoardProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onUpdateStatus,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterUrgency, setFilterUrgency] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterVerification, setFilterVerification] = useState('ALL');

  const filteredIncidents = useMemo(() => incidents.filter((incident) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = incident.raw_text.toLowerCase().includes(search) || incident.location_name.toLowerCase().includes(search);
    return matchesSearch
      && (filterType === 'ALL' || incident.incident_type === filterType)
      && (filterUrgency === 'ALL' || incident.urgency_level === filterUrgency)
      && (filterStatus === 'ALL' || incident.status === filterStatus)
      && (filterVerification === 'ALL' || incident.verification_status === filterVerification);
  }), [incidents, searchTerm, filterType, filterUrgency, filterStatus, filterVerification]);

  const getTypeIcon = (type: IncidentType) => {
    if (type === 'Flood') return <Waves className="h-4 w-4 text-cyan-800" />;
    if (type === 'Fire') return <Flame className="h-4 w-4 text-orange-800" />;
    return <Building2 className="h-4 w-4 text-amber-800" />;
  };

  return (
    <section aria-label="Community incident queue" className="flex h-full min-h-0 flex-col bg-white text-slate-800">
      <header className="space-y-3 border-b border-slate-200 px-4 py-4 sm:px-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-sky-900" />
            <h2 className="text-sm font-bold text-slate-950">Community report queue</h2>
          </div>
          <span className="text-xs text-slate-600">{filteredIncidents.length} of {incidents.length}</span>
        </div>
        <label className="relative block">
          <span className="sr-only">Search reports</span>
          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" />
          <input
            type="search"
            placeholder="Search location or report"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="min-h-11 w-full rounded-md border border-slate-300 bg-white pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-500 focus:border-sky-800 focus:outline-none focus:ring-1 focus:ring-sky-800"
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label><span className="sr-only">Incident type</span>
            <select value={filterType} onChange={(event) => setFilterType(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-700">
              <option value="ALL">All types</option><option value="Flood">Flood</option><option value="Fire">Fire</option><option value="Collapse">Collapse</option>
            </select>
          </label>
          <label><span className="sr-only">Verification state</span>
            <select value={filterVerification} onChange={(event) => setFilterVerification(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-700">
              <option value="ALL">All verification</option><option value="Unverified">Unverified</option><option value="Provisional">AI provisional</option><option value="Confirmed">Confirmed</option><option value="Rejected">Rejected</option>
            </select>
          </label>
          <label><span className="sr-only">Urgency</span>
            <select value={filterUrgency} onChange={(event) => setFilterUrgency(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-700">
              <option value="ALL">All urgency</option><option value="Critical">Critical</option><option value="Medium">Medium</option><option value="Low">Low</option>
            </select>
          </label>
          <label><span className="sr-only">Response status</span>
            <select value={filterStatus} onChange={(event) => setFilterStatus(event.target.value)} className="min-h-10 w-full rounded-md border border-slate-300 bg-white px-2 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-700">
              <option value="ALL">All response status</option><option value="Pending">Pending</option><option value="Dispatched">Dispatched</option><option value="Resolved">Resolved</option>
            </select>
          </label>
        </div>
      </header>

      <div className="min-h-0 flex-1 divide-y divide-slate-200 overflow-y-auto">
        {filteredIncidents.length === 0 ? (
          <div className="px-5 py-10 text-center">
            <p className="text-sm font-semibold text-slate-800">{incidents.length ? 'No reports match these filters' : 'No community reports yet'}</p>
            <p className="mt-1 text-sm text-slate-600">{incidents.length ? 'Adjust the search or filters to see more reports.' : 'New reports from survivors will appear here.'}</p>
          </div>
        ) : filteredIncidents.map((incident) => {
          const selected = selectedIncident?.id === incident.id;
          const urgencyTone = incident.urgency_level === 'Critical' ? 'bg-rose-100 text-rose-900' : incident.urgency_level === 'Medium' ? 'bg-amber-100 text-amber-950' : 'bg-emerald-100 text-emerald-900';
          const verificationTone = incident.verification_status === 'Confirmed' ? 'text-emerald-900' : incident.verification_status === 'Rejected' ? 'text-slate-600' : 'text-amber-900';
          return (
            <article key={incident.id} className={`p-4 transition-colors sm:px-5 ${selected ? 'bg-sky-50' : 'hover:bg-slate-50'}`}>
              <button
                type="button"
                onClick={() => onSelectIncident(incident)}
                aria-pressed={selected}
                className="block w-full rounded text-left focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {getTypeIcon(incident.incident_type)}
                    <span className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${urgencyTone}`}>{incident.urgency_level}</span>
                    <span className="truncate text-xs text-slate-500">{new Date(incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <span className={`shrink-0 text-[11px] font-semibold ${verificationTone}`}>{incident.verification_status === 'Provisional' ? 'AI provisional' : incident.verification_status}</span>
                </div>
                <p className="mt-2 flex items-center gap-1.5 text-sm font-bold text-slate-950">
                  <MapPin className="h-4 w-4 shrink-0 text-sky-900" /><span className="truncate">{incident.location_name}</span>
                </p>
                <p className="mt-1 line-clamp-2 text-sm leading-5 text-slate-700">{incident.raw_text}</p>
              </button>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3">
                <span className={`rounded px-2 py-1 text-xs font-semibold ${
                  incident.status === 'Pending' ? 'bg-amber-100 text-amber-950' :
                  incident.status === 'Dispatched' ? 'bg-sky-100 text-sky-950' : 'bg-emerald-100 text-emerald-950'
                }`}>{incident.status}</span>
                <div className="flex flex-wrap gap-2">
                  {incident.status === 'Pending' && (
                    <button onClick={() => onUpdateStatus(incident.id, 'Dispatched')} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-sky-900 px-3 text-xs font-semibold text-white hover:bg-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2">
                      <Send className="h-3.5 w-3.5" /> Dispatch
                    </button>
                  )}
                  {incident.status === 'Dispatched' && (
                    <button onClick={() => onUpdateStatus(incident.id, 'Resolved')} className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-800 px-3 text-xs font-semibold text-white hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-emerald-700 focus:ring-offset-2">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Resolve
                    </button>
                  )}
                  {incident.verification_status === 'Confirmed' && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-900"><ShieldCheck className="h-3.5 w-3.5" /> Verified</span>}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};
