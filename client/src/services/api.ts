import { Incident, CivilianReportInput, GeoJSONFeatureCollection, IncidentStatus } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';

export const api = {
  async getIncidents(): Promise<Incident[]> {
    const res = await fetch(`${API_BASE}/api/v1/incidents`);
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

  async updateStatus(id: string, status: IncidentStatus): Promise<Incident> {
    const res = await fetch(`${API_BASE}/api/v1/incidents/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error('Failed to update status');
    return res.json();
  },

  createWebSocket(onMessage: (event: string, data: any) => void, onStatusChange?: (connected: boolean) => void) {
    let socket: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connect = () => {
      try {
        socket = new WebSocket(`${WS_BASE}/ws/live-incidents`);

        socket.onopen = () => {
          if (onStatusChange) onStatusChange(true);
        };

        socket.onmessage = (e) => {
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
          reconnectTimeout = setTimeout(connect, 3000);
        };

        socket.onerror = () => {
          socket?.close();
        };
      } catch (e) {
        if (onStatusChange) onStatusChange(false);
        reconnectTimeout = setTimeout(connect, 3000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimeout);
      socket?.close();
    };
  }
};
