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
    <header className="min-h-16 border-b border-slate-300 bg-white px-4 py-2.5 text-slate-800 md:px-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
      {/* Brand & Operational System Title */}
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h1 className="truncate text-base font-bold tracking-tight text-slate-950">u-SHA-jua <span className="font-normal text-slate-500">/ Response operations</span></h1>
          <p className="truncate text-xs text-slate-600">{userName} · Administrator portal</p>
        </div>
      </div>

      {/* Critical Status Bar & Controls */}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {criticalCount > 0 && (
          <div className="flex min-h-10 items-center gap-2 rounded-md bg-rose-50 px-3 text-xs font-bold text-rose-900">
            <AlertTriangle className="h-4 w-4" />
            <span>{criticalCount} critical open</span>
          </div>
        )}

        {/* Low-Bandwidth Mode Switcher */}
        <button
          onClick={onToggleLowBandwidth}
          className={`flex min-h-11 items-center gap-2 rounded-md border px-3 text-xs font-semibold transition-colors ${
            lowBandwidth
              ? 'border-amber-300 bg-amber-50 text-amber-950'
              : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
          }`}
          title="Toggle constrained bandwidth optimization"
          aria-pressed={lowBandwidth}
        >
          <Radio className="w-3.5 h-3.5" />
          <span>{lowBandwidth ? 'Low bandwidth on' : 'Low bandwidth'}</span>
        </button>

        {/* Audio Alert Toggle */}
        <button
          onClick={onToggleSound}
          className="flex h-11 w-11 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700"
          title={soundEnabled ? 'Mute critical incident alerts' : 'Enable critical incident alerts'}
          aria-label={soundEnabled ? 'Mute emergency alerts' : 'Enable emergency alerts'}
          aria-pressed={soundEnabled}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-800" /> : <VolumeX className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Live WebSocket Connection Status */}
        <div
          className={`flex min-h-10 items-center gap-2 rounded-md px-3 text-xs font-semibold ${
            connected
              ? 'bg-emerald-50 text-emerald-950'
              : 'bg-slate-100 text-slate-700'
          }`}
          role="status"
          aria-live="polite"
        >
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
          <span>{connected ? 'Live updates on' : 'Live updates off'}</span>
        </div>

        {/* Report Ingestion Button */}
        <button
          onClick={onOpenReportModal}
          className="min-h-11 flex items-center justify-center gap-1.5 rounded-md bg-sky-900 px-3 text-xs font-semibold text-white transition hover:bg-sky-950 focus:outline-none focus:ring-2 focus:ring-sky-700 focus:ring-offset-2 sm:px-4"
          aria-label="Submit disaster report"
          title="Submit disaster report"
        >
          <Plus className="w-4 h-4" />
          <span>New report</span>
        </button>
        <button
          onClick={onSignOut}
          className="min-h-11 min-w-11 rounded-md border border-slate-300 bg-white p-2 text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-700"
          title="Sign out"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      </div>
    </header>
  );
};
