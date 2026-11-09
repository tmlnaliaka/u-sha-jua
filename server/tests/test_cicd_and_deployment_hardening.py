import os
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)
BYPASS_HEADERS = {"X-Skip-Rate-Limit": "test-bypass"}
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))


def test_dockerfile_multistage_and_non_root_hardening():
    """Verifies server/Dockerfile and client/Dockerfile enforce multi-stage builds, non-root execution, and HEALTHCHECK probes."""
    with open(os.path.join(ROOT_DIR, "server", "Dockerfile"), "r", encoding="utf-8") as f:
        server_df = f.read()

    assert "FROM python:3.11-slim AS builder" in server_df
    assert "FROM python:3.11-slim AS runtime" in server_df
    assert "USER ushajua" in server_df
    assert "HEALTHCHECK" in server_df
    assert "/healthz" in server_df
    assert "--reload" not in server_df

    with open(os.path.join(ROOT_DIR, "client", "Dockerfile"), "r", encoding="utf-8") as f:
        client_df = f.read()

    assert "FROM node:20-alpine AS builder" in client_df
    assert "FROM nginx:1.27-alpine AS runtime" in client_df
    assert "HEALTHCHECK" in client_df

    assert os.path.exists(os.path.join(ROOT_DIR, "server", ".dockerignore"))
    assert os.path.exists(os.path.join(ROOT_DIR, "client", ".dockerignore"))


def test_nginx_reverse_proxy_websocket_and_security_directives():
    """Verifies client/nginx.conf configures API & WebSocket proxy passes, OWASP headers, and Service Worker cache busting."""
    with open(os.path.join(ROOT_DIR, "client", "nginx.conf"), "r", encoding="utf-8") as f:
        nginx_conf = f.read()

    assert "location /api/v1/" in nginx_conf
    assert "proxy_pass http://server:8000/api/v1/;" in nginx_conf
    assert "location /ws" in nginx_conf
    assert 'proxy_set_header Upgrade $http_upgrade;' in nginx_conf
    assert 'proxy_set_header Connection "upgrade";' in nginx_conf
    assert "location = /sw.js" in nginx_conf
    assert "no-store, no-cache, must-revalidate" in nginx_conf
    assert 'add_header X-Frame-Options "DENY" always;' in nginx_conf
    assert 'add_header X-Content-Type-Options "nosniff" always;' in nginx_conf


def test_github_actions_ci_pipeline_and_env_example_parity():
    """Verifies .github/workflows/ci.yml defines 3 quality gate jobs and docker-compose.yml avoids hardcoded credentials."""
    with open(os.path.join(ROOT_DIR, ".github", "workflows", "ci.yml"), "r", encoding="utf-8") as f:
        ci_yml = f.read()

    assert "backend-verify:" in ci_yml
    assert "frontend-verify:" in ci_yml
    assert "deployment-config-audit:" in ci_yml
    assert "npx tsc --noEmit" in ci_yml
    assert "pytest -v" in ci_yml

    with open(os.path.join(ROOT_DIR, "docker-compose.yml"), "r", encoding="utf-8") as f:
        compose_yml = f.read()

    assert "${POSTGRES_PASSWORD:-" in compose_yml
    assert "http://127.0.0.1:8000/readyz" in compose_yml


def test_deployment_readiness_audit_endpoint():
    """Verifies GET /api/v1/admin/deployment-audit returns 11/11 passing deployment hardening checks."""
    resp = client.get("/api/v1/admin/deployment-audit", headers=BYPASS_HEADERS)
    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "hardened"
    assert data["all_checks_passed"] is True
    assert data["passed_checks"] == data["total_checks"]
    assert data["total_checks"] == 11
