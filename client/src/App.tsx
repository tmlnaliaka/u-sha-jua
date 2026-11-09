import React, { useState, useEffect, useCallback } from 'react';
import { Incident, CivilianReportInput, IncidentStatus, ResponderUnit, ActiveRoute, UserProfile } from './types';
import { api } from './services/api';
import { Header } from './components/Header';
import { StatCards } from './components/StatCards';
import { DisasterMap } from './components/DisasterMap';
import { DispatchBoard } from './components/DispatchBoard';
import { ReportModal } from './components/ReportModal';
import { SimulatorModal } from './components/SimulatorModal';
import { ResponderFleet } from './components/ResponderFleet';
import { CivilianPortalModal } from './components/CivilianPortalModal';
import { AnalyticsModal } from './components/AnalyticsModal';
import { ResponderPwaModal } from './components/ResponderPwaModal';
import { CommandCenterModal } from './components/CommandCenterModal';
import { PrivacyModal } from './components/PrivacyModal';
import { AuthModal } from './components/AuthModal';

export const App: React.FC = () => {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [responders, setResponders] = useState<ResponderUnit[]>([]);
  const [activeRoutes, setActiveRoutes] = useState<ActiveRoute[]>([]);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);
  const [wsConnected, setWsConnected] = useState<boolean>(false);
  const [lowBandwidth, setLowBandwidth] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);

  // Authentication State
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(api.getUser());
  
  // Modals state
  const [isReportModalOpen, setIsReportModalOpen] = useState<boolean>(false);
  const [isSimulatorModalOpen, setIsSimulatorModalOpen] = useState<boolean>(false);
  const [isCivilianPortalOpen, setIsCivilianPortalOpen] = useState<boolean>(false);
  const [isAnalyticsModalOpen, setIsAnalyticsModalOpen] = useState<boolean>(false);
  const [isResponderPwaOpen, setIsResponderPwaOpen] = useState<boolean>(false);
  const [isCommandCenterOpen, setIsCommandCenterOpen] = useState<boolean>(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState<boolean>(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState<boolean>(false);
  
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [simulatedCrash, setSimulatedCrash] = useState<boolean>(false);

  useEffect(() => {
    (window as any).__TRIGGER_SIMULATED_CRASH__ = () => setSimulatedCrash(true);
    (window as any).__RESET_SIMULATED_CRASH__ = () => setSimulatedCrash(false);
  }, []);

  if (simulatedCrash) {
    throw new Error('Simulated tactical coordinate calculation failure in GIS engine (GeoJSON coordinate array NaN corruption)');
  }

  // Play synthetic browser audio alert for critical emergencies (with automatic cleanup)
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
      
      osc.onended = () => {
        try {
          audioCtx.close();
        } catch (e) {
          // ignore
        }
      };

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
    }, 4500);
  };

  // Close any active modal when pressing Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsReportModalOpen(false);
        setIsSimulatorModalOpen(false);
        setIsCivilianPortalOpen(false);
        setIsAnalyticsModalOpen(false);
        setIsResponderPwaOpen(false);
        setIsCommandCenterOpen(false);
        setIsAuthModalOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Sync session & rehydrate user
  useEffect(() => {
    const handleAuthChanged = (e: any) => {
      setCurrentUser(e.detail);
    };
    window.addEventListener('ushajua:auth-changed', handleAuthChanged);

    if (api.getAuthToken()) {
      api.getMe().then((u) => setCurrentUser(u)).catch(() => {
        // Token invalid or expired
      });
    }

    return () => {
      window.removeEventListener('ushajua:auth-changed', handleAuthChanged);
    };
  }, []);

  // Load initial incidents from backend
  const loadIncidents = async () => {
    try {
      const data = await api.getIncidents();
      setIncidents(data);
    } catch (err) {
      console.error('Failed to load incidents', err);
    }
  };

  // Load responders from backend
  const loadResponders = async (targetIncId?: string) => {
    try {
      const data = await api.getResponders(targetIncId);
      setResponders(data);
    } catch (err) {
      console.error('Failed to load responders', err);
    }
  };

  useEffect(() => {
    loadIncidents();
    loadResponders();

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
        } else if (event === 'batch_incidents_reported') {
          loadIncidents();
          showToast(`🚨 INGESTED ${data.count} BATCH DISTRESS REPORTS`);
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
        } else if (event === 'responder_dispatched') {
          const { responder, routing } = data;
          setResponders((prev) =>
            prev.map((r) => (r.id === responder.id ? responder : r))
          );
          if (routing) {
            setActiveRoutes((prev) => [
              ...prev.filter((route) => route.responder_id !== responder.id),
              {
                responder_id: responder.id,
                incident_id: responder.assigned_incident_id,
                origin: [routing.origin[1], routing.origin[0]],
                destination: [routing.destination[1], routing.destination[0]],
                distance_km: routing.distance_km,
                eta_minutes: routing.eta_minutes,
                unit_callsign: responder.callsign,
              }
            ]);
          }
          showToast(`⚡ ${responder.callsign} DISPATCHED (ETA ${routing?.eta_minutes || 10}m)`);
        } else if (event === 'responder_status_updated') {
          const updatedResp: ResponderUnit = data;
          setResponders((prev) =>
            prev.map((r) => (r.id === updatedResp.id ? updatedResp : r))
          );
          if (updatedResp.status === 'Available') {
            setActiveRoutes((prev) => prev.filter((r) => r.responder_id !== updatedResp.id));
          }
        } else if (event === 'responder_location_updated') {
          const updatedResp: ResponderUnit = data;
          setResponders((prev) =>
            prev.map((r) => (r.id === updatedResp.id ? updatedResp : r))
          );
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

  // Recalculate proximity when selected incident changes
  useEffect(() => {
    if (selectedIncident) {
      loadResponders(selectedIncident.id);
    }
  }, [selectedIncident]);

  const handleUpdateStatus = async (id: string, status: IncidentStatus) => {
    const prevIncidents = [...incidents];
    const prevSelected = selectedIncident;

    // Optimistic UI update
    setIncidents((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status } : i))
    );
    if (selectedIncident?.id === id) {
      setSelectedIncident({ ...selectedIncident, status });
    }
    if (status === 'Resolved') {
      setActiveRoutes((prev) => prev.filter((r) => r.incident_id !== id));
    }

    try {
      const updated = await api.updateStatus(id, status);
      setIncidents((prev) =>
        prev.map((i) => (i.id === updated.id ? updated : i))
      );
      if (selectedIncident?.id === id) {
        setSelectedIncident(updated);
      }
      showToast(`Incident status updated to ${status}`);
    } catch (err: any) {
      // Rollback on failure
      setIncidents(prevIncidents);
      setSelectedIncident(prevSelected);
      showToast(`Failed to update status: ${err.message || 'Network error'}. Changes reverted.`);
      console.error('Error updating status', err);
    }
  };

  const handleDispatchResponder = async (responderId: string, incidentId: string) => {
    const prevResponders = [...responders];
    const prevIncidents = [...incidents];
    const prevRoutes = [...activeRoutes];

    // Optimistic UI update
    setResponders((prev) =>
      prev.map((r) => (r.id === responderId ? { ...r, status: 'Dispatched', assigned_incident_id: incidentId } : r))
    );
    setIncidents((prev) =>
      prev.map((i) => (i.id === incidentId ? { ...i, status: 'Dispatched' } : i))
    );

    try {
      const result = await api.dispatchResponder(responderId, incidentId);
      const inc = incidents.find((i) => i.id === incidentId);
      const unit = responders.find((r) => r.id === responderId);

      if (inc && unit) {
        setActiveRoutes((prev) => [
          ...prev.filter((r) => r.responder_id !== responderId),
          {
            responder_id: responderId,
            incident_id: incidentId,
            origin: [unit.coordinates.latitude, unit.coordinates.longitude],
            destination: [inc.coordinates.latitude, inc.coordinates.longitude],
            distance_km: result.distance_km || 4.2,
            eta_minutes: result.eta_minutes || 12,
            unit_callsign: unit.callsign,
          }
        ]);
      }
      loadResponders(selectedIncident?.id);
      loadIncidents();
      showToast(`⚡ Dispatched ${result.callsign} to crisis zone!`);
    } catch (err: any) {
      // Rollback on failure
      setResponders(prevResponders);
      setIncidents(prevIncidents);
      setActiveRoutes(prevRoutes);
      showToast(`Dispatch failed: ${err.message || 'Network error'}. Reverted.`);
      console.error('Error dispatching responder', err);
    }
  };

  const handleUpdateResponderStatus = async (responderId: string, status: string) => {
    const prevResponders = [...responders];

    // Optimistic UI update
    setResponders((prev) =>
      prev.map((r) => (r.id === responderId ? { ...r, status: status as any, assigned_incident_id: status === 'Available' ? undefined : r.assigned_incident_id } : r))
    );
    if (status === 'Available') {
      setActiveRoutes((prev) => prev.filter((r) => r.responder_id !== responderId));
    }

    try {
      await api.updateResponderStatus(responderId, status);
      loadResponders(selectedIncident?.id);
      showToast(`Responder status updated to ${status}`);
    } catch (err: any) {
      // Rollback on failure
      setResponders(prevResponders);
      showToast(`Failed to update responder: ${err.message || 'Network error'}. Reverted.`);
      console.error('Error updating responder status', err);
    }
  };

  const handleSubmitReport = async (report: CivilianReportInput) => {
    try {
      const created = await api.reportIncident(report);
      setIncidents((prev) => [created, ...prev.filter((i) => i.id !== created.id)]);
      setSelectedIncident(created);
      showToast(`Incident ingested: ${created.location_name}`);
      return created;
    } catch (err) {
      const queued = api.enqueueOfflineReport(report);
      setIncidents((prev) => [queued, ...prev.filter((i) => i.id !== queued.id)]);
      setSelectedIncident(queued);
      showToast(`📡 Queued in Offline Outbox (${queued.location_name}) — will auto-sync when online`);
      return queued;
    }
  };

  useEffect(() => {
    const handleOnline = async () => {
      try {
        const count = await api.flushOfflineOutbox();
        if (count > 0) {
          await loadIncidents();
          showToast(`✅ Auto-synced ${count} queued offline distress report(s) to spatial ledger`);
        }
      } catch (e) {
        console.error('Failed to auto-flush offline outbox', e);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const handleDeleteIncident = async (id: string) => {
    const prevIncidents = [...incidents];
    const prevSelected = selectedIncident;

    // Optimistic UI update
    setIncidents((prev) => prev.filter((i) => i.id !== id));
    if (selectedIncident?.id === id) {
      setSelectedIncident(null);
    }

    try {
      await api.deleteIncident(id);
      showToast('Incident purged from tactical database');
    } catch (err: any) {
      setIncidents(prevIncidents);
      setSelectedIncident(prevSelected);
      showToast(`Failed to delete incident: ${err.message || 'Network error'}. Incident restored.`);
    }
  };

  const handleAnonymizeIncident = async (id: string) => {
    const prevIncidents = [...incidents];
    const prevSelected = selectedIncident;

    try {
      const updated = await api.anonymizeIncident(id);
      setIncidents((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
      if (selectedIncident?.id === id) {
        setSelectedIncident(updated);
      }
      showToast('Incident anonymized per Kenya DPA 2019 / GDPR');
    } catch (err: any) {
      setIncidents(prevIncidents);
      setSelectedIncident(prevSelected);
      showToast(`Failed to anonymize: ${err.message || 'Network error'}. Reverted.`);
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
        onOpenSimulatorModal={() => setIsSimulatorModalOpen(true)}
        onOpenCivilianPortal={() => setIsCivilianPortalOpen(true)}
        onOpenAnalyticsModal={() => setIsAnalyticsModalOpen(true)}
        onOpenResponderPwa={() => setIsResponderPwaOpen(true)}
        onOpenCommandCenter={() => setIsCommandCenterOpen(true)}
        onOpenPrivacyModal={() => setIsPrivacyModalOpen(true)}
        currentUser={currentUser}
        onOpenAuthModal={() => setIsAuthModalOpen(true)}
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
            responders={responders}
            activeRoutes={activeRoutes}
            onDispatchResponder={handleDispatchResponder}
          />
        </div>

        {/* Right Tactical Dispatch Board */}
        <div className="w-full md:w-[420px] lg:w-[480px] h-full shrink-0 flex flex-col">
          <DispatchBoard
            incidents={incidents}
            selectedIncident={selectedIncident}
            onSelectIncident={setSelectedIncident}
            onUpdateStatus={handleUpdateStatus}
            onDeleteIncident={handleDeleteIncident}
            onAnonymizeIncident={handleAnonymizeIncident}
          />
        </div>

      </main>

      {/* Bottom Tactical Responder Fleet Matrix */}
      <ResponderFleet
        responders={responders}
        selectedIncident={selectedIncident}
        onDispatch={handleDispatchResponder}
        onUpdateStatus={handleUpdateResponderStatus}
      />

      {/* Standard Civilian Report Modal */}
      <ReportModal
        isOpen={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        onSubmit={async (r) => { await handleSubmitReport(r); }}
      />

      {/* Dedicated Civilian Public Distress Portal & Tracking */}
      <CivilianPortalModal
        isOpen={isCivilianPortalOpen}
        onClose={() => setIsCivilianPortalOpen(false)}
        onSubmitReport={handleSubmitReport}
      />

      {/* Spatial Analytics & Export Modal */}
      <AnalyticsModal
        isOpen={isAnalyticsModalOpen}
        onClose={() => setIsAnalyticsModalOpen(false)}
        incidents={incidents}
      />

      {/* Field Responder Tactical Mobile Cockpit View */}
      <ResponderPwaModal
        isOpen={isResponderPwaOpen}
        onClose={() => setIsResponderPwaOpen(false)}
        responders={responders}
        incidents={incidents}
        onUpdateResponderStatus={handleUpdateResponderStatus}
        onUpdateIncidentStatus={handleUpdateStatus}
      />

      {/* Crisis Stress-Test Simulator Modal */}
      <SimulatorModal
        isOpen={isSimulatorModalOpen}
        onClose={() => setIsSimulatorModalOpen(false)}
        onSurgeTriggered={(msg) => showToast(msg)}
      />

      {/* Enterprise Tactical Command & Security Suite */}
      <CommandCenterModal
        isOpen={isCommandCenterOpen}
        onClose={() => setIsCommandCenterOpen(false)}
        incidents={incidents}
        onIncidentUpdated={loadIncidents}
        showToast={showToast}
      />

      {/* Kenya DPA 2019 / GDPR Privacy Policy */}
      <PrivacyModal
        isOpen={isPrivacyModalOpen}
        onClose={() => setIsPrivacyModalOpen(false)}
      />

      {/* Identity & Authentication Modal */}
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        currentUser={currentUser}
        onUserChanged={setCurrentUser}
        showToast={showToast}
      />

      {/* Global Toast Notification Banner (Floating above all modals, WCAG 2.2 ARIA Live Region) */}
      {toastMessage && (
        <div
          role="status"
          aria-live="assertive"
          aria-atomic="true"
          className="fixed top-6 left-1/2 -translate-x-1/2 z-[9999] px-5 py-3 rounded-xl bg-slate-900/95 border border-cyan-400/40 text-white text-xs font-semibold shadow-2xl backdrop-blur-md flex items-center space-x-2 animate-in fade-in slide-in-from-top-3"
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping mr-1" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default App;
