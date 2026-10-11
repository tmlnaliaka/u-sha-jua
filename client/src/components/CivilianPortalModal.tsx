import React, { useState, useEffect } from 'react';
import { 
  X, MapPin, Send, AlertTriangle, Phone, Camera, Mic, Square, 
  CheckCircle2, Clock, ShieldCheck, Navigation, Search, Radio, Volume2
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
  
  // Simulated photo & voice recording
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [recordingSeconds, setRecordingSeconds] = useState<number>(0);
  const [voiceNoteReady, setVoiceNoteReady] = useState<boolean>(false);

  // Tracking state
  const [searchTrackingId, setSearchTrackingId] = useState<string>('');
  const [trackingResult, setTrackingResult] = useState<CivilianTrackResult | null>(null);
  const [trackingLoading, setTrackingLoading] = useState<boolean>(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [recentlySubmittedId, setRecentlySubmittedId] = useState<string | null>(null);

  // Auto-fetch location on modal open
  useEffect(() => {
    if (isOpen && !coords) {
      handleGetLocation();
    }
  }, [isOpen]);

  // Audio recording timer simulation
  useEffect(() => {
    let timer: any;
    if (isRecording) {
      timer = setInterval(() => {
        setRecordingSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timer);
    }
    return () => clearInterval(timer);
  }, [isRecording]);

  if (!isOpen) return null;

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      // Fallback to Nairobi CBD coordinates
      setCoords({ lat: -1.286389, lon: 36.817223 });
      setLocationName('Nairobi CBD (GPS Fallback)');
      return;
    }
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
        // Fallback default
        setCoords({ lat: -1.2612, lon: 36.8574 });
        setLocationName('Mathare 4A (Approximated)');
        setLocating(false);
      },
      { timeout: 8000 }
    );
  };

  const handleToggleVoiceRecording = () => {
    if (isRecording) {
      setIsRecording(false);
      setVoiceNoteReady(true);
    } else {
      setRecordingSeconds(0);
      setVoiceNoteReady(false);
      setIsRecording(true);
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!distressText.trim()) return;

    setIsSubmitting(true);
    try {
      const fullText = `[${hazardType.toUpperCase()}] ${distressText.trim()}${locationName ? ` at ${locationName}` : ''}${voiceNoteReady ? ' (Voice Distress Attached)' : ''}`;
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
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0B101B] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        
        {/* Top Header & Tab Navigation */}
        <div className="p-5 border-b border-white/10 bg-[#0E1524] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-red-600/20 border border-red-500/40 flex items-center justify-center text-red-400 shadow-md shadow-red-950/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                u-SHA-jua Civilian Distress Portal
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/30 text-emerald-300 font-mono">
                  LIVE SOS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Direct Citizen Emergency Dispatch & Real-Time Rescue Tracking
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

        {/* Tab Switcher */}
        <div className="flex border-b border-white/10 bg-[#0D1322] px-5 pt-2">
          <button
            onClick={() => setActiveTab('report')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'report'
                ? 'border-red-500 text-red-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-4 h-4" />
            Report Emergency SOS
          </button>
          <button
            onClick={() => setActiveTab('track')}
            className={`pb-3 px-4 text-xs font-semibold border-b-2 transition flex items-center gap-2 ${
              activeTab === 'track'
                ? 'border-blue-500 text-blue-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" />
            Track Rescue Status {recentlySubmittedId && <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />}
          </button>
        </div>

        {/* Tab 1: Submit Emergency Distress Report */}
        {activeTab === 'report' && (
          <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
            
            {/* GPS Auto-Location Banner */}
            <div className="p-3.5 rounded-xl bg-slate-900/90 border border-white/10 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400">
                  <MapPin className={`w-4 h-4 ${locating ? 'animate-bounce text-amber-400' : ''}`} />
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-200">
                    {locating ? 'Acquiring GPS Satellite Fix...' : coords ? `GPS Locked: ${coords.lat.toFixed(4)}, ${coords.lon.toFixed(4)}` : 'Location Not Set'}
                  </p>
                  <p className="text-[11px] text-slate-400 font-mono">
                    {locationName || 'High-accuracy device coordinates'}
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
                <span>{locating ? 'Locating...' : 'Refresh GPS'}</span>
              </button>
            </div>

            {/* Hazard Type Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 block">
                1. Select Emergency Hazard Type
              </label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { label: 'Flood', icon: '🌊', color: 'border-blue-500/50 bg-blue-950/40 text-blue-300' },
                  { label: 'Fire', icon: '🔥', color: 'border-red-500/50 bg-red-950/40 text-red-300' },
                  { label: 'Collapse', icon: '🏚️', color: 'border-amber-500/50 bg-amber-950/40 text-amber-300' },
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => setHazardType(item.label)}
                    className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center justify-center space-y-1 transition ${
                      hazardType === item.label
                        ? `${item.color} ring-2 ring-white/20 shadow-lg scale-[1.02]`
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-lg">{item.icon}</span>
                    <span>{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Situation Description & Fast Chips */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-2 flex items-center justify-between">
                <span>2. Describe Situation & Trapped Victims</span>
                <span className="text-[11px] text-slate-400 font-normal">NLP will geocode landmarks</span>
              </label>
              <textarea
                value={distressText}
                onChange={(e) => setDistressText(e.target.value)}
                placeholder="e.g. Flood waters rushing past Juja Road bridge near Mathare 4A, 3 adults trapped on metal roof, water reaching knee level..."
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

            {/* Multimedia Attachments: Photo Upload & Audio Voice Note Simulator */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              
              {/* Photo Evidence */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-blue-400" /> Photo Attachment
                    </span>
                    {photoPreview && (
                      <button 
                        type="button" 
                        onClick={() => setPhotoPreview(null)}
                        className="text-[10px] text-red-400 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {photoPreview ? (
                    <div className="relative rounded-lg overflow-hidden border border-white/20 h-20 bg-black/40">
                      <img src={photoPreview} alt="Distress snapshot" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-20 rounded-lg border border-dashed border-white/20 hover:border-blue-400/50 hover:bg-blue-950/20 cursor-pointer transition">
                      <Camera className="w-5 h-5 text-slate-400 mb-1" />
                      <span className="text-[11px] text-slate-400">Click to upload photo snapshot</span>
                      <input type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                    </label>
                  )}
                </div>
              </div>

              {/* Voice Distress Note */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-white/10 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                      <Mic className="w-3.5 h-3.5 text-amber-400" /> Voice Distress Note
                    </span>
                    {voiceNoteReady && (
                      <span className="text-[10px] text-emerald-400 font-mono">Recorded</span>
                    )}
                  </div>

                  <div className="flex items-center space-x-3 h-20">
                    <button
                      type="button"
                      onClick={handleToggleVoiceRecording}
                      className={`w-12 h-12 rounded-xl flex items-center justify-center transition shadow-lg shrink-0 ${
                        isRecording 
                          ? 'bg-red-600 text-white animate-pulse ring-4 ring-red-500/30' 
                          : voiceNoteReady
                            ? 'bg-emerald-600/30 border border-emerald-500/50 text-emerald-300'
                            : 'bg-slate-800 border border-white/15 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isRecording ? <Square className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </button>

                    <div className="flex-1">
                      {isRecording ? (
                        <div>
                          <p className="text-xs text-red-400 font-bold flex items-center gap-1.5 font-mono">
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                            RECORDING 00:{recordingSeconds < 10 ? `0${recordingSeconds}` : recordingSeconds}
                          </p>
                          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-1.5">
                            <div className="bg-red-500 h-full w-2/3 animate-pulse" />
                          </div>
                        </div>
                      ) : voiceNoteReady ? (
                        <div className="flex items-center gap-2 text-xs text-emerald-300">
                          <Volume2 className="w-4 h-4 text-emerald-400" />
                          <span>Voice note attached (5s audio clip)</span>
                        </div>
                      ) : (
                        <p className="text-[11px] text-slate-400">
                          Tap microphone to speak distress message for offline transcription.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

            </div>

            {/* Civilian Phone Contact */}
            <div>
              <label className="text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400" /> Contact Phone for SMS Updates (Optional)
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+254 719 000 000"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900/90 border border-white/15 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500/70 focus:ring-1 focus:ring-emerald-500/50 font-mono transition"
              />
            </div>

            {/* Submit Action Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isSubmitting || !distressText.trim()}
                className="w-full py-3 px-4 rounded-xl bg-red-600 hover:bg-red-500 active:scale-[0.99] disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-950/60 border border-red-400/40 transition flex items-center justify-center space-x-2"
              >
                <Send className="w-4 h-4" />
                <span>{isSubmitting ? 'TRANSMITTING DISTRESS...' : 'BROADCAST EMERGENCY SOS'}</span>
              </button>
            </div>

            {/* Emergency Hotline Assistance Banner */}
            <div className="p-3.5 rounded-xl bg-blue-950/30 border border-blue-500/30 text-xs text-blue-200 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Phone className="w-4 h-4 text-blue-400" />
                <span>Kenyan Toll-Free Hotlines:</span>
              </div>
              <div className="font-mono font-bold text-[11px] space-x-3">
                <span className="text-red-400">Red Cross: 1199</span>
                <span className="text-amber-400">Police/Ambulance: 999</span>
              </div>
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
                  value={searchTrackingId}
                  onChange={(e) => setSearchTrackingId(e.target.value)}
                  placeholder="Enter Incident Tracking ID (e.g. 5a5a...)"
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-blue-500/70 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => handleTrackLookup()}
                disabled={trackingLoading || !searchTrackingId.trim()}
                className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-bold transition flex items-center gap-1.5"
              >
                {trackingLoading ? 'Checking...' : 'Track'}
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
                      ID: {trackingResult.incident.id.slice(0, 8)}...
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
                      <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 font-mono font-bold">
                        ETA ~8-12 MIN
                      </span>
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
