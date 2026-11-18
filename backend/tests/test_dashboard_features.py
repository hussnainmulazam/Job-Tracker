"""
tests/test_dashboard_features.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for:
- Enhanced Dashboard metrics (new CVs today, pending reviews, messages awaiting reply, interviews this week, funnel by stage, time-to-shortlist)
- Bulk Candidate actions (bulk stage change, bulk delete)
- Candidate and Pipeline Audit Logs
- Recruiter Notifications (list, mark read, mark all read)
- Global Search (candidates, openings, quick actions)
- WhatsApp Unified Inbox conversations feed
"""
from fastapi.testclient import TestClient


def test_dashboard_extended_metrics_and_search(client: TestClient, user_a: dict):
    # 1. Create a Job Opening
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Senior Cloud Architect", "description": "GCP and Kubernetes.", "status": "active"},
        headers=user_a["headers"],
    ).json()

    # 2. Create Candidate
    cand = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Grace Hopper",
            "email": "grace@navy.mil",
            "cv_text": "Pioneer of computer programming and compiler development with COBOL.",
        },
        headers=user_a["headers"],
    ).json()

    # 3. Verify Dashboard extended metrics
    res = client.get("/api/v1/dashboard/stats", headers=user_a["headers"])
    assert res.status_code == 200
    stats = res.json()

    assert stats["new_cvs_today"] >= 1
    assert stats["pending_reviews"] >= 1
    assert stats["messages_awaiting_reply"] >= 0
    assert stats["interviews_this_week"] >= 0
    assert "funnel_by_stage" in stats
    assert len(stats["funnel_by_stage"]) == 5

    # 4. Global Search
    search_res = client.get("/api/v1/search?q=Hopper", headers=user_a["headers"])
    assert search_res.status_code == 200
    search_data = search_res.json()
    assert search_data["total_results"] >= 1
    assert any(c["title"] == "Grace Hopper" for c in search_data["candidates"])

    # Search for job opening
    search_op = client.get("/api/v1/search?q=Architect", headers=user_a["headers"])
    assert search_op.status_code == 200
    assert any(o["title"] == "Senior Cloud Architect" for o in search_op.json()["openings"])

    # Search for quick action
    search_act = client.get("/api/v1/search?q=pipeline", headers=user_a["headers"])
    assert search_act.status_code == 200
    assert any(a["id"] == "action-pipeline" for a in search_act.json()["quick_actions"])


def test_candidate_bulk_actions_and_audit_logs(client: TestClient, user_a: dict):
    # 1. Create Opening
    op = client.post(
        "/api/v1/job-openings",
        json={"title": "Backend Lead", "description": "FastAPI & PostgreSQL.", "status": "active"},
        headers=user_a["headers"],
    ).json()

    # 2. Create 2 candidates
    c1 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Candidate Alpha",
            "email": "alpha@example.com",
            "cv_text": "Experienced Python and FastAPI backend engineer.",
        },
        headers=user_a["headers"],
    ).json()

    c2 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": op["id"],
            "name": "Candidate Beta",
            "email": "beta@example.com",
            "cv_text": "Experienced distributed systems and SQL engineer.",
        },
        headers=user_a["headers"],
    ).json()

    # 3. Bulk stage update to 'interview'
    bulk_res = client.post(
        "/api/v1/candidates/bulk-stage",
        json={"candidate_ids": [c1["id"], c2["id"]], "stage": "interview"},
        headers=user_a["headers"],
    )
    assert bulk_res.status_code == 200
    assert bulk_res.json()["updated_count"] == 2

    # Verify both are now in 'interview' stage
    get_c1 = client.get(f"/api/v1/candidates/{c1['id']}", headers=user_a["headers"]).json()
    assert get_c1["stage"] == "interview"

    # 4. Check candidate audit logs
    logs_res = client.get(f"/api/v1/candidates/{c1['id']}/audit-logs", headers=user_a["headers"])
    assert logs_res.status_code == 200
    logs = logs_res.json()
    assert len(logs) >= 2  # candidate_created and bulk_stage_update
    assert any(l["action"] == "bulk_stage_update" for l in logs)

    # 5. Check recent pipeline audit logs
    recent_logs = client.get("/api/v1/candidates/audit-logs/recent", headers=user_a["headers"]).json()
    assert recent_logs["total"] >= 2

    # 6. Bulk delete
    del_res = client.post(
        "/api/v1/candidates/bulk-delete",
        json={"candidate_ids": [c1["id"], c2["id"]]},
        headers=user_a["headers"],
    )
    assert del_res.status_code == 200
    assert del_res.json()["updated_count"] == 2

    # Verify candidate 404s after delete
    check_del = client.get(f"/api/v1/candidates/{c1['id']}", headers=user_a["headers"])
    assert check_del.status_code == 404


def test_notifications_workflow(client: TestClient, user_a: dict):
    # 1. Fetch initial notifications
    res = client.get("/api/v1/notifications", headers=user_a["headers"])
    assert res.status_code == 200
    data = res.json()
    assert "items" in data
    assert "unread_count" in data

    # 2. Mark all as read
    mark_all = client.post("/api/v1/notifications/read-all", headers=user_a["headers"])
    assert mark_all.status_code == 200

    # 3. Check unread count is 0
    after_res = client.get("/api/v1/notifications", headers=user_a["headers"]).json()
    assert after_res["unread_count"] == 0


def test_whatsapp_conversations_inbox_feed(client: TestClient, user_a: dict):
    # Fetch unified inbox conversations
    res = client.get("/api/v1/whatsapp/conversations", headers=user_a["headers"])
    assert res.status_code == 200
    feed = res.json()
    assert "conversations" in feed
    assert "total_conversations" in feed
    assert "awaiting_reply_count" in feed
