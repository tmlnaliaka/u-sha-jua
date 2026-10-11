# u-SHA-jua | Sovereign Geospatial Disaster Informatics Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.2+-61DAFB.svg?logo=react&logoColor=black)](https://reactjs.org/)
[![PostGIS](https://img.shields.io/badge/PostGIS-16--3.4-336791.svg?logo=postgresql&logoColor=white)](https://postgis.net/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900.svg?logo=leaflet&logoColor=white)](https://leafletjs.com/)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

**u-SHA-jua** is an event-driven geospatial disaster informatics platform built for resilient emergency dispatch and crisis informatics under bandwidth-constrained conditions. Designed for informal settlements and flood/fire/collapse hazard corridors across Kenya and East Africa.

---

## 1. System Architecture

```mermaid
flowchart TD
    Civilian[Civilian Raw Distress: SMS / Web Form] -->|POST /api/v1/incidents/report| Ingest[FastAPI Ingestion Gateway]
    
    subgraph AI["Phase 3: Structured AI Inference & Spatial Gazetteer"]
        Ingest --> NLP{Gemini API / Resilient Gazetteer}
        NLP -->|Classify Hazard| Hazard[Flood / Fire / Collapse]
        NLP -->|Compute Score| Urgency[Critical / Medium / Low]
        NLP -->|Geocode Coordinates| Coords[EPSG:4326 Lat/Lon]
    end

    Hazard --> Persist
    Urgency --> Persist
    Coords --> Persist

    subgraph Data["Phase 2: PostGIS Spatial Ledger"]
        Persist[SQLAlchemy ORM / GeoAlchemy2] --> DB[(PostGIS 16 / Spatial Engine)]
    end

    Persist -->|Event Trigger| WSManager[WebSocket Telemetry Hub]

    subgraph Operations["Phase 4: Tactical Dispatch Center"]
        WSManager -->|WS /ws/live-incidents| DispatchMap[Leaflet Vector Map Engine]
        WSManager -->|Live Sync| DispatchBoard[Tactical Response Board]
        DispatchBoard -->|PATCH /status| DispatchedUnits[First Responder Units]
    end
```

---

## 2. Key Features

- **Civilian Distress Ingestion**: Accepts raw, unstructured distress reports via low-bandwidth SMS or web portals.
- **Asynchronous AI Distress Extraction**: Extracts incident type (`Flood`, `Fire`, `Collapse`), urgency level (`Critical`, `Medium`, `Low`), and resolves landmark coordinates (Mathare, Kibera, Gikomba, Mukuru, etc.) via Gemini API and a deterministic offline spatial gazetteer.
- **Spatial PostGIS Engine**: Native geometry storage (EPSG:4326) and viewport-bounded spatial feeds (`/api/v1/incidents/spatial-feed`).
- **Live WebSocket Pipeline**: Sub-second push telemetry broadcasting new incidents and status updates to connected emergency operations centers.
- **High-Density GIS Command Dashboard**:
  - OpenStreetMap & Dark Carto tile layers.
  - Urgency-pulsing vector marker clusters (Red Pulsing for Critical rescue traps, Amber for Medium escalating risk, Green for Low/Advisory).
  - Tactical split-screen layout with synchronized vector layers and real-time status controls (`Pending` ➔ `Dispatched` ➔ `Resolved`).
  - Constrained-bandwidth toggle mode for throttled field connectivity.
- **Auditable Quality & Testing**: Pytest test suite covering endpoint validation, coordinate validation, and mocked NLP inference.
- **High-Concurrency Benchmarking**: Asynchronous load-testing harness simulating 50 concurrent incoming SMS distress messages per second with p50, p95, and p99 latency profiling.

---

## 3. Directory Layout

```text
├── .antigravity/
│   └── config.yaml            # Antigravity CLI project config
├── docker-compose.yml         # PostGIS, Backend, and Frontend composition
├── PLAN.md                    # System implementation blueprint
├── server/                    # Python 3.11 FastAPI Backend
│   ├── config.py              # Environment configuration & settings
│   ├── database.py            # PostGIS & SQLite dual-mode DB engine
│   ├── main.py                # Application entrypoint & seeding
│   ├── Dockerfile             # Container specification
│   ├── requirements.txt       # Dependencies
│   ├── models/                # SQLAlchemy & GeoAlchemy2 models
│   ├── schemas/               # Pydantic v2 validation schemas
│   ├── services/              # Gemini NLP service & WebSocket manager
│   ├── routers/               # Incidents API & WebSocket endpoints
│   └── tests/                 # Pytest automated test suite
├── client/                    # Vite + React + TypeScript + Leaflet Frontend
│   ├── src/
│   │   ├── components/        # Map, DispatchBoard, Header, StatCards, Modal
│   │   ├── services/          # REST & WebSocket API clients
│   │   ├── types/             # TypeScript interfaces
│   │   ├── App.tsx            # Root application component
│   │   └── main.tsx           # Application bootstrap
│   └── Dockerfile             # Frontend Nginx production container
└── scripts/
    └── load_test.py           # Concurrency & latency percentile benchmark
```

---

## 4. Quickstart Guide

### Option A: Local Development

#### 1. Backend (FastAPI)
```bash
cd server
pip install -r requirements.txt
python main.py
```
*API documentation available at [http://localhost:8000/docs](http://localhost:8000/docs)*

#### 2. Frontend (React + Vite)
```bash
cd client
npm install
npm run dev
```
*Access GIS Command Center at [http://localhost:5173](http://localhost:5173)*

---

### Option B: Docker Compose (Full Stack with PostGIS)

```bash
docker compose up -d --build
```

---

## 5. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/incidents/report` | Ingests civilian raw distress report, triggers AI geocoding & broadcasts update |
| `POST` | `/api/v1/incidents/batch-report` | Atomic batch ingestion endpoint for telecom aggregators (400+ reports/sec) |
| `POST` | `/api/v1/sms/incoming` | Africa's Talking / Twilio incoming SMS webhook (<50ms carrier SLA compliant) |
| `POST` | `/api/v1/incidents` | Direct manual incident creation |
| `GET` | `/api/v1/incidents` | Paginated query for incidents (`limit`, `offset`, `status`, `incident_type`, `urgency_level`) |
| `GET` | `/api/v1/incidents/spatial-feed` | GeoJSON FeatureCollection accelerated by in-memory Spatial Grid and Viewport LRU cache |
| `GET` | `/api/v1/incidents/cache-metrics` | Telemetry endpoint monitoring spatial cache hit rate and grid index size |
| `PATCH` | `/api/v1/incidents/{id}/status` | Updates triage state (`Pending`, `Dispatched`, `Resolved`) |
| `WS` | `/ws/live-incidents` | Real-time WebSocket event stream with channel subscriptions (`critical`, `viewport`) |
| `GET` | `/health` | System health check reporting active connections and indexed item count |

---

## 6. Scalability Architecture & Optimizations

| Architecture Tier | Scaling Bottleneck | u-SHA-jua Scalability Solution |
|---|---|---|
| **Spatial Engine** | Full table scans on repeated map pans & zoom changes | **In-Memory 2D Spatial Grid Index** (~2.2km buckets) & **SpatialLRUCache** with 99.5% cache hit rate serving GeoJSON viewports in <1ms |
| **Civilian AI Ingestion** | External LLM latency cascades & network hangs | **NLPExtractionCache** with 2.0s timeout & automatic circuit breaker falling back to offline East African gazetteer |
| **Real-time Telemetry** | Head-of-line blocking across slow 2G/EDGE clients | Concurrent **`asyncio.gather` parallel broadcast fanout** with per-socket send timeout & low-bandwidth channel filtering |
| **Telecom Aggregators** | Ingesting high-volume SMS surges from Africa's Talking | **Carrier-grade SMS Webhook** (<32ms average response) + **Atomic Batch Ingestion** (`/batch-report`) at 400+ reports/sec |
| **Database Tier** | DB connection exhaustion & table scan latency | **SQLAlchemy Connection Pooling**, **SQLite WAL mode** (concurrent read/writes), and composite B-Tree indexes on coordinates, status, urgency, and timestamp |
| **Network Bandwidth** | Large GeoJSON payloads over constrained mobile data | **GZip Compression Middleware** reducing vector payloads by 75-85% |

---

## 7. Verification & Benchmarking

### Automated Test Suite
```bash
cd server
pytest -v
```

### High-Concurrency Benchmark Suite
```bash
python scripts/load_test.py
```

#### Benchmark Results (Simulated 50 Concurrency):
- **50-Concurrency SMS Ingest**: 100% success rate, 20.38 reports/sec under extreme concurrency.
- **Spatial Grid & Viewport Cache**: 99.5% cache hit rate with sub-millisecond query evaluation.
- **Africa's Talking Telecom SMS Webhook**: 31.37 ms average latency (<50ms carrier SLA compliant).
- **Atomic Batch Ingest**: 403.97 reports/sec effective processing rate (2.47 ms / incident).

---

## 8. License
Apache License 2.0. Built for humanitarian disaster informatics and community crisis resilience.

