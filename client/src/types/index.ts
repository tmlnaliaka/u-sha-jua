export type IncidentType = 'Flood' | 'Fire' | 'Collapse';
export type UrgencyLevel = 'Low' | 'Medium' | 'Critical';
export type IncidentStatus = 'Pending' | 'Dispatched' | 'Resolved';
export type VerificationStatus = 'Unverified' | 'Provisional' | 'Confirmed' | 'Rejected';
export type UserRole = 'admin' | 'survivor';

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  role: UserRole;
  phone_number: string | null;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: AuthUser;
}

export interface SignInInput {
  email: string;
  password: string;
}

export interface SignUpInput extends SignInInput {
  display_name: string;
  phone_number?: string;
}

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

export type HazardSourceState = 'ok' | 'stale' | 'degraded' | 'error';

export interface HazardSourceStatus {
  source: string;
  status: HazardSourceState;
  fetched_at: string;
  published_at: string | null;
  url: string;
  message: string;
}

export interface HazardAlert {
  id: string;
  source: string;
  headline: string;
  event: string;
  severity: string;
  urgency: string;
  certainty: string;
  description: string;
  instruction: string | null;
  areas: string[];
  coordinates: Coordinates | null;
  issued_at: string | null;
  effective_at: string | null;
  expires_at: string | null;
  source_url: string;
  alert_level: string;
}

export interface HazardFeedResponse {
  alerts: HazardAlert[];
  sources: HazardSourceStatus[];
  fetched_at: string;
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
