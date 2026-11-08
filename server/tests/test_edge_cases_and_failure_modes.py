import pytest
import asyncio
from fastapi.testclient import TestClient
from main import app
from config import settings
from services.nlp_service import NLPService
from models.incident import IncidentType, UrgencyLevel

client = TestClient(app)

@pytest.fixture
def auth_headers():
    return {"X-API-Key": settings.DISPATCHER_API_KEY}

def test_swahili_and_sheng_nlp_extraction():
    """Verifies NLP service correctly identifies Swahili, Sheng, and crisis emojis."""
    nlp = NLPService()

    # 1. Swahili flood distress with urgent rescue keyword and siren emoji
    res1 = asyncio.run(nlp.extract_distress_report("🚨 Maji yamejaa ndani ya nyumba Mathare haraka watu wamekwama!"))
    assert res1.incident_type == IncidentType.FLOOD
    assert res1.urgency_level == UrgencyLevel.CRITICAL
    assert "Mathare" in res1.location_name

    # 2. Swahili fire report with Gikomba market and fire emoji
    res2 = asyncio.run(nlp.extract_distress_report("Moto mkubwa unateketeza vibanda vya nguo Gikomba moshi mwingi 🔥"))
    assert res2.incident_type == IncidentType.FIRE
    assert "Gikomba" in res2.location_name

    # 3. Sheng/Swahili building collapse with collapse emoji
    res3 = asyncio.run(nlp.extract_distress_report("Ghorofa imeporomoka mtaa wa Huruma watu wameumia sana 🏚️"))
    assert res3.incident_type == IncidentType.COLLAPSE
    assert res3.urgency_level in [UrgencyLevel.MEDIUM, UrgencyLevel.CRITICAL]

    # 4. Swahili emergency rescue SOS
    res4 = asyncio.run(nlp.extract_distress_report("Tusaidie dharura! Maji yamezama kijiji chote Kibera 🆘"))
    assert res4.incident_type == IncidentType.FLOOD
    assert res4.urgency_level == UrgencyLevel.CRITICAL

def test_unicode_and_crisis_emoji_ingestion():
    """Verifies API ingests raw distress reports containing Unicode, emojis, and Arabic text."""
    payload = {
        "raw_text": "Dharura ya mafuriko 🌊🚨 mtaani Garissa (غاريsa) tusaidie haraka! 🆘",
        "device_lat": -0.4532,
        "device_lon": 39.6461
    }
    response = client.post("/api/v1/incidents/report", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert "🌊🚨" in data["raw_text"]
    assert "غاريsa" in data["raw_text"]
    assert data["incident_type"] == "Flood"
    assert data["urgency_level"] == "Critical"

def test_empty_database_and_zero_search_results(auth_headers):
    """Verifies search, status, and type filtering return 200 OK with empty list when no matches exist."""
    # Search for an impossible term
    res = client.get("/api/v1/incidents?q=NON_EXISTENT_DISASTER_TOKEN_99999", headers=auth_headers)
    assert res.status_code == 200
    assert res.json() == []
    assert res.headers.get("X-Total-Count") == "0"

    # Filter with unmatched type
    res_type = client.get("/api/v1/incidents?type=Medical Emergency&q=NEVER_MATCHES", headers=auth_headers)
    assert res_type.status_code == 200
    assert res_type.json() == []

def test_high_volume_pagination_and_bounds(auth_headers):
    """Verifies high limit and deep offset query parameters do not cause 500 or DB failures."""
    res = client.get("/api/v1/incidents?limit=500&offset=500000", headers=auth_headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    assert res.json() == []

def test_weather_radar_circuit_breaker_resilience():
    """Verifies weather radar telemetry endpoint returns valid schema structure with resilience."""
    res = client.get("/api/v1/weather/telemetry")
    assert res.status_code == 200
    data = res.json()
    assert "circuit_breaker" in data
    assert data["circuit_breaker"] in ["healthy", "tripped"]
    assert "river_gauge_elevation_m" in data
    assert "warning_bulletin" in data

def test_offline_distress_packet_sync_deduplication():
    """Verifies field workers syncing offline distress packets via mesh do not create duplicate incidents."""
    packet_data = {
        "device_id": "LORA_REPEATER_TEST_01",
        "packet_timestamp": "2026-11-08T06:00:00Z",
        "incidents": [
            {
                "id": "offline-mesh-test-unique-001",
                "raw_text": "Maji yameziba barabara ya Eastleigh Section 3 🌊",
                "incident_type": "Flood",
                "urgency_level": "Medium",
                "location_name": "Eastleigh Section 3, Nairobi",
                "latitude": -1.2741,
                "longitude": 36.8522,
                "timestamp": "2026-11-08T05:45:00Z"
            }
        ]
    }

    # 1. First sync - should ingest cleanly
    res1 = client.post("/api/v1/incidents/sync/offline-packet", json=packet_data)
    assert res1.status_code == 200
    res1_data = res1.json()
    assert res1_data["status"] == "synchronized"
    assert res1_data["newly_ingested"] >= 0

    # 2. Duplicate sync replay - should recognize existing item without crashing
    res2 = client.post("/api/v1/incidents/sync/offline-packet", json=packet_data)
    assert res2.status_code == 200
    res2_data = res2.json()
    assert res2_data["status"] == "synchronized"
    assert res2_data["already_synced"] >= 1
