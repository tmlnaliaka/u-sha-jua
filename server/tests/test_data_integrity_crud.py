import pytest
from fastapi.testclient import TestClient
from main import app
from database import get_db, SessionLocal
from models.incident import Incident, IncidentStatus, IncidentType, UrgencyLevel
from models.responder import ResponderUnit, ResponderStatus, ResponderType
from models.shelter import Shelter
from models.user import User

client = TestClient(app)
DISPATCHER_KEY = "ushajua-dev-dispatcher-key"

@pytest.fixture
def auth_headers():
    return {"X-API-Key": DISPATCHER_KEY}

def test_incident_crud_and_search_sort(auth_headers):
    # 1. CREATE Incident
    payload = {
        "raw_text": "Severe structural crack and flooding at Eastleigh Section 7",
        "incident_type": "Flood",
        "urgency_level": "Critical",
        "location_name": "Eastleigh Section 7, Nairobi",
        "coordinates": {"latitude": -1.2750, "longitude": 36.8500},
        "status": "Pending"
    }
    create_res = client.post("/api/v1/incidents", json=payload, headers=auth_headers)
    assert create_res.status_code == 201
    inc_data = create_res.json()
    inc_id = inc_data["id"]
    assert inc_data["location_name"] == "Eastleigh Section 7, Nairobi"

    # 2. READ (with full-text search 'q' and sorting)
    search_res = client.get("/api/v1/incidents?q=Eastleigh&limit=10")
    assert search_res.status_code == 200
    search_items = search_res.json()
    assert any(item["id"] == inc_id for item in search_items)

    # Test sorting
    sort_res = client.get("/api/v1/incidents?sort_by=timestamp&order=asc&limit=5")
    assert sort_res.status_code == 200

    # 3. UPDATE Incident (PATCH /incidents/{id})
    update_payload = {
        "urgency_level": "Medium",
        "location_name": "Eastleigh Section 7 North, Nairobi"
    }
    patch_res = client.patch(f"/api/v1/incidents/{inc_id}", json=update_payload, headers=auth_headers)
    assert patch_res.status_code == 200
    updated_data = patch_res.json()
    assert updated_data["urgency_level"] == "Medium"
    assert updated_data["location_name"] == "Eastleigh Section 7 North, Nairobi"

    # 4. DELETE Incident
    del_res = client.delete(f"/api/v1/incidents/{inc_id}", headers=auth_headers)
    assert del_res.status_code in [200, 204]

    # Verify not found after delete
    verify_res = client.get(f"/api/v1/incidents?q={inc_id}")
    assert not any(i["id"] == inc_id for i in verify_res.json())

def test_orphaned_responder_record_prevention_on_incident_deletion(auth_headers):
    # Setup: Create incident
    inc_res = client.post("/api/v1/incidents", json={
        "raw_text": "Flash flood near Ngong River bridge",
        "incident_type": "Flood",
        "urgency_level": "Critical",
        "location_name": "Ngong River Basin",
        "coordinates": {"latitude": -1.3100, "longitude": 36.8200}
    }, headers=auth_headers)
    inc_id = inc_res.json()["id"]

    # Dispatch a responder to it
    responders = client.get("/api/v1/responders").json()
    assert len(responders) > 0
    resp_id = responders[0]["id"]

    dispatch_res = client.post(f"/api/v1/responders/{resp_id}/dispatch", json={"incident_id": inc_id}, headers=auth_headers)
    assert dispatch_res.status_code == 200
    assert dispatch_res.json()["assigned_incident_id"] == inc_id
    assert dispatch_res.json()["status"] == "Dispatched"

    # Delete the incident
    del_res = client.delete(f"/api/v1/incidents/{inc_id}", headers=auth_headers)
    assert del_res.status_code in [200, 204]

    # CRITICAL INTEGRITY CHECK: The responder MUST NOT have an orphaned assigned_incident_id
    resp_check = client.get("/api/v1/responders").json()
    disengaged_resp = next(r for r in resp_check if r["id"] == resp_id)
    assert disengaged_resp["assigned_incident_id"] is None
    assert disengaged_resp["status"] in ["Available", "Returning"]

def test_responder_unit_crud_and_validation(auth_headers):
    import time
    unique_callsign = f"KDF-BOAT-{int(time.time() * 1000) % 100000}"

    # 1. CREATE responder unit
    create_payload = {
        "callsign": unique_callsign,
        "unit_type": "WaterRescue",
        "base_station": "Kenya Navy Marine Base, Nairobi Outpost",
        "coordinates": {"latitude": -1.2850, "longitude": 36.8200}
    }
    create_res = client.post("/api/v1/responders", json=create_payload, headers=auth_headers)
    assert create_res.status_code == 201
    unit_id = create_res.json()["id"]
    assert create_res.json()["callsign"] == unique_callsign

    # 2. DUPLICATE rejection
    dup_res = client.post("/api/v1/responders", json=create_payload, headers=auth_headers)
    assert dup_res.status_code in [400, 409, 422]

    # 3. COORDINATE BOUNDS validation
    invalid_coord_payload = dict(create_payload)
    invalid_coord_payload["callsign"] = f"{unique_callsign}-X"
    invalid_coord_payload["coordinates"] = {"latitude": 999.0, "longitude": 36.8200}
    val_res = client.post("/api/v1/responders", json=invalid_coord_payload, headers=auth_headers)
    assert val_res.status_code == 422

    # 4. DELETE responder unit
    del_res = client.delete(f"/api/v1/responders/{unit_id}", headers=auth_headers)
    assert del_res.status_code in [200, 204]

def test_shelter_crud_and_capacity_validation(auth_headers):
    import time
    unique_name = f"Nairobi West Relief Camp {int(time.time() * 1000) % 100000}"

    # 1. CREATE shelter
    create_payload = {
        "name": unique_name,
        "location_name": "Nairobi West Stadium",
        "coordinates": {"latitude": -1.3050, "longitude": 36.8150},
        "capacity_total": 500,
        "occupancy_current": 100,
        "water_supply_status": "Operational",
        "medical_post_available": True,
        "contact_phone": "+254712000111"
    }
    create_res = client.post("/api/v1/shelters", json=create_payload, headers=auth_headers)
    assert create_res.status_code == 201
    shelter_id = create_res.json()["id"]
    assert create_res.json()["available_space"] == 400

    # 2. VALIDATION: Negative capacity rejected
    neg_payload = dict(create_payload)
    neg_payload["name"] = f"{unique_name}-neg"
    neg_payload["capacity_total"] = -50
    neg_res = client.post("/api/v1/shelters", json=neg_payload, headers=auth_headers)
    assert neg_res.status_code == 422

    # 3. UPDATE shelter (PATCH /shelters/{id})
    patch_payload = {
        "water_supply_status": "Tanker Dispatched",
        "occupancy_current": 250
    }
    patch_res = client.patch(f"/api/v1/shelters/{shelter_id}", json=patch_payload, headers=auth_headers)
    assert patch_res.status_code == 200
    assert patch_res.json()["water_supply_status"] == "Tanker Dispatched"
    assert patch_res.json()["available_space"] == 250

    # 4. DELETE / DEACTIVATE shelter
    del_res = client.delete(f"/api/v1/shelters/{shelter_id}", headers=auth_headers)
    assert del_res.status_code in [200, 204]

    # Verify inactive
    shelters = client.get("/api/v1/shelters").json()
    assert not any(s["id"] == shelter_id for s in shelters)

def test_user_soft_delete_and_deactivation(auth_headers):
    import time
    test_email = f"deactivate_user_{int(time.time() * 1000)}@ushajua.org"
    signup_res = client.post("/api/v1/auth/signup", json={
        "email": test_email,
        "password": "StrongPassword123!",
        "full_name": "Test Deactivate Officer",
        "role": "citizen"
    })
    assert signup_res.status_code == 201
    user_id = signup_res.json()["id"]

    # Delete / Deactivate user
    del_res = client.delete(f"/api/v1/auth/users/{user_id}", headers=auth_headers)
    assert del_res.status_code in [200, 204]

    # Trying to login with deactivated user should fail
    login_res = client.post("/api/v1/auth/login", json={
        "identifier": test_email,
        "password": "StrongPassword123!"
    })
    assert login_res.status_code in [400, 401, 403]

