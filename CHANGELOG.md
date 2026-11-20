# Changelog

All notable changes to the **u-SHA-jua** platform are documented in this file.

## [1.4.1-enterprise] - 2026-11-20
### Added
- **Kenya-Only Mapbox Navigation Basemaps (`client/src/components/DisasterMap.tsx`)**: Integrated `navigation-night-v1`, `navigation-day-v1`, and `satellite-streets-v12` strictly locked to Kenya territorial bounds (`[[-5.5, 33.0], [5.8, 42.5]]`) with 6 automated boundary tests (`server/tests/test_kenya_jurisdiction.py`).
- **Multi-Worker Shared State Adapter (`server/services/cache_service.py`)**: Hybrid Redis/in-memory cache backing JWT revocation, sliding-window rate limits, and shared telemetry counters.
- **Background Periodic Maintenance Scheduler (`server/main.py`)**: FastAPI lifespan task for hourly stale bucket/JWT revocation cleanup and daily SHA-256 snapshot backups, plus `POST /api/v1/admin/maintenance/run`.
- **Reversible Schema Migrations (`server/migrations/runner.py`)**: Added `down()` handlers, `rollback_migration()`, and admin-only `POST /api/v1/admin/migrations/rollback`.
- **Cloud Object Storage Abstraction (`server/services/storage_service.py`)**: Pluggable `LocalStorageProvider` and `S3StorageProvider` controlled via `STORAGE_BACKEND`.

### Changed & Cleaned
- Pruned unused `shapely` dependency and declared direct JWT/bcrypt dependencies (`python-jose`, `passlib`, `bcrypt`) in `server/requirements.txt`.
- Removed 15 obsolete phase E2E audit scripts (`client/e2e/`), untracked local AI/planning files, and added test teardown cleanup for zero residual disk bloat (`109/109` pytest passing).

## [1.4.0-enterprise] - 2026-11-03
### Added
- **Durable Database-Backed SHA-256 Audit Ledger (`server/models/audit.py`)**: Persists cryptographic hash-chained operational blocks in SQLite/PostGIS (`audit_blocks` table) so audit trails survive server restarts.
- **OASIS Common Alerting Protocol (CAP v1.2) Export (`GET /api/v1/incidents/{id}/cap-alert`)**: Generates standards-compliant CAP v1.2 JSON and XML alerts with one-click export in `DispatchBoard.tsx`.
- **Client-Side Offline Outbox Queue (`client/src/services/api.ts`)**: Automatically queues civilian distress reports in `localStorage` during network blackouts and auto-flushes to `/api/v1/incidents/sync/offline-packet` upon reconnection.
- **Design Tokens & WCAG 2.2 Accessibility (`client/src/index.css`, `App.tsx`)**: Added semantic CSS custom properties, `:focus-visible` keyboard outlines, and `aria-live="assertive"` screen-reader emergency announcements.
- **CI/CD & Operations Hygiene**: Added `.github/workflows/ci.yml`, `server/.env.example`, `client/.env.example`, `CONTRIBUTING.md`, and `RUNBOOK.md`.

### Security
- Pinned `starlette>=0.40.0` and `python-multipart>=0.0.18` in `server/requirements.txt` to mitigate CVE-2024-47874 and CVE-2024-24762.

## [1.3.0-enterprise] - 2026-10-18
### Added
- Role-Based Access Control (RBAC), sliding-window rate limiting, PII phone masking (`+254 7XX *** *XX`), and XSS sanitization.
- AI Multi-Criteria Decision Analysis (MCDA) unit recommendation and one-touch autonomous dispatch.
- Evacuation shelter registry, dynamic 16-point circular hazard perimeters, and offline mesh synchronization.

