import React, { useState } from 'react';
import { X, Play, Zap, Flame, Waves, Building2, AlertOctagon, CheckCircle2 } from 'lucide-react';
import { api } from '../services/api';

interface SimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSurgeTriggered: (msg: string) => void;
}

export const SimulatorModal: React.FC<SimulatorModalProps> = ({
  isOpen,
  onClose,
  onSurgeTriggered,
}) => {
  const [surgeCount, setSurgeCount] = useState<number>(3);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [log, setLog] = useState<string[]>([]);

  if (!isOpen) return null;

  const handleSimulate = async (count: number = surgeCount) => {
    setIsLoading(true);
    try {
      setLog((prev) => [`[${new Date().toLocaleTimeString()}] Triggering ${count} concurrent distress reports...`, ...prev]);
      const res = await api.simulateSurge(count);
      const injected = res.incidents || [];
      const lines = injected.map((inc: any) =>
        `✓ ${inc.urgency_level} ${inc.incident_type} in ${inc.location_name} (ID: ${inc.id.slice(0, 8)})`
      );
      setLog((prev) => [
        `[${new Date().toLocaleTimeString()}] Surge injected successfully (${injected.length} incidents broadcasted)`,
        ...lines,
        ...prev
      ]);
      onSurgeTriggered(`🚨 Disaster Surge Simulated: ${injected.length} new incidents active across Nairobi!`);
    } catch (err: any) {
      setLog((prev) => [`[${new Date().toLocaleTimeString()}] Error: ${err.message}`, ...prev]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0f172a] border border-white/10 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-wide">
                Crisis Stress-Test Simulator
              </h3>
              <p className="text-xs text-slate-400">
                Simulate high-concurrency disaster surges and benchmark AI triage & routing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Quick Presets */}
          <div>
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2.5 block">
              1-Click Disaster Scenarios
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                disabled={isLoading}
                onClick={() => handleSimulate(2)}
                className="p-3 rounded-xl bg-blue-950/40 border border-blue-500/30 hover:border-blue-400 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-blue-400 font-semibold text-xs mb-1">
                  <Waves className="w-4 h-4" />
                  Mathare Flood Surge
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Simulates rapid river surge with families trapped in Mathare Valley 4A.
                </p>
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleSimulate(2)}
                className="p-3 rounded-xl bg-orange-950/40 border border-orange-500/30 hover:border-orange-400 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-orange-400 font-semibold text-xs mb-1">
                  <Flame className="w-4 h-4" />
                  Gikomba Timber Blaze
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Simulates spreading fire outbreak blocking market alleyways.
                </p>
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleSimulate(2)}
                className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 hover:border-amber-400 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs mb-1">
                  <Building2 className="w-4 h-4" />
                  Structural Collapse
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Simulates perimeter wall and tenement failure in Mukuru & Pipeline.
                </p>
              </button>

              <button
                disabled={isLoading}
                onClick={() => handleSimulate(5)}
                className="p-3 rounded-xl bg-red-950/40 border border-red-500/40 hover:border-red-400 text-left transition group disabled:opacity-50"
              >
                <div className="flex items-center gap-2 text-red-400 font-semibold text-xs mb-1">
                  <AlertOctagon className="w-4 h-4 animate-pulse" />
                  Multi-Sector Surge (5x)
                </div>
                <p className="text-[11px] text-slate-400 line-clamp-2">
                  Mass casualty multi-zone emergency stress test across Nairobi.
                </p>
              </button>
            </div>
          </div>

          {/* Surge Count Slider */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-300">Custom Surge Volume</span>
              <span className="font-mono font-bold text-sky-400 px-2 py-0.5 rounded bg-sky-500/10 border border-sky-500/20">
                {surgeCount} Distress Reports
              </span>
            </div>
            <input
              type="range"
              min="1"
              max="6"
              value={surgeCount}
              onChange={(e) => setSurgeCount(parseInt(e.target.value))}
              className="w-full accent-sky-500 cursor-pointer"
            />
            <button
              disabled={isLoading}
              onClick={() => handleSimulate(surgeCount)}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 transition disabled:opacity-50"
            >
              <Play className="w-4 h-4 fill-current" />
              {isLoading ? 'Injecting Simulated Surge...' : `Inject ${surgeCount} Live Distress Reports`}
            </button>
          </div>

          {/* Simulation Console Log */}
          {log.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="font-mono uppercase text-[10px] tracking-wider">Live Telemetry Log</span>
                <button
                  onClick={() => setLog([])}
                  className="text-[10px] hover:text-white transition"
                >
                  Clear
                </button>
              </div>
              <div className="bg-black/60 border border-white/10 rounded-xl p-3 font-mono text-[11px] text-slate-300 space-y-1 max-h-40 overflow-y-auto">
                {log.map((entry, idx) => (
                  <div key={idx} className={entry.startsWith('✓') ? 'text-emerald-400' : entry.startsWith('🚨') ? 'text-amber-400 font-bold' : ''}>
                    {entry}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
