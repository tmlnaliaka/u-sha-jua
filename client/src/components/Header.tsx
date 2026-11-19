import React from 'react';
import {
  BarChart3,
  LifeBuoy,
  MapPinned,
  Radio,
  ShieldCheck,
  Smartphone,
  Siren,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  Zap,
} from 'lucide-react';

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
  soundEnabled,
  onToggleSound,
  criticalCount,
}) => {
  return (
    <header className="site-header">
      <a className="brand-lockup" href="#main-content" aria-label="u-SHA-jua response overview">
        <span className="brand-mark" aria-hidden="true">
          <MapPinned size={21} strokeWidth={1.8} />
        </span>
        <span className="brand-copy">
          <h1 className="brand-name">u-SHA-jua</h1>
          <span className="brand-description">Emergency response map</span>
        </span>
      </a>

      <div className="header-controls">
        <div className={`connection-state ${connected ? 'is-connected' : 'is-disconnected'}`} role="status" aria-live="polite">
          {connected ? <Wifi size={15} aria-hidden="true" /> : <WifiOff size={15} aria-hidden="true" />}
          <span>{connected ? 'Live updates' : 'Reconnecting'}</span>
        </div>

        <div className="header-tools" aria-label="Response tools">
          <button className={`tool-button ${lowBandwidth ? 'is-active' : ''}`} onClick={onToggleLowBandwidth} aria-pressed={lowBandwidth} title="Toggle low-bandwidth mode">
            <Radio size={15} aria-hidden="true" />
            <span className="tool-label">Low bandwidth</span>
          </button>
          <button className="tool-button sound-button" onClick={onToggleSound} aria-label={soundEnabled ? 'Mute alert sound' : 'Enable alert sound'} aria-pressed={soundEnabled} title={soundEnabled ? 'Mute alert sound' : 'Enable alert sound'}>
            {soundEnabled ? <Volume2 size={15} aria-hidden="true" /> : <VolumeX size={15} aria-hidden="true" />}
            <span className="tool-label">Sound</span>
          </button>
          <button className="tool-button" onClick={onOpenCivilianPortal} title="Open the public distress and tracking portal">
            <LifeBuoy size={15} aria-hidden="true" />
            <span className="tool-label">Public help</span>
          </button>
          <button className="tool-button" onClick={onOpenResponderPwa} title="Open the field responder view">
            <Smartphone size={15} aria-hidden="true" />
            <span className="tool-label">Field view</span>
          </button>
          <button className="tool-button" onClick={onOpenAnalyticsModal} title="Open incident analytics and exports">
            <BarChart3 size={15} aria-hidden="true" />
            <span className="tool-label">Analytics</span>
          </button>
          <button className="tool-button" onClick={onOpenCommandCenter} title="Open shelters, unit recommendations, audit, and offline tools">
            <ShieldCheck size={15} aria-hidden="true" />
            <span className="tool-label">Operations</span>
          </button>
          <button className="tool-button" onClick={onOpenSimulatorModal} title="Open the incident simulator">
            <Zap size={15} aria-hidden="true" />
            <span className="tool-label">Simulator</span>
          </button>
          <button className="report-button" onClick={onOpenReportModal}>
            <Siren size={16} aria-hidden="true" />
            <span>New report</span>
          </button>
        </div>
      </div>

      {criticalCount > 0 && (
        <div className="critical-ribbon" role="status">
          <span className="critical-indicator" aria-hidden="true" />
          {criticalCount} critical {criticalCount === 1 ? 'incident' : 'incidents'} need attention
        </div>
      )}
    </header>
  );
};
