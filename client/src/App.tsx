import React, { useState, useEffect, useCallback } from 'react';
import { Incident, CivilianReportInput, IncidentStatus } from './types';
import { api } from './services/api';
import { Header } from './components/Header';
import { StatCards } from './components/StatCards';
import { DisasterMap } from './components/DisasterMap';
import { DispatchBoard } from './components/DispatchBoard';
import { ReportModal } from './components/ReportModal';

export const App: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lowBandwidth, setLowBandwidth] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Play synthetic browser audio alert for critical emergencies
  const playAlertSound = useCallback(() => {
    if (!soundEnabled) return;
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
      osc.frequency.exponentialRampToValueAtTime(440, audioCtx.currentTime + 0.3);
      gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.3);
    } catch (e) {
      // AudioContext not permitted without user gesture
    }
  }, [soundEnabled]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Load initial incidents from backend
  const loadIncidents = async () => {
    try {
      const data = await api.getIncidents();
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incidents', err);
    }
  };

  useEffect(() => {
    loadIncidents();

    // Subscribe to real-time WebSocket events
    const cleanupWs = api.createWebSocket(
      (event, data) => {
        if (event === 'incident_reported' || event === 'incident_created') {
          const newInc: Incident = data;
          setIncidents((prev) => [newInc, ...prev.filter((i) => i.id !== newInc.id)]);
          showToast(`🚨 NEW ${newInc.urgency_level.toUpperCase()} ${newInc.incident_type.toUpperCase()}: ${newInc.location_name}`);
          if (newInc.urgency_level === 'Critical') {
            playAlertSound();
          }
        } else if (event === 'status_updated') {
          const updated: Incident = data;
          setIncidents((prev) =>
            prev.map((inc) => (inc.id === updated.id ? updated : inc))
          );
          if (selectedIncident?.id === updated.id) {
            setSelectedIncident(updated);
          }
          showToast(`Status updated: ${updated.location_name} -> ${updated.status}`);
        } else if (event === 'incident_deleted') {
          setIncidents((prev) => prev.filter((i) => i.id !== data.id));
        }
      },
      (connected) => {
        setWsConnected(connected);
      }
    );

    return () => {
      cleanupWs();
    };
  }, [playAlertSound, selectedIncident]);

  const handleUpdateStatus = async (id: string, status: IncidentStatus) => {
    try {
      const updated = await api.updateStatus(id, status);
      setIncidents((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i))
      );
      if (selectedIncident?.id === id) {
        setSelectedIncident(updated);
      }
    } catch (err) {
      console.error('Error updating status', err);
    }
  };

  const handleSubmitReport = async (report: CivilianReportInput) => {
    try {
      const created = await api.reportIncident(report);
      setIncidents((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      setSelectedIncident(created);
      showToast(`Incident ingested: ${created.location_name}`);
    } catch (err) {
      console.error('Error submitting report', err);
    }
  };

  const criticalCount = incidents.filter(
    (i) => i.urgency_level === 'Critical' && i.status !== 'Resolved'
  ).length;

  return (
    <div className="flex flex-col h-screen w-screen bg-[#0B0F17] text-slate-100 overflow-hidden font-sans">
      {/* Top Telemetry Header */}
      <Header
        connected={wsConnected}
        lowBandwidth={lowBandwidth}
        onToggleLowBandwidth={() => setLowBandwidth(!lowBandwidth)}
        onOpenReportModal={() => setIsReportModalOpen(true)}
        soundEnabled={soundEnabled}
        onToggleSound={() => setSoundEnabled(!soundEnabled)}
        criticalCount={criticalCount}
      />

      {/* High-Density Statistical Emergency Metric Cards */}
      <StatCards incidents={incidents} />

      {/* Main Split Screen Area: Leaflet Map (Left) + Dispatch Board (Right) */}
      <main className="flex-1 flex overflow-hidden relative">
        {/* Left Map Viewport */}
        <div className="flex-1 h-full relative">
          <DisasterMap
            incidents={incidents}
            selectedIncident={selectedIncident}
            onSelectIncident={setSelectedIncident}
            onUpdateStatus={handleUpdateStatus}
            lowBandwidth={lowBandwidth}
          />
        </div>

        {/* Right Tactical Dispatch Board */}
        <div className="w-full md:w-[420px] lg:w-[480px] h-full shrink-0">
          <DispatchBoard
            incidents={incidents}
            selectedIncident={selectedIncident}
            onSelectIncident={setSelectedIncident}
            onUpdateStatus={handleUpdateStatus}
          />
        </div>

        {/* Live Notification Toast Banner */}
        {toastMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[3000] px-4 py-2.5 rounded-xl bg-slate-900/95 border border-white/20 text-white text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-top-2">
            <span>{toastMessage}</span>
          </div>
        )}
      </main>

      {/* Civilian Report Submission Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmit={handleSubmitReport}
      />
    </div>
  );
};

export default App;
