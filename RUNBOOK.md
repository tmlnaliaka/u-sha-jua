# Operational Runbook — u-SHA-jua Platform

## 1. Health & Cryptographic Ledger Verification
Run the health probe at any time to verify database connectivity, WebSocket client count, spatial index size, and SHA-256 audit chain integrity:
```bash
curl -s http://localhost:8000/health
```
- **Expected**: `"status": "healthy"`, `"audit_chain_verified": true`.
- **If `audit_chain_verified` is `false`**: Inspect `/api/v1/analytics/audit-log/verify` to identify `error_at_block` and `reason` (e.g., manual database tampering on `audit_blocks`).

## 2. Gemini API Quota Exhaustion (`HTTP 429`)
- **Symptom**: Gemini API returns `429 Resource Exhausted` during a major disaster surge.
- **Automated Mitigation**: `NLPService` (`server/services/nlp_service.py`) automatically trips its circuit breaker for **60 seconds** and routes distress parsing to the deterministic 22-location Kenyan Gazetteer (`KENYA_GAZETTEER`) with `<1ms` latency. No operator intervention is required.

## 3. SQLite WAL Lock Contention vs. PostGIS Failover
- **Local / Edge Deployment**: Uses SQLite in `WAL` (Write-Ahead Logging) mode with `busy_timeout=30000`. If `ushajua.db-wal` grows large after sustained batch testing, restart the FastAPI process cleanly to trigger a WAL checkpoint.
- **Production Deployment**: Set `DATABASE_URL=postgresql://postgres:postgres@db:5432/ushajua` in `server/.env` and launch via `docker compose up -d --build`.

## 4. Disconnected Field Tablet / Cellular Blackout Recovery
- **Automatic Browser Recovery**: Civilian reports submitted while offline are stored in `localStorage["ushajua_offline_outbox_v1"]` and automatically flushed to `POST /api/v1/incidents/sync/offline-packet` when the browser fires the `online` event.
- **Manual Mesh Bundle Export**: Before deploying tablets into a zero-coverage flood zone, download the offline crisis bundle from `GET /api/v1/incidents/export/offline-bundle` (or via the **Command Center -> Offline Mesh & RBAC** modal).

