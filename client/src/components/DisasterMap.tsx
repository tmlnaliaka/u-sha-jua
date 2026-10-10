import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Incident, IncidentStatus } from '../types';
import { api } from '../services/api';
import { CheckCircle2, Image as ImageIcon, Map as MapIcon, Send, ShieldCheck, Satellite, XCircle } from 'lucide-react';

interface DisasterMapProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
  onUpdateVerification: (id: string, status: 'Confirmed' | 'Rejected') => void;
  lowBandwidth: boolean;
}

const RESPONSE_PROTOCOLS = {
  Flood: [
    'Move to higher ground using a route away from moving water.',
    'Do not walk, swim, or drive through floodwater; avoid bridges and drainage channels.',
    'Keep clear of fallen power lines and follow responder instructions.',
  ],
  Fire: [
    'Leave by the nearest safe exit; stay low if smoke is present.',
    'Do not use lifts or re-enter the building for belongings.',
    'Warn others only if safe, then follow fire and rescue personnel directions.',
  ],
  Collapse: [
    'Move away from the unstable structure and keep access routes clear.',
    'Do not enter rubble or move debris; hidden voids and further collapse are dangerous.',
    'Tell rescuers where people may be trapped and follow their directions.',
  ],
} as const;

// Controller to handle programmatic camera flyTo
const MapController: React.FC<{ selectedIncident: Incident | null }> = ({ selectedIncident }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedIncident) {
      map.flyTo(
        [selectedIncident.coordinates.latitude, selectedIncident.coordinates.longitude],
        15,
        { duration: 1.2 }
      );
    }
  }, [selectedIncident, map]);

  return null;
};

// Create custom DOM DivIcons based on urgency
const createCustomMarker = (urgency: string) => {
  let pinClass = 'marker-pin-low';

  if (urgency === 'Critical') {
    pinClass = 'marker-pin-critical';
  } else if (urgency === 'Medium') {
    pinClass = 'marker-pin-medium';
  }

  const html = `
    <div class="${pinClass}" style="display: flex; align-items: center; justify-content: center;">
      <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
    </div>
  `;

  return L.divIcon({
    className: 'custom-disaster-marker',
    html,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

const SecureEvidenceLink: React.FC<{ evidence: Incident['evidence'][number] }> = ({ evidence }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    api.getEvidence(evidence.url)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob);
        if (active) setUrl(objectUrl);
        else URL.revokeObjectURL(objectUrl);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [evidence.url]);

  if (failed) return <span className="text-[10px] text-slate-400">Evidence unavailable</span>;
  if (!url) return <span className="text-[10px] text-slate-400">Loading evidence…</span>;
  if (evidence.content_type.startsWith('image/')) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={evidence.filename}>
        <img src={url} alt={`Evidence: ${evidence.filename}`} className="h-16 w-20 rounded border border-white/10 object-cover" />
      </a>
    );
  }
  return <a href={url} target="_blank" rel="noreferrer" className="text-[10px] text-blue-300 underline">View {evidence.filename}</a>;
};

export const DisasterMap: React.FC<DisasterMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onUpdateStatus,
  onUpdateVerification,
  lowBandwidth,
}) => {
  const [satelliteView, setSatelliteView] = useState(false);
  const [weatherLayer, setWeatherLayer] = useState('');
  // Kenya Default Center (Nairobi Metropolitan / Informal Settlement Basin)
  const defaultPosition: [number, number] = [-1.286389, 36.817223];
  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  const openWeatherApiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
  const useMapbox = satelliteView && Boolean(mapboxToken) && !lowBandwidth;

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      <MapContainer
        center={defaultPosition}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <MapController selectedIncident={selectedIncident} />

        {/* OpenStreetMap is the base map; OpenWeather tiles are optional overlays. */}
        <TileLayer
          attribution={useMapbox
            ? '&copy; <a href="https://www.mapbox.com/about/maps/">Mapbox</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
          url={useMapbox
            ? `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/256/{z}/{x}/{y}?access_token=${mapboxToken}`
            : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'}
          className={lowBandwidth ? 'dark-map-tiles' : ''}
          maxZoom={19}
        />
        {weatherLayer && openWeatherApiKey && !lowBandwidth && (
          <TileLayer
            key={weatherLayer}
            url={`https://tile.openweathermap.org/map/${weatherLayer}/{z}/{x}/{y}.png?appid=${encodeURIComponent(openWeatherApiKey)}`}
            opacity={0.65}
            attribution='Weather tiles &copy; <a href="https://openweathermap.org/">OpenWeather</a>'
            maxZoom={19}
          />
        )}

        {/* Render Vector Markers */}
        {incidents.map((incident) => {
          const markerIcon = createCustomMarker(incident.urgency_level);

          return (
            <Marker
              key={incident.id}
              position={[incident.coordinates.latitude, incident.coordinates.longitude]}
              icon={markerIcon}
              eventHandlers={{
                click: () => onSelectIncident(incident),
              }}
            >
              <Tooltip direction="top" offset={[0, -12]} opacity={0.98} sticky>
                <div className="max-w-56 space-y-1">
                  <strong>{incident.location_name}</strong>
                  <p>{incident.urgency_level} {incident.incident_type} · {incident.verification_status}</p>
                  <p>{incident.raw_text}</p>
                  <small>Community report · {incident.status}</small>
                </div>
              </Tooltip>
              <Popup>
                <div className="p-1 space-y-2.5 text-slate-100 max-w-sm">
                  {/* Header Badge */}
                  <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
                    <span
                      className={`text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                        incident.urgency_level === 'Critical'
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                          : incident.urgency_level === 'Medium'
                          ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      }`}
                    >
                      {incident.urgency_level} · {incident.incident_type}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {incident.status}
                    </span>
                  </div>

                  <div className={`rounded-md px-2 py-1.5 text-[11px] ${
                    incident.verification_status === 'Confirmed'
                      ? 'bg-emerald-950/70 text-emerald-300'
                      : incident.verification_status === 'Rejected'
                        ? 'bg-slate-800 text-slate-300'
                        : incident.verification_status === 'Provisional'
                          ? 'bg-amber-950/70 text-amber-200'
                          : 'bg-amber-950/50 text-amber-300'
                  }`}>
                    <strong>{incident.verification_status === 'Provisional' ? 'AI review · provisional' : incident.verification_status}</strong>
                    <span className="block mt-0.5">
                      {incident.verification_status === 'Confirmed'
                        ? 'Dispatcher-confirmed. Follow local emergency authorities.'
                        : incident.verification_status === 'Rejected'
                          ? 'Marked unconfirmed by dispatcher.'
                          : 'Self-reported and not verified. GPS and satellite imagery are location context only.'}
                    </span>
                  </div>

                  {incident.ai_assessment && (
                    <div className="text-[11px] text-slate-300">
                      <span className="font-semibold text-amber-200">Evidence review note · not verification</span>
                      <p className="mt-0.5 leading-relaxed">{incident.ai_assessment}</p>
                    </div>
                  )}

                  {incident.evidence.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-slate-200 flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Reporter evidence ({incident.evidence.length})
                      </p>
                      <div className="flex gap-2 overflow-x-auto">
                        {incident.evidence.map((evidence) => <SecureEvidenceLink key={evidence.id} evidence={evidence} />)}
                      </div>
                    </div>
                  )}

                  {incident.verification_status === 'Confirmed' && (
                    <section className="rounded-md bg-emerald-950/40 p-2">
                      <h5 className="text-[11px] font-bold text-emerald-200 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5" /> {incident.incident_type} response guide
                      </h5>
                      <ol className="mt-1 list-decimal pl-4 space-y-1 text-[10px] text-slate-200">
                        {RESPONSE_PROTOCOLS[incident.incident_type].map((instruction) => (
                          <li key={instruction}>{instruction}</li>
                        ))}
                      </ol>
                      <p className="mt-1 text-[10px] text-emerald-200/80">
                        General safety guidance only; follow instructions from on-scene emergency services.
                      </p>
                    </section>
                  )}

                  {/* Location & Raw Text */}
                  <div>
                    <h4 className="font-semibold text-xs text-white flex items-center gap-1">
                      📍 {incident.location_name}
                    </h4>
                    <p className="text-xs text-slate-300 mt-1 line-clamp-3 leading-relaxed">
                      "{incident.raw_text}"
                    </p>
                    <p className="text-[10px] text-slate-400 mt-1 font-mono">
                      EPSG:4326: [{incident.coordinates.latitude.toFixed(4)}, {incident.coordinates.longitude.toFixed(4)}]
                    </p>
                  </div>

                  {/* Quick Dispatch Actions */}
                  <div className="pt-2 border-t border-white/10 flex flex-wrap items-center justify-between gap-1.5">
                    {incident.verification_status !== 'Confirmed' && incident.verification_status !== 'Rejected' && (
                      <>
                        <button
                          onClick={() => onUpdateVerification(incident.id, 'Confirmed')}
                          className="flex-1 py-1 px-2 rounded bg-emerald-700 hover:bg-emerald-600 text-white text-[11px] font-medium flex items-center justify-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Confirm
                        </button>
                        <button
                          onClick={() => onUpdateVerification(incident.id, 'Rejected')}
                          className="py-1 px-2 rounded bg-slate-700 hover:bg-slate-600 text-white text-[11px] font-medium flex items-center justify-center gap-1"
                        >
                          <XCircle className="w-3 h-3" /> Reject
                        </button>
                      </>
                    )}
                    {incident.status === 'Pending' && (
                      <button
                        onClick={() => onUpdateStatus(incident.id, 'Dispatched')}
                        className="flex-1 py-1 px-2 rounded bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-medium flex items-center justify-center gap-1 shadow transition"
                      >
                        <Send className="w-3 h-3" />
                        Dispatch Units
                      </button>
                    )}
                    {incident.status === 'Dispatched' && (
                      <button
                        onClick={() => onUpdateStatus(incident.id, 'Resolved')}
                        className="flex-1 py-1 px-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium flex items-center justify-center gap-1 shadow transition"
                      >
                        <ShieldCheck className="w-3 h-3" />
                        Mark Resolved
                      </button>
                    )}
                    {incident.status === 'Resolved' && (
                      <span className="text-[11px] text-emerald-400 font-medium py-1">
                        ✓ Crisis Cleared
                      </span>
                    )}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl text-xs space-y-2 pointer-events-auto max-w-[200px]">
        <h5 className="font-semibold text-slate-200 tracking-wider text-[11px] uppercase border-b border-white/10 pb-1">
          Vector Urgency Legend
        </h5>
        <div className="space-y-1.5">
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-red-500 shadow-sm shadow-red-500 animate-pulse"></span>
            <span className="text-slate-300 text-[11px]">Critical (Rescue trapped)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-amber-500"></span>
            <span className="text-slate-300 text-[11px]">Medium (Escalating risk)</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <span className="text-slate-300 text-[11px]">Low (Advisory/Monitored)</span>
          </div>
        </div>
      </div>
      <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end gap-2">
        <label className="flex items-center gap-2 rounded-lg border border-white/15 bg-[#111827]/95 px-3 py-2 text-xs text-slate-100 shadow-xl">
          <span>Weather layer</span>
          <select
            aria-label="Weather map layer"
            value={weatherLayer}
            onChange={(event) => setWeatherLayer(event.target.value)}
            disabled={!openWeatherApiKey || lowBandwidth}
            className="max-w-36 rounded bg-slate-800 px-2 py-1 text-xs text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
            title={!openWeatherApiKey ? 'Set VITE_OPENWEATHER_API_KEY to enable weather layers' : undefined}
          >
            <option value="">Off</option>
            <option value="precipitation_new">Precipitation</option>
            <option value="clouds_new">Clouds</option>
            <option value="temp_new">Temperature</option>
            <option value="wind_new">Wind</option>
            <option value="pressure_new">Pressure</option>
          </select>
        </label>
        {!openWeatherApiKey && <p className="text-right text-[10px] text-slate-200">Configure OpenWeather key to enable layers</p>}
        {lowBandwidth && <p className="text-right text-[10px] text-slate-200">Weather overlays disabled in low-bandwidth mode</p>}
        <button
          type="button"
          onClick={() => setSatelliteView((current) => !current)}
          disabled={!mapboxToken || lowBandwidth}
          aria-pressed={useMapbox}
          title={!mapboxToken ? 'Set VITE_MAPBOX_ACCESS_TOKEN to enable Mapbox satellite tiles' : 'Satellite imagery is not live incident evidence'}
          className="flex items-center gap-2 rounded-lg border border-white/15 bg-[#111827]/95 px-3 py-2 text-xs font-medium text-slate-100 shadow-xl disabled:cursor-not-allowed disabled:opacity-50"
        >
          {useMapbox ? <MapIcon className="h-3.5 w-3.5" /> : <Satellite className="h-3.5 w-3.5" />}
          {useMapbox ? 'Street map' : 'Satellite context'}
        </button>
      </div>
    </div>
  );
};
