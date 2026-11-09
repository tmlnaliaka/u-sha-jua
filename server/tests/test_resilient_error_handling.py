import pytest
from fastapi.testclient import TestClient
from main import app
from config import settings

client = TestClient(app, raise_server_exceptions=False)

def test_404_structured_error_envelope():
    response = client.get("/api/v1/non-existent-route")
    assert response.status_code == 404
    data = response.json()
    assert data["success"] == False
    assert data["error_code"] == "NOT_FOUND"
    assert data["status_code"] == 404
    assert "request_id" in data
    assert "timestamp" in data
    assert "X-Request-ID" in response.headers

def test_422_validation_error_envelope():
    # Send invalid payload (missing required raw_text)
    response = client.post("/api/v1/incidents/report", json={})
    assert response.status_code == 422
    data = response.json()
    assert data["success"] == False
    assert data["error_code"] == "VALIDATION_ERROR"
    assert data["status_code"] == 422
    assert "details" in data
    assert isinstance(data["details"], list)
    assert any(err["field"].endswith("raw_text") for err in data["details"])

def test_500_synthetic_error_suppresses_traceback():
    response = client.get("/api/v1/test/synthetic-error")
    assert response.status_code == 500
    data = response.json()
    assert data["success"] == False
    assert data["error_code"] == "INTERNAL_SERVER_ERROR"
    # Ensure internal Python traceback and exception names are NOT leaked to client
    assert "Traceback" not in response.text
    assert "RuntimeError" not in response.text
    assert "Synthetic crisis" not in response.text
    assert ".py" not in response.text

def test_request_id_correlation_in_error_envelope():
    custom_id = "req-audit-test-998877"
    response = client.get(
        "/api/v1/non-existent",
        headers={"X-Request-ID": custom_id}
    )
    assert response.status_code == 404
    assert response.headers["X-Request-ID"] == custom_id
    data = response.json()
    assert data["request_id"] == custom_id
