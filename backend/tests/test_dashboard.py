"""
tests/test_dashboard.py
~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for /api/v1/dashboard/stats:
- Real queries on Supabase Postgres tables (zero mock data)
- Metrics calculation (openings, candidates, scores, stage breakdown)
- Recruiter data isolation (User A vs User B)
- 401 Unauthorized for unauthenticated requests
"""
from fastapi.testclient import TestClient


def test_dashboard_stats_empty(client: TestClient, user_a: dict):
    """Initial dashboard stats should be zeroes with no data."""
    res = client.get("/api/v1/dashboard/stats", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()
    assert data["total_openings"] == 0
    assert data["active_openings"] == 0
    assert data["total_candidates"] == 0
    assert data["screened_candidates"] == 0
    assert data["shortlisted_candidates"] == 0
    assert data["average_score"] is None
    assert data["stage_breakdown"]["applied"] == 0
    assert data["recent_candidates"] == []


def test_dashboard_stats_computed_real(client: TestClient, user_a: dict):
    """Dashboard metrics computed from live database rows."""
    # 1. Create an active opening
    op1 = client.post(
        "/api/v1/job-openings",
        json={"title": "ML Engineer", "description": "PyTorch model deployment.", "status": "active"},
        headers=user_a["headers"],
    ).json()

    # 2. Create a paused opening
    op2 = client.post(
        "/api/v1/job-openings",
        json={"title": "QA Lead", "description": "Automated regression testing.", "status": "paused"},
        headers=user_a["headers"],
    ).json()

    # 3. Create Candidate 1 (scored 80, stage interview)
    c1 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op1["id"],
            "name": "Alan Turing",
            "email": "alan@cambridge.edu",
            "cv_text": "Father of theoretical computer science and AI with decades of research.",
        },
        headers=user_a["headers"],
    ).json()

    # Update candidate 1 with score 80 and stage interview
    client.patch(
        f"/api/v1/candidates/{c1['id']}",
        json={"score": 80.0, "stage": "interview"},
        headers=user_a["headers"],
    )

    # 4. Create Candidate 2 (scored 90, stage offer)
    c2 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op1["id"],
            "name": "Ada Lovelace",
            "email": "ada@lovelace.org",
            "cv_text": "First computer programmer with foundational algorithm development experience.",
        },
        headers=user_a["headers"],
    ).json()

    client.patch(
        f"/api/v1/candidates/{c2['id']}",
        json={"score": 90.0, "stage": "offer"},
        headers=user_a["headers"],
    )

    # 5. Create Candidate 3 (unscreened, stage applied)
    client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op2["id"],
            "name": "Claude Shannon",
            "email": "claude@bell-labs.com",
            "cv_text": "Information theorist with cryptography background.",
        },
        headers=user_a["headers"],
    )

    # Query dashboard stats
    res = client.get("/api/v1/dashboard/stats", headers=user_a["headers"])
    assert res.status_code == 200
    stats = res.json()

    assert stats["total_openings"] == 2
    assert stats["active_openings"] == 1
    assert stats["total_candidates"] == 3
    assert stats["screened_candidates"] == 2
    assert stats["shortlisted_candidates"] == 2  # 1 interview + 1 offer
    # Average score = (80 + 90) / 2 = 85.0
    assert stats["average_score"] == 85.0
    assert stats["stage_breakdown"]["applied"] == 1
    assert stats["stage_breakdown"]["interview"] == 1
    assert stats["stage_breakdown"]["offer"] == 1
    assert stats["stage_breakdown"]["rejected"] == 0
    assert len(stats["recent_candidates"]) == 3
    assert len(stats["openings_summary"]) == 2


def test_dashboard_user_isolation(client: TestClient, user_a: dict, user_b: dict):
    """User B should see 0 stats even if User A has active openings and candidates."""
    # User A creates an opening
    client.post(
        "/api/v1/job-openings",
        json={"title": "Private Role A", "description": "Confidential role A.", "status": "active"},
        headers=user_a["headers"],
    )

    # User B queries stats -> must be 0
    res_b = client.get("/api/v1/dashboard/stats", headers=user_b["headers"])
    assert res_b.status_code == 200
    data_b = res_b.json()
    assert data_b["total_openings"] == 0
    assert data_b["total_candidates"] == 0


def test_dashboard_unauthorized_401(client: TestClient):
    """Unauthenticated call to /dashboard/stats must return 401."""
    res = client.get("/api/v1/dashboard/stats")
    assert res.status_code == 401
