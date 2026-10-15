import React, { useState, useEffect } from 'react';
import { 
  X, ShieldCheck, Home, BrainCircuit, FileCheck2, Download, 
  Send, RefreshCw, CheckCircle, AlertCircle, Users, Activity, Lock
} from 'lucide-react';
import { Shelter, Incident, RecommendationResult, AuditEntry, AuditLedgerVerification } from '../types';
import { api } from '../services/api';

interface CommandCenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Incident[];
  onIncidentUpdated: () => void;
  showToast: (msg: string) => void;
}

export const CommandCenterModal: React.FC<CommandCenterModalProps> = ({
  isOpen,
  onClose,
  incidents,
  onIncidentUpdated,
  showToast
}) => {
  const [activeTab, setActiveTab] = useState<'shelters' | 'recommend' | 'audit' | 'mesh'>('shelters');
  
  // Shelters state
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [loadingShelters, setLoadingShelters] = useState(false);

  // Recommendation state
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);

  // Audit state
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditVerification, setAuditVerification] = useState<AuditLedgerVerification | null>(null);
  const [loadingAudit, setLoadingAudit] = useState(false);

  // Mesh bundle state
  const [offlineBundle, setOfflineBundle] = useState<any | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadShelters();
      loadAuditTrail();
      if (incidents.length > 0 && !selectedIncidentId) {
        setSelectedIncidentId(incidents[0].id);
      }
    }
  }, [isOpen, incidents]);

  const loadShelters = async () => {
    setLoadingShelters(true);
    try {
      const data = await api.getShelters();
      setShelters(data);
    } catch (e: any) {
      showToast('Failed to load evacuation shelters');
    } finally {
      setLoadingShelters(false);
    }
  };

  const loadAuditTrail = async () => {
    setLoadingAudit(true);
    try {
      const trail = await api.getAuditTrail(30);
      setAuditEntries(trail.entries || []);
      const ver = await api.verifyAuditTrail();
      setAuditVerification(ver);
    } catch (e: any) {
      showToast('Failed to load audit ledger');
    } finally {
      setLoadingAudit(false);
    }
  };

  const handleUpdateOccupancy = async (shelterId: string, current: number, delta: number) => {
    const newCount = Math.max(0, current + delta);
    try {
      await api.updateShelterOccupancy(shelterId, newCount);
      showToast(`Updated shelter occupancy to ${newCount}`);
      loadShelters();
    } catch (e: any) {
      showToast('Failed to update occupancy');
    }
  };

  const handleCalculateRecommendation = async () => {
    if (!selectedIncidentId) return;
    setLoadingRec(true);
    try {
      const rec = await api.recommendResponder(selectedIncidentId);
      setRecommendation(rec);
    } catch (e: any) {
      showToast('Failed to calculate unit recommendation');
    } finally {
      setLoadingRec(false);
    }
  };

  const handleExecuteAutoDispatch = async () => {
    if (!selectedIncidentId) return;
    try {
      const res = await api.autoDispatchResponder(selectedIncidentId);
      showToast(`Autonomous Dispatch: Unit ${res.callsign} assigned!`);
      onIncidentUpdated();
      handleCalculateRecommendation();
    } catch (e: any) {
      showToast(e.message || 'Auto-dispatch failed');
    }
  };

  const handleVerifyChain = async () => {
    try {
      const ver = await api.verifyAuditTrail();
      setAuditVerification(ver);
      if (ver.valid) {
        showToast(`✓ All ${ver.total_blocks} audit blocks verified cryptographically!`);
      } else {
        showToast(`⚠️ Block tampering detected at block ${ver.error_at_block}`);
      }
    } catch (e) {
      showToast('Verification failed');
    }
  };

  const handleExportOfflineBundle = async () => {
    try {
      const bundle = await api.getOfflineBundle();
      setOfflineBundle(bundle);
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(bundle, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `ushajua_offline_bundle_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
      showToast('Downloaded offline crisis bundle for field devices');
    } catch (e) {
      showToast('Failed to export offline bundle');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
      <div className="w-full max-w-4xl bg-[#0F172A] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Topbar */}
        <div className="px-6 py-4 bg-[#0B0F17] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                Enterprise Tactical Operations & Security Suite
                <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-mono">SECURED</span>
              </h3>
              <p className="text-xs text-slate-400">
                Evacuation Shelters • AI Auto-Dispatch • Tamper-Evident SHA-256 Ledger • Mesh Sync
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex border-b border-white/10 bg-[#0B111E] px-6 text-xs">
          <button
            onClick={() => setActiveTab('shelters')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'shelters'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Home className="w-4 h-4" />
            Evacuation Shelters ({shelters.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('recommend');
              if (!recommendation && selectedIncidentId) handleCalculateRecommendation();
            }}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'recommend'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BrainCircuit className="w-4 h-4" />
            AI Auto-Dispatch & Recommendations
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'audit'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Lock className="w-4 h-4" />
            Cryptographic Audit Ledger
          </button>
          <button
            onClick={() => setActiveTab('mesh')}
            className={`py-3 px-4 font-semibold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'mesh'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-950/20'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileCheck2 className="w-4 h-4" />
            Offline Crisis Mesh Sync
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="p-6 overflow-y-auto flex-1 text-slate-200 text-xs">
          
          {/* TAB 1: EVACUATION SHELTERS */}
          {activeTab === 'shelters' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300 font-medium">Designated Safe Ground Facilities & Capacity</span>
                <button
                  onClick={loadShelters}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:text-white"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Refresh
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {shelters.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-bold text-white text-sm">{s.name}</h4>
                        <p className="text-[11px] text-cyan-400 font-mono">{s.location_name}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        s.available_space > 100 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {s.occupancy_percent}% OCCUPIED
                      </span>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] text-slate-400">
                        <span>Occupancy: {s.occupancy_current} / {s.capacity_total}</span>
                        <span className="font-mono text-emerald-400">{s.available_space} Beds Open</span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${
                            s.occupancy_percent > 85 ? 'bg-red-500' : s.occupancy_percent > 60 ? 'bg-amber-500' : 'bg-cyan-500'
                          }`}
                          style={{ width: `${Math.min(100, s.occupancy_percent)}%` }}
                        />
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-white/5">
                      <span>Water: <span className="text-white font-medium">{s.water_supply_status}</span></span>
                      <span>Medical: <span className="text-white font-medium">{s.medical_post_available ? '✓ Active Post' : '✗ None'}</span></span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateOccupancy(s.id, s.occupancy_current, -10)}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-white"
                        >-10</button>
                        <button
                          onClick={() => handleUpdateOccupancy(s.id, s.occupancy_current, 10)}
                          className="px-2 py-0.5 rounded bg-cyan-700 hover:bg-cyan-600 text-white"
                        >+10</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: AI RECOMMENDATIONS & AUTO-DISPATCH */}
          {activeTab === 'recommend' && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-slate-900/90 p-3 rounded-xl border border-white/10">
                <span className="font-semibold text-slate-300">Target Crisis Incident:</span>
                <select
                  value={selectedIncidentId}
                  onChange={(e) => setSelectedIncidentId(e.target.value)}
                  className="bg-slate-800 border border-white/10 rounded px-3 py-1.5 text-xs text-white flex-1"
                >
                  {incidents.map((inc) => (
                    <option key={inc.id} value={inc.id}>
                      [{inc.urgency_level.toUpperCase()}] {inc.incident_type} @ {inc.location_name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={handleCalculateRecommendation}
                  disabled={loadingRec}
                  className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold transition"
                >
                  {loadingRec ? 'Calculating...' : 'Run MCDA Engine'}
                </button>
              </div>

              {recommendation && (
                <div className="space-y-4">
                  {/* Best Match Banner */}
                  {recommendation.best_match && (
                    <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/60 to-blue-950/40 border border-cyan-500/40 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                          <h4 className="font-bold text-white text-sm">
                            Optimal Tactical Recommendation: {recommendation.best_match.callsign}
                          </h4>
                        </div>
                        <span className="px-3 py-1 rounded-full bg-cyan-500/20 text-cyan-300 font-mono font-bold text-xs border border-cyan-500/30">
                          {recommendation.best_match.match_score}% MATCH SCORE
                        </span>
                      </div>

                      <p className="text-slate-300 text-xs">
                        {recommendation.best_match.recommendation_rationale}
                      </p>

                      <div className="flex items-center justify-between pt-2 border-t border-white/10">
                        <div className="flex gap-4 text-slate-400">
                          <span>Unit Type: <strong className="text-white">{recommendation.best_match.unit_type}</strong></span>
                          <span>ETA: <strong className="text-emerald-400">{recommendation.best_match.eta_minutes} min</strong></span>
                          <span>Distance: <strong className="text-white">{recommendation.best_match.distance_km} km</strong></span>
                        </div>
                        <button
                          onClick={handleExecuteAutoDispatch}
                          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-lg shadow-emerald-950/60"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Authorize Auto-Dispatch
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Other Ranked Candidates */}
                  <div>
                    <h5 className="font-semibold text-slate-300 mb-2">Fleet Ranking Analysis:</h5>
                    <div className="space-y-2">
                      {recommendation.all_recommendations.map((unit) => (
                        <div key={unit.id} className="p-3 rounded-lg bg-slate-900 border border-white/5 flex items-center justify-between">
                          <div>
                            <span className="font-bold text-white">{unit.callsign}</span>
                            <span className="ml-2 text-slate-400">({unit.unit_type})</span>
                            <p className="text-[11px] text-slate-400 mt-0.5">{unit.recommendation_rationale}</p>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-cyan-400 font-bold">{unit.match_score}%</span>
                            <div className="text-[10px] text-slate-500">{unit.status}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: CRYPTOGRAPHIC AUDIT TRAIL */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-slate-900 p-3 rounded-xl border border-white/10">
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-300 font-medium">
                    SHA-256 Hash-Chained Tamper-Evident Ledger
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {auditVerification && (
                    <span className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[11px] font-mono">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {auditVerification.total_blocks} BLOCKS VERIFIED
                    </span>
                  )}
                  <button
                    onClick={handleVerifyChain}
                    className="px-3 py-1 rounded bg-cyan-700 hover:bg-cyan-600 text-white font-semibold transition"
                  >
                    Re-Verify Chain Integrity
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                {auditEntries.map((e) => (
                  <div key={e.entry_id} className="p-3 rounded-lg bg-slate-900/70 border border-white/5 font-mono text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-slate-400">
                      <span className="text-cyan-400 font-bold">BLOCK #{e.entry_id} — {e.action}</span>
                      <span>{new Date(e.timestamp).toLocaleTimeString()} ({e.actor})</span>
                    </div>
                    <p className="text-slate-300 font-sans text-xs">
                      {JSON.stringify(e.details)}
                    </p>
                    <div className="text-[10px] text-slate-500 truncate pt-1 border-t border-white/5">
                      Hash: <span className="text-slate-400">{e.entry_hash}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: OFFLINE CRISIS MESH SYNC */}
          {activeTab === 'mesh' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
                <h4 className="font-bold text-white text-sm">Offline Mesh Synchronization Protocol</h4>
                <p className="text-slate-300 text-xs leading-relaxed">
                  During cellular outages, field teams using the u-SHA-jua PWA or LoRa radio mesh can export and synchronize localized crisis bundles without cloud dependency.
                </p>
                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={handleExportOfflineBundle}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-bold transition shadow"
                  >
                    <Download className="w-4 h-4" />
                    Export Field Tablet Bundle (JSON)
                  </button>
                </div>
              </div>

              {offlineBundle && (
                <div className="p-3 rounded-lg bg-slate-900 font-mono text-[11px] border border-white/5 text-slate-300">
                  <p>✓ Exported {offlineBundle.active_incidents?.length || 0} active incidents</p>
                  <p>✓ Exported {offlineBundle.shelters?.length || 0} evacuation shelters</p>
                  <p>Checksum: {offlineBundle.security_checksum}</p>
                </div>
              )}
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
