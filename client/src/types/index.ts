export type IncidentType = 'Flood' | 'Fire' | 'Collapse';
export type UrgencyLevel = 'Low' | 'Medium' | 'Critical';
export type IncidentStatus = 'Pending' | 'Dispatched' | 'Resolved';
export type VerificationStatus = 'Unverified' | 'Provisional' | 'Confirmed' | 'Rejected';

export interface IncidentEvidence {
  id: string;
  filename: string;
  content_type: string;
  url: string;
  created_at: string | null;
}

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
  verification_status: VerificationStatus;
  verification_note: string | null;
  ai_assessment: string | null;
  evidence: IncidentEvidence[];
}

export interface CivilianReportInput {
  raw_text: string;
  sender_phone?: string;
  device_lat?: number;
  device_lon?: number;
  sms_opt_in?: boolean;
  files?: File[];
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
