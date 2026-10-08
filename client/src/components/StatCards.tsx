import React from 'react';
import { Incident } from '../types';
import { AlertCircle, Flame, Waves, CheckCircle2, Clock } from 'lucide-react';

interface StatCardsProps {
  incidents: Incident[];
}

export const StatCards: React.FC<StatCardsProps> = ({ incidents }) => {
  const critical = incidents.filter((i) => i.urgency_level === 'Critical' && i.status !== 'Resolved').length;
  const pending = incidents.filter((i) => i.status === 'Pending').length;
  const dispatched = incidents.filter((i) => i.status === 'Dispatched').length;
  const resolved = incidents.filter((i) => i.status === 'Resolved').length;

  const floods = incidents.filter((i) => i.incident_type === 'Flood').length;
  const fires = incidents.filter((i) => i.incident_type === 'Fire').length;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 p-4 bg-[#0B0F17]/90 border-b border-white/5">
      {/* Critical Active */}
      <div className="bg-[#121826] border border-red-500/30 rounded-xl p-3 flex flex-col justify-between shadow-sm relative overflow-hidden">
        <div className="flex items-center justify-between text-xs text-red-400 font-medium">
          <span className="uppercase tracking-wider">Critical Active</span>
          <AlertCircle className="w-4 h-4 animate-bounce text-red-500" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">{critical}</span>
          <span className="text-[10px] text-red-400/80 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-500/20">
            Immediate Action
          </span>
        </div>
        <div className="absolute -right-4 -bottom-4 w-12 h-12 bg-red-500/10 rounded-full blur-xl pointer-events-none"></div>
      </div>

      {/* Pending Triage */}
      <div className="bg-[#121826] border border-amber-500/20 rounded-xl p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-xs text-amber-400 font-medium">
          <span className="uppercase tracking-wider">Pending Triage</span>
          <Clock className="w-4 h-4 text-amber-400" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">{pending}</span>
          <span className="text-[10px] text-amber-400/80 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-500/20">
            Awaiting Units
          </span>
        </div>
      </div>

      {/* Field Dispatched */}
      <div className="bg-[#121826] border border-blue-500/20 rounded-xl p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-xs text-blue-400 font-medium">
          <span className="uppercase tracking-wider">Dispatched</span>
          <div className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></div>
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">{dispatched}</span>
          <span className="text-[10px] text-blue-400/80 bg-blue-950/60 px-1.5 py-0.5 rounded border border-blue-500/20">
            Units En Route
          </span>
        </div>
      </div>

      {/* Floods */}
      <div className="bg-[#121826] border border-cyan-500/20 rounded-xl p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-xs text-cyan-400 font-medium">
          <span className="uppercase tracking-wider">Floods / Surges</span>
          <Waves className="w-4 h-4 text-cyan-400" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">{floods}</span>
          <span className="text-[10px] text-slate-400">Total logged</span>
        </div>
      </div>

      {/* Fires */}
      <div className="bg-[#121826] border border-orange-500/20 rounded-xl p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-xs text-orange-400 font-medium">
          <span className="uppercase tracking-wider">Fires / Blazes</span>
          <Flame className="w-4 h-4 text-orange-400" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">{fires}</span>
          <span className="text-[10px] text-slate-400">Total logged</span>
        </div>
      </div>

      {/* Resolved */}
      <div className="bg-[#121826] border border-emerald-500/20 rounded-xl p-3 flex flex-col justify-between shadow-sm">
        <div className="flex items-center justify-between text-xs text-emerald-400 font-medium">
          <span className="uppercase tracking-wider">Resolved / Safe</span>
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
        </div>
        <div className="mt-2 flex items-baseline justify-between">
          <span className="text-2xl font-black text-white font-mono">{resolved}</span>
          <span className="text-[10px] text-emerald-400/80 bg-emerald-950/60 px-1.5 py-0.5 rounded border border-emerald-500/20">
            Safely Mitigated
          </span>
        </div>
      </div>
    </div>
  );
};
