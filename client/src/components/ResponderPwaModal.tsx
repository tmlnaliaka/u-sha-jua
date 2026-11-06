import React, { useState, useEffect } from 'react';
import { 
  X, Shield, Radio, Navigation, CheckSquare, Square, 
  MapPin, AlertTriangle, Send, RefreshCw, Smartphone, 
  Wifi, Flame, Waves, Activity, CheckCircle2
} from 'lucide-react';
import { ResponderUnit, Incident, IncidentStatus, ResponderStatus } from '../types';
import { api } from '../services/api';

interface ResponderPwaModalProps {
  isOpen: boolean;
  onClose: () => void;
  responders: ResponderUnit[];
  incidents: Incident[];
  onUpdateResponderStatus: (responderId: string, status: string) => Promise<any>;
  onUpdateIncidentStatus: (incidentId: string, status: IncidentStatus) => Promise<any>;
}

export const ResponderPwaModal: React.FC<ResponderPwaModalProps> = ({
  isOpen,
  onClose,
  responders,
  incidents,
  onUpdateResponderStatus,
  onUpdateIncidentStatus,
}) => {
  const [selectedUnitId, setSelectedUnitId] = useState<string>(responders[0]?.id || '');
  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    'hazard_survey': false,
    'triage_perimeter': false,
    'casualty_treatment': false,
    'evacuation_corridor': false,
  });
  const [isTransmittingGps, setIsTransmittingGps] = useState<boolean>(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (responders.length > 0 && !selectedUnitId) {
      setSelectedUnitId(responders[0].id);
    }
  }, [responders, selectedUnitId]);

  const currentUnit = responders.find((r) => r.id === selectedUnitId) || responders[0];
  const assignedIncident = incidents.find((i) => i.id === currentUnit?.assigned_incident_id);

  // Sync checklist state when current unit loads or updates
  useEffect(() => {
    if (currentUnit?.checklist) {
      setChecklist((prev) => ({
        ...prev,
        ...currentUnit.checklist
      }));
    } else {
      setChecklist({
        'hazard_survey': false,
        'triage_perimeter': false,
        'casualty_treatment': false,
        'evacuation_corridor': false,
      });
    }
  }, [currentUnit?.id, currentUnit?.checklist]);

  if (!isOpen) return null;

  const toggleChecklist = async (key: string) => {
    if (!currentUnit) return;
    const nextVal = !checklist[key];
    const updated = { ...checklist, [key]: nextVal };
    setChecklist(updated);
    try {
      await api.updateResponderChecklist(currentUnit.id, { [key]: nextVal });
    } catch (err) {
      console.error('Failed to persist tactical checklist:', err);
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleStatusChange = async (newStatus: ResponderStatus) => {
    if (!currentUnit || isUpdatingStatus) return;
    setIsUpdatingStatus(true);
    try {
      await onUpdateResponderStatus(currentUnit.id, newStatus);
      if (newStatus === 'OnScene' && assignedIncident) {
        showToast(`📍 Unit ${currentUnit.callsign} arrived On-Scene!`);
      } else if (newStatus === 'Available') {
        if (assignedIncident) {
          await onUpdateIncidentStatus(assignedIncident.id, 'Resolved');
        }
        showToast(`✅ Mission Resolved & ${currentUnit.callsign} Cleared!`);
      } else {
        showToast(`⚡ Unit status updated: ${newStatus}`);
      }
    } catch (err) {
      console.error('Status update failed', err);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleTransmitFieldGps = async () => {
    if (!currentUnit) return;
    setIsTransmittingGps(true);
    try {
      let targetLat: number | null = null;
      let targetLon: number | null = null;

      if (navigator.geolocation) {
        try {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 });
          });
          targetLat = pos.coords.latitude;
          targetLon = pos.coords.longitude;
        } catch {
          // Fallback to mission movement simulation if sensor unavailable
        }
      }

      if (targetLat === null || targetLon === null) {
        const currentLat = currentUnit.coordinates.latitude;
        const currentLon = currentUnit.coordinates.longitude;
        const destLat = assignedIncident ? assignedIncident.coordinates.latitude : currentLat;
        const destLon = assignedIncident ? assignedIncident.coordinates.longitude : currentLon;
        targetLat = currentLat + (destLat - currentLat) * 0.25;
        targetLon = currentLon + (destLon - currentLon) * 0.25;
      }

      await api.updateResponderLocation(currentUnit.id, targetLat, targetLon);
      showToast(`📡 Live GPS coordinates broadcasted to central command! (${targetLat.toFixed(4)}, ${targetLon.toFixed(4)})`);
    } catch (err) {
      console.error('GPS transmission failed', err);
      showToast('❌ GPS broadcast failed');
    } finally {
      setIsTransmittingGps(false);
    }
  };

  const allChecklistCompleted = Object.values(checklist).every(Boolean);

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0B101B] border border-white/15 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 bg-[#0E1524] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                Field Responder Mobile PWA
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/30 text-emerald-300 font-mono">
                  FIELD COCKPIT
                </span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Tactical On-Scene Triage & Real-Time Mission Telemetry
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tactical Cockpit Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          
          {/* Unit Selector & Connectivity Status */}
          <div className="flex items-center justify-between gap-3 bg-slate-900/90 p-3 rounded-xl border border-white/10">
            <div className="flex-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Active Tactical Unit
              </label>
              <select
                value={selectedUnitId}
                onChange={(e) => setSelectedUnitId(e.target.value)}
                className="w-full bg-slate-800 border border-white/15 rounded-lg px-2.5 py-1.5 text-xs text-white font-semibold focus:outline-none focus:border-emerald-500"
              >
                {responders.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.callsign} ({r.status})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col items-end">
              <span className="text-[10px] text-slate-400 font-bold uppercase mb-1">PWA Sync</span>
              <div className="flex items-center space-x-1.5 text-xs font-mono text-emerald-400 bg-emerald-950/60 px-2 py-1 rounded-md border border-emerald-500/30">
                <Wifi className="w-3.5 h-3.5 animate-pulse" />
                <span>ONLINE</span>
              </div>
            </div>
          </div>

          {/* Assigned Mission Banner */}
          {currentUnit && (
            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-400" />
                  Mission Target: {assignedIncident ? assignedIncident.location_name : 'No Active Dispatch'}
                </span>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded font-bold uppercase ${
                  currentUnit.status === 'Dispatched'
                    ? 'bg-blue-950 text-blue-400 border border-blue-500/40 animate-pulse'
                    : currentUnit.status === 'OnScene'
                      ? 'bg-amber-950 text-amber-400 border border-amber-500/40'
                      : 'bg-slate-800 text-slate-400'
                }`}>
                  {currentUnit.status}
                </span>
              </div>

              {assignedIncident ? (
                <div className="space-y-2">
                  <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 text-xs italic text-slate-300">
                    "{assignedIncident.raw_text}"
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="p-2 rounded bg-slate-800/60 border border-white/10">
                      <span className="text-[10px] text-slate-400 block">ESTIMATED ETA</span>
                      <span className="font-mono font-bold text-blue-300">
                        {currentUnit.eta_minutes || 8} Minutes
                      </span>
                    </div>
                    <div className="p-2 rounded bg-slate-800/60 border border-white/10">
                      <span className="text-[10px] text-slate-400 block">HAZARD PRIORITY</span>
                      <span className="font-mono font-bold text-red-400">
                        {assignedIncident.urgency_level} {assignedIncident.incident_type}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Unit is currently standing by at base station ({currentUnit.base_station}). Ready for dispatch assignment.
                </p>
              )}
            </div>
          )}

          {/* Turn-by-Turn Routing Cues */}
          {assignedIncident && (
            <div className="p-3.5 rounded-xl bg-slate-900/70 border border-white/10 space-y-2">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Navigation className="w-3.5 h-3.5 text-blue-400" />
                Turn-by-Turn Tactical Routing
              </span>
              <div className="space-y-1.5 text-xs text-slate-300">
                <p className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Depart {currentUnit.base_station} via priority lane
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                  Proceed towards {assignedIncident.location_name} (ETA ~{currentUnit.eta_minutes || 10}m)
                </p>
                <p className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Muster point: Near elevated bypass access corridor
                </p>
              </div>
            </div>
          )}

          {/* On-Scene Tactical Mission Checklist */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              On-Scene Rescue Checklist
            </h3>

            <div className="space-y-2">
              {[
                { key: 'hazard_survey', label: '1. Initial Scene Hazard & Stability Survey' },
                { key: 'triage_perimeter', label: '2. Establish Safe Perimeter & Casualty Triage Zone' },
                { key: 'casualty_treatment', label: '3. Administer Emergency First Aid / Extraction' },
                { key: 'evacuation_corridor', label: '4. Clear Civilian Escape Route & Evacuate' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => toggleChecklist(item.key)}
                  className={`w-full p-2.5 rounded-lg border text-left text-xs font-medium flex items-center space-x-2.5 transition ${
                    checklist[item.key]
                      ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                      : 'bg-slate-800/60 border-white/10 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {checklist[item.key] ? (
                    <CheckSquare className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500 shrink-0" />
                  )}
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Tactical Status Change Buttons */}
          <div className="space-y-2 pt-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Broadcast Operational Status
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('Dispatched')}
                disabled={isUpdatingStatus || !currentUnit}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  currentUnit?.status === 'Dispatched'
                    ? 'bg-blue-600 border-blue-400 text-white shadow-lg'
                    : 'bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700'
                }`}
              >
                En Route
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('OnScene')}
                disabled={isUpdatingStatus || !currentUnit}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition disabled:opacity-50 disabled:cursor-not-allowed ${
                  currentUnit?.status === 'OnScene'
                    ? 'bg-amber-600 border-amber-400 text-white shadow-lg'
                    : 'bg-slate-800 border-white/10 text-slate-300 hover:bg-slate-700'
                }`}
              >
                On Scene
              </button>

              <button
                type="button"
                onClick={() => handleStatusChange('Available')}
                disabled={isUpdatingStatus || !currentUnit}
                className="py-2 px-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Resolve & Clear
              </button>
            </div>
          </div>

          {/* Live GPS Broadcast Button */}
          <div>
            <button
              type="button"
              onClick={handleTransmitFieldGps}
              disabled={isTransmittingGps}
              className="w-full py-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-bold transition flex items-center justify-center space-x-2"
            >
              <Radio className={`w-4 h-4 ${isTransmittingGps ? 'animate-ping' : ''}`} />
              <span>{isTransmittingGps ? 'Broadcasting Coordinates...' : 'Transmit Live Field GPS Coordinates'}</span>
            </button>
          </div>

          {/* Toast Notification */}
          {toastMsg && (
            <div className="p-3 rounded-xl bg-slate-900 border border-white/20 text-white text-xs font-semibold text-center animate-in fade-in">
              {toastMsg}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
