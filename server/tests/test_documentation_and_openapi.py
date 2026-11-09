import os
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
BYPASS_HEADERS = {"X-Skip-Rate-Limit": "test-bypass"}
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def test_openapi_schema_metadata_and_tags():
    """Verifies /openapi.json exposes v1.4.0-enterprise metadata, Apache 2.0 license, and all 11 domain tag groups."""
    resp = client.get("/openapi.json", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    schema = resp.json()

    assert schema["info"]["title"] == "u-SHA-jua Disaster Informatics Platform"
    assert schema["info"]["version"] == "1.4.0-enterprise"
    assert schema["info"]["license"]["name"] == "Apache 2.0"
    assert "contact" in schema["info"]

    tag_names = [t["name"] for t in schema.get("tags", [])]
    expected_tags = [
        "Authentication & RBAC",
        "Incidents",
        "Responders",
        "Shelters",
        "SMS Gateway",
        "Weather",
        "Analytics",
        "Observability & Telemetry",
        "Database Migrations & Disaster Backup",
        "Health",
        "Diagnostics"
    ]
    for et in expected_tags:
        assert et in tag_names


def test_openapi_paths_completeness():
    """Verifies all core REST endpoints across phases 1-15 are documented in /openapi.json."""
    resp = client.get("/openapi.json", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    paths = resp.json()["paths"]

    required_paths = [
        "/api/v1/incidents/report",
        "/api/v1/incidents/spatial-feed",
        "/api/v1/responders/auto-dispatch/{incident_id}",
        "/api/v1/shelters",
        "/api/v1/telemetry/metrics",
        "/api/v1/telemetry/logs",
        "/api/v1/telemetry/client-error",
        "/api/v1/admin/migrations",
        "/api/v1/admin/backup/snapshot",
        "/api/v1/admin/backup/restore",
        "/api/v1/admin/query-plan",
        "/api/v1/admin/deployment-audit",
        "/health",
        "/healthz",
        "/readyz"
    ]
    for rp in required_paths:
        assert rp in paths, f"Missing path in OpenAPI specification: {rp}"


def test_swagger_ui_interactive_docs_accessible():
    """Verifies /docs serves the interactive Swagger UI HTML interface."""
    resp = client.get("/docs", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    assert "swagger-ui" in resp.text.lower()
    assert "u-sha-jua disaster informatics platform" in resp.text.lower()


def test_architecture_and_operational_runbooks_documentation():
    """Verifies README.md and docs/ARCHITECTURE_AND_RUNBOOK.md exist and document all 5 operational runbooks."""
    readme_path = os.path.join(ROOT_DIR, "README.md")
    runbook_path = os.path.join(ROOT_DIR, "docs", "ARCHITECTURE_AND_RUNBOOK.md")

    assert os.path.exists(readme_path)
    assert os.path.exists(runbook_path)

    with open(readme_path, "r", encoding="utf-8") as f:
        readme_text = f.read()
    assert "/api/v1/telemetry/metrics" in readme_text
    assert "/api/v1/admin/backup/snapshot" in readme_text
    assert "/api/v1/admin/deployment-audit" in readme_text

    with open(runbook_path, "r", encoding="utf-8") as f:
        runbook_text = f.read()
    assert "Runbook 1:" in runbook_text
    assert "Runbook 2:" in runbook_text
    assert "Runbook 3:" in runbook_text
    assert "Runbook 4:" in runbook_text
    assert "Runbook 5:" in runbook_text
    assert "sequenceDiagram" in runbook_text
    assert "erDiagram" in runbook_text

