"""
tests/test_auth.py
~~~~~~~~~~~~~~~~~~
Pytest test suite for authentication endpoints:
  - POST /api/v1/auth/register
  - POST /api/v1/auth/login
  - GET  /api/v1/auth/me
"""
from fastapi.testclient import TestClient


def test_register_success(client: TestClient):
    """Registering a new account returns 201, a JWT access_token, and user profile."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "developer@example.com", "password": "SecurePassword123!"},
    )
    assert response.status_code == 201
    data = response.json()

    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert "user" in data

    user = data["user"]
    assert user["email"] == "developer@example.com"
    assert "id" in user
    assert "created_at" in user

    # Security check: hashed_password MUST NEVER be returned in any schema
    assert "hashed_password" not in user
    assert "password" not in user


def test_register_duplicate_email_fails(client: TestClient):
    """Registering with an already existing email returns 409 Conflict."""
    payload = {"email": "duplicate@example.com", "password": "Password123!"}
    res1 = client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 409
    assert "already exists" in res2.json()["detail"].lower()


def test_register_short_password_fails(client: TestClient):
    """Passwords shorter than 8 characters are rejected with 422 Unprocessable Entity."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "shortpass@example.com", "password": "short"},
    )
    assert response.status_code == 422
    errors = response.json().get("detail", [])
    assert any("at least 8 characters" in str(err) for err in errors)


def test_register_invalid_email_fails(client: TestClient):
    """Malformed emails are rejected with 422 Unprocessable Entity."""
    response = client.post(
        "/api/v1/auth/register",
        json={"email": "not-a-valid-email", "password": "Password123!"},
    )
    assert response.status_code == 422


def test_login_success(client: TestClient):
    """Logging in with valid credentials returns 200 and a JWT token."""
    # First, register
    client.post(
        "/api/v1/auth/register",
        json={"email": "loginuser@example.com", "password": "MySecretPassword123!"},
    )

    # Then, login
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "loginuser@example.com", "password": "MySecretPassword123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["user"]["email"] == "loginuser@example.com"
    assert "hashed_password" not in data["user"]


def test_login_wrong_password_fails(client: TestClient):
    """Login with wrong password returns 401 Unauthorized."""
    client.post(
        "/api/v1/auth/register",
        json={"email": "user@example.com", "password": "CorrectPassword123!"},
    )

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "WrongPassword999!"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_login_unknown_email_fails(client: TestClient):
    """Login with unknown email returns 401 Unauthorized (generic message prevents enumeration)."""
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "SomePassword123!"},
    )
    assert response.status_code == 401
    assert "Invalid email or password" in response.json()["detail"]


def test_login_validation_error(client: TestClient):
    """Missing required credentials or invalid types return 422 Unprocessable Entity."""
    # Missing password
    res1 = client.post("/api/v1/auth/login", json={"email": "user@example.com"})
    assert res1.status_code == 422

    # Missing email
    res2 = client.post("/api/v1/auth/login", json={"password": "Password123!"})
    assert res2.status_code == 422

    # Malformed email
    res3 = client.post("/api/v1/auth/login", json={"email": "not-an-email", "password": "Password123!"})
    assert res3.status_code == 422


def test_login_form_oauth2_success(client: TestClient):
    """OAuth2 form-compatible login (/login/form) returns 200 with access token."""
    client.post(
        "/api/v1/auth/register",
        json={"email": "formuser@example.com", "password": "Password123!"},
    )

    response = client.post(
        "/api/v1/auth/login/form",
        data={"username": "formuser@example.com", "password": "Password123!"},
    )
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"


def test_login_form_oauth2_wrong_password_fails(client: TestClient):
    """OAuth2 form-compatible login with wrong password returns 401."""
    client.post(
        "/api/v1/auth/register",
        json={"email": "formuser2@example.com", "password": "Password123!"},
    )

    response = client.post(
        "/api/v1/auth/login/form",
        data={"username": "formuser2@example.com", "password": "WrongPassword!"},
    )
    assert response.status_code == 401


def test_login_form_oauth2_validation_error(client: TestClient):
    """Missing form fields returns 422 Unprocessable Entity."""
    response = client.post("/api/v1/auth/login/form", data={})
    assert response.status_code == 422


def test_get_me_authenticated(client: TestClient, register_user):
    """GET /auth/me returns the profile of the authenticated user."""
    user, headers = register_user(email="me@example.com", password="Password123!")

    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 200
    data = response.json()
    assert data["id"] == user["id"]
    assert data["email"] == "me@example.com"
    assert "hashed_password" not in data


def test_get_me_unauthorized(client: TestClient):
    """GET /auth/me without an Authorization header returns 401 Unauthorized."""
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.headers.get("WWW-Authenticate") == "Bearer"


def test_get_me_invalid_token(client: TestClient):
    """GET /auth/me with an invalid or tampered token returns 401 Unauthorized."""
    headers = {"Authorization": "Bearer this-is-not-a-valid-jwt-token"}
    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 401
    assert "Could not validate credentials" in response.json()["detail"]


def test_get_me_nonexistent_user_token_fails(client: TestClient):
    """GET /auth/me with a token referencing a deleted/nonexistent user returns 401."""
    from app.core.security import create_access_token
    import uuid

    fake_id = str(uuid.uuid4())
    token = create_access_token(fake_id)
    headers = {"Authorization": f"Bearer {token}"}

    response = client.get("/api/v1/auth/me", headers=headers)
    assert response.status_code == 401


