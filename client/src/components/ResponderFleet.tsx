import React from 'react';
import { ResponderUnit, Incident } from '../types';
import { Truck, Navigation, CheckCircle2, Clock, MapPin, Zap } from 'lucide-react';

interface ResponderFleetProps {
  responders: ResponderUnit[];
  selectedIncident: Incident | null;
  onDispatch: (responderId: string, incidentId: string) => void;
  onUpdateStatus: (responderId: string, status: string) => void;
}

export const ResponderFleet: React.FC<ResponderFleetProps> = ({
  responders,
  selectedIncident,
  onDispatch,
  onUpdateStatus,
}) => {
  return (
    <div className="bg-[#111827] border-t border-white/10 p-3.5 space-y-2.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Truck className="w-4 h-4 text-sky-400" />
          <h4 className="text-xs font-bold text-white uppercase tracking-wider">
            First Responder Fleet Matrix
          </h4>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
            {responders.filter((r) => r.status === 'Available').length} Ready / {responders.length} Total
          </span>
        </div>

        {selectedIncident && (
          <div className="text-[11px] text-slate-400 flex items-center gap-1.5 font-mono">
            <span>Target:</span>
            <span className="text-amber-400 font-semibold truncate max-w-[150px]">
              {selectedIncident.location_name}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {responders.map((unit) => {
          const isAvailable = unit.status === 'Available';
          const isDispatched = unit.status === 'Dispatched';

          return (
            <div
              key={unit.id}
              className={`p-2.5 rounded-xl border transition flex flex-col justify-between ${
                isDispatched
                  ? 'bg-amber-950/20 border-amber-500/30'
                  : isAvailable
                  ? 'bg-slate-900/60 border-white/5 hover:border-sky-500/30'
                  : 'bg-slate-900/40 border-white/5'
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-white truncate max-w-[100px]">
                    {unit.callsign.split(' ')[0]}
                  </span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      isAvailable
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : isDispatched
                        ? 'bg-amber-500/20 text-amber-400 animate-pulse'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {unit.status}
                  </span>
                </div>
                <p className="text-[10px] text-slate-400 truncate" title={unit.base_station}>
                  {unit.base_station.split(',')[0]}
                </p>

                {unit.distance_km !== undefined && (
                  <div className="mt-1 flex items-center gap-2 text-[10px] font-mono text-sky-400">
                    <span>{unit.distance_km} km</span>
                    <span>•</span>
                    <span className="flex items-center gap-0.5 text-amber-300">
                      <Clock className="w-2.5 h-2.5" /> {unit.eta_minutes}m
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-2">
                {selectedIncident && isAvailable ? (
                  <button
                    onClick={() => onDispatch(unit.id, selectedIncident.id)}
                    className="w-full py-1 px-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold flex items-center justify-center gap-1 transition shadow"
                  >
                    <Navigation className="w-2.5 h-2.5" />
                    Dispatch
                  </button>
                ) : isDispatched ? (
                  <button
                    onClick={() => onUpdateStatus(unit.id, 'OnScene')}
                    className="w-full py-1 px-1.5 rounded-lg bg-amber-600/30 hover:bg-amber-600/50 text-amber-300 border border-amber-500/40 text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    On Scene
                  </button>
                ) : unit.status === 'OnScene' ? (
                  <button
                    onClick={() => onUpdateStatus(unit.id, 'Available')}
                    className="w-full py-1 px-1.5 rounded-lg bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 text-[10px] font-semibold flex items-center justify-center gap-1 transition"
                  >
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    Release
                  </button>
                ) : (
                  <div className="text-[10px] text-slate-500 text-center py-0.5">
                    Standby
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
