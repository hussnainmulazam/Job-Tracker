from fastapi.testclient import TestClient
from unittest.mock import MagicMock
from app.core.config import settings
from app.db import get_session
from app.main import app


def test_health_endpoint(client: TestClient):
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "connected"
    assert data["app"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION
    assert data["environment"] == settings.ENVIRONMENT


def test_health_endpoint_db_degraded():
    """When DB query throws, status returns degraded."""
    mock_session = MagicMock()
    mock_session.exec.side_effect = Exception("DB connection timeout")

    def get_broken_session():
        yield mock_session

    app.dependency_overrides[get_session] = get_broken_session
    try:
        from unittest.mock import patch
        with patch("app.main.init_db", return_value=None), patch("app.db.init_db", return_value=None):
            with TestClient(app) as test_client:
                response = test_client.get("/health")
                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "degraded"
                assert "unreachable" in data["database"]
    finally:
        app.dependency_overrides.clear()


def test_root_endpoint(client: TestClient):
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert "message" in data
    assert data["health"] == "/health"

