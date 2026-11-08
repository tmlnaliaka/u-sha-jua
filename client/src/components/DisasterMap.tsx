import React, { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Tooltip, Polygon, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Incident, IncidentStatus, ResponderUnit, ActiveRoute, FloodZoneFeature, WeatherTelemetry, Shelter, HazardPerimeterFeature } from '../types';
import { ShieldCheck, Send, Navigation, CloudRain, Flame, Layers, Eye, EyeOff, Waves, AlertTriangle, Home, Globe } from 'lucide-react';
import { api } from '../services/api';

interface DisasterMapProps {
  incidents: Incident[];
  selectedIncident: Incident | null;
  onSelectIncident: (incident: Incident) => void;
  onUpdateStatus: (id: string, status: IncidentStatus) => void;
  lowBandwidth: boolean;
  responders?: ResponderUnit[];
  activeRoutes?: ActiveRoute[];
  onDispatchResponder?: (responderId: string, incidentId: string) => void;
}

// Controller to handle programmatic camera flyTo
const MapController: React.FC<{ selectedIncident: Incident | null }> = ({ selectedIncident }) => {
  const map = useMap();

  useEffect(() => {
    if (selectedIncident) {
      map.flyTo(
        [selectedIncident.coordinates.latitude, selectedIncident.coordinates.longitude],
        14,
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
    <div class="${pinClass}" role="img" aria-label="${urgency} crisis marker" style="display: flex; align-items: center; justify-content: center;">
      <div style="width: 8px; height: 8px; background: white; border-radius: 50%;"></div>
      <span class="sr-only">${urgency} Incident</span>
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

// Create custom DOM DivIcon for emergency responder units
const createResponderMarker = (unit: ResponderUnit) => {
  const isDispatched = unit.status === 'Dispatched' || unit.status === 'OnScene';
  const color = unit.unit_type === 'Ambulance'
    ? '#38bdf8'
    : unit.unit_type === 'FireEngine'
    ? '#f97316'
    : unit.unit_type === 'WaterRescue'
    ? '#2dd4bf'
    : '#a855f7';

  const emoji = unit.unit_type === 'Ambulance'
    ? '🚑'
    : unit.unit_type === 'FireEngine'
    ? '🚒'
    : unit.unit_type === 'WaterRescue'
    ? '🚤'
    : '🚁';

  const html = `
    <div role="img" aria-label="Responder ${unit.callsign} (${unit.unit_type})" style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; background: #0f172a; border: 2px solid ${color}; border-radius: 50%; box-shadow: 0 0 12px ${color}88;">
      <span style="font-size: 14px;">${emoji}</span>
      <span class="sr-only">${unit.callsign}</span>
      ${isDispatched ? `<span style="position: absolute; top: -3px; right: -3px; width: 8px; height: 8px; background: #ef4444; border-radius: 50%; animation: pulse 1s infinite;"></span>` : ''}
    </div>
  `;

  return L.divIcon({
    className: 'custom-responder-marker',
    html,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
};

const createShelterMarker = (shelter: Shelter) => {
  const isCrowded = shelter.occupancy_percent > 85;
  const color = isCrowded ? '#ef4444' : shelter.occupancy_percent > 60 ? '#f59e0b' : '#10b981';

  const html = `
    <div role="img" aria-label="Evacuation shelter ${shelter.name}" style="position: relative; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: #0b111e; border: 2px solid ${color}; border-radius: 8px; box-shadow: 0 0 10px ${color}66;">
      <span style="font-size: 13px;">🏠</span>
      <span class="sr-only">${shelter.name}</span>
    </div>
  `;

  return L.divIcon({
    className: 'custom-shelter-marker',
    html,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
  });
};

export const DisasterMap: React.FC<DisasterMapProps> = ({
  incidents,
  selectedIncident,
  onSelectIncident,
  onUpdateStatus,
  lowBandwidth,
  responders = [],
  activeRoutes = [],
  onDispatchResponder
}) => {
  // Kenya Default Center (Nairobi Metropolitan / Informal Settlement Basin)
  const defaultPosition: [number, number] = [-1.286389, 36.817223];

  // Layer Toggles
  const [showHeatmap, setShowHeatmap] = useState<boolean>(true);
  const [showWeatherRadar, setShowWeatherRadar] = useState<boolean>(true);
  const [showShelters, setShowShelters] = useState<boolean>(true);
  const [basemapMode, setBasemapMode] = useState<'tactical' | 'satellite' | 'streets'>('tactical');
  
  // Weather & Flood Zones state
  const [floodZones, setFloodZones] = useState<FloodZoneFeature[]>([]);
  const [weatherTelemetry, setWeatherTelemetry] = useState<WeatherTelemetry | null>(null);
  const [shelters, setShelters] = useState<Shelter[]>([]);
  const [hazardPerimeter, setHazardPerimeter] = useState<HazardPerimeterFeature | null>(null);

  useEffect(() => {
    // Load flood zones, weather telemetry, and evacuation shelters
    const loadMapData = async () => {
      try {
        const [zonesData, telemetryData, sheltersData] = await Promise.all([
          api.getFloodZones(),
          api.getWeatherTelemetry(),
          api.getShelters()
        ]);
        if (zonesData?.features) {
          setFloodZones(zonesData.features);
        }
        if (telemetryData) {
          setWeatherTelemetry(telemetryData);
        }
        if (sheltersData) {
          setShelters(sheltersData);
        }
      } catch (err) {
        console.error('Failed to load map data', err);
      }
    };
    loadMapData();
  }, []);

  // Fetch dynamic hazard perimeter whenever selected incident changes
  useEffect(() => {
    if (!selectedIncident) {
      setHazardPerimeter(null);
      return;
    }
    const loadPerimeter = async () => {
      try {
        const perim = await api.getHazardPerimeter(selectedIncident.id);
        setHazardPerimeter(perim);
      } catch (e) {
        setHazardPerimeter(null);
      }
    };
    loadPerimeter();
  }, [selectedIncident]);

  return (
    <div className="w-full h-full relative overflow-hidden select-none">
      
      {/* Top Map Layer Control Bar */}
      <div className="absolute top-4 right-4 z-[1000] flex items-center space-x-2 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-2xl">
        {/* Basemap Mode Switcher */}
        <button
          type="button"
          onClick={() => {
            setBasemapMode(prev => prev === 'tactical' ? 'satellite' : prev === 'satellite' ? 'streets' : 'tactical');
          }}
          className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/90 hover:bg-indigo-500 text-white shadow-md shadow-indigo-900/50 transition"
          title="Cycle Basemap: Tactical Dark / Satellite Aerial / OpenStreetMap"
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="capitalize">{basemapMode === 'tactical' ? 'Tactical Dark' : basemapMode === 'satellite' ? 'Satellite' : 'Street Map'}</span>
        </button>

        <button
          type="button"
          onClick={() => setShowWeatherRadar(!showWeatherRadar)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            showWeatherRadar
              ? 'bg-blue-600 text-white shadow-md shadow-blue-900/50'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Toggle Flood Inundation Zones & Weather Radar HUD"
        >
          <CloudRain className="w-3.5 h-3.5" />
          <span>Flood Radar</span>
        </button>

        <button
          type="button"
          onClick={() => setShowShelters(!showShelters)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            showShelters
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-900/50'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Toggle Designated Evacuation Shelters & Relief Bases"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Shelters</span>
        </button>

        <button
          type="button"
          onClick={() => setShowHeatmap(!showHeatmap)}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
            showHeatmap
              ? 'bg-amber-600 text-white shadow-md shadow-amber-900/50'
              : 'bg-slate-800 text-slate-400 hover:text-white'
          }`}
          title="Toggle Spatial Incident Heatmap Gradient"
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Heatmap</span>
        </button>
      </div>

      {/* Weather Early-Warning Telemetry HUD Card (Top-Left) */}
      {showWeatherRadar && weatherTelemetry && (
        <div className="absolute top-4 left-4 z-[1000] max-w-sm bg-slate-900/95 backdrop-blur-md border border-blue-500/30 rounded-xl p-3.5 shadow-2xl text-xs space-y-2 text-slate-100">
          <div className="flex items-center justify-between border-b border-white/10 pb-1.5">
            <span className="font-bold text-sky-400 flex items-center gap-1.5">
              <CloudRain className="w-4 h-4 text-sky-400" />
              LIVE RADAR TELEMETRY
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-500/40 font-mono font-bold animate-pulse">
              LEVEL 3 ALERT
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
            <div className="p-1.5 rounded bg-slate-800/80 border border-white/10">
              <span className="text-slate-400 block text-[10px]">RAINFALL RATE</span>
              <span className="text-sky-300 font-bold">{weatherTelemetry.precipitation_rate_mmh} mm/hr</span>
            </div>
            <div className="p-1.5 rounded bg-slate-800/80 border border-white/10">
              <span className="text-slate-400 block text-[10px]">RIVER GAUGE</span>
              <span className="text-amber-300 font-bold">{weatherTelemetry.river_gauge_elevation_m}m (+{weatherTelemetry.river_delta_above_flood_stage_m}m)</span>
            </div>
          </div>

          <p className="text-[10px] text-slate-300 italic leading-snug">
            {weatherTelemetry.warning_bulletin}
          </p>
        </div>
      )}

      <MapContainer
        center={defaultPosition}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        <MapController selectedIncident={selectedIncident} />

        {/* Clean, High-Precision Tile Layer without Watermarks */}
        <TileLayer
          key={basemapMode}
          attribution={
            basemapMode === 'satellite'
              ? '&copy; Esri &copy; Earthstar Geographics'
              : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; u-SHA-jua Geospatial Engine'
          }
          url={
            basemapMode === 'satellite'
              ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
              : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
          }
          className={basemapMode === 'tactical' ? 'dark-map-tiles' : ''}
          maxZoom={19}
        />

        {/* High-Hazard Flood Vulnerability Polygons */}
        {showWeatherRadar && floodZones.map((zone) => {
          // Leaflet Polygon expects coordinates in [lat, lon] format
          const latLngs: [number, number][] = zone.geometry.coordinates[0].map(([lon, lat]) => [lat, lon]);

          return (
            <Polygon
              key={zone.properties.id}
              positions={latLngs}
              pathOptions={{
                color: zone.properties.color,
                fillColor: zone.properties.fill_color,
                fillOpacity: 0.35,
                weight: 2,
                dashArray: '6, 6'
              }}
            >
              <Tooltip permanent={false} direction="center">
                <div className="p-1.5 text-xs text-white bg-slate-900/95 border border-white/20 rounded shadow-xl font-sans">
                  <p className="font-bold text-red-400 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    {zone.properties.name}
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Population At Risk: ~{zone.properties.estimated_population_at_risk.toLocaleString()}
                  </p>
                  <p className="text-[10px] text-emerald-400 mt-0.5 font-mono">
                    Muster: {zone.properties.muster_point}
                  </p>
                </div>
              </Tooltip>
            </Polygon>
          );
        })}

        {/* Spatial Incident Heatmap Gradient Circles */}
        {showHeatmap && incidents.map((inc) => {
          const isCritical = inc.urgency_level === 'Critical';
          const isMedium = inc.urgency_level === 'Medium';
          const radius = isCritical ? 900 : isMedium ? 600 : 350;
          const heatColor = isCritical ? '#EF4444' : isMedium ? '#F59E0B' : '#10B981';

          return (
            <Circle
              key={`heat-${inc.id}`}
              center={[inc.coordinates.latitude, inc.coordinates.longitude]}
              radius={radius}
              pathOptions={{
                color: heatColor,
                fillColor: heatColor,
                fillOpacity: isCritical ? 0.22 : 0.14,
                weight: 1,
              }}
            />
          );
        })}

        {/* Dynamic Vector Route Polylines for active dispatches */}
        {activeRoutes.map((route, idx) => (
          <Polyline
            key={`route-${idx}-${route.responder_id}`}
            positions={[route.origin, route.destination]}
            pathOptions={{
              color: '#38bdf8',
              weight: 3.5,
              dashArray: '8, 8',
              opacity: 0.85
            }}
          >
            <Tooltip permanent={false} direction="top" offset={[0, -10]}>
              <div className="text-xs font-mono font-semibold text-sky-400 bg-slate-900 px-1 py-0.5 rounded">
                ⚡ {route.unit_callsign}: {route.distance_km} km (ETA {route.eta_minutes} min)
              </div>
            </Tooltip>
          </Polyline>
        ))}

        {/* Render Incident Markers */}
        {incidents.map((incident) => {
          const markerIcon = createCustomMarker(incident.urgency_level);

          return (
            <Marker
              key={incident.id}
              position={[incident.coordinates.latitude, incident.coordinates.longitude]}
              icon={markerIcon}
              title={`[${incident.urgency_level}] ${incident.location_name}`}
              alt={`Crisis incident at ${incident.location_name}`}
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

        {/* Render Emergency Responder Fleet Markers */}
        {responders.map((unit) => {
          const respIcon = createResponderMarker(unit);
          return (
            <Marker
              key={unit.id}
              position={[unit.coordinates.latitude, unit.coordinates.longitude]}
              icon={respIcon}
              title={`Responder ${unit.callsign} (${unit.unit_type}) - ${unit.status}`}
              alt={`Emergency unit ${unit.callsign}`}
            >
              <Popup>
                <div className="p-1 space-y-1.5 text-slate-100 max-w-xs">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                    <span className="text-xs font-bold text-white">{unit.callsign}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                      unit.status === 'Available' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                    }`}>
                      {unit.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    <span className="text-slate-400">Station:</span> {unit.base_station}
                  </p>
                  {selectedIncident && unit.status === 'Available' && (
                    <button
                      onClick={() => onDispatchResponder && onDispatchResponder(unit.id, selectedIncident.id)}
                      className="w-full mt-1 py-1 px-2 rounded bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium flex items-center justify-center gap-1 transition shadow"
                    >
                      <Navigation className="w-3 h-3" />
                      Dispatch to {selectedIncident.location_name.slice(0, 18)}...
                    </button>
                  )}
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Dynamic Incident Hazard Perimeter Buffer Polygon */}
        {hazardPerimeter && (
          <Polygon
            positions={hazardPerimeter.geometry.coordinates[0].map(([lon, lat]) => [lat, lon])}
            pathOptions={{
              color: '#ef4444',
              fillColor: '#ef4444',
              fillOpacity: 0.22,
              weight: 2,
              dashArray: '5, 8'
            }}
          >
            <Popup>
              <div className="p-1 space-y-1 text-slate-100 max-w-xs text-xs">
                <div className="flex items-center gap-1.5 font-bold text-red-400 border-b border-white/10 pb-1">
                  <AlertTriangle className="w-4 h-4 text-red-400 animate-pulse" />
                  DYNAMIC HAZARD CORDON ({hazardPerimeter.properties.radius_meters}m)
                </div>
                <p className="text-[11px] text-slate-200">
                  {hazardPerimeter.properties.evacuation_advisory}
                </p>
                <div className="text-[10px] text-amber-300 font-mono pt-1">
                  Est. Affected Population: ~{hazardPerimeter.properties.estimated_population_impacted.toLocaleString()} civilians
                </div>
              </div>
            </Popup>
          </Polygon>
        )}

        {/* Designated Evacuation Shelters & Relief Bases Layer */}
        {showShelters && shelters.map((s) => {
          const shelterIcon = createShelterMarker(s);
          return (
            <Marker
              key={s.id}
              position={[s.coordinates.latitude, s.coordinates.longitude]}
              icon={shelterIcon}
              title={`Shelter ${s.name} (${s.occupancy_percent}% full)`}
              alt={`Evacuation shelter ${s.name}`}
            >
              <Popup>
                <div className="p-1 space-y-1.5 text-slate-100 max-w-xs text-xs">
                  <div className="flex items-center justify-between border-b border-white/10 pb-1">
                    <span className="font-bold text-emerald-400">{s.name}</span>
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                      {s.occupancy_percent}% Full
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300 font-mono">
                    📍 {s.location_name}
                  </p>
                  <div className="text-[11px] space-y-0.5 text-slate-400">
                    <div>Capacity: <strong className="text-white">{s.occupancy_current} / {s.capacity_total}</strong></div>
                    <div>Open Beds: <strong className="text-emerald-400">{s.available_space}</strong></div>
                    <div>Medical Post: <strong className="text-white">{s.medical_post_available ? '✓ Present' : '✗ None'}</strong></div>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      {/* Floating Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[1000] bg-[#111827]/90 backdrop-blur-md border border-white/10 rounded-xl p-3 shadow-2xl text-xs space-y-2 pointer-events-auto max-w-[240px]">
        <h5 className="font-semibold text-slate-200 tracking-wider text-[11px] uppercase border-b border-white/10 pb-1">
          Tactical Map Legend
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
          <div className="flex items-center space-x-2">
            <span className="w-3.5 h-2 rounded border border-dashed border-red-500 bg-red-500/20"></span>
            <span className="text-red-300 text-[11px]">Hazard Cordon & Flood Plain</span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-[12px]">🏠</span>
            <span className="text-emerald-300 text-[11px]">Evacuation Shelters</span>
          </div>
          <div className="pt-1 border-t border-white/10 flex items-center space-x-2">
            <span className="text-[12px]">🚑 🚒 🚤</span>
            <span className="text-sky-300 text-[11px]">Active Responders & Routes</span>
          </div>
        </div>
      </div>
    </div>
  );
};
