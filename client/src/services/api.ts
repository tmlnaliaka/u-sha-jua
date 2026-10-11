import { Incident, CivilianReportInput, GeoJSONFeatureCollection, IncidentStatus } from '../types';

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

export const api = {
  async getIncidents(limit: number = 100, offset: number = 0): Promise<Incident[]> {
    const res = await fetch(`${API_BASE}/api/v1/incidents?limit=${limit}&offset=${offset}`);
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
    if (!res.ok) throw new Error('Failed to submit report');
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    return res.json();
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
          // Subscribe to channels
          if (socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ action: 'subscribe', channels: initialChannels }));
          }
          // Heartbeat ping every 25s to keep cellular connection warm
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


