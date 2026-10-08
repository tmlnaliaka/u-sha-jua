import React, { useState } from 'react';
import { X, Send, AlertTriangle, Sparkles, Navigation } from 'lucide-react';
import { CivilianReportInput } from '../types';

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (report: CivilianReportInput) => Promise<void>;
}

const PRESET_TEMPLATES = [
  {
    label: "Mathare Flood (Severe)",
    text: "River overflow in Mathare 4A near chief's camp, families trapped on zinc rooftops, water level rising rapidly!",
  },
  {
    label: "Gikomba Fire (Critical)",
    text: "Intense fire outbreak spreading across timber section in Gikomba market, explosions heard, smoke suffocating nearby residents.",
  },
  {
    label: "Mukuru Wall Collapse",
    text: "Perimeter masonry wall collapsed into residential alley in Mukuru kwa Njenga after torrential rain, road impassable.",
  },
  {
    label: "Pipeline Building Tremor",
    text: "Severe foundation cracks visible on 6-storey building in Pipeline Embakasi, residents fleeing into the streets.",
  }
];

export const ReportModal: React.FC<ReportModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [rawText, setRawText] = useState('');
  const [senderPhone, setSenderPhone] = useState('');
  const [useGps, setUseGps] = useState(false);
  const [deviceLat, setDeviceLat] = useState<number | undefined>(undefined);
  const [deviceLon, setDeviceLon] = useState<number | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleUseLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDeviceLat(position.coords.latitude);
          setDeviceLon(position.coords.longitude);
          setUseGps(true);
        },
        () => {
          // Fallback to Nairobi GPS coordinates
          setDeviceLat(-1.286389);
          setDeviceLon(36.817223);
          setUseGps(true);
        }
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawText.trim()) return;

    setSubmitting(true);
    try {
      await onSubmit({
        raw_text: rawText,
        sender_phone: senderPhone || undefined,
        device_lat: useGps ? deviceLat : undefined,
        device_lon: useGps ? deviceLon : undefined,
      });
      setRawText('');
      setSenderPhone('');
      setUseGps(false);
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#111827] border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between bg-[#0E1522]">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 border border-red-500/30 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider">
                Ingest Civilian Distress Message
              </h3>
              <p className="text-[11px] text-slate-400">
                Simulates real-time SMS / Emergency Hotline Intake with AI NLP Geocoding
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Quick Preset Buttons */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5 mb-2">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              <span>Simulate Crisis Scenario (Quick Presets)</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {PRESET_TEMPLATES.map((tpl, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setRawText(tpl.text)}
                  className="text-left p-2 rounded-lg bg-[#161F30] border border-white/5 hover:border-blue-500/40 hover:bg-slate-800/80 text-[11px] text-slate-300 transition"
                >
                  <span className="font-semibold text-white block truncate">{tpl.label}</span>
                  <span className="text-slate-400 block truncate text-[10px] mt-0.5">{tpl.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Raw Distress Message */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Raw Civilian Message / SMS Content *
            </label>
            <textarea
              required
              rows={4}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="e.g. Flooding has broken the river banks in Mathare 4A near juja road bridge, 4 families trapped, water rising fast!"
              className="w-full bg-[#161F30] border border-white/10 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 leading-relaxed"
            />
          </div>

          {/* Sender Phone and GPS Tagging */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Civilian Phone (Optional)
              </label>
              <input
                type="text"
                placeholder="+254 7XX XXX XXX"
                value={senderPhone}
                onChange={(e) => setSenderPhone(e.target.value)}
                className="w-full bg-[#161F30] border border-white/10 rounded-lg py-2 px-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-blue-500/50 font-mono"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1">
                Device GPS Coordinates
              </label>
              <button
                type="button"
                onClick={handleUseLocation}
                className={`w-full py-2 px-3 rounded-lg border text-xs font-medium flex items-center justify-center space-x-1.5 transition ${
                  useGps
                    ? 'bg-blue-950/60 border-blue-500/40 text-blue-400'
                    : 'bg-[#161F30] border-white/10 text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <Navigation className="w-3.5 h-3.5" />
                <span>{useGps ? 'GPS Attached' : 'Attach GPS Pin'}</span>
              </button>
            </div>
          </div>

          {/* Footer Submit Action */}
          <div className="pt-2 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !rawText.trim()}
              className="px-5 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 active:scale-95 text-white font-semibold text-xs shadow-lg shadow-red-950/50 transition flex items-center space-x-2 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{submitting ? 'NLP INFERENCING...' : 'DISPATCH CRISIS REPORT'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
