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
