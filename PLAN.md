# Antigravity CLI Implementation Plan: u-SHA-jua Platform

## 1. System Architecture Overview
The platform integrates an event-driven architecture designed for resilient disaster informatics under constrained bandwidth conditions:
- **Civilian Reporting Ingest**: Low-bandwidth SMS and web distress reporting.
- **NLP Distress Extraction**: Asynchronous intelligence pipeline utilizing Gemini API / structured schema extraction for rapid damage classification, urgency rating, and landmark geocoding.
- **PostGIS / Spatial Engine**: GeoAlchemy2 and spatial database storing coordinates in EPSG:4326 with spatial bounding box queries.
- **Real-Time Telemetry Pipeline**: WebSocket broadcasting to administrative and first-responder dispatch boards.
- **GIS Operations Dashboard**: High-density Leaflet vector map with urgency-pulsing clusters, emergency dispatch board, and bandwidth-throttled mode.

---

## 2. Phase-by-Phase Implementation Plan

### Phase 1: Environment Initialization & Workspace Configuration
1. Verify Antigravity CLI installation and authentication.
2. Initialize workspace configuration in `.antigravity/config.yaml`.
3. Scaffold asynchronous disaster management platform:
   - Python FastAPI backend in `/server`
   - Vite React TypeScript frontend with Tailwind CSS and Leaflet in `/client`
   - Initial `requirements.txt`, `package.json`, `Dockerfile`, and `docker-compose.yml` for PostGIS.

### Phase 2: Database Schema & Spatial Extension Setup
1. **PostGIS Container Provisioning**: Configure `docker-compose.yml` with `postgis/postgis:16-3.4`.
2. **GeoAlchemy2 & SQLAlchemy ORM Generation** (`/server/models/incident.py`):
   - `id`: UUID (Primary Key)
   - `raw_text`: Text
   - `incident_type`: Enum (`Flood`, `Fire`, `Collapse`)
   - `urgency_level`: Enum (`Low`, `Medium`, `Critical`)
   - `location_name`: String
   - `coordinates`: Geometry (Point, 4326) / lat & lon
   - `status`: Enum (`Pending`, `Dispatched`, `Resolved`)
   - `timestamp`: DateTime (UTC)

### Phase 3: AI Inference & Spatial API Microservices
1. **Structured Distress Extraction Module** (`/server/services/nlp_service.py`):
   - Asynchronous extraction worker using Gemini API with Pydantic structured outputs.
   - Incident classification, priority urgency score calculation, and landmark geocoding.
2. **Real-Time WebSockets & Geospatial Endpoints** (`/server/routers/incidents.py`):
   - `POST /api/v1/incidents/report`: Ingests civilian raw reports, triggers NLP parsing, writes coordinates, and broadcasts updates.
   - `GET /api/v1/incidents/spatial-feed`: Outputs GeoJSON FeatureCollections bounded by requested map viewports.
   - `WS /ws/live-incidents`: Asynchronous WebSocket pipeline pushing real-time incident notifications to administrative dashboards.

### Phase 4: Frontend GIS Dashboard Implementation
1. **Leaflet Vector Map Engine** (`/client/src/components/DisasterMap.tsx`):
   - OpenStreetMap basemaps with Carto vector overlays.
   - GeoJSON marker clusters styled dynamically by urgency:
     - Red Pulsing Marker: Critical (active flood trap, spreading fire).
     - Orange Marker: Medium (blocked escape route, drainage spill).
     - Yellow Marker: Low/Advisory.
2. **Administrative Dispatch Board** (`/client/src/components/DispatchBoard.tsx`):
   - Interactive split-screen layout with synchronized vector layers and real-time dispatch control tables.

### Phase 5: Verification, Benchmarking & Testing Cycle
1. **Automated Unit & Integration Test Generation**:
   - Pytest test suite in `/server/tests` checking API endpoint validation, coordinate handling, and mocked Gemini NLP responses.
2. **Throughput & Latency Simulation**:
   - Python async benchmark script in `/scripts/load_test.py` simulating 50 concurrent incoming SMS distress messages per second, outputting latency percentiles (p50, p95, p99).
3. **Container Build Verification & Execution**.

### Phase 6: Advanced Tactical Emergency Suite (Completed)
1. **Civilian Public Distress Portal**:
   - High-accuracy geolocation capture, situational quick-distress tags, simulated photo upload, and voice note recording.
   - Live 4-stage rescue tracking timeline (`/api/v1/incidents/track/{id}`) with assigned responder unit callsigns and ETAs.
2. **Spatial Analytics & Incident Heatmap**:
   - Urgency-scaled heat circles on Leaflet map.
   - Comprehensive operational metrics (`/api/v1/analytics/summary`): MTTD, MTTR, casualty estimates, hotspot ranking.
   - Downloadable CSV and GeoJSON dataset exports (`/api/v1/analytics/export/csv`).
3. **Field Responder Mobile PWA**:
   - Tactical field agent interface with unit selector, mission target summary, turn-by-turn route cues.
   - Interactive on-scene checklist and status progression buttons (En Route, On Scene, Resolved & Clear).
   - Live field GPS telemetry broadcast (`PATCH /api/v1/responders/{id}/location`).
4. **Early-Warning Weather & Flood Vulnerability Radar Layer**:
   - Real-time meteorological telemetry HUD (`/api/v1/weather/telemetry`): rainfall rate, river gauge height, storm alerts.
   - High-hazard flood plain polygons (`/api/v1/weather/flood-zones`) for Mathare Valley, Kibera Ngong Corridor, Nairobi Basin, and Mukuru with designated evacuation muster points.

### Phase 7: Enterprise Security Hardening & Advanced Capabilities (Completed)
1. **Security Vulnerability Hardening & Defense-in-Depth**:
   - Role-Based Access Control (RBAC) & API Key Security (`/server/services/security.py`) enforcing separate access tiers for Dispatchers, Responders, and Administrators (`X-API-Key`).
   - In-Memory Sliding-Window Token-Bucket Rate Limiter protecting public distress ingestion from volumetric denial-of-service and AI cost exhaustion.
   - Automated PII Redaction (`mask_pii`) filtering civilian mobile numbers from live WebSocket telemetry broadcasts.
   - Input Sanitization & Payload Bounding stripping malicious script injection and non-printable control characters.
   - Telecom Carrier Secret Validation for Africa's Talking / Twilio webhook gateways (`X-Webhook-Secret`).
   - CORS Hardening eliminating unsafe wildcard credential policies.
2. **AI Multi-Criteria Unit Recommendation & One-Touch Auto-Dispatch**:
   - MCDA scoring algorithm (`/api/v1/responders/recommend/{id}`) factoring unit specialty affinity, Haversine travel distance, and response ETA.
   - One-click autonomous dispatch authorization (`/api/v1/responders/auto-dispatch/{id}`).
3. **Designated Evacuation Shelters & Relief Capacity Engine**:
   - Real-time shelter registry (`/api/v1/shelters`) tracking capacity, current occupancy, water supply status, and medical posts across high-hazard settlements.
   - Nearest operational shelter calculation (`/api/v1/shelters/nearest`) with live occupancy adjustment.
4. **Dynamic Hazard Perimeter & Threat Buffer Modeling**:
   - Procedural 16-point circular hazard buffer polygon calculation (`/api/v1/incidents/{id}/hazard-perimeter`) scaling with urgency.
   - Real-time population impact estimation and evacuation corridor advisories rendered on the Leaflet map.
5. **Cryptographic SHA-256 Tamper-Evident Audit Ledger**:
   - Immutable hash-chained audit ledger (`/api/v1/analytics/audit-log`) tracking every incident, dispatch, status transition, and operator intervention.
   - Full chain verification endpoint (`/api/v1/analytics/audit-log/verify`) for post-disaster humanitarian compliance.
6. **Offline Crisis Mesh Synchronization & Portable Bundle Export**:
   - LoRa / Bluetooth mesh packet ingestion endpoint (`/api/v1/incidents/sync/offline-packet`) for cellular blackout resilience.
   - Portable JSON crisis package export (`/api/v1/incidents/export/offline-bundle`) for field tablet deployments.

