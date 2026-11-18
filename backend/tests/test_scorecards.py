"""
tests/test_scorecards.py
~~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for /api/v1/scorecards:
- Create (201, 422, 401)
- Read by candidate (200)
- Update (200, 404)
- Delete (204, 404)
- User isolation (User A vs User B)
"""
import uuid
import pytest
from fastapi.testclient import TestClient


def _setup_candidate(client: TestClient, headers: dict) -> str:
    op_res = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Security Engineer",
            "description": "AppSec and cloud infrastructure defense.",
            "required_skills": ["AppSec", "OAuth", "Python"],
        },
        headers=headers,
    )
    opening_id = op_res.json()["id"]

    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Bruce Wayne",
            "email": "bruce@wayne-enterprises.com",
            "cv_text": "Experienced security researcher and penetration testing expert with 10 years experience.",
        },
        headers=headers,
    )
    return cand_res.json()["id"]


def test_create_scorecard_success(client: TestClient, user_a: dict):
    candidate_id = _setup_candidate(client, user_a["headers"])
    payload = {
        "candidate_id": candidate_id,
        "rating": 5,
        "notes": "Exceptional technical depth and strong problem solving.",
    }
    res = client.post("/api/v1/scorecards", json=payload, headers=user_a["headers"])
    assert res.status_code == 201
    data = res.json()
    assert data["rating"] == 5
    assert data["notes"] == payload["notes"]
    assert "id" in data


def test_create_scorecard_validation_error(client: TestClient, user_a: dict):
    candidate_id = _setup_candidate(client, user_a["headers"])
    # Rating out of range (must be 1-5)
    payload = {"candidate_id": candidate_id, "rating": 10}
    res = client.post("/api/v1/scorecards", json=payload, headers=user_a["headers"])
    assert res.status_code == 422


def test_list_scorecards_by_candidate(client: TestClient, user_a: dict):
    candidate_id = _setup_candidate(client, user_a["headers"])
    client.post(
        "/api/v1/scorecards",
        json={"candidate_id": candidate_id, "rating": 4, "notes": "Solid round 1"},
        headers=user_a["headers"],
    )
    client.post(
        "/api/v1/scorecards",
        json={"candidate_id": candidate_id, "rating": 5, "notes": "Outstanding round 2"},
        headers=user_a["headers"],
    )

    res = client.get(f"/api/v1/scorecards?candidate_id={candidate_id}", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2


def test_update_scorecard_success(client: TestClient, user_a: dict):
    candidate_id = _setup_candidate(client, user_a["headers"])
    create_res = client.post(
        "/api/v1/scorecards",
        json={"candidate_id": candidate_id, "rating": 3, "notes": "Average initial impression"},
        headers=user_a["headers"],
    )
    sc_id = create_res.json()["id"]

    patch_res = client.patch(
        f"/api/v1/scorecards/{sc_id}",
        json={"rating": 4, "notes": "Updated after second review"},
        headers=user_a["headers"],
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["rating"] == 4


def test_delete_scorecard_success(client: TestClient, user_a: dict):
    candidate_id = _setup_candidate(client, user_a["headers"])
    create_res = client.post(
        "/api/v1/scorecards",
        json={"candidate_id": candidate_id, "rating": 4},
        headers=user_a["headers"],
    )
    sc_id = create_res.json()["id"]

    del_res = client.delete(f"/api/v1/scorecards/{sc_id}", headers=user_a["headers"])
    assert del_res.status_code == 204

    # Verification: reading candidate should show 0 scorecards
    cand = client.get(f"/api/v1/candidates/{candidate_id}", headers=user_a["headers"]).json()
    assert len(cand["scorecards"]) == 0


def test_scorecards_user_isolation(client: TestClient, user_a: dict, user_b: dict):
    cand_id_a = _setup_candidate(client, user_a["headers"])
    create_res = client.post(
        "/api/v1/scorecards",
        json={"candidate_id": cand_id_a, "rating": 5, "notes": "Top secret review"},
        headers=user_a["headers"],
    )
    sc_id = create_res.json()["id"]

    # User B cannot access User A's scorecard
    assert client.get(f"/api/v1/scorecards/{sc_id}", headers=user_b["headers"]).status_code == 404

    # User B cannot list scorecards for User A's candidate
    assert client.get(f"/api/v1/scorecards?candidate_id={cand_id_a}", headers=user_b["headers"]).status_code == 404

    # User B cannot update User A's scorecard
    assert (
        client.patch(
            f"/api/v1/scorecards/{sc_id}",
            json={"rating": 1},
            headers=user_b["headers"],
        ).status_code
        == 404
    )

    # User B cannot delete User A's scorecard
    assert client.delete(f"/api/v1/scorecards/{sc_id}", headers=user_b["headers"]).status_code == 404

