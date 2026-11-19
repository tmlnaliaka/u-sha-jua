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
  connected: boolean;
  responders: ResponderUnit[];
  incidents: Incident[];
  onUpdateResponderStatus: (responderId: string, status: string) => Promise<any>;
  onUpdateIncidentStatus: (incidentId: string, status: IncidentStatus) => Promise<any>;
}

export const ResponderPwaModal: React.FC<ResponderPwaModalProps> = ({
  isOpen,
  onClose,
  connected,
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
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  useEffect(() => {
    if (responders.length > 0 && !selectedUnitId) {
      setSelectedUnitId(responders[0].id);
    }
  }, [responders, selectedUnitId]);

  if (!isOpen) return null;

  const currentUnit = responders.find((r) => r.id === selectedUnitId) || responders[0];
  const assignedIncident = incidents.find((i) => i.id === currentUnit?.assigned_incident_id);

  const toggleChecklist = (key: string) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3500);
  };

  const handleStatusChange = async (newStatus: ResponderStatus) => {
    if (!currentUnit) return;
    try {
      const updated = await onUpdateResponderStatus(currentUnit.id, newStatus);
      if (updated === false) return;
      if (newStatus === 'OnScene' && assignedIncident) {
        showToast(`${currentUnit.callsign} marked on scene.`);
      } else if (newStatus === 'Available') {
        if (assignedIncident) {
          const resolved = await onUpdateIncidentStatus(assignedIncident.id, 'Resolved');
          if (resolved === false) return;
        }
        showToast(`${currentUnit.callsign} is available.`);
      } else {
        showToast(`Status changed to ${newStatus}.`);
      }
    } catch (err) {
      console.error('Status update failed', err);
      showToast('Could not update the assignment. Check the connection and try again.');
    }
  };

  const handleTransmitFieldGps = async () => {
    if (!currentUnit) return;
    if (!navigator.geolocation) {
      showToast('This browser cannot access device location.');
      return;
    }
    setIsTransmittingGps(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });
      await api.updateResponderLocation(
        currentUnit.id,
        position.coords.latitude,
        position.coords.longitude
      );
      showToast('Device location sent to the response map.');
    } catch (err) {
      console.error('GPS transmission failed', err);
      showToast('Could not send device location. Check location permission and try again.');
    } finally {
      setIsTransmittingGps(false);
    }
  };

  const allChecklistCompleted = Object.values(checklist).every(Boolean);

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="field-heading">
      <div className="bg-[#0B101B] border border-white/15 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        
        {/* Modal Header */}
        <div className="p-4 border-b border-white/10 bg-[#0E1524] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-600/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
              <Smartphone className="w-6 h-6" />
            </div>
            <div>
              <h2 id="field-heading" className="text-sm font-bold text-white flex items-center gap-2">
                Responder field view
              </h2>
              <p className="text-[11px] text-slate-400">
                Review an assignment and update its status.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close responder field view"
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
              <label htmlFor="field-unit" className="text-[10px] font-bold text-slate-400 block mb-1">
                Responder unit
              </label>
              <select
                id="field-unit"
                name="field-unit"
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
              <span className="text-[10px] text-slate-400 font-bold mb-1">Connection</span>
              <div className={`flex items-center space-x-1.5 text-xs px-2 py-1 rounded-md border ${connected ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-amber-800 bg-amber-50 border-amber-200'}`} role="status">
                <Wifi className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{connected ? 'Live updates' : 'Reconnecting'}</span>
              </div>
            </div>
          </div>

          {/* Assigned Mission Banner */}
          {currentUnit && (
            {currentUnit && <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-emerald-700" />
                  {assignedIncident ? assignedIncident.location_name : 'No current assignment'}
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

                  <dl className="assignment-facts">
                    <div>
                      <dt>Incident</dt>
                      <dd>{assignedIncident.urgency_level} {assignedIncident.incident_type}</dd>
                    </div>
                    {currentUnit.distance_km !== undefined && (
                      <div>
                        <dt>Distance</dt>
                        <dd>{currentUnit.distance_km} km</dd>
                      </div>
                    )}
                    {currentUnit.eta_minutes !== undefined && (
                      <div>
                        <dt>Estimated travel time</dt>
                        <dd>{currentUnit.eta_minutes} min</dd>
                      </div>
                    )}
                  </dl>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Available at {currentUnit.base_station}. No incident is assigned.
                </p>
              )}
            </div>
          </div>}

          {/* On-device checklist state is not sent to the server. */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Field checklist
            </h3>
            <p className="text-[11px] text-slate-500">Checklist changes stay on this device and are not saved.</p>

            <div className="space-y-2">
              {[
                { key: 'hazard_survey', label: 'Assess the scene and nearby hazards' },
                { key: 'triage_perimeter', label: 'Set a safe perimeter' },
                { key: 'casualty_treatment', label: 'Check whether anyone needs urgent care' },
                { key: 'evacuation_corridor', label: 'Keep access and exit routes clear' },
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

          {!currentUnit && <p className="fleet-empty">No responder units are available.</p>}
          {currentUnit && <>
          <div className="space-y-2 pt-1">
            <span className="text-xs font-semibold text-slate-400 block">
              Update unit status
            </span>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => handleStatusChange('Dispatched')}
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition ${
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
                className={`py-2 px-1 rounded-xl text-xs font-bold border transition ${
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
                className="py-2 px-1 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-400 shadow-lg transition"
              >
                Available
              </button>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleTransmitFieldGps}
              disabled={isTransmittingGps}
              className="w-full py-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-300 hover:text-white text-xs font-bold transition flex items-center justify-center space-x-2"
            >
              <Radio className={`w-4 h-4 ${isTransmittingGps ? 'animate-ping' : ''}`} />
              <span>{isTransmittingGps ? 'Getting device location…' : 'Send device location'}</span>
            </button>
          </div>
          </>}

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
