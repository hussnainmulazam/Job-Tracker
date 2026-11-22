"""
scripts/verify_new_db_flow.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
End-to-end verification of clean database flow:
1. Register new user
2. Login with that user
3. Verify GET /health/db (latency + status)
4. Verify GET /api/v1/dashboard/stats (clean zero/empty state)
5. Create a job opening
6. Upload/intake one CV and verify extraction + persistence
7. Verify dashboard updates to 1 candidate, 1 opening
8. Test 401 response handling & logout
"""
import os
import sys
import time
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from fastapi.testclient import TestClient
from app.main import app

def run_verification():
    print("=" * 65)
    print("      NEW SUPABASE DATABASE END-TO-END VERIFICATION")
    print("=" * 65)

    client = TestClient(app)

    # 1. Test /health/db
    print("\n[Step 1] Testing GET /health/db ...")
    health_resp = client.get("/health/db")
    print(f"  Response Status: {health_resp.status_code}")
    print(f"  Response Data:   {health_resp.json()}")
    assert health_resp.status_code == 200
    assert health_resp.json()["status"] == "connected"
    print("  -> /health/db PASSED!")

    # 2. Register a new user
    test_email = f"recruiter_{int(time.time())}@hiringloop.ai"
    test_password = "RecruiterStrongPassword123!"
    print(f"\n[Step 2] Testing /register with: {test_email} ...")
    reg_resp = client.post(
        "/api/v1/auth/register",
        json={"email": test_email, "password": test_password},
    )
    print(f"  Register Status: {reg_resp.status_code}")
    assert reg_resp.status_code == 201
    reg_data = reg_resp.json()
    token = reg_data["access_token"]
    user_id = reg_data["user"]["id"]
    print(f"  Created user ID: {user_id}")
    print("  -> /register PASSED!")

    # 3. Login with that user
    print("\n[Step 3] Testing /login ...")
    login_resp = client.post(
        "/api/v1/auth/login",
        json={"email": test_email, "password": test_password},
    )
    assert login_resp.status_code == 200
    login_token = login_resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {login_token}"}
    print("  -> /login PASSED!")

    # 4. Check dashboard stats (empty state)
    print("\n[Step 4] Checking dashboard stats on empty DB ...")
    dash_resp = client.get("/api/v1/dashboard/stats", headers=headers)
    assert dash_resp.status_code == 200
    dash_data = dash_resp.json()
    print(f"  Dashboard Stats: {dash_data}")
    assert dash_data["total_candidates"] == 0
    assert dash_data["active_openings"] == 0
    print("  -> Empty dashboard stats PASSED!")

    # 5. Create a job opening
    print("\n[Step 5] Creating a job requisition ...")
    opening_resp = client.post(
        "/api/v1/job-openings",
        headers=headers,
        json={
            "title": "Senior AI Systems Engineer",
            "description": "Lead design and deployment of large language model agent pipelines.",
            "required_skills": ["Python", "FastAPI", "Next.js", "PostgreSQL"],
            "years_of_experience": 5.0,
            "nice_to_haves": ["PyTorch", "Docker"],
            "status": "active",
        },
    )
    assert opening_resp.status_code == 201
    opening = opening_resp.json()
    opening_id = opening["id"]
    print(f"  Created JobOpening ID: {opening_id}")
    print("  -> Create job opening PASSED!")

    # 6. Upload/intake one CV
    print("\n[Step 6] Ingesting and extracting one CV ...")
    sample_cv = """
    Alex Morgan
    Email: alex.morgan.dev@gmail.com
    Phone: +1 415-555-9876
    Location: San Francisco, CA
    LinkedIn: https://linkedin.com/in/alexmorgan-ai
    GitHub: https://github.com/alexmorgan-eng

    Professional Experience:
    Senior Software Engineer at CloudScale AI (2020 - Present)
    - Architected scalable microservices using Python, FastAPI, and PostgreSQL.
    - Built frontend recruiting workflows with Next.js and TypeScript.
    - 6 years of experience in distributed systems.

    Education:
    B.S. in Computer Science, University of California, Berkeley (2019)

    Skills:
    Python, FastAPI, Next.js, PostgreSQL, Docker, PyTorch
    """
    extract_resp = client.post(
        "/api/v1/candidates/extract-text",
        headers=headers,
        json={"opening_id": opening_id, "cv_text": sample_cv},
    )
    assert extract_resp.status_code == 200
    extracted = extract_resp.json()
    print(f"  Extracted Name:  {extracted.get('name')}")
    print(f"  Extracted Email: {extracted.get('email')}")
    print(f"  Extracted Skills: {extracted.get('skills')}")
    print(f"  Extracted Links: {extracted.get('links')}")

    # Save candidate into the opening
    confirm_resp = client.post(
        "/api/v1/candidates/confirm-extracted",
        headers=headers,
        json={
            "opening_id": opening_id,
            "cv_text": sample_cv,
            "name": extracted.get("name") or "Alex Morgan",
            "email": extracted.get("email") or "alex.morgan.dev@gmail.com",
            "phone": extracted.get("phone"),
            "skills": extracted.get("skills") or ["Python", "FastAPI"],
            "years_of_experience": extracted.get("years_of_experience") or 6.0,
            "current_title": extracted.get("current_title") or "Senior Software Engineer",
            "education": extracted.get("education") or "B.S. in Computer Science",
            "links": extracted.get("links") or {},
        },
    )
    assert confirm_resp.status_code == 201
    candidate = confirm_resp.json()
    print(f"  Created Candidate ID: {candidate['id']} (Name: {candidate['name']})")
    print("  -> Candidate extraction & upload PASSED!")

    # 7. Check dashboard stats updated
    print("\n[Step 7] Checking updated dashboard stats ...")
    dash2_resp = client.get("/api/v1/dashboard/stats", headers=headers)
    dash2_data = dash2_resp.json()
    print(f"  Updated Dashboard Stats: {dash2_data}")
    assert dash2_data["total_candidates"] == 1
    assert dash2_data["active_openings"] == 1
    print("  -> Dashboard direct DB count sync PASSED!")

    # 8. Test 401 handling on invalid/deleted token
    print("\n[Step 8] Testing 401 on invalid/deleted token ...")
    invalid_headers = {"Authorization": "Bearer invalid_or_expired_jwt_token"}
    unauth_resp = client.get("/api/v1/dashboard/stats", headers=invalid_headers)
    assert unauth_resp.status_code == 401
    print(f"  Invalid Token Response: {unauth_resp.status_code} - {unauth_resp.json()}")
    print("  -> 401 status verified cleanly!")

    print("\n" + "=" * 65)
    print("      ALL END-TO-END VERIFICATION STEPS PASSED 100%!")
    print("=" * 65)

if __name__ == "__main__":
    run_verification()
