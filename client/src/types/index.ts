export type IncidentType = 'Flood' | 'Fire' | 'Collapse';
export type UrgencyLevel = 'Low' | 'Medium' | 'Critical';
export type IncidentStatus = 'Pending' | 'Dispatched' | 'Resolved';

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
