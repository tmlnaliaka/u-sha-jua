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
- **Evidence Review & Dispatcher Verification**: Reports can include GPS and up to six photo/video files. Gemini can summarize visible signs in photos as provisional support; it does not verify incidents. A dispatcher explicitly confirms or rejects each report, and only confirmed incidents reveal a hazard-specific safety guide.
- **Mapbox Satellite Context**: An optional Mapbox satellite-streets layer helps orient responders. Satellite tiles are not live imagery and must not be treated as evidence that a reported incident is active.
- **Africa's Talking SMS**: An optional protected inbound SMS webhook creates incidents from SMS, and opt-in reporters can receive a receipt and status updates. API credentials remain server-side.
- **Separate survivor and administrator portals**: Survivor accounts can submit reports and view only reports linked to their account. Administrators are provisioned server-side and can review all incidents, confirm reports, and dispatch responders. Public registration can never create an administrator.
- **Protected sessions and dispatch controls**: Passwords are stored as salted PBKDF2 hashes, short-lived bearer tokens protect the API, and the live dispatch WebSocket requires an administrator session.
- **Spatial PostGIS Engine**: Native geometry storage (EPSG:4326) and viewport-bounded spatial feeds (`/api/v1/incidents/spatial-feed`).
- **Live WebSocket Pipeline**: Sub-second push telemetry broadcasting new incidents and status updates to connected emergency operations centers.
- **High-Density GIS Command Dashboard**:
  - OpenStreetMap basemap with optional OpenWeather overlays.
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
copy .env.example .env
python main.py
```
*API documentation available at [http://localhost:8000/docs](http://localhost:8000/docs)*

Set `AUTH_SECRET_KEY` to a newly generated random value of at least 32 characters before starting the server. For example, generate one with `python -c "import secrets; print(secrets.token_urlsafe(48))"`. Set a unique `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 12 characters); the server provisions that administrator account at startup if it does not already exist. Keep these values in the untracked `server/.env`, never in source control. Survivor self-registration is available in the app; selecting the administrator portal only permits sign-in to the server-provisioned administrator account. Authentication tables are created automatically; existing incident tables are not rewritten.

Set `GEMINI_API_KEY` in `server/.env` for text extraction and provisional photo summaries. Without it, text extraction uses the offline parser and photo evidence remains available for dispatcher review. Set a server-side, API-restricted `GOOGLE_MAPS_API_KEY` to reverse-geocode reporter GPS coordinates; the offline gazetteer remains the fallback. To enable SMS, configure the Africa's Talking API key, username, and a newly generated `AFRICASTALKING_WEBHOOK_TOKEN`; configure the SMS callback URL with that token. Enable reporter notifications only when a reporter submits a phone number and checks the SMS consent box. Set `CORS_ORIGINS` to the exact frontend origins used by your deployment.

#### 2. Frontend (React + Vite)
```bash
cd client
npm install
copy .env.example .env.local
npm run dev
```
*Access GIS Command Center at [http://localhost:5173](http://localhost:5173)*

OpenStreetMap provides the default map. Set `VITE_OPENWEATHER_API_KEY` in `client/.env.local` to enable optional precipitation, cloud, temperature, wind, and pressure overlays. This browser-side tile key is visible to users; restrict it in your OpenWeather account and rotate it if exposed. Set `VITE_MAPBOX_ACCESS_TOKEN` to a URL-restricted public Mapbox token to enable the optional satellite-context base layer. The map works without provider keys.

---

### Option B: Docker Compose (Full Stack with PostGIS)

Create a root `.env` file (it is git-ignored) with a generated `AUTH_SECRET_KEY`, `ADMIN_EMAIL`, and unique `ADMIN_PASSWORD` of at least 12 characters before starting the stack. Compose passes these authentication settings to the API; without them, sign-in and registration remain unavailable.

```bash
docker compose up -d --build
```

---

## 5. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/register` | Creates a survivor account; administrator roles cannot be self-assigned |
| `POST` | `/api/v1/auth/login` | Authenticates a survivor or provisioned administrator |
| `GET` | `/api/v1/auth/me` | Returns the current authenticated account |
| `POST` | `/api/v1/incidents/report` | Accepts a public or authenticated civilian report; signed-in survivor reports are account-linked |
| `POST` | `/api/v1/incidents/report-with-media` | Multipart report with optional GPS and photo/video evidence |
| `PATCH` | `/api/v1/incidents/{id}/verification` | Administrator-only confirmation or rejection |
| `GET` | `/api/v1/incidents/{id}/evidence/{evidence_id}` | Reads evidence for administrators or the owning survivor |
| `POST` | `/api/v1/integrations/africastalking/sms?token=...` | Protected Africa's Talking inbound SMS callback |
| `POST` | `/api/v1/incidents` | Administrator-only manual incident creation |
| `GET` | `/api/v1/incidents` | Administrators query all incidents; survivors see only their own |
| `GET` | `/api/v1/incidents/spatial-feed` | Authenticated GeoJSON; survivor results are account-scoped |
| `PATCH` | `/api/v1/incidents/{id}/status` | Administrator-only triage updates (`Pending`, `Dispatched`, `Resolved`) |
| `WS` | `/ws/live-incidents` | Administrator-only real-time WebSocket event stream |
| `GET` | `/health` | System health check |

---

## 6. Verification & Benchmarking

### Automated Test Suite
```bash
cd server
pytest -v
```

### 50 Concurrency Load Benchmark
```bash
python scripts/load_test.py
```

---

## 7. License
Apache License 2.0. Built for humanitarian disaster informatics and community crisis resilience.
