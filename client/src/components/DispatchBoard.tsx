import React, { useState } from 'react';
import { Incident, IncidentStatus, IncidentType } from '../types';
import { Search, Send, CheckCircle2, MapPin, AlertOctagon, Flame, Waves, Building2, Zap, Trash2, ShieldAlert, Paperclip, Volume2, Camera } from 'lucide-react';
import { api, API_BASE } from '../services/api';

interface DispatchBoardProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
  onDeleteIncident?: (id: string) => void;
  onAnonymizeIncident?: (id: string) => void;
}

export const DispatchBoard: React.FC<DispatchBoardProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onUpdateStatus,
  onDeleteIncident,
  onAnonymizeIncident,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [filterUrgency, setFilterUrgency] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<string>('ALL');

  const filteredIncidents = incidents.filter((incident) => {
    const matchesSearch =
      incident.raw_text.toLowerCase().includes(searchTerm.toLowerCase()) ||
      incident.location_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'ALL' || incident.incident_type === filterType;
    const matchesUrgency = filterUrgency === 'ALL' || incident.urgency_level === filterUrgency;
    const matchesStatus = filterStatus === 'ALL' || incident.status === filterStatus;
    return matchesSearch && matchesType && matchesUrgency && matchesStatus;
  });

  const getTypeIcon = (type: IncidentType) => {
    switch (type) {
      case 'Flood':
        return <Waves className="w-3.5 h-3.5 text-cyan-400" />;
      case 'Fire':
        return <Flame className="w-3.5 h-3.5 text-orange-400" />;
      case 'Collapse':
        return <Building2 className="w-3.5 h-3.5 text-amber-400" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0E1522] border-l border-white/10 select-none">
      {/* Header and Search Controls */}
      <div className="p-4 border-b border-white/10 space-y-3 bg-[#0B0F17]/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertOctagon className="w-4 h-4 text-blue-400" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-100">
              Command Dispatch Board
            </h2>
          </div>
          <span className="text-[11px] font-mono text-slate-400">
            {filteredIncidents.length} shown / {incidents.length} total
          </span>
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            aria-label="Search incidents by landmark, description, or keyword"
            placeholder="Search landmarks, reports, keywords..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-[#161F30] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 transition"
          />
        </div>

        {/* Filters Grid */}
        <div className="grid grid-cols-3 gap-2">
          {/* Type Filter */}
          <select
            aria-label="Filter incidents by disaster type"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="bg-[#161F30] border border-white/10 rounded-md py-1.5 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="ALL">All Types</option>
            <option value="Flood">Flood</option>
            <option value="Fire">Fire</option>
            <option value="Collapse">Collapse</option>
          </select>

          {/* Urgency Filter */}
          <select
            aria-label="Filter incidents by urgency level"
            value={filterUrgency}
            onChange={(e) => setFilterUrgency(e.target.value)}
            className="bg-[#161F30] border border-white/10 rounded-md py-1.5 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="ALL">All Urgencies</option>
            <option value="Critical">Critical</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          {/* Status Filter */}
          <select
            aria-label="Filter incidents by triage status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-[#161F30] border border-white/10 rounded-md py-1.5 px-2 text-[11px] text-slate-300 focus:outline-none focus:border-blue-500/50"
          >
            <option value="ALL">All Status</option>
            <option value="Pending">Pending</option>
            <option value="Dispatched">Dispatched</option>
            <option value="Resolved">Resolved</option>
          </select>
        </div>
      </div>

      {/* Incident List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {filteredIncidents.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center justify-center space-y-3 my-auto">
            <div className="w-10 h-10 rounded-full bg-slate-800/80 border border-white/10 flex items-center justify-center text-slate-400">
              <Search className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-200">No distress incidents match criteria</p>
              <p className="text-[11px] text-slate-500 mt-0.5">Try altering your keywords or relaxing type and urgency filters.</p>
            </div>
            {(searchTerm || filterType !== 'ALL' || filterUrgency !== 'ALL' || filterStatus !== 'ALL') && (
              <button
                type="button"
                onClick={() => {
                  setSearchTerm('');
                  setFilterType('ALL');
                  setFilterUrgency('ALL');
                  setFilterStatus('ALL');
                }}
                className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-300 text-xs font-semibold transition"
              >
                Reset All Filters
              </button>
            )}
          </div>
        ) : (
          filteredIncidents.map((incident) => {
            const isSelected = selectedIncident?.id === incident.id;

            return (
              <div
                key={incident.id}
                onClick={() => onSelectIncident(incident)}
                className={`p-3.5 transition cursor-pointer flex flex-col space-y-2 relative ${
                  isSelected
                    ? 'bg-blue-950/40 border-l-4 border-l-blue-500'
                    : 'hover:bg-slate-800/40'
                }`}
              >
                {/* Top Row: Type & Urgency & Time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="p-1 rounded bg-[#1F293D] border border-white/10">
                      {getTypeIcon(incident.incident_type)}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        incident.urgency_level === 'Critical'
                          ? 'bg-red-500/10 text-red-400 border-red-500/30'
                          : incident.urgency_level === 'Medium'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                          : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      }`}
                    >
                      {incident.urgency_level}
                    </span>
                  </div>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(incident.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Location and Raw Text */}
                <div>
                  <div className="flex items-center space-x-1 text-slate-200 text-xs font-semibold">
                    <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                    <span className="truncate">{incident.location_name}</span>
                  </div>
                  <p className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                    {incident.raw_text}
                  </p>
                </div>

                {/* Attachments Section if present */}
                {incident.attachments && incident.attachments.length > 0 && (
                  <div className="p-2 rounded-lg bg-black/40 border border-white/10 space-y-1.5" onClick={(e) => e.stopPropagation()}>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                      <Paperclip className="w-3 h-3 text-blue-400" />
                      Scene Evidence ({incident.attachments.length})
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {incident.attachments.map((att, attIdx) => {
                        if (!att) return null;
                        const rawPath = typeof att === 'string' ? att : (att.path || '');
                        const fileUrl = rawPath ? (rawPath.startsWith('http') ? rawPath : `${API_BASE}${rawPath}`) : '';
                        const fileName = (typeof att === 'object' && att.filename) ? att.filename : `attachment_${attIdx}`;
                        const fileType = (typeof att === 'object' && att.file_type) ? att.file_type : '';
                        const isAudio = fileType.includes('audio') || fileName.endsWith('.webm') || fileName.endsWith('.wav');
                        const isImage = fileType.includes('image') || fileName.endsWith('.png') || fileName.endsWith('.jpg') || fileName.endsWith('.jpeg');

                        if (isImage) {
                          return (
                            <a
                              key={attIdx}
                              href={fileUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="group relative block w-14 h-14 rounded overflow-hidden border border-white/20 bg-slate-900 shrink-0 hover:border-blue-400 transition"
                            >
                              <img src={fileUrl} alt={att.filename} className="w-full h-full object-cover group-hover:scale-105 transition" />
                              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <Camera className="w-3 h-3 text-white" />
                              </div>
                            </a>
                          );
                        }

                        if (isAudio) {
                          return (
                            <div key={attIdx} className="flex items-center gap-1.5 bg-slate-800/80 px-2 py-1 rounded border border-white/10">
                              <Volume2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <audio controls src={fileUrl} className="h-6 w-36" />
                            </div>
                          );
                        }

                        return (
                          <a
                            key={attIdx}
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-blue-400 hover:underline flex items-center gap-1 font-mono"
                          >
                            <Paperclip className="w-3 h-3" /> {att.filename}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Expanded Details when selected */}
                {isSelected && (
                  <div className="pt-2 border-t border-white/10 space-y-2 animate-in fade-in" onClick={(e) => e.stopPropagation()}>
                    {(incident.dispatched_at || incident.resolved_at) && (
                      <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-2">
                        {incident.dispatched_at && (
                          <span className="text-blue-300">
                            Dispatched: {new Date(incident.dispatched_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        )}
                        {incident.resolved_at && (
                          <span className="text-emerald-300">
                            Resolved: {new Date(incident.resolved_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-1">
                      {onAnonymizeIncident && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Scrub personal civilian identifiers under Kenya DPA 2019 / GDPR Right to Erasure?')) {
                              onAnonymizeIncident(incident.id);
                            }
                          }}
                          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-[10px] font-mono flex items-center gap-1 border border-white/10 transition"
                          title="Anonymize personal data under Kenya Data Protection Act 2019"
                        >
                          <ShieldAlert className="w-3 h-3 text-amber-400" />
                          Anonymize (DPA 2019)
                        </button>
                      )}

                      {onDeleteIncident && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm('Permanently purge this incident record from tactical storage?')) {
                              onDeleteIncident(incident.id);
                            }
                          }}
                          className="px-2 py-1 rounded bg-red-950/60 hover:bg-red-900 text-red-300 hover:text-red-100 text-[10px] font-mono flex items-center gap-1 border border-red-500/30 transition"
                          title="Purge incident record"
                        >
                          <Trash2 className="w-3 h-3 text-red-400" />
                          Purge
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Dispatch Controls & Status */}
                <div className="flex items-center justify-between pt-1 border-t border-white/5">
                  <span
                    className={`text-[11px] font-mono px-2 py-0.5 rounded ${
                      incident.status === 'Pending'
                        ? 'bg-amber-950/60 text-amber-400 border border-amber-500/30'
                        : incident.status === 'Dispatched'
                        ? 'bg-blue-950/60 text-blue-400 border border-blue-500/30'
                        : 'bg-emerald-950/60 text-emerald-400 border border-emerald-500/30'
                    }`}
                  >
                    ● {incident.status}
                  </span>

                  <div className="flex items-center space-x-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={async () => {
                        try {
                          const cap = await api.getCapAlert(incident.id);
                          const blob = new Blob([cap.xml], { type: 'application/xml' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `${cap.identifier}.xml`;
                          a.click();
                          URL.revokeObjectURL(url);
                        } catch (err) {
                          console.error('Failed to export CAP 1.2 XML', err);
                        }
                      }}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 text-[10px] font-mono transition"
                      title="Export OASIS Common Alerting Protocol (CAP v1.2) XML Alert"
                    >
                      CAP 1.2
                    </button>
                    {incident.status === 'Pending' && (
                      <>
                        <button
                          onClick={async () => {
                            try {
                              await api.autoDispatchResponder(incident.id);
                            } catch (err) {
                              onUpdateStatus(incident.id, 'Dispatched');
                            }
                          }}
                          className="flex items-center space-x-1 px-2 py-1 rounded bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-[11px] font-bold transition shadow-sm"
                          title="Execute AI Autonomous Dispatch to Highest Scored Unit"
                        >
                          <Zap className="w-3 h-3 fill-current text-amber-200" />
                          <span>Auto</span>
                        </button>

                        <button
                          onClick={() => onUpdateStatus(incident.id, 'Dispatched')}
                          className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition shadow-sm"
                          title="Dispatch First Responder Units"
                        >
                          <Send className="w-3 h-3" />
                          <span>Dispatch</span>
                        </button>
                      </>
                    )}

                    {incident.status === 'Dispatched' && (
                      <button
                        onClick={() => onUpdateStatus(incident.id, 'Resolved')}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium transition shadow-sm"
                        title="Mark As Resolved"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Resolve</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
