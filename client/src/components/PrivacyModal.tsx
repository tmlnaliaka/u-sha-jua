import React from 'react';
import { X, ShieldCheck, Lock, EyeOff, FileText, CheckCircle2 } from 'lucide-react';

interface PrivacyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyModal: React.FC<PrivacyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-2xl bg-[#0D1524] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#131D31]">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
                Privacy, Data Protection & Sovereignty
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30 font-mono">
                  Kenya DPA 2019 / GDPR Compliant
                </span>
              </h2>
              <p className="text-xs text-slate-400">Citizen Data Governance & Emergency Dispatch Protections</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-white/5 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-sm text-slate-300">
          {/* Section 1: Data Minimization */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
            <div className="flex items-center space-x-2 text-cyan-400 font-semibold text-xs tracking-wider uppercase font-mono">
              <Lock className="w-4 h-4" />
              <span>1. Purpose Limitation & Data Minimization</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              u-SHA-jua strictly ingests only data essential to emergency humanitarian relief: distress description text, approximate geographic coordinates, and responder status. No advertising trackers, profiling cookies, or commercial telemetry are ever deployed.
            </p>
          </div>

          {/* Section 2: PII Redaction */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
            <div className="flex items-center space-x-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase font-mono">
              <EyeOff className="w-4 h-4" />
              <span>2. Automated PII Scrubbing on Public Feeds</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              All civilian contact phone numbers, National ID patterns, and personal names are scrubbed using automated regex redaction (e.g. <code className="text-emerald-300 bg-emerald-950/60 px-1 py-0.5 rounded">+254 712 *** *78</code>) before distress signals are broadcast on public map feeds and WebSocket streams.
            </p>
          </div>

          {/* Section 3: Right to Erasure */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
            <div className="flex items-center space-x-2 text-amber-400 font-semibold text-xs tracking-wider uppercase font-mono">
              <FileText className="w-4 h-4" />
              <span>3. Right to Erasure & Rectification (Kenya DPA Sec. 40)</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Any citizen or emergency agency may request immediate redaction or deletion of emergency reports via the <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded">DELETE /api/v1/incidents/&#123;id&#125;</code> or <code className="text-amber-300 bg-amber-950/60 px-1 py-0.5 rounded">POST /anonymize</code> API endpoints. Deletions are immutably verified in our cryptographic audit ledger.
            </p>
          </div>

          {/* Section 4: Cryptographic Ledger Verification */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-white/5 space-y-2">
            <div className="flex items-center space-x-2 text-indigo-400 font-semibold text-xs tracking-wider uppercase font-mono">
              <CheckCircle2 className="w-4 h-4" />
              <span>4. Tamper-Evident SHA-256 Audit Trail</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              All dispatch directives, status transitions, and data erasure events are hashed into a cryptographic Merkle-chain audit ledger to prevent unauthorized tampering and ensure complete accountability during disaster post-mortems.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-white/10 bg-[#131D31]">
          <span className="text-[11px] text-slate-400">Office of the Data Protection Commissioner (ODPC) Aligned</span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs transition shadow-lg shadow-cyan-950/50"
          >
            I Understand
          </button>
        </div>
      </div>
    </div>
  );
};

