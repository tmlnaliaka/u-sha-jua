import {
  Incident,
  CivilianReportInput,
  GeoJSONFeatureCollection,
  IncidentStatus,
  ResponderUnit,
  Shelter,
  HazardPerimeterFeature,
  RecommendationResult,
  AuditEntry,
  AuditLedgerVerification,
  UserProfile,
  AuthSession
} from '../types';

export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export interface BatchReportResponse {
  total_processed: number;
  successful: number;
  incidents: Incident[];
}

export interface CacheMetrics {
  grid_indexed_items: number;
  cache_hits: number;
  cache_misses: number;
  cache_hit_rate: number;
  nlp_cache_hits: number;
  nlp_cache_misses: number;
}

// Session tokens & API key defaults
const AUTH_TOKEN_KEY = 'ushajua_access_token_v1';
const REFRESH_TOKEN_KEY = 'ushajua_refresh_token_v1';
const USER_KEY = 'ushajua_user_v1';

let currentAuthToken: string | null = localStorage.getItem(AUTH_TOKEN_KEY);
let currentUser: UserProfile | null = (() => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
})();

// Development default key for tactical dispatcher commands
let currentApiKey: string = 'ushajua-dev-dispatcher-key';
const OFFLINE_OUTBOX_KEY = 'ushajua_offline_outbox_v1';

export interface QueuedOfflineReport {
  id: string;
  raw_text: string;
  incident_type: 'Flood' | 'Fire' | 'Collapse';
  urgency_level: 'Low' | 'Medium' | 'Critical';
  location_name: string;
  latitude: number;
  longitude: number;
  timestamp: string;
}

function formatErrorMessage(err: any): string {
  if (!err) return 'Request failed';
  if (typeof err === 'string') return err;
  if (typeof err.detail === 'string') return err.detail;
  if (Array.isArray(err.detail)) {
    return err.detail.map((d: any) => d.msg || JSON.stringify(d)).join(', ');
  }
  return err.message || JSON.stringify(err);
}

export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number = 15000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      signal: options.signal || controller.signal
    });
    return response;
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`Network timeout: request exceeded ${timeoutMs / 1000}s threshold.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (currentAuthToken) {
    headers['Authorization'] = `Bearer ${currentAuthToken}`;
  } else if (currentApiKey) {
    headers['X-API-Key'] = currentApiKey;
  }
  return headers;
}

export const api = {
  getAuthToken(): string | null {
    return currentAuthToken;
  },

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  },

  getUser(): UserProfile | null {
    return currentUser;
  },

  setSession(session: AuthSession) {
    currentAuthToken = session.access_token;
    currentUser = session.user;
    localStorage.setItem(AUTH_TOKEN_KEY, session.access_token);
    localStorage.setItem(REFRESH_TOKEN_KEY, session.refresh_token);
    localStorage.setItem(USER_KEY, JSON.stringify(session.user));
    window.dispatchEvent(new CustomEvent('ushajua:auth-changed', { detail: session.user }));
  },

  clearSession() {
    currentAuthToken = null;
    currentUser = null;
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    window.dispatchEvent(new CustomEvent('ushajua:auth-changed', { detail: null }));
  },

  async signup(payload: { email: string; phone?: string; password: string; full_name: string; role?: string }): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Signup failed' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async login(username_or_email: string, password: string): Promise<AuthSession> {
    const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier: username_or_email, username_or_email, password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Invalid credentials' }));
      throw new Error(formatErrorMessage(err));
    }
    const session: AuthSession = await res.json();
    this.setSession(session);
    return session;
  },

  async refreshToken(): Promise<string> {
    const refresh_token = this.getRefreshToken();
    if (!refresh_token) {
      this.clearSession();
      throw new Error('No refresh token available');
    }
    const res = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token })
    });
    if (!res.ok) {
      this.clearSession();
      throw new Error('Session expired, please log in again');
    }
    const data = await res.json();
    currentAuthToken = data.access_token;
    localStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
    return data.access_token;
  },

  async logout(): Promise<void> {
    try {
      if (currentAuthToken) {
        await fetch(`${API_BASE}/api/v1/auth/logout`, {
          method: 'POST',
          headers: getAuthHeaders()
        });
      }
    } catch (e) {
      console.warn('Logout network error', e);
    } finally {
      this.clearSession();
    }
  },

  async getMe(): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/api/v1/auth/me`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      if (res.status === 401) {
        // try refreshing once
        try {
          await this.refreshToken();
          const retryRes = await fetch(`${API_BASE}/api/v1/auth/me`, {
            headers: getAuthHeaders()
          });
          if (retryRes.ok) {
            const user = await retryRes.json();
            currentUser = user;
            localStorage.setItem(USER_KEY, JSON.stringify(user));
            return user;
          }
        } catch {}
        this.clearSession();
      }
      throw new Error('Failed to fetch user profile');
    }
    const user = await res.json();
    currentUser = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return user;
  },

  async forgotPassword(email: string): Promise<{ message: string; simulated_reset_token?: string }> {
    const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to request reset' }));
      throw new Error(err.detail || 'Password reset request failed');
    }
    return res.json();
  },

  async resetPassword(token: string, new_password: string): Promise<{ message: string }> {
    const res = await fetch(`${API_BASE}/api/v1/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, new_password })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Password reset failed' }));
      throw new Error(err.detail || 'Password reset failed');
    }
    return res.json();
  },

  async getUserProfile(userId: string): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/api/v1/auth/users/${userId}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Access denied' }));
      throw new Error(err.detail || 'Failed to fetch user profile');
    }
    return res.json();
  },

  async updateUserProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile> {
    const res = await fetch(`${API_BASE}/api/v1/auth/users/${userId}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Update failed' }));
      throw new Error(err.detail || 'Failed to update profile');
    }
    const updated = await res.json();
    if (currentUser && currentUser.id === updated.id) {
      currentUser = updated;
      localStorage.setItem(USER_KEY, JSON.stringify(updated));
    }
    return updated;
  },

  setApiKey(key: string) {
    currentApiKey = key;
  },

  getApiKey(): string {
    return currentApiKey;
  },

  getOfflineOutbox(): QueuedOfflineReport[] {
    try {
      const raw = localStorage.getItem(OFFLINE_OUTBOX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  enqueueOfflineReport(report: CivilianReportInput): Incident {
    const outbox = this.getOfflineOutbox();
    const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const lat = report.device_lat ?? -1.2864;
    const lon = report.device_lon ?? 36.8172;
    const textLower = report.raw_text.toLowerCase();
    const incident_type = (textLower.includes('fire') || textLower.includes('smoke') || textLower.includes('moto') || textLower.includes('ungua') || textLower.includes('🔥'))
      ? 'Fire'
      : (textLower.includes('collapse') || textLower.includes('wall') || textLower.includes('poromoka') || textLower.includes('anguka') || textLower.includes('🏚️'))
      ? 'Collapse'
      : 'Flood';
    const urgency_level = (textLower.includes('trapped') || textLower.includes('urgent') || textLower.includes('critical') || textLower.includes('haraka') || textLower.includes('okoa') || textLower.includes('kwama') || textLower.includes('🚨') || textLower.includes('🆘'))
      ? 'Critical'
      : 'Medium';
    const entry: QueuedOfflineReport = {
      id,
      raw_text: report.raw_text,
      incident_type,
      urgency_level,
      location_name: report.device_lat ? `Offline GPS Pin (${lat.toFixed(4)}, ${lon.toFixed(4)})` : 'Nairobi Offline Queue',
      latitude: lat,
      longitude: lon,
      timestamp: new Date().toISOString()
    };
    outbox.push(entry);
    try {
      localStorage.setItem(OFFLINE_OUTBOX_KEY, JSON.stringify(outbox));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ushajua:outbox-updated', { detail: { count: outbox.length } }));
      }
    } catch {
      // Ignore storage quota errors
    }
    return {
      id: entry.id,
      raw_text: entry.raw_text,
      incident_type: entry.incident_type,
      urgency_level: entry.urgency_level,
      location_name: entry.location_name,
      coordinates: { latitude: entry.latitude, longitude: entry.longitude },
      status: 'Pending',
      timestamp: entry.timestamp
    };
  },

  async flushOfflineOutbox(): Promise<number> {
    const outbox = this.getOfflineOutbox();
    if (outbox.length === 0) return 0;
    const res = await this.syncOfflinePacket('BROWSER_PWA_OUTBOX', outbox);
    try {
      localStorage.removeItem(OFFLINE_OUTBOX_KEY);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ushajua:outbox-updated', { detail: { count: 0 } }));
      }
    } catch {
      // Ignore
    }
    return res.newly_ingested ?? outbox.length;
  },

  async getCapAlert(incidentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/${encodeURIComponent(incidentId)}/cap-alert`);
    if (!res.ok) throw new Error('Failed to generate OASIS CAP 1.2 alert');
    return res.json();
  },

  async getIncidents(
    optionsOrLimit: {
      limit?: number;
      offset?: number;
      q?: string;
      sortBy?: string;
      order?: 'asc' | 'desc';
      status?: string;
      incident_type?: string;
      urgency_level?: string;
    } | number = 100,
    offsetParam: number = 0
  ): Promise<Incident[]> {
    let limit = 100;
    let offset = 0;
    const params = new URLSearchParams();

    if (typeof optionsOrLimit === 'number') {
      limit = optionsOrLimit;
      offset = offsetParam;
    } else if (optionsOrLimit && typeof optionsOrLimit === 'object') {
      limit = optionsOrLimit.limit ?? 100;
      offset = optionsOrLimit.offset ?? 0;
      if (optionsOrLimit.q) params.set('q', optionsOrLimit.q);
      if (optionsOrLimit.sortBy) params.set('sort_by', optionsOrLimit.sortBy);
      if (optionsOrLimit.order) params.set('order', optionsOrLimit.order);
      if (optionsOrLimit.status && optionsOrLimit.status !== 'ALL') params.set('status', optionsOrLimit.status);
      if (optionsOrLimit.incident_type && optionsOrLimit.incident_type !== 'ALL') params.set('incident_type', optionsOrLimit.incident_type);
      if (optionsOrLimit.urgency_level && optionsOrLimit.urgency_level !== 'ALL') params.set('urgency_level', optionsOrLimit.urgency_level);
    }
    params.set('limit', limit.toString());
    params.set('offset', offset.toString());

    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents?${params.toString()}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch incidents' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getSpatialFeed(bounds?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  }, limit: number = 250): Promise<GeoJSONFeatureCollection> {
    let url = `${API_BASE}/api/v1/incidents/spatial-feed`;
    const params = new URLSearchParams({ limit: limit.toString() });
    if (bounds) {
      params.append('min_lat', bounds.minLat.toString());
      params.append('max_lat', bounds.maxLat.toString());
      params.append('min_lon', bounds.minLon.toString());
      params.append('max_lon', bounds.maxLon.toString());
    }
    url += `?${params.toString()}`;
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch spatial feed' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async reportIncident(report: CivilianReportInput): Promise<Incident> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return this.enqueueOfflineReport(report);
    }
    try {
      const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/report`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(report),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: 'Failed to submit report' }));
        throw new Error(formatErrorMessage(err));
      }
      return res.json();
    } catch (e: any) {
      if (typeof window !== 'undefined' && (e.message?.includes('network') || e.message?.includes('Failed to fetch') || e.message?.includes('timeout') || !navigator.onLine)) {
        console.warn('Network unreachable, enqueueing report in offline outbox', e);
        return this.enqueueOfflineReport(report);
      }
      throw e;
    }
  },

  async batchReportIncidents(reports: CivilianReportInput[]): Promise<BatchReportResponse> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/batch-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to submit batch reports' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getCacheMetrics(): Promise<CacheMetrics> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/cache-metrics`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch cache metrics' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateIncident(id: string, updates: Partial<Incident>): Promise<Incident> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update incident' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateStatus(id: string, status: IncidentStatus): Promise<Incident> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update status' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async deleteIncident(id: string): Promise<void> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete incident' }));
      throw new Error(formatErrorMessage(err));
    }
  },

  async anonymizeIncident(id: string): Promise<Incident> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/${encodeURIComponent(id)}/anonymize`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to anonymize incident' }));
      throw new Error(err.detail || 'Failed to anonymize incident');
    }
    return res.json();
  },

  async uploadAttachments(incidentId: string, files: (File | Blob)[], fileNames?: string[]): Promise<any> {
    const formData = new FormData();
    files.forEach((file, index) => {
      const name = fileNames?.[index] || (file instanceof File ? file.name : `attachment_${Date.now()}_${index}.webm`);
      formData.append('files', file, name);
    });

    const headers: Record<string, string> = {};
    if (currentApiKey) {
      headers['X-API-Key'] = currentApiKey;
    }

    const res = await fetch(`${API_BASE}/api/v1/incidents/${encodeURIComponent(incidentId)}/attachments`, {
      method: 'POST',
      headers,
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to upload attachments' }));
      throw new Error(err.detail || 'Failed to upload attachments');
    }
    return res.json();
  },

  async getHazardPerimeter(incidentId: string): Promise<HazardPerimeterFeature> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/${encodeURIComponent(incidentId)}/hazard-perimeter`);
    if (!res.ok) throw new Error('Failed to fetch hazard perimeter');
    return res.json();
  },

  async getResponders(incidentId?: string): Promise<any[]> {
    const url = incidentId
      ? `${API_BASE}/api/v1/responders?incident_id=${encodeURIComponent(incidentId)}`
      : `${API_BASE}/api/v1/responders`;
    const res = await fetch(url, { headers: getAuthHeaders() });
    if (!res.ok) throw new Error('Failed to fetch responders');
    return res.json();
  },

  async recommendResponder(incidentId: string): Promise<RecommendationResult> {
    const res = await fetch(`${API_BASE}/api/v1/responders/recommend/${encodeURIComponent(incidentId)}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch unit recommendations');
    return res.json();
  },

  async autoDispatchResponder(incidentId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/responders/auto-dispatch/${encodeURIComponent(incidentId)}`, {
      method: 'POST',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to auto-dispatch unit' }));
      throw new Error(err.detail || 'Failed to auto-dispatch unit');
    }
    return res.json();
  },

  async dispatchResponder(responderId: string, incidentId: string): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders/${encodeURIComponent(responderId)}/dispatch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ incident_id: incidentId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to dispatch responder unit' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateResponderStatus(responderId: string, status: string): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders/${encodeURIComponent(responderId)}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update responder status' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async simulateSurge(surgeCount: number = 3): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders/surge-simulate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ surge_count: surgeCount }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to simulate surge' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateResponderLocation(responderId: string, latitude: number, longitude: number): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders/${encodeURIComponent(responderId)}/location`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ latitude, longitude }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update responder location' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateResponderChecklist(responderId: string, checklist: Record<string, boolean>): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders/${encodeURIComponent(responderId)}/checklist`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ checklist }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update responder checklist' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async createResponder(payload: {
    callsign: string;
    unit_type: string;
    base_station: string;
    coordinates: { latitude: number; longitude: number };
  }): Promise<ResponderUnit> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create responder unit' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async deleteResponder(responderId: string): Promise<void> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/responders/${encodeURIComponent(responderId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to decommission responder' }));
      throw new Error(formatErrorMessage(err));
    }
  },

  async getShelters(onlyWithCapacity: boolean = false): Promise<Shelter[]> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/shelters?only_with_capacity=${onlyWithCapacity}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch evacuation shelters' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getNearestShelter(latitude: number, longitude: number): Promise<Shelter> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/shelters/nearest?latitude=${latitude}&longitude=${longitude}`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch nearest shelter' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateShelterOccupancy(shelterId: string, occupancy: number): Promise<Shelter> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/shelters/${encodeURIComponent(shelterId)}/occupancy`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ occupancy_current: occupancy })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update shelter occupancy' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async createShelter(payload: {
    name: string;
    location_name: string;
    coordinates: { latitude: number; longitude: number };
    capacity_total: number;
    occupancy_current?: number;
    water_supply_status?: string;
    medical_post_available?: boolean;
    contact_phone?: string;
  }): Promise<Shelter> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/shelters`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to create shelter' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async updateShelter(shelterId: string, updates: Partial<Shelter>): Promise<Shelter> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/shelters/${encodeURIComponent(shelterId)}`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify(updates),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to update shelter' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async deleteShelter(shelterId: string): Promise<void> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/shelters/${encodeURIComponent(shelterId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to delete shelter' }));
      throw new Error(formatErrorMessage(err));
    }
  },

  async sendOutboundSms(to_phone: string, message: string, idempotency_key?: string): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/sms/outbound`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ to_phone, message, idempotency_key })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to dispatch outbound SMS' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async deleteUserAccount(userId: string): Promise<void> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/auth/users/${encodeURIComponent(userId)}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to deactivate account' }));
      throw new Error(formatErrorMessage(err));
    }
  },

  async getWeatherTelemetry(): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/weather/telemetry`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch weather telemetry' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getFloodZones(): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/weather/flood-zones`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch flood zones' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getAnalyticsSummary(): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/analytics/summary`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch analytics summary' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getAuditTrail(limit: number = 50, offset: number = 0): Promise<{ entries: AuditEntry[]; total_returned: number }> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/analytics/audit-log?limit=${limit}&offset=${offset}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to fetch audit trail' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async verifyAuditTrail(): Promise<AuditLedgerVerification> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/analytics/audit-log/verify`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to verify audit ledger' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async getOfflineBundle(): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/export/offline-bundle`);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to export offline bundle' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async syncOfflinePacket(deviceId: string, incidents: any[]): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/sync/offline-packet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        packet_timestamp: new Date().toISOString(),
        incidents
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to sync offline packet' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  async trackIncident(trackingId: string): Promise<any> {
    const res = await fetchWithTimeout(`${API_BASE}/api/v1/incidents/track/${encodeURIComponent(trackingId)}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('Incident tracking ID not found');
      const err = await res.json().catch(() => ({ detail: 'Failed to track incident' }));
      throw new Error(formatErrorMessage(err));
    }
    return res.json();
  },

  getCsvExportUrl(): string {
    return `${API_BASE}/api/v1/analytics/export/csv`;
  },

  createWebSocket(
    onMessage: (event: string, data: any) => void,
    onStatusChange?: (connected: boolean) => void,
    initialChannels: string[] = ['all']
  ) {
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;
    let heartbeatInterval: any = null;

    const connect = () => {
      try {
        socket = new WebSocket(`${WS_BASE}/ws/live-incidents`);

        socket.onopen = () => {
          if (onStatusChange) onStatusChange(true);
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'subscribe', channels: initialChannels }));
          }
          heartbeatInterval = setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) {
              socket.send('ping');
            }
          }, 25000);
        };

        socket.onmessage = (e) => {
          if (e.data === 'pong') return;
          try {
            const parsed = JSON.parse(e.data);
            if (parsed.event) {
              onMessage(parsed.event, parsed.data);
            }
          } catch (err) {
            console.error('Failed to parse WS message', err);
          }
        };

        socket.onclose = () => {
          if (onStatusChange) onStatusChange(false);
          clearInterval(heartbeatInterval);
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch (e) {
        if (onStatusChange) onStatusChange(false);
        clearInterval(heartbeatInterval);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    const cleanupFn = () => {
      clearTimeout(reconnectTimeout);
      clearInterval(heartbeatInterval);
      socket?.close();
    };

    (cleanupFn as any).close = cleanupFn;
    (cleanupFn as any).setChannels = (channels: string[]) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'subscribe', channels }));
      }
    };
    (cleanupFn as any).setViewport = (bbox: { min_lat: number; max_lat: number; min_lon: number; max_lon: number }) => {
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ action: 'set_viewport', bbox }));
      }
    };

    connect();

    return cleanupFn as typeof cleanupFn & {
      close: () => void;
      setChannels: (channels: string[]) => void;
      setViewport: (bbox: { min_lat: number; max_lat: number; min_lon: number; max_lon: number }) => void;
    };
  }
};

// Auto-sync offline outbox when connection is restored
if (typeof window !== 'undefined') {
  window.addEventListener('online', async () => {
    try {
      const count = await api.flushOfflineOutbox();
      if (count > 0) {
        window.dispatchEvent(new CustomEvent('ushajua:outbox-synced', { detail: { count } }));
      }
    } catch (e) {
      console.warn('Auto-sync of offline outbox failed:', e);
    }
  });
}
