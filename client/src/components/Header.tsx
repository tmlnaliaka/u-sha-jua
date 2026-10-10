import React from 'react';
import { Radio, Wifi, WifiOff, AlertTriangle, Plus, Volume2, VolumeX, ShieldAlert, LogOut } from 'lucide-react';

interface HeaderProps {
  connected: boolean;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  onOpenReportModal: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  criticalCount: number;
  userName: string;
  onSignOut: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  connected,
  lowBandwidth,
  onToggleLowBandwidth,
  onOpenReportModal,
  soundEnabled,
  onToggleSound,
  criticalCount,
  userName,
  onSignOut,
}) => {
  return (
    <header className="min-h-16 bg-[#0E1522] border-b border-white/10 px-3 md:px-6 py-2 flex flex-wrap items-center justify-between gap-2 select-none">
      {/* Brand & Operational System Title */}
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 rounded-lg bg-red-950/70 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg shadow-red-950/40">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-extrabold text-lg tracking-wider text-slate-100 flex items-center gap-1.5 font-mono">
              u-SHA-jua <span className="text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans uppercase">GIS Command</span>
            </h1>
            <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              v1.0.0 PostGIS
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Resilient Geospatial Disaster Informatics & First Responder Telemetry
          </p>
        </div>
      </div>

      {/* Critical Status Bar & Controls */}
      <div className="flex flex-wrap items-center justify-end gap-2 md:space-x-3">
        <span className="hidden max-w-40 truncate text-xs text-slate-300 lg:inline">{userName}</span>
        {criticalCount > 0 && (
          <div className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-500/50 text-red-400 animate-pulse text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{criticalCount} CRITICAL DISTRESS ACTIVE</span>
          </div>
        )}

        {/* Low-Bandwidth Mode Switcher */}
        <button
          onClick={onToggleLowBandwidth}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            lowBandwidth
              ? 'bg-amber-950/80 text-amber-300 border-amber-500/50 shadow-sm'
              : 'bg-slate-800/80 text-slate-300 border-white/10 hover:bg-slate-800 hover:text-white'
          }`}
          title="Toggle constrained bandwidth optimization"
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{lowBandwidth ? 'Bandwidth Throttled (Low-BW)' : 'Standard BW'}</span>
        </button>

        {/* Audio Alert Toggle */}
        <button
          onClick={onToggleSound}
          className="min-h-11 min-w-11 p-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition"
          title={soundEnabled ? 'Mute emergency klaxon' : 'Enable emergency alerts'}
          aria-label={soundEnabled ? 'Mute emergency alerts' : 'Enable emergency alerts'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>

        {/* Live WebSocket Connection Status */}
        <div
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs border font-mono ${
            connected
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
          }`}
        >
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 animate-pulse" />}
          <span className="hidden sm:inline">{connected ? 'WS LIVE' : 'WS RECONNECTING'}</span>
        </div>

        {/* Report Ingestion Button */}
        <button
          onClick={onOpenReportModal}
          className="min-h-11 min-w-11 flex items-center justify-center space-x-1.5 px-3 sm:px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-medium text-xs shadow-lg shadow-red-950/50 transition border border-red-400/30"
          aria-label="Submit disaster report"
          title="Submit disaster report"
        >
          <Plus className="w-4 h-4" />
          <span className="sm:hidden">Report</span>
          <span className="hidden sm:inline">SUBMIT REPORT</span>
        </button>
        <button
          onClick={onSignOut}
          className="min-h-11 min-w-11 rounded-lg border border-white/10 bg-slate-800/80 p-2 text-slate-300 transition hover:bg-slate-800 hover:text-white"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
};
