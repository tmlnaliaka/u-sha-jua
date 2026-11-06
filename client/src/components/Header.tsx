import React from 'react';
import { 
  Radio, Wifi, WifiOff, AlertTriangle, Plus, Volume2, VolumeX, 
  ShieldAlert, Zap, BarChart3, Smartphone, LifeBuoy, ShieldCheck, Lock, User
} from 'lucide-react';
import { UserProfile } from '../types';

interface HeaderProps {
  connected: boolean;
  lowBandwidth: boolean;
  onToggleLowBandwidth: () => void;
  onOpenReportModal: () => void;
  onOpenSimulatorModal: () => void;
  onOpenCivilianPortal: () => void;
  onOpenAnalyticsModal: () => void;
  onOpenResponderPwa: () => void;
  onOpenCommandCenter: () => void;
  onOpenPrivacyModal?: () => void;
  currentUser: UserProfile | null;
  onOpenAuthModal: () => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  criticalCount: number;
}

export const Header: React.FC<HeaderProps> = ({
  connected,
  lowBandwidth,
  onToggleLowBandwidth,
  onOpenReportModal,
  onOpenSimulatorModal,
  onOpenCivilianPortal,
  onOpenAnalyticsModal,
  onOpenResponderPwa,
  onOpenCommandCenter,
  onOpenPrivacyModal,
  currentUser,
  onOpenAuthModal,
  soundEnabled,
  onToggleSound,
  criticalCount,
}) => {
  return (
    <header className="h-16 bg-[#0E1522] border-b border-white/10 px-4 sm:px-6 flex items-center justify-between select-none">
      {/* Brand & Operational System Title */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <div className="w-10 h-10 rounded-lg bg-red-950/70 border border-red-500/40 flex items-center justify-center text-red-500 shadow-lg shadow-red-950/40 shrink-0">
          <ShieldAlert className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="font-extrabold text-base sm:text-lg tracking-wider text-slate-100 flex items-center gap-1.5 font-mono">
              u-SHA-jua <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-sans uppercase">GIS Command</span>
            </h1>
            <span className="hidden md:flex text-xs px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/30 items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
              v1.3.0 Live
            </span>
          </div>
          <p className="text-[11px] sm:text-xs text-slate-400 truncate max-w-[280px] sm:max-w-none">
            Resilient Geospatial Disaster Informatics & First Responder Telemetry
          </p>
        </div>
      </div>

      {/* Critical Status Bar & Navigation Controls */}
      <div className="flex items-center space-x-2 sm:space-x-2.5">
        
        {/* Critical Alert Banner */}
        {criticalCount > 0 && (
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-red-950/60 border border-red-500/50 text-red-400 animate-pulse text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 text-red-400" />
            <span>{criticalCount} CRITICAL DISTRESS</span>
          </div>
        )}

        {/* Civilian Public SOS Portal Button */}
        <button
          onClick={onOpenCivilianPortal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-red-600/20 hover:bg-red-600/40 border border-red-500/50 text-red-300 hover:text-white text-xs font-bold transition shadow-sm"
          title="Open Civilian Public Distress Portal (SOS & Tracking)"
        >
          <LifeBuoy className="w-3.5 h-3.5 text-red-400" />
          <span className="hidden sm:inline">CIVILIAN SOS</span>
        </button>

        {/* Field Responder Mobile PWA Cockpit */}
        <button
          onClick={onOpenResponderPwa}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/40 border border-emerald-500/50 text-emerald-300 hover:text-white text-xs font-bold transition shadow-sm"
          title="Open Field Responder Tactical Mobile View"
        >
          <Smartphone className="w-3.5 h-3.5 text-emerald-400" />
          <span className="hidden sm:inline">FIELD AGENT</span>
        </button>

        {/* Spatial Analytics Modal Button */}
        <button
          onClick={onOpenAnalyticsModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/50 text-indigo-300 hover:text-white text-xs font-bold transition shadow-sm"
          title="Open Spatial Analytics & Report Export"
        >
          <BarChart3 className="w-3.5 h-3.5 text-indigo-400" />
          <span className="hidden md:inline">ANALYTICS</span>
        </button>

        {/* Enterprise Command & Security Suite */}
        <button
          onClick={onOpenCommandCenter}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/40 border border-cyan-500/50 text-cyan-300 hover:text-white text-xs font-bold transition shadow-sm"
          title="Open Enterprise Tactical Suite (Shelters, AI Auto-Dispatch, Cryptographic Ledger, Mesh)"
        >
          <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
          <span className="hidden lg:inline">COMMAND & SEC</span>
        </button>

        {/* Low-Bandwidth Mode Switcher */}
        <button
          onClick={onToggleLowBandwidth}
          className={`hidden sm:flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
            lowBandwidth
              ? 'bg-amber-950/80 text-amber-300 border-amber-500/50 shadow-sm'
              : 'bg-slate-800/80 text-slate-300 border-white/10 hover:bg-slate-800 hover:text-white'
          }`}
          title="Toggle constrained bandwidth optimization"
        >
          <Radio className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">{lowBandwidth ? 'Low-BW Throttled' : 'Standard BW'}</span>
        </button>

        {/* Audio Alert Toggle */}
        <button
          onClick={onToggleSound}
          className="p-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 hover:text-white hover:bg-slate-800 transition"
          title={soundEnabled ? 'Mute emergency sound' : 'Enable emergency sound'}
        >
          {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
        </button>

        {/* Privacy & Citizen Rights Policy */}
        {onOpenPrivacyModal && (
          <button
            onClick={onOpenPrivacyModal}
            className="p-2 rounded-lg bg-slate-800/80 border border-white/10 text-slate-300 hover:text-cyan-400 hover:bg-slate-800 transition"
            title="Privacy, Data Protection (Kenya DPA 2019 / GDPR) & Citizen Rights"
          >
            <Lock className="w-4 h-4 text-cyan-400" />
          </button>
        )}

        {/* Live WebSocket Connection Status */}
        <div
          className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg text-xs border font-mono ${
            connected
              ? 'bg-emerald-950/40 text-emerald-400 border-emerald-500/30'
              : 'bg-rose-950/40 text-rose-400 border-rose-500/30'
          }`}
        >
          {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5 animate-pulse" />}
          <span className="hidden sm:inline">{connected ? 'WS LIVE' : 'RECONNECTING'}</span>
        </div>

        {/* Crisis Stress-Test Simulator Button */}
        <button
          onClick={onOpenSimulatorModal}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:scale-95 text-white font-medium text-xs shadow-lg shadow-indigo-950/50 transition border border-indigo-400/30"
          title="Launch crisis stress-test simulator"
        >
          <Zap className="w-3.5 h-3.5 text-amber-300 fill-current" />
          <span className="hidden md:inline">SIMULATOR</span>
        </button>

        {/* User Identity / Authentication Button */}
        <button
          onClick={onOpenAuthModal}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition shadow-sm ${
            currentUser
              ? 'bg-blue-600/20 hover:bg-blue-600/30 border-blue-500/40 text-blue-300'
              : 'bg-slate-800/90 hover:bg-slate-700 border-white/15 text-slate-300 hover:text-white'
          }`}
          title={currentUser ? `Signed in as ${currentUser.full_name} (${currentUser.role})` : 'Sign In or Register'}
        >
          <User className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">
            {currentUser ? (
              <span className="flex items-center gap-1">
                <span className="max-w-[80px] truncate">{currentUser.full_name.split(' ')[0]}</span>
                <span className="text-[10px] uppercase px-1 py-0.2 rounded bg-blue-500/20 text-blue-300 font-mono">
                  {currentUser.role}
                </span>
              </span>
            ) : (
              'SIGN IN'
            )}
          </span>
        </button>

        {/* Direct Ingestion Button */}
        <button
          onClick={onOpenReportModal}
          className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-red-950/50 transition border border-red-400/30"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">REPORT</span>
        </button>

      </div>
    </header>
  );
};
