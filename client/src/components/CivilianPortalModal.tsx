import React, { useState } from 'react';
import { 
  X, MapPin, Send, AlertTriangle, Phone, CheckCircle2, Clock,
  ShieldCheck, Navigation, Search, Radio, Waves, Flame, Building2
} from 'lucide-react';
import { CivilianReportInput, CivilianTrackResult } from '../types';
import { api } from '../services/api';

interface CivilianPortalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitReport: (report: CivilianReportInput) => Promise<any>;
}

export const CivilianPortalModal: React.FC<CivilianPortalModalProps> = ({
  isOpen,
  onClose,
  onSubmitReport,
}) => {
  const [activeTab, setActiveTab] = useState<'report' | 'track'>('report');
  
  // Report Form state
  const [hazardType, setHazardType] = useState<string>('Flood');
  const [distressText, setDistressText] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [locationName, setLocationName] = useState<string>('');
  const [coords, setCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [locating, setLocating] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  
  const [locationError, setLocationError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Tracking state
  const [searchTrackingId, setSearchTrackingId] = useState<string>('');
  const [trackingResult, setTrackingResult] = useState<CivilianTrackResult | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [recentlySubmittedId, setRecentlySubmittedId] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('This browser cannot access device location. Describe a nearby landmark instead.');
      return;
    }
    setLocationError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
        setLocationName(`Lat ${pos.coords.latitude.toFixed(4)}, Lon ${pos.coords.longitude.toFixed(4)}`);
        setLocating(false);
      },
      () => {
        setLocationError('Device location was not available. Describe a nearby landmark instead.');
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distressText.trim()) return;

    setIsSubmitting(true);
    setSubmissionError(null);
    try {
      const fullText = `[${hazardType.toUpperCase()}] ${distressText.trim()}${locationName ? ` at ${locationName}` : ''}`;
      const payload: CivilianReportInput = {
        raw_text: fullText,
        sender_phone: phone.trim() || undefined,
        device_lat: coords?.lat,
        device_lon: coords?.lon,
      };

      const result = await onSubmitReport(payload);
      const incId = result?.id || 'SUBMITTED';
      setRecentlySubmittedId(incId);
      setSearchTrackingId(incId);
      
      // Auto-load into tracking tab
      setActiveTab('track');
      handleTrackLookup(incId);
    } catch (err) {
      console.error('Submission failed', err);
      setSubmissionError('Your report could not be sent. Check your connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTrackLookup = async (idToSearch?: string) => {
    const target = idToSearch || searchTrackingId;
    if (!target.trim()) return;

    setTrackingLoading(true);
    setTrackingError(null);
    try {
      const data = await api.trackIncident(target.trim());
      setTrackingResult(data);
    } catch (err: any) {
      setTrackingError(err.message || 'Tracking ID not found');
      setTrackingResult(null);
    } finally {
      setTrackingLoading(false);
    }
  };

  const quickChips = [
    'Water entering living room rapidly',
    '3 people trapped on building rooftop',
    'Tree fell and blocked access road',
    'Electrical wire sparking near flooded alley',
    'Wall cracked after heavy rain landslide',
  ];

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200" role="dialog" aria-modal="true" aria-labelledby="public-help-heading">
      <div className="bg-[#0B101B] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        
        {/* Top Header & Tab Navigation */}
        <div className="p-5 border-b border-white/10 bg-[#0E1524] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shadow-md shadow-red-950/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 id="public-help-heading" className="text-base font-bold text-white flex items-center gap-2">
                Public help &amp; report tracking
              </h2>
              <p className="text-xs text-slate-400">
                Send an emergency report or check its status.
              </p>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            aria-label="Close public help"
            className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-[#0D1322] px-5 pt-2">
          <button
            onClick={() => setActiveTab('report')}
            aria-pressed={activeTab === 'report'}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'report'
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Send a report
          </button>
          <button
            onClick={() => setActiveTab('track')}
            aria-pressed={activeTab === 'track'}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'track'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Track a report {recentlySubmittedId && <span className="w-2 h-2 rounded-full bg-blue-600" aria-label="Recently submitted report" />}
          </button>
        </div>

        {/* Tab 1: Submit Emergency Distress Report */}
        {activeTab === 'report' && (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
            
            {/* Optional device location */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <MapPin className={`w-4 h-4 ${locating ? 'animate-bounce text-amber-400' : ''}`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    {locating ? 'Getting device location…' : coords ? 'Device location attached' : 'No device location attached'}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {locationName || 'You can describe a landmark in the report.'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGetLocation}
                disabled={locating}
                className="px-3 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/40 border border-blue-500/40 text-blue-300 text-xs font-medium transition flex items-center gap-1.5"
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{locating ? 'Locating…' : coords ? 'Refresh location' : 'Use device location'}</span>
              </button>
            </div>
            {locationError && <p className="text-xs text-amber-800" role="status">{locationError}</p>}

            {/* Hazard Type Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 block">
                What kind of incident is this?
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: 'Flood', icon: Waves, color: 'border-blue-500/50 bg-blue-950/40 text-blue-300' },
                  { label: 'Fire', icon: Flame, color: 'border-red-500/50 bg-red-950/40 text-red-300' },
                  { label: 'Collapse', icon: Building2, color: 'border-amber-500/50 bg-amber-950/40 text-amber-300' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setHazardType(item.label)}
                    aria-pressed={hazardType === item.label}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center space-y-1 transition ${
                      hazardType === item.label
                        ? `${item.color} ring-2 ring-white/20 shadow-lg scale-[1.02]`
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <item.icon className="w-5 h-5" aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Situation Description & Fast Chips */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span>What happened and where?</span>
              </label>
              <textarea
                value={distressText}
                onChange={(e) => setDistressText(e.target.value)}
                placeholder="Describe what you can see and a nearby landmark…"
                rows={3}
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-red-500/70 focus:ring-1 focus:ring-red-500/50 transition resize-none"
              />

              {/* Fast Situational Distress Chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                {quickChips.map((chip, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setDistressText((prev) => prev ? `${prev} ${chip}` : chip)}
                    className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white transition"
                  >
                    + {chip}
                  </button>
                ))}
              </div>
            </div>

            {/* Optional contact details */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" /> Contact phone (optional)
              </label>
              <input
                name="contact-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 719 000 000…"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/50 font-mono transition"
              />
            </div>

            {submissionError && <p className="text-xs text-red-700" role="alert">{submissionError}</p>}

            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !distressText.trim()}
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-950/60 border border-red-400/40 transition flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'Sending report…' : 'Send emergency report'}</span>
              </button>
            </div>

          </form>
        )}

        {/* Tab 2: Track Rescue Status */}
        {activeTab === 'track' && (
          <div className="p-6 overflow-y-auto space-y-5 flex-1">
            
            {/* Search Input Bar */}
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  name="tracking-id"
                  autoComplete="off"
                  value={searchTrackingId}
                  onChange={(e) => setSearchTrackingId(e.target.value)}
                  placeholder="Enter your tracking reference…"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500/70 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => handleTrackLookup()}
                disabled={trackingLoading || !searchTrackingId.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                {trackingLoading ? 'Checking…' : 'Track'}
              </button>
            </div>

            {trackingError && (
              <div className="p-4 rounded-xl bg-rose-950/50 border border-rose-500/40 text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
                <span>{trackingError}</span>
              </div>
            )}

            {/* Tracking Result View */}
            {trackingResult && (
              <div className="space-y-4 animate-in fade-in">
                
                {/* Status Hero Card */}
                <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-400">
                      ID: {trackingResult.incident.id.slice(0, 8)}…
                    </span>
                    <span className={`text-[11px] px-2.5 py-0.5 rounded-full font-bold uppercase ${
                      trackingResult.incident.status === 'Resolved'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                        : trackingResult.incident.status === 'Dispatched'
                          ? 'bg-blue-950 text-blue-400 border border-blue-500/40 animate-pulse'
                          : 'bg-amber-950 text-amber-400 border border-amber-500/40'
                    }`}>
                      {trackingResult.incident.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white">
                    {trackingResult.incident.location_name}
                  </h3>
                  <p className="text-xs text-slate-300 italic">
                    "{trackingResult.incident.raw_text}"
                  </p>
                </div>

                {/* Assigned Responder Unit Telemetry (if dispatched) */}
                {trackingResult.assigned_responder && (
                  <div className="p-4 rounded-xl bg-blue-950/30 border border-blue-500/30 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-9 h-9 rounded-lg bg-blue-600/30 border border-blue-500/40 flex items-center justify-center text-blue-300">
                        <Radio className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-white">
                          Assigned Unit: {trackingResult.assigned_responder.callsign}
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {trackingResult.assigned_responder.base_station}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                    </div>
                  </div>
                )}

                {/* 4-Stage Step Progress Stepper */}
                <div className="p-4 rounded-xl bg-slate-900/60 border border-white/10 space-y-4">
                  <h4 className="text-xs font-semibold text-slate-300">
                    Rescue Operation Lifecycle
                  </h4>

                  <div className="space-y-3">
                    {trackingResult.stages.map((stg) => (
                      <div key={stg.step} className="flex items-center space-x-3">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          stg.completed
                            ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/50'
                            : stg.active
                              ? 'bg-blue-500 text-white animate-pulse'
                              : 'bg-slate-800 text-slate-500 border border-white/10'
                        }`}>
                          {stg.completed ? <CheckCircle2 className="w-4 h-4" /> : stg.step}
                        </div>
                        <div className="flex-1">
                          <p className={`text-xs font-medium ${
                            stg.completed ? 'text-emerald-300' : stg.active ? 'text-blue-300 font-bold' : 'text-slate-500'
                          }`}>
                            {stg.name}
                          </p>
                        </div>
                        {stg.active && (
                          <span className="text-[10px] px-2 py-0.5 rounded bg-blue-950 text-blue-400 font-mono">
                            IN PROGRESS
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            )}

            {!trackingResult && !trackingLoading && !trackingError && (
              <div className="text-center py-10 text-slate-500 space-y-2">
                <Clock className="w-8 h-8 mx-auto text-slate-600" />
                <p className="text-xs">Enter your tracking reference to view live rescue dispatch progress.</p>
              </div>
            )}

          </div>
        )}

      </div>
    </div>
  );
};
