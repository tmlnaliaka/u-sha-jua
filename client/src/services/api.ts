import {
  AuthResponse,
  AuthUser,
  Incident,
  CivilianReportInput,
  GeoJSONFeatureCollection,
  IncidentStatus,
  SignInInput,
  SignUpInput,
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
const AUTH_STORAGE_KEY = 'ushajua.access_token';
let accessToken: string | null = sessionStorage.getItem(AUTH_STORAGE_KEY);

export function setAccessToken(token: string | null): void {
  accessToken = token;
  if (token) sessionStorage.setItem(AUTH_STORAGE_KEY, token);
  else sessionStorage.removeItem(AUTH_STORAGE_KEY);
}

export function hasAccessToken(): boolean {
  return accessToken !== null;
}

function authHeaders(headers: HeadersInit = {}): Headers {
  const result = new Headers(headers);
  if (accessToken) result.set('Authorization', `Bearer ${accessToken}`);
  return result;
}

async function responseError(response: Response, fallback: string): Promise<string> {
  try {
    const data = await response.json();
    return typeof data.detail === 'string' ? data.detail : fallback;
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return fallback;
  }
}

export const api = {
  async signIn(input: SignInInput): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Could not sign in.'));
    return res.json();
  },

  async signUp(input: SignUpInput): Promise<AuthResponse> {
    const res = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Could not create your account.'));
    return res.json();
  },

  async getCurrentUser(): Promise<AuthUser> {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await responseError(res, 'Your session has expired. Sign in again.'));
    return res.json();
  },

  async getIncidents(): Promise<Incident[]> {
    const res = await fetch(`${API_BASE}/api/v1/incidents`, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch incidents');
    return res.json();
  },

  async getSpatialFeed(bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }): Promise<GeoJSONFeatureCollection> {
    let url = `${API_BASE}/api/v1/incidents/spatial-feed`;
    if (bounds) {
      const params = new URLSearchParams({
        min_lat: bounds.minLat.toString(),
        max_lat: bounds.maxLat.toString(),
        min_lon: bounds.minLon.toString(),
        max_lon: bounds.maxLon.toString(),
      });
      url += `?${params.toString()}`;
    }
    const res = await fetch(url, { headers: authHeaders() });
    if (!res.ok) throw new Error('Failed to fetch spatial feed');
    return res.json();
  },

  async reportIncident(report: CivilianReportInput): Promise<Incident> {
    if (report.files?.length) {
      const form = new FormData();
      form.append('raw_text', report.raw_text);
      if (report.sender_phone) form.append('sender_phone', report.sender_phone);
      form.append('sms_opt_in', String(report.sms_opt_in ?? false));
      if (report.device_lat !== undefined) form.append('device_lat', String(report.device_lat));
      if (report.device_lon !== undefined) form.append('device_lon', String(report.device_lon));
      report.files.forEach((file) => form.append('files', file));

      const res = await fetch(`${API_BASE}/api/v1/incidents/report-with-media`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      if (!res.ok) throw new Error(await responseError(res, 'Failed to submit report with evidence'));
      return res.json();
    }

    const res = await fetch(`${API_BASE}/api/v1/incidents/report`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ ...report, files: undefined }),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Failed to submit report'));
    return res.json();
  },

  async updateStatus(id: string, status: IncidentStatus): Promise<Incident> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/${id}/status`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Failed to update status'));
    return res.json();
  },

  async updateVerification(id: string, verificationStatus: 'Confirmed' | 'Rejected'): Promise<Incident> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/${id}/verification`, {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ status: verificationStatus }),
    });
    if (!res.ok) throw new Error(await responseError(res, 'Failed to update verification'));
    return res.json();
  },

  evidenceUrl(incidentId: string, evidenceId: string): string {
    return `${API_BASE}/api/v1/incidents/${incidentId}/evidence/${evidenceId}`;
  },

  async getEvidence(path: string): Promise<Blob> {
    const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (!res.ok) throw new Error(await responseError(res, 'Could not load report evidence.'));
    return res.blob();
  },

  createWebSocket(
    onMessage: (event: string, data: unknown) => void,
    onStatusChange?: (connected: boolean) => void,
    onUnauthorized?: () => void,
  ) {
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        socket = new WebSocket(`${WS_BASE}/ws/live-incidents`);

        socket.onopen = () => {
          if (accessToken) socket?.send(JSON.stringify({ type: 'auth', token: accessToken }));
          else socket?.close();
        };

        socket.onmessage = (e) => {
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.event) {
              if (parsed.event === 'connection_established' && onStatusChange) onStatusChange(true);
              onMessage(parsed.event, parsed.data);
            }
          } catch (err) {
            console.error('Failed to parse WS message', err);
          }
        };

        socket.onclose = (event) => {
          if (onStatusChange) onStatusChange(false);
          if (event.code === 4401 || event.code === 4403) {
            setAccessToken(null);
            onUnauthorized?.();
          } else if (accessToken) {
            reconnectTimeout = setTimeout(connect, 3000);
          }
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch (e) {
        if (onStatusChange) onStatusChange(false);
        if (accessToken) reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }
};
