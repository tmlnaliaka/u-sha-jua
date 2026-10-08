import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Incident, IncidentStatus } from '../types';
import { ShieldCheck, Send } from 'lucide-react';

interface DisasterMapProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
  lowBandwidth: boolean;
}

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

export const DisasterMap: React.FC<DisasterMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onUpdateStatus,
  lowBandwidth,
}) => {
  // Kenya Default Center (Nairobi Metropolitan / Informal Settlement Basin)
  const defaultPosition: [number, number] = [-1.286389, 36.817223];

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      <MapContainer
        center={defaultPosition}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <MapController selectedIncident={selectedIncident} />

        {/* Dynamic Tile Layer (Dark Matter / CartoDB or OpenStreetMap) */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={
            lowBandwidth
              ? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
              : `https://{s}.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}{r}.png?api_key=${import.meta.env.VITE_CARTO_API_KEY || 'cb1_4ekr_1_985d9ad7f061f7ff08db79c4'}`
          }
          className={lowBandwidth ? 'dark-map-tiles' : ''}
          maxZoom={19}
        />

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
              <Popup>
                <div className="p-1 space-y-2 text-slate-100 max-w-xs">
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
                      {incident.urgency_level} • {incident.incident_type}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono">
                      {incident.status}
                    </span>
                  </div>

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
                  <div className="pt-2 border-t border-white/10 flex items-center justify-between gap-1.5">
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
    </div>
  );
};
