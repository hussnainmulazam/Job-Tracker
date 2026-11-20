"""
backend/tests/test_cv_review.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for the CV Review Flow:
1. Opening pass mark (default 80, editable per opening)
2. Candidate recommendation categorization (Recommended, Borderline, Not recommended)
3. 'Needs HR Review' queue listing
4. Single & bulk Approve action:
   - Sets stage to shortlisted
   - Creates tokenized scheduling link
   - Dispatches CV Passed and Job Details emails
   - Records audit trail
5. Single & bulk Reject action:
   - Sets stage to rejected
   - Dispatches Rejection email
   - Records audit trail
6. Nothing sent before HR decides
"""
import uuid
from fastapi.testclient import TestClient


def test_opening_pass_mark_default_and_editable(client: TestClient, user_a: dict):
    # 1. Create opening - should default pass_mark to 80
    create_payload = {
        "title": "Senior Cloud Infrastructure Engineer",
        "description": "Looking for a seasoned engineer with AWS, Terraform, Docker, and Kubernetes expertise.",
        "required_skills": ["AWS", "Terraform", "Docker", "Kubernetes"],
    }
    r = client.post("/api/v1/job-openings", json=create_payload, headers=user_a["headers"])
    assert r.status_code == 201
    opening_data = r.json()
    opening_id = opening_data["id"]
    assert opening_data["pass_mark"] == 80

    # 2. Update pass mark to 75
    r_patch = client.patch(
        f"/api/v1/cv-review/opening/{opening_id}/pass-mark",
        json={"pass_mark": 75},
        headers=user_a["headers"],
    )
    assert r_patch.status_code == 200
    assert r_patch.json()["pass_mark"] == 75

    # 3. Validation error on out-of-range pass mark
    r_invalid = client.patch(
        f"/api/v1/cv-review/opening/{opening_id}/pass-mark",
        json={"pass_mark": 120},
        headers=user_a["headers"],
    )
    assert r_invalid.status_code == 422 or r_invalid.status_code == 400


def test_cv_review_queue_and_recommendation_flow(client: TestClient, user_a: dict):
    # 1. Create Opening with pass_mark=80
    r_op = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Staff Python Backend Architect",
            "description": "Deep expertise in Python, FastAPI, PostgreSQL, architecture design.",
            "required_skills": ["Python", "FastAPI", "PostgreSQL"],
        },
        headers=user_a["headers"],
    )
    assert r_op.status_code == 201
    opening_id = r_op.json()["id"]

    # 2. Ingest 3 candidates with different scores:
    # Cand 1: Strong fit (Score: 88 -> Recommended)
    # Cand 2: Borderline fit (Score: 68 -> Borderline)
    # Cand 3: Low fit (Score: 45 -> Not recommended)
    cands = [
        {
            "name": "Jordan High",
            "email": "jordan.high@example.com",
            "cv_text": "Python architect with 10 years experience building scalable FastAPI microservices and PostgreSQL schemas.",
            "score": 88.0,
            "matched_skills": ["Python", "FastAPI", "PostgreSQL"],
            "missing_skills": [],
            "summary": "Outstanding technical profile aligning closely with requirements.",
        },
        {
            "name": "Morgan Border",
            "email": "morgan.border@example.com",
            "cv_text": "Backend developer with 3 years Python and Django experience. Eager to learn FastAPI and advanced databases.",
            "score": 68.0,
            "matched_skills": ["Python"],
            "missing_skills": ["FastAPI", "PostgreSQL"],
            "summary": "Decent foundational skills but missing core modern API stack.",
        },
        {
            "name": "Riley Low",
            "email": "riley.low@example.com",
            "cv_text": "Graphic designer with some frontend HTML and CSS experience. No backend or Python background.",
            "score": 45.0,
            "matched_skills": [],
            "missing_skills": ["Python", "FastAPI", "PostgreSQL"],
            "summary": "Candidate experience is in design rather than backend engineering.",
        },
    ]

    cand_ids = []
    for c in cands:
        r_c = client.post(
            "/api/v1/candidates",
            json={
                "opening_id": opening_id,
                "name": c["name"],
                "email": c["email"],
                "cv_text": c["cv_text"],
            },
            headers=user_a["headers"],
        )
        assert r_c.status_code == 201
        cid = r_c.json()["id"]
        cand_ids.append(cid)

        # Update candidate with scoring data
        r_p = client.patch(
            f"/api/v1/candidates/{cid}",
            json={
                "score": c["score"],
                "matched_skills": c["matched_skills"],
                "missing_skills": c["missing_skills"],
                "summary": c["summary"],
            },
            headers=user_a["headers"],
        )
        assert r_p.status_code == 200

    # 3. Query the 'Needs HR Review' queue (status=pending)
    r_queue = client.get(
        f"/api/v1/cv-review/queue?opening_id={opening_id}&status=pending",
        headers=user_a["headers"],
    )
    assert r_queue.status_code == 200
    queue_items = r_queue.json()
    assert len(queue_items) == 3

    # Check recommendations relative to pass mark 80
    high_item = next(item for item in queue_items if item["name"] == "Jordan High")
    border_item = next(item for item in queue_items if item["name"] == "Morgan Border")
    low_item = next(item for item in queue_items if item["name"] == "Riley Low")

    assert high_item["score"] == 88.0
    assert high_item["recommendation"] == "Recommended"
    assert high_item["review_status"] == "pending"

    assert border_item["score"] == 68.0
    assert border_item["recommendation"] == "Borderline"
    assert border_item["review_status"] == "pending"

    assert low_item["score"] == 45.0
    assert low_item["recommendation"] == "Not recommended"
    assert low_item["review_status"] == "pending"


def test_approve_candidate_dispatches_emails_and_scheduling_link(client: TestClient, user_a: dict):
    # Setup opening & candidate
    r_op = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Senior AI Systems Lead",
            "description": "Architect autonomous multi-agent pipelines and LLM orchestration systems.",
            "required_skills": ["Python", "LLMs", "FastAPI"],
        },
        headers=user_a["headers"],
    )
    opening_id = r_op.json()["id"]

    r_c = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Taylor Swiftly",
            "email": "taylor.swiftly@example.com",
            "cv_text": "AI engineer with deep experience in prompt orchestration, LangChain, and Python systems.",
        },
        headers=user_a["headers"],
    )
    cid = r_c.json()["id"]

    # 1. Approve Candidate
    decide_payload = {
        "candidate_ids": [cid],
        "action": "approve",
        "notes": "Strong background in LLM systems.",
    }
    r_dec = client.post("/api/v1/cv-review/decision", json=decide_payload, headers=user_a["headers"])
    assert r_dec.status_code == 200
    dec_res = r_dec.json()
    assert dec_res["approved_count"] == 1
    assert dec_res["rejected_count"] == 0

    item_res = dec_res["results"][0]
    assert item_res["status"] == "approved"
    assert item_res["stage"] == "shortlisted"
    assert "CV Passed" in item_res["emails_sent"]
    assert "Job Details" in item_res["emails_sent"]
    assert item_res["scheduling_link"] is not None
    assert "/schedule/" in item_res["scheduling_link"]

    # 2. Candidate should now be shortlisted and review_status="approved"
    r_get = client.get(f"/api/v1/candidates/{cid}", headers=user_a["headers"])
    assert r_get.status_code == 200
    cand_data = r_get.json()
    assert cand_data["stage"] == "shortlisted"
    assert cand_data["review_status"] == "approved"

    # 3. Verify decision is in Audit Trail
    r_audit = client.get("/api/v1/candidates/audit-logs/recent", headers=user_a["headers"])
    assert r_audit.status_code == 200
    audit_logs = r_audit.json()["items"]
    approved_audit = next((a for a in audit_logs if a["action"] == "cv_review_approved" and a["candidate_id"] == cid), None)
    assert approved_audit is not None
    assert "CV Passed & Job Details emails sent with scheduling link" in approved_audit["details"]


def test_reject_candidate_dispatches_rejection_email(client: TestClient, user_a: dict):
    # Setup opening & candidate
    r_op = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Principal Rust Engineer",
            "description": "Kernel level memory-safe concurrency and systems programming.",
            "required_skills": ["Rust", "Tokio"],
        },
        headers=user_a["headers"],
    )
    opening_id = r_op.json()["id"]

    r_c = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Casey Unfit",
            "email": "casey.unfit@example.com",
            "cv_text": "Non-technical applicant with no programming experience.",
        },
        headers=user_a["headers"],
    )
    cid = r_c.json()["id"]

    # Reject Candidate
    decide_payload = {
        "candidate_ids": [cid],
        "action": "reject",
        "notes": "Does not meet basic technical qualifications.",
    }
    r_dec = client.post("/api/v1/cv-review/decision", json=decide_payload, headers=user_a["headers"])
    assert r_dec.status_code == 200
    dec_res = r_dec.json()
    assert dec_res["approved_count"] == 0
    assert dec_res["rejected_count"] == 1

    item_res = dec_res["results"][0]
    assert item_res["status"] == "rejected"
    assert item_res["stage"] == "rejected"
    assert "Rejection" in item_res["emails_sent"]

    # Candidate should now be rejected
    r_get = client.get(f"/api/v1/candidates/{cid}", headers=user_a["headers"])
    assert r_get.status_code == 200
    cand_data = r_get.json()
    assert cand_data["stage"] == "rejected"
    assert cand_data["review_status"] == "rejected"

    # Verify decision is in Audit Trail
    r_audit = client.get("/api/v1/candidates/audit-logs/recent", headers=user_a["headers"])
    assert r_audit.status_code == 200
    audit_logs = r_audit.json()["items"]
    rejected_audit = next((a for a in audit_logs if a["action"] == "cv_review_rejected" and a["candidate_id"] == cid), None)
    assert rejected_audit is not None
    assert "Rejection email dispatched" in rejected_audit["details"]


def test_bulk_approve_and_reject_flow(client: TestClient, user_a: dict):
    # Setup opening
    r_op = client.post(
        "/api/v1/job-openings",
        json={
            "title": "DevOps Architect",
            "description": "Managing cloud infrastructure and CI/CD pipelines.",
            "required_skills": ["Kubernetes", "Terraform"],
        },
        headers=user_a["headers"],
    )
    opening_id = r_op.json()["id"]

    # Create 4 candidates
    c_ids = []
    for i in range(4):
        r_c = client.post(
            "/api/v1/candidates",
            json={
                "opening_id": opening_id,
                "name": f"Candidate {i}",
                "email": f"candidate{i}@example.com",
                "cv_text": "DevOps engineer with Kubernetes and cloud infrastructure experience.",
            },
            headers=user_a["headers"],
        )
        assert r_c.status_code == 201
        c_ids.append(r_c.json()["id"])

    # Bulk Approve candidates 0 and 1
    r_bulk_app = client.post(
        "/api/v1/cv-review/decision",
        json={"candidate_ids": [c_ids[0], c_ids[1]], "action": "approve"},
        headers=user_a["headers"],
    )
    assert r_bulk_app.status_code == 200
    assert r_bulk_app.json()["approved_count"] == 2

    # Bulk Reject candidates 2 and 3
    r_bulk_rej = client.post(
        "/api/v1/cv-review/decision",
        json={"candidate_ids": [c_ids[2], c_ids[3]], "action": "reject"},
        headers=user_a["headers"],
    )
    assert r_bulk_rej.status_code == 200
    assert r_bulk_rej.json()["rejected_count"] == 2

    # Check queue: pending queue should now have 0 candidates
    r_pending = client.get(
        f"/api/v1/cv-review/queue?opening_id={opening_id}&status=pending",
        headers=user_a["headers"],
    )
    assert r_pending.status_code == 200
    assert len(r_pending.json()) == 0

    # Approved queue has 2
    r_approved = client.get(
        f"/api/v1/cv-review/queue?opening_id={opening_id}&status=approved",
        headers=user_a["headers"],
    )
    assert r_approved.status_code == 200
    assert len(r_approved.json()) == 2

    # Rejected queue has 2
    r_rejected = client.get(
        f"/api/v1/cv-review/queue?opening_id={opening_id}&status=rejected",
        headers=user_a["headers"],
    )
    assert r_rejected.status_code == 200
    assert len(r_rejected.json()) == 2
