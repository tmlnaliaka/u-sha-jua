import React, { useEffect, useState } from 'react';
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Layers2, Satellite } from 'lucide-react';
import { HazardAlert, Incident } from '../types';

interface DisasterMapProps {
  incidents: Incident[];
  alerts: HazardAlert[];
  selectedIncident: Incident | null;
  selectedAlert: HazardAlert | null;
  onSelectIncident: (incident: Incident) => void;
  onSelectAlert: (alert: HazardAlert) => void;
  lowBandwidth: boolean;
}

const MapController: React.FC<{ selectedIncident: Incident | null; selectedAlert: HazardAlert | null }> = ({
  selectedIncident,
  selectedAlert,
}) => {
  const map = useMap();

  useEffect(() => {
    const coordinates = selectedIncident?.coordinates ?? selectedAlert?.coordinates;
    if (coordinates) map.flyTo([coordinates.latitude, coordinates.longitude], 12, { duration: 0.8 });
  }, [map, selectedAlert, selectedIncident]);

  useEffect(() => {
    const container = map.getContainer();
    const resizeObserver = new ResizeObserver(() => map.invalidateSize({ pan: false }));
    resizeObserver.observe(container);
    const frame = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
    };
  }, [map]);

  return null;
};

const createIncidentIcon = (urgency: Incident['urgency_level']) => {
  const className = urgency === 'Critical' ? 'marker-pin-critical' : urgency === 'Medium' ? 'marker-pin-medium' : 'marker-pin-low';
  return L.divIcon({
    className: 'custom-disaster-marker',
    html: `<div class="${className}" aria-hidden="true"><span></span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

export const DisasterMap: React.FC<DisasterMapProps> = ({
  incidents,
  alerts,
  selectedIncident,
  selectedAlert,
  onSelectIncident,
  onSelectAlert,
  lowBandwidth,
}) => {
  const [satelliteView, setSatelliteView] = useState(false);
  const [weatherLayer, setWeatherLayer] = useState('');
  const defaultPosition: [number, number] = [-0.0236, 37.9062];
  const mapboxToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
  const openWeatherApiKey = import.meta.env.VITE_OPENWEATHER_API_KEY;
  const useMapbox = satelliteView && Boolean(mapboxToken) && !lowBandwidth;

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-200">
      <MapContainer center={defaultPosition} zoom={6} minZoom={4} scrollWheelZoom className="h-full w-full">
        <MapController selectedIncident={selectedIncident} selectedAlert={selectedAlert} />
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
            opacity={0.62}
            attribution='Weather tiles &copy; <a href="https://openweathermap.org/">OpenWeather</a>'
            maxZoom={19}
          />
        )}

        {incidents.map((incident) => (
          <Marker
            key={`incident-${incident.id}`}
            position={[incident.coordinates.latitude, incident.coordinates.longitude]}
            icon={createIncidentIcon(incident.urgency_level)}
            eventHandlers={{ click: () => onSelectIncident(incident) }}
          >
            <Tooltip direction="top" offset={[0, -12]} opacity={1} sticky>
              <div className="max-w-64 space-y-1.5">
                <p className="font-bold">{incident.location_name} · {incident.incident_type}</p>
                <p><strong>{incident.urgency_level}</strong> priority · {incident.status}</p>
                <p className={`font-semibold ${incident.verification_status === 'Confirmed' ? 'text-emerald-800' : 'text-amber-900'}`}>
                  {incident.verification_status === 'Confirmed' ? 'Dispatcher confirmed' : incident.verification_status === 'Rejected' ? 'Dispatcher rejected' : 'Self-reported · not verified'}
                </p>
                <p className="line-clamp-3">{incident.raw_text}</p>
                <p className="text-xs">{incident.evidence.length} evidence file(s) · {new Date(incident.timestamp).toLocaleString()}</p>
                <p className="text-xs">Select point to open full report details</p>
              </div>
            </Tooltip>
          </Marker>
        ))}

        {alerts.filter((alert) => alert.coordinates).map((alert) => {
          const position: [number, number] = [alert.coordinates!.latitude, alert.coordinates!.longitude];
          return (
            <CircleMarker
              key={`alert-${alert.source}-${alert.id}`}
              center={position}
              radius={10}
              pathOptions={{ color: '#0e7490', weight: 3, dashArray: '4 4', fillColor: '#67e8f9', fillOpacity: 0.36 }}
              eventHandlers={{ click: () => onSelectAlert(alert) }}
            >
              <Tooltip direction="top" offset={[0, -8]} opacity={1} sticky>
                <div className="max-w-60 space-y-1">
                  <p className="font-bold">{alert.headline}</p>
                  <p>{alert.source} · {alert.severity} severity</p>
                  <p>{alert.areas.join(', ') || 'Regional warning area'}</p>
                  <p className="text-xs">Approximate official alert area · select for details</p>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute bottom-4 left-4 z-[1000] rounded-md border border-slate-300 bg-white/95 p-3 text-xs shadow-md">
        <p className="font-bold text-slate-950">Map key</p>
        <div className="mt-2 space-y-2 text-slate-700">
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rose-600 ring-2 ring-rose-200" /> Community reports · status varies</div>
          <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full border-2 border-dashed border-cyan-800 bg-cyan-200" /> External warning area · approximate</div>
        </div>
      </div>

      <div className="absolute right-4 top-4 z-[1000] flex flex-col items-end gap-2">
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white/95 px-3 text-xs text-slate-800 shadow-md">
          Weather layer
          <select
            aria-label="Weather map layer"
            value={weatherLayer}
            onChange={(event) => setWeatherLayer(event.target.value)}
            disabled={!openWeatherApiKey || lowBandwidth}
            className="max-w-36 rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
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
        <button
          type="button"
          onClick={() => setSatelliteView((current) => !current)}
          disabled={!mapboxToken || lowBandwidth}
          aria-pressed={useMapbox}
          title={!mapboxToken ? 'Set VITE_MAPBOX_ACCESS_TOKEN to enable optional satellite context' : 'Satellite imagery is not live incident evidence'}
          className="inline-flex min-h-11 items-center gap-2 rounded-md border border-slate-300 bg-white/95 px-3 text-xs font-semibold text-slate-800 shadow-md hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {useMapbox ? <Layers2 className="h-4 w-4" /> : <Satellite className="h-4 w-4" />}
          {useMapbox ? 'Street map' : 'Satellite context'}
        </button>
        {lowBandwidth && <p className="rounded bg-white/95 px-2 py-1 text-[11px] text-slate-700">Optional overlays paused</p>}
      </div>
    </div>
  );
};
