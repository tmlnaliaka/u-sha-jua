export type IncidentType = 'Flood' | 'Fire' | 'Collapse';
export type UrgencyLevel = 'Low' | 'Medium' | 'Critical';
export type IncidentStatus = 'Pending' | 'Dispatched' | 'Resolved';

export type ResponderType = 'Ambulance' | 'FireEngine' | 'WaterRescue' | 'SearchRescue';
export type ResponderStatus = 'Available' | 'Dispatched' | 'OnScene' | 'Returning';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface Incident {
  id: string;
  raw_text: string;
  incident_type: IncidentType;
  urgency_level: UrgencyLevel;
  location_name: string;
  coordinates: {
    latitude: number;
    longitude: number;
  };
  status: IncidentStatus;
  timestamp: string;
}

export interface ResponderUnit {
  id: string;
  callsign: string;
  unit_type: ResponderType;
  base_station: string;
  coordinates: Coordinates;
  status: ResponderStatus;
  assigned_incident_id?: string;
  distance_km?: number;
  eta_minutes?: number;
}

export interface ActiveRoute {
  responder_id: string;
  incident_id: string;
  origin: [number, number]; // [lat, lon]
  destination: [number, number]; // [lat, lon]
  distance_km: number;
  eta_minutes: number;
  unit_callsign: string;
}

export interface CivilianReportInput {
  raw_text: string;
  sender_phone?: string;
  device_lat?: number;
  device_lon?: number;
}

export interface GeoJSONFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id: string;
    raw_text: string;
    incident_type: IncidentType;
    urgency_level: UrgencyLevel;
    location_name: string;
    status: IncidentStatus;
    timestamp: string;
  };
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface WeatherTelemetry {
  status: string;
  precipitation_rate_mmh: number;
  storm_severity: string;
  river_gauge_elevation_m: number;
  river_flood_threshold_m: number;
  river_delta_above_flood_stage_m: number;
  wind_velocity_kmh: number;
  wind_direction: string;
  atmospheric_pressure_hpa: number;
  warning_bulletin: string;
  active_hazard_zones_count: number;
}

export interface FloodZoneFeature {
  type: 'Feature';
  properties: {
    id: string;
    name: string;
    risk_level: 'EXTREME' | 'HIGH' | 'MODERATE';
    color: string;
    fill_color: string;
    estimated_population_at_risk: number;
    muster_point: string;
    advisory: string;
  };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][]; // GeoJSON polygon: array of rings of [lon, lat]
  };
}

export interface FloodZoneCollection {
  type: 'FeatureCollection';
  features: FloodZoneFeature[];
}

export interface AnalyticsSummary {
  total_incidents: number;
  resolved_incidents: number;
  dispatched_incidents: number;
  pending_incidents: number;
  critical_active_count: number;
  resolution_rate_percent: number;
  mean_time_to_dispatch_minutes: number;
  mean_time_to_resolution_minutes: number;
  estimated_affected_civilians: number;
  type_breakdown: Record<string, number>;
  urgency_breakdown: Record<string, number>;
  fleet_utilization: {
    Available: number;
    Dispatched: number;
    OnScene: number;
    Total: number;
  };
  hotspot_rankings: Array<{
    name: string;
    incident_count: number;
  }>;
}

export interface TrackingStage {
  step: number;
  name: string;
  completed: boolean;
  active: boolean;
}

export interface CivilianTrackResult {
  incident: Incident;
  assigned_responder?: ResponderUnit | null;
  current_stage: number;
  stages: TrackingStage[];
}
