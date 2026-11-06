import pytest
import os
import sys
import uuid
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from main import app
from database import Base, engine, SessionLocal
from models.user import User

client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield


def test_user_signup_and_login():
    """Validates full user registration, password hashing, and JWT login issuance."""
    unique_email = f"citizen_{uuid.uuid4().hex[:8]}@ushajua.ke"
    unique_phone = f"+2547{uuid.uuid4().int % 100000000:08d}"

    # 1. Sign up new citizen
    res_signup = client.post(
        "/api/v1/auth/signup",
        json={
            "email": unique_email,
            "phone": unique_phone,
            "password": "SecurePassword123!",
            "full_name": "Amina Wanjiku",
            "role": "citizen"
        }
    )
    assert res_signup.status_code == 201
    user_data = res_signup.json()
    assert user_data["email"] == unique_email
    assert user_data["phone"] == unique_phone
    assert user_data["role"] == "citizen"
    assert "hashed_password" not in user_data

    # 2. Login with valid credentials
    res_login = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": unique_email,
            "password": "SecurePassword123!"
        }
    )
    assert res_login.status_code == 200
    token_data = res_login.json()
    assert "access_token" in token_data
    assert "refresh_token" in token_data
    assert token_data["token_type"] == "bearer"
    assert token_data["user"]["email"] == unique_email

    # 3. Access protected /me endpoint
    access_token = token_data["access_token"]
    res_me = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert res_me.status_code == 200
    me = res_me.json()
    assert me["id"] == user_data["id"]
    assert me["full_name"] == "Amina Wanjiku"


def test_duplicate_signup_prevention():
    """Validates that duplicate email or phone registrations are rejected with HTTP 409."""
    email = f"dup_{uuid.uuid4().hex[:8]}@ushajua.ke"
    phone = f"+2547{uuid.uuid4().int % 100000000:08d}"

    # First registration
    client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "phone": phone,
            "password": "SecurePassword123!",
            "full_name": "First Registrant"
        }
    )

    # Duplicate email registration
    res_dup_email = client.post(
        "/api/v1/auth/signup",
        json={
            "email": email,
            "phone": f"+2547{uuid.uuid4().int % 100000000:08d}",
            "password": "DifferentPassword123!",
            "full_name": "Second Registrant"
        }
    )
    assert res_dup_email.status_code == 409
    assert "already registered" in res_dup_email.json()["detail"].lower()


def test_invalid_credentials_rejected():
    """Validates rejection of incorrect passwords or unknown users with HTTP 401."""
    res_wrong = client.post(
        "/api/v1/auth/login",
        json={
            "identifier": "nonexistent@ushajua.ke",
            "password": "WrongPassword"
        }
    )
    assert res_wrong.status_code == 401


def test_jwt_refresh_token_flow():
    """Validates that a valid refresh token generates a new access token without re-entering credentials."""
    email = f"refresh_{uuid.uuid4().hex[:8]}@ushajua.ke"
    phone = f"+2547{uuid.uuid4().int % 100000000:08d}"

    client.post(
        "/api/v1/auth/signup",
        json={"email": email, "phone": phone, "password": "SecurePassword123!", "full_name": "Refresh Tester"}
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": "SecurePassword123!"}
    )
    refresh_token = login_res.json()["refresh_token"]

    # Exchange refresh token for fresh access token
    res_refresh = client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": refresh_token}
    )
    assert res_refresh.status_code == 200
    data = res_refresh.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_logout_and_revocation():
    """Validates that after logout, previously issued access token is revoked and returns HTTP 401."""
    email = f"logout_{uuid.uuid4().hex[:8]}@ushajua.ke"
    phone = f"+2547{uuid.uuid4().int % 100000000:08d}"

    client.post(
        "/api/v1/auth/signup",
        json={"email": email, "phone": phone, "password": "SecurePassword123!", "full_name": "Logout Tester"}
    )
    login_res = client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": "SecurePassword123!"}
    )
    access_token = login_res.json()["access_token"]

    # Call logout
    res_logout = client.post(
        "/api/v1/auth/logout",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert res_logout.status_code == 200

    # Attempt to use revoked access token
    res_try = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {access_token}"}
    )
    assert res_try.status_code == 401


def test_password_reset_flow():
    """Validates end-to-end forgot-password and reset-password workflow."""
    email = f"reset_{uuid.uuid4().hex[:8]}@ushajua.ke"
    phone = f"+2547{uuid.uuid4().int % 100000000:08d}"

    client.post(
        "/api/v1/auth/signup",
        json={"email": email, "phone": phone, "password": "OldPassword123!", "full_name": "Reset Tester"}
    )

    # 1. Request reset
    req_res = client.post(
        "/api/v1/auth/forgot-password",
        json={"email": email}
    )
    assert req_res.status_code == 200
    reset_token = req_res.json()["reset_token"]
    assert reset_token is not None

    # 2. Reset password
    confirm_res = client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": reset_token,
            "new_password": "BrandNewPassword456!"
        }
    )
    assert confirm_res.status_code == 200

    # 3. Old password fails
    fail_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": "OldPassword123!"}
    )
    assert fail_login.status_code == 401

    # 4. New password succeeds
    good_login = client.post(
        "/api/v1/auth/login",
        json={"identifier": email, "password": "BrandNewPassword456!"}
    )
    assert good_login.status_code == 200


def test_role_based_access_control():
    """Validates that citizen role cannot access dispatcher/admin operations, but dispatcher can."""
    # 1. Citizen user
    cit_email = f"citizen_rbac_{uuid.uuid4().hex[:8]}@ushajua.ke"
    signup_cit = client.post(
        "/api/v1/auth/signup",
        json={"email": cit_email, "phone": f"+2547{uuid.uuid4().int % 100000000:08d}", "password": "Password123!", "full_name": "Citizen Test", "role": "citizen"}
    )
    assert signup_cit.status_code == 201

    login_cit = client.post(
        "/api/v1/auth/login",
        json={"identifier": cit_email, "password": "Password123!"}
    )
    assert login_cit.status_code == 200
    cit_token = login_cit.json()["access_token"]

    # Ensure an incident and responder exist
    inc = client.post("/api/v1/incidents/report", json={"raw_text": "Role test incident at Juja Road"}).json()
    unit = client.get("/api/v1/responders").json()[0]

    # Citizen attempts to access dispatcher-only endpoint (dispatch responder) -> 403 Forbidden
    res_cit_disp = client.post(
        f"/api/v1/responders/{unit['id']}/dispatch",
        json={"incident_id": inc["id"]},
        headers={"Authorization": f"Bearer {cit_token}"}
    )
    assert res_cit_disp.status_code == 403

    # 2. Dispatcher user
    disp_email = f"disp_rbac_{uuid.uuid4().hex[:8]}@ushajua.ke"
    signup_disp = client.post(
        "/api/v1/auth/signup",
        json={"email": disp_email, "phone": f"+2547{uuid.uuid4().int % 100000000:08d}", "password": "Password123!", "full_name": "Dispatcher Test", "role": "dispatcher"}
    )
    assert signup_disp.status_code == 201

    login_disp = client.post(
        "/api/v1/auth/login",
        json={"identifier": disp_email, "password": "Password123!"}
    )
    assert login_disp.status_code == 200
    disp_token = login_disp.json()["access_token"]

    # Dispatcher accesses dispatch -> succeeds 200 OK
    res_disp_disp = client.post(
        f"/api/v1/responders/{unit['id']}/dispatch",
        json={"incident_id": inc["id"]},
        headers={"Authorization": f"Bearer {disp_token}"}
    )
    assert res_disp_disp.status_code == 200


def test_user_data_isolation_idor_prevention():
    """Validates that User A cannot read or modify User B's account data by changing IDs (BOLA/IDOR)."""
    # Create User A
    user_a_email = f"user_a_{uuid.uuid4().hex[:8]}@ushajua.ke"
    res_a = client.post(
        "/api/v1/auth/signup",
        json={"email": user_a_email, "phone": f"+2547{uuid.uuid4().int % 100000000:08d}", "password": "PasswordA123!", "full_name": "User Alpha"}
    )
    user_a_id = res_a.json()["id"]
    token_a = client.post("/api/v1/auth/login", json={"identifier": user_a_email, "password": "PasswordA123!"}).json()["access_token"]

    # Create User B
    user_b_email = f"user_b_{uuid.uuid4().hex[:8]}@ushajua.ke"
    res_b = client.post(
        "/api/v1/auth/signup",
        json={"email": user_b_email, "phone": f"+2547{uuid.uuid4().int % 100000000:08d}", "password": "PasswordB123!", "full_name": "User Beta"}
    )
    user_b_id = res_b.json()["id"]

    # User A tries to read User B's profile by ID
    res_read_other = client.get(
        f"/api/v1/auth/users/{user_b_id}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_read_other.status_code == 403

    # User A tries to modify User B's profile by ID
    res_edit_other = client.patch(
        f"/api/v1/auth/users/{user_b_id}",
        json={"full_name": "Hacked Name"},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert res_edit_other.status_code == 403
