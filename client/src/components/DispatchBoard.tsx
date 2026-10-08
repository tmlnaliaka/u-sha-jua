import React, { useState } from 'react';
import { Incident, IncidentStatus, IncidentType } from '../types';
import { Search, Send, CheckCircle2, MapPin, AlertOctagon, Flame, Waves, Building2 } from 'lucide-react';

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
          <div className="p-8 text-center text-slate-500 text-xs">
            No incidents match the active search or filters.
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
                    {incident.status === 'Pending' && (
                      <button
                        onClick={() => onUpdateStatus(incident.id, 'Dispatched')}
                        className="flex items-center space-x-1 px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium transition shadow-sm"
                        title="Dispatch First Responder Units"
                      >
                        <Send className="w-3 h-3" />
                        <span>Dispatch</span>
                      </button>
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
