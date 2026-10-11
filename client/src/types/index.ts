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
