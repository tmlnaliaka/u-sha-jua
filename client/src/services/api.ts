import {
  Incident,
  CivilianReportInput,
  GeoJSONFeatureCollection,
  IncidentStatus,
  Shelter,
  HazardPerimeterFeature,
  RecommendationResult,
  AuditEntry,
  AuditLedgerVerification
} from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

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

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json'
  };
  if (currentApiKey) {
    headers['X-API-Key'] = currentApiKey;
  }
  return headers;
}

export const api = {
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
    const incident_type = textLower.includes('fire') || textLower.includes('smoke')
      ? 'Fire'
      : textLower.includes('collapse') || textLower.includes('wall')
      ? 'Collapse'
      : 'Flood';
    const urgency_level = textLower.includes('trapped') || textLower.includes('urgent') || textLower.includes('critical')
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

  async getIncidents(limit: number = 100, offset: number = 0): Promise<Incident[]> {
    const res = await fetch(`${API_BASE}/api/v1/incidents?limit=${limit}&offset=${offset}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch incidents');
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
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch spatial feed');
    return res.json();
  },

  async reportIncident(report: CivilianReportInput): Promise<Incident> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Failed to submit report' }));
      throw new Error(err.detail || 'Failed to submit report');
    }
    return res.json();
  },

  async batchReportIncidents(reports: CivilianReportInput[]): Promise<BatchReportResponse> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/batch-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reports }),
    });
    if (!res.ok) throw new Error('Failed to submit batch reports');
    return res.json();
  },

  async getCacheMetrics(): Promise<CacheMetrics> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/cache-metrics`);
    if (!res.ok) throw new Error('Failed to fetch cache metrics');
    return res.json();
  },

  async updateStatus(id: string, status: IncidentStatus): Promise<Incident> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/${id}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update status');
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
    const res = await fetch(`${API_BASE}/api/v1/responders/${responderId}/dispatch`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ incident_id: incidentId }),
    });
    if (!res.ok) throw new Error('Failed to dispatch responder unit');
    return res.json();
  },

  async updateResponderStatus(responderId: string, status: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/responders/${responderId}/status`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update responder status');
    return res.json();
  },

  async simulateSurge(surgeCount: number = 3): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/responders/surge-simulate`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({ surge_count: surgeCount }),
    });
    if (!res.ok) throw new Error('Failed to simulate surge');
    return res.json();
  },

  async updateResponderLocation(responderId: string, latitude: number, longitude: number): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/responders/${responderId}/location`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ latitude, longitude }),
    });
    if (!res.ok) throw new Error('Failed to update responder location');
    return res.json();
  },

  async getShelters(onlyWithCapacity: boolean = false): Promise<Shelter[]> {
    const res = await fetch(`${API_BASE}/api/v1/shelters?only_with_capacity=${onlyWithCapacity}`);
    if (!res.ok) throw new Error('Failed to fetch evacuation shelters');
    return res.json();
  },

  async getNearestShelter(latitude: number, longitude: number): Promise<Shelter> {
    const res = await fetch(`${API_BASE}/api/v1/shelters/nearest?latitude=${latitude}&longitude=${longitude}`);
    if (!res.ok) throw new Error('Failed to fetch nearest shelter');
    return res.json();
  },

  async updateShelterOccupancy(shelterId: string, occupancy: number): Promise<Shelter> {
    const res = await fetch(`${API_BASE}/api/v1/shelters/${encodeURIComponent(shelterId)}/occupancy`, {
      method: 'PATCH',
      headers: getAuthHeaders(),
      body: JSON.stringify({ occupancy_current: occupancy })
    });
    if (!res.ok) throw new Error('Failed to update shelter occupancy');
    return res.json();
  },

  async getWeatherTelemetry(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/weather/telemetry`);
    if (!res.ok) throw new Error('Failed to fetch weather telemetry');
    return res.json();
  },

  async getFloodZones(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/weather/flood-zones`);
    if (!res.ok) throw new Error('Failed to fetch flood zones');
    return res.json();
  },

  async getAnalyticsSummary(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/analytics/summary`);
    if (!res.ok) throw new Error('Failed to fetch analytics summary');
    return res.json();
  },

  async getAuditTrail(limit: number = 50, offset: number = 0): Promise<{ entries: AuditEntry[]; total_returned: number }> {
    const res = await fetch(`${API_BASE}/api/v1/analytics/audit-log?limit=${limit}&offset=${offset}`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to fetch audit trail');
    return res.json();
  },

  async verifyAuditTrail(): Promise<AuditLedgerVerification> {
    const res = await fetch(`${API_BASE}/api/v1/analytics/audit-log/verify`, {
      headers: getAuthHeaders()
    });
    if (!res.ok) throw new Error('Failed to verify audit ledger');
    return res.json();
  },

  async getOfflineBundle(): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/export/offline-bundle`);
    if (!res.ok) throw new Error('Failed to export offline bundle');
    return res.json();
  },

  async syncOfflinePacket(deviceId: string, incidents: any[]): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/sync/offline-packet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: deviceId,
        packet_timestamp: new Date().toISOString(),
        incidents
      })
    });
    if (!res.ok) throw new Error('Failed to sync offline packet');
    return res.json();
  },

  async trackIncident(trackingId: string): Promise<any> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/track/${encodeURIComponent(trackingId)}`);
    if (!res.ok) {
      if (res.status === 404) throw new Error('Incident tracking ID not found');
      throw new Error('Failed to track incident');
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
