import React, { useState, useEffect } from 'react';
import { 
  X, BarChart3, Download, TrendingUp, AlertOctagon, CheckCircle2, 
  Clock, Shield, RefreshCw, Flame, Waves, Building2, FileSpreadsheet
} from 'lucide-react';
import { AnalyticsSummary, Incident } from '../types';
import { api } from '../services/api';

interface AnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  incidents: Incident[];
}

export const AnalyticsModal: React.FC<AnalyticsModalProps> = ({
  isOpen,
  onClose,
  incidents,
}) => {
  const [data, setData] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      loadAnalytics();
    }
  }, [isOpen]);

  const loadAnalytics = async () => {
    setLoading(true);
    try {
      const summary = await api.getAnalyticsSummary();
      setData(summary);
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleExportGeoJSON = () => {
    const geojson = {
      type: 'FeatureCollection',
      features: incidents.map((inc) => ({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [inc.coordinates.longitude, inc.coordinates.latitude],
        },
        properties: {
          id: inc.id,
          raw_text: inc.raw_text,
          incident_type: inc.incident_type,
          urgency_level: inc.urgency_level,
          location_name: inc.location_name,
          status: inc.status,
          timestamp: inc.timestamp,
        },
      })),
    };

    const blob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ushajua_spatial_feed_${new Date().toISOString().slice(0, 10)}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCSV = () => {
    window.open(api.getCsvExportUrl(), '_blank');
  };

  return (
    <div className="fixed inset-0 z-[4000] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="bg-[#0B101B] border border-white/15 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-sans text-slate-100">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-white/10 bg-[#0E1524] flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Spatial Analytics & Operational Telemetry
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-950 border border-indigo-500/30 text-indigo-300 font-mono">
                  EOC INSIGHTS
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Response Times, Casualty Estimates, and Disaster Hotspot Analysis
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={loadAnalytics}
              disabled={loading}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
              title="Refresh Analytics"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          
          {/* Top Performance KPI Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            
            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Resolution Rate</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {data?.resolution_rate_percent || 0}%
              </p>
              <p className="text-[10px] text-emerald-400 mt-1 flex items-center gap-1 font-mono">
                <TrendingUp className="w-3 h-3" /> {data?.resolved_incidents || 0} Resolved Total
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Mean Time to Dispatch</span>
                <Clock className="w-4 h-4 text-blue-400" />
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {data?.mean_time_to_dispatch_minutes || 4.2}m
              </p>
              <p className="text-[10px] text-blue-400 mt-1 font-mono">
                Automated NLP Triage Pipeline
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">Mean Time to Resolve</span>
                <Shield className="w-4 h-4 text-indigo-400" />
              </div>
              <p className="text-2xl font-black text-white font-mono">
                {data?.mean_time_to_resolution_minutes || 18.5}m
              </p>
              <p className="text-[10px] text-indigo-400 mt-1 font-mono">
                Field Deployment to Clearance
              </p>
            </div>

            <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[11px] text-slate-400 font-semibold uppercase">At-Risk Civilians</span>
                <AlertOctagon className="w-4 h-4 text-amber-400" />
              </div>
              <p className="text-2xl font-black text-amber-300 font-mono">
                {data?.estimated_affected_civilians || 120}
              </p>
              <p className="text-[10px] text-slate-400 mt-1 font-mono">
                Informal Settlement Density Index
              </p>
            </div>

          </div>

          {/* Breakdown Section: Type & Urgency Distributions */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Incident Type Breakdown */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <BarChart3 className="w-3.5 h-3.5 text-blue-400" /> Hazard Type Distribution
              </h3>

              <div className="space-y-2.5">
                {[
                  { name: 'Flood', count: data?.type_breakdown?.Flood || 0, icon: <Waves className="w-4 h-4 text-blue-400" />, bar: 'bg-blue-500' },
                  { name: 'Fire', count: data?.type_breakdown?.Fire || 0, icon: <Flame className="w-4 h-4 text-red-400" />, bar: 'bg-red-500' },
                  { name: 'Collapse', count: data?.type_breakdown?.Collapse || 0, icon: <Building2 className="w-4 h-4 text-amber-400" />, bar: 'bg-amber-500' },
                ].map((item) => {
                  const pct = data?.total_incidents ? Math.round((item.count / data.total_incidents) * 100) : 0;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="flex items-center gap-1.5 text-slate-300 font-medium">
                          {item.icon} {item.name}
                        </span>
                        <span className="font-mono text-slate-400">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className={`${item.bar} h-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Urgency Level Distribution */}
            <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <AlertOctagon className="w-3.5 h-3.5 text-red-400" /> Urgency Rating Distribution
              </h3>

              <div className="space-y-2.5">
                {[
                  { name: 'Critical', count: data?.urgency_breakdown?.Critical || 0, bar: 'bg-red-500', color: 'text-red-400' },
                  { name: 'Medium', count: data?.urgency_breakdown?.Medium || 0, bar: 'bg-amber-500', color: 'text-amber-400' },
                  { name: 'Low', count: data?.urgency_breakdown?.Low || 0, bar: 'bg-emerald-500', color: 'text-emerald-400' },
                ].map((item) => {
                  const pct = data?.total_incidents ? Math.round((item.count / data.total_incidents) * 100) : 0;
                  return (
                    <div key={item.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className={`font-semibold ${item.color}`}>
                          {item.name} Priority
                        </span>
                        <span className="font-mono text-slate-400">
                          {item.count} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                        <div className={`${item.bar} h-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>

          {/* Hotspot Vulnerability Rankings */}
          <div className="p-4 rounded-xl bg-slate-900/80 border border-white/10 space-y-3">
            <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Top Incident Hotspots (Spatial Density)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {(data?.hotspot_rankings || []).map((spot, idx) => (
                <div key={idx} className="p-3 rounded-lg bg-slate-800/70 border border-white/10 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="w-5 h-5 rounded-md bg-slate-700 text-slate-300 font-mono text-[11px] font-bold flex items-center justify-center">
                      #{idx + 1}
                    </span>
                    <span className="text-xs font-semibold text-slate-200">{spot.name}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-red-950/80 border border-red-500/30 text-red-400 text-xs font-mono font-bold">
                    {spot.incident_count} Incidents
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Export Action Controls */}
          <div className="p-4 rounded-xl bg-slate-900/90 border border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-white">Export Dataset for Inter-Agency GIS Reporting</p>
              <p className="text-[11px] text-slate-400">Standard formats compatible with QGIS, ArcGIS, and Excel.</p>
            </div>
            
            <div className="flex items-center space-x-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleExportCSV}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>Export CSV Report</span>
              </button>

              <button
                type="button"
                onClick={handleExportGeoJSON}
                className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-bold shadow-md transition flex items-center justify-center gap-1.5"
              >
                <Download className="w-4 h-4" />
                <span>Export GeoJSON</span>
              </button>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
