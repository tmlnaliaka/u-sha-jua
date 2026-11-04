---
name: rw-pjt
description: Comprehensive market-readiness review orchestrator and multi-dimensional audit for production launch. Evaluates backend API, data layer & migrations, deployment & ops, integrations & payments, privacy & compliance, reliability & observability, security (OWASP/BOLA/IDOR), testing & code quality, and provides staff-level release readiness scoring (0-5) with evidence-backed GO/NO-GO verdicts. Trigger on requests to audit, review, verify market/production readiness, prepare for release, or run comprehensive quality reviews on any codebase.
---

# `rw-pjt`: Comprehensive Market Readiness Project Review

A unified, staff-engineer quality audit framework combining 9 critical dimensions of software production readiness. This review replaces optimism with hard evidence: every finding must cite exact file paths, line numbers, configuration files, or concrete test/command outputs.

---

## Operating Protocol

### 1. Orientation & Scope Definition
- Inspect repository structure, dependency manifests (`package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `pom.xml`, etc.), environment examples, Dockerfiles, and CI workflows.
- Identify:
  - Architecture type: Monolith, microservices, SPA + REST/GraphQL API, serverless, mobile backend.
  - Critical flows: Authentication, financial transactions, PII ingestion, core domain workflows.
  - Failure blast radius: Financial loss, regulatory non-compliance, data loss/corruption, service downtime, brand reputation.
  - Target audience and regulatory jurisdiction (e.g., GDPR, CCPA, Kenya DPA 2019, PCI-DSS, HIPAA).

### 2. The 9 Review Dimensions

#### Dimension 1: Backend & API Review
- **Contract & API Design**:
  - Consistent RESTful/RPC/GraphQL conventions, HTTP verbs, standard HTTP status codes (`200`, `201`, `400`, `401`, `403`, `404`, `409`, `422`, `500`).
  - Formal schema / contract (OpenAPI 3.x, protobuf, GraphQL schema). Versioning strategy in place before external exposure.
  - List endpoints enforce cursor or keyset pagination with hard `max_limit` caps.
  - Consistent, typed error responses: machine code, clear human message, trace/correlation ID. Zero leaked stack traces or DB errors.
- **Input & Output Validation**:
  - Strict server-side runtime validation on all inputs (body, query, headers, params) using schema libraries (Pydantic, Zod, Joi, class-validator).
  - Explicit DTOs / serialization boundaries preventing accidental leakage of sensitive attributes (e.g., `password_hash`, internal IDs, private flags).
  - File upload hardening: magic byte verification, strict MIME white-listing, size caps, decoupled storage (GCS/S3 with presigned URLs), non-executable paths.
- **Resilience Under Concurrency & Failure**:
  - Idempotency mechanisms (`Idempotency-Key` or unique transaction hashes) on all state-altering write endpoints.
  - Database transactions wrapping multi-step atomic operations. Protection against race conditions (`SELECT ... FOR UPDATE`, optimistic locking).
  - Strict timeouts configured on all database queries and outbound HTTP/gRPC requests.
  - Offloading heavy/slow tasks to asynchronous queues with backoff, retries, and dead-letter queues (DLQ).

#### Dimension 2: Data Layer Review
- **Schema Design & Integrity**:
  - Explicit Primary Keys, Foreign Keys with referential integrity actions (`ON DELETE RESTRICT/CASCADE`), and constraints (`NOT NULL`, `UNIQUE`, `CHECK`).
  - Appropriate data types: Currency in minor units (integer/decimal, never float), timestamps with timezone in UTC (`TIMESTAMPTZ`), strict enums.
  - Normalization vs intentional denormalization documented.
  - Multi-tenant tenant isolation columns properly indexed and enforced across all query filters or via RLS (Row-Level Security).
- **Query Performance & Indexing**:
  - Composite indexes aligned with frequent query filters, sorting, and joins.
  - Detection of N+1 query antipatterns, unbounded table scans, and expensive offset pagination.
  - Connection pool configuration tuned for concurrency limits and database server capacity.
- **Database Migrations & Lifecycle**:
  - Versioned migration files (Flyway, Liquibase, Alembic, Prisma, Drizzle, etc.) tested against clean and populated environments.
  - Zero-downtime expand-and-contract patterns for schema modifications.
  - Clear rollback and forward-fix recovery strategies. Prohibit test seed scripts from executing in production environments.

#### Dimension 3: Deployment & Operations Review
- **CI/CD Pipeline**:
  - Automated deployment pipeline: Lint -> Test -> Security Scan -> Build -> Container Scan -> Deploy.
  - Deterministic builds with pinned lockfiles (`package-lock.json`, `uv.lock`, `poetry.lock`).
  - Immutable artifacts tagged with git commit SHAs (never naked `latest` tags in staging/production).
  - Protected branches requiring peer reviews and green CI status checks prior to merging.
- **Release Safety & Zero-Downtime**:
  - Blue-Green, Rolling, or Canary deployments with automated rollback on health probe failure.
  - Strict separation of build and runtime steps.
  - Decoupled deployment from feature release using feature flags where appropriate.
- **Environment & Secret Management**:
  - 12-factor application configuration: secrets injected exclusively via environment variables or secret vaults (GCP Secret Manager, AWS Secrets Manager, HashiCorp Vault).
  - Exhaustive `.env.example` documenting all configuration keys without real credentials.
  - Resource limits (CPU/Memory requests & limits, autoscaling ceilings, database connection maximums) to prevent runaway cloud costs.

#### Dimension 4: Integrations & External Services Review
- **Outbound HTTP / Third-Party Services**:
  - Explicit connection and socket read timeouts on every external call.
  - Retry logic restricted to idempotent operations, configured with exponential backoff and jitter.
  - Circuit breakers to avoid cascading failure when external providers suffer outages.
  - Dedicated credentials per environment (sandbox vs production) with zero test credentials targeting live provider APIs.
- **Inbound Webhooks & Asynchronous Callbacks**:
  - Cryptographic signature verification (HMAC SHA-256) on every incoming webhook.
  - Idempotency deduplication table to handle out-of-order and repeated webhook deliveries.
  - Fast response acknowledge (`200 OK`) with background queue processing of webhook payloads.
- **Payment & Financial Flows (if applicable)**:
  - Exact currency representation in minor units (cents, etc.).
  - Robust state machine handling `pending`, `successful`, `failed`, `expired`, and `reversed` states.
  - Reconciliation workflows to resolve asynchronous state divergences with provider reports.
  - Masking and strict redaction of sensitive payment credentials (PCI-DSS compliance).

#### Dimension 5: Privacy & Regulatory Compliance Review
- **Data Inventory & Minimization**:
  - Catalog of all Personal Identifiable Information (PII) collected, stored, and shared with third-party sub-processors.
  - Verification that data collection adheres to purpose limitation and data minimization principles.
- **Legal Grounds & User Rights**:
  - Audit against applicable data protection regulations (GDPR, Kenya DPA 2019, CCPA).
  - Consent capture records with timestamps, versions, and mechanisms for withdrawal.
  - Verified user rights workflows: Subject Access Requests (SAR), Data Correction, and Data Erasure (Right to Be Forgotten across databases and backups).
  - Explicit terms of service, privacy policy matching actual data practices, and cookie notices.
- **Safeguards & Security Controls**:
  - Encryption in transit (TLS 1.3/1.2) and at rest (AES-256).
  - Granular role-based access control (RBAC) to production data stores.
  - Explicit data retention and automated purging schedules.
  - Documented 72-hour security incident and breach notification protocols.

#### Dimension 6: Reliability & Observability Review
- **Structured Logging**:
  - JSON-formatted structured logs with log levels (`DEBUG`, `INFO`, `WARN`, `ERROR`).
  - Correlation / Trace ID and authenticated user/tenant context propagated on every log entry.
  - Strict sanitization filters preventing secrets, tokens, passwords, and sensitive PII from appearing in log streams.
- **Monitoring & Metrics (The 4 Golden Signals)**:
  - Latency (p50, p95, p99), Traffic (requests/sec), Errors (5xx rates), and Saturation (CPU, RAM, DB connection pool utilization).
  - Key business transaction counters and alerts (e.g., successful orders, dropped checkouts).
  - Centralized application performance monitoring and exception tracking (e.g., Sentry) with release tracking.
- **Resilience & Fault Tolerance**:
  - Decoupled liveness (`/healthz`) and readiness (`/ready`) endpoints reflecting actual dependency states.
  - Graceful degradation paths for non-essential features when dependencies degrade.
  - Documented operational runbooks for standard emergency procedures (database failover, credential compromise, rollbacks).

#### Dimension 7: Security Review (OWASP & Threat Modeling)
- **Authentication**:
  - Password hashing via modern memory-hard functions: Argon2id or bcrypt (cost factor >= 12).
  - Rate limiting and brute-force protection on authentication and password reset routes.
  - Secure session/token handling: short-lived access tokens, rotatable refresh tokens, signed JWTs with pinned algorithms, cryptographic revocation.
  - Cookie security attributes: `Secure; HttpOnly; SameSite=Lax/Strict`.
- **Authorization & Access Control**:
  - Zero-trust default-deny authorization on all non-public routes.
  - Prevention of Insecure Direct Object References (IDOR/BOLA): verification that authenticated callers own the requested entity.
  - Protection against Mass Assignment / Over-posting by disallowing direct request body mapping to persistent models.
- **Injection & Client-Side Protections**:
  - Parameterized database queries / ORMs across all data access; zero string interpolation in queries.
  - Strict sanitization against Cross-Site Scripting (XSS), avoidance of raw HTML injection.
  - Hardened HTTP response security headers: Content-Security-Policy (CSP), Strict-Transport-Security (HSTS), X-Content-Type-Options, X-Frame-Options.
  - Clean dependency vulnerability audit (0 critical / 0 unmitigated high CVEs).

#### Dimension 8: Testing & Code Quality Review
- **Test Portfolio & Execution**:
  - Automated execution of unit, integration, and end-to-end test suites.
  - Integration tests utilizing real containerized databases/services rather than superficial mocks.
  - Dedicated tests for critical business rules, authorization boundaries, and negative failure cases.
- **Static Analysis & Type Rigor**:
  - Zero unhandled type-checker errors (`tsc --noEmit`, `mypy --strict`, etc.).
  - Linter and formatter cleanliness (`eslint`, `ruff`, etc.).
  - Deterministic test execution free of race conditions, sleeps, or network flakiness.
- **CI Quality Gates**:
  - Pre-commit and CI automated checks blocking merges on test failures or regressions.

#### Dimension 9: Release Readiness Orchestration
- Consolidates findings across all 8 preceding dimensions.
- Evaluates real command outputs: tests, linters, dependency audits, build runs.
- Delivers a Staff Engineer Go/No-Go Decision with concrete justification.

---

## Output Report Structure

Every execution of `rw-pjt` must produce a formal evaluation report matching this exact structure:

### 1. Executive Summary & Verdict
- **Launch Verdict**: `[GO]`, `[GO WITH CONDITIONS]`, or `[NO-GO]`
- **Summary Statement**: One clear, unequivocal sentence explaining the primary driver of the verdict.
- **Scope & Risk Profile**: Summary of tech stack, target users, risk tier (Low / Medium / High / Critical), and compliance obligations.

### 2. Multi-Dimensional Scorecard
A summary table scoring each dimension from 0 to 5:
- **0 - Absent**: Completely missing or broken.
- **1 - Critical Deficiencies**: Rudimentary setup with severe gaps posing immediate danger.
- **2 - Incomplete**: Foundational pieces present but notable security/reliability risks remain.
- **3 - Acceptable for Launch**: Meets baseline production standards with managed, low risks.
- **4 - Robust**: Follows industry best practices with comprehensive protections.
- **5 - Exemplary**: Hardened, automated, observable, and resilient to failure.

| Dimension | Score (0-5) | Status | Key Justification |
| :--- | :---: | :---: | :--- |
| 1. Backend & API | 0-5 | PASS / WARN / FAIL | Brief justification citing specific implementation |
| 2. Data Layer | 0-5 | PASS / WARN / FAIL | Brief justification |
| 3. Deploy & Ops | 0-5 | PASS / WARN / FAIL | Brief justification |
| 4. Integrations | 0-5 | PASS / WARN / FAIL | Brief justification |
| 5. Privacy & Compliance | 0-5 | PASS / WARN / FAIL | Brief justification |
| 6. Reliability & Observability | 0-5 | PASS / WARN / FAIL | Brief justification |
| 7. Security (OWASP/BOLA) | 0-5 | PASS / WARN / FAIL | Brief justification |
| 8. Testing & Quality | 0-5 | PASS / WARN / FAIL | Brief justification |
| **Overall Market Readiness** | **Avg** | **Status** | **Weighted Launch Verdict** |

### 3. Detailed Findings by Severity
Each finding formatted strictly as:
`[SEVERITY] Title | Evidence (path:line) | Why it matters | Fix (Concrete minimal remediation)`
- **Blockers**: Immediate dealbreakers causing data loss, security compromise, legal liability, or system crash.
- **High**: Vulnerabilities or reliability deficits likely to trigger incidents post-launch.
- **Medium**: Technical debt or operational friction needing planned resolution within 30 days.
- **Low**: Code hygiene, formatting, or minor optimization opportunities.

### 4. Items Not Verified
Explicit list of areas that could not be independently verified (e.g., live cloud secrets, production load test benchmarks, real third-party webhooks) and what access is needed.

### 5. Actionable Remediation Roadmap
A prioritized execution table detailing:
- Priority (P0 / P1 / P2)
- Action Item
- Estimated Effort (S / M / L)
- Target Timeline (Pre-Launch vs Post-Launch Day 1-30)

