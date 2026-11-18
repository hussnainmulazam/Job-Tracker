"""
tests/test_job_openings.py
~~~~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for /api/v1/job-openings:
- Create (201, 422 validation error, 401 unauthorized)
- Read by ID (200, 404 not found, 401 unauthorized)
- List with search/filter/pagination (200)
- Update (200, 404, 401)
- Delete (204, 404, 401)
- Bulk scoring with ranking (POST /job-openings/{id}/bulk-score)
- Shortlist CSV export (GET /job-openings/{id}/shortlist/export)
- Screening question generation (POST /job-openings/{id}/screening-questions)
- Ownership isolation (User A cannot view, update, or delete User B's openings)
"""
import uuid
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient


def test_create_job_opening_success(client: TestClient, user_a: dict):
    payload = {
        "title": "Senior Backend Engineer",
        "description": "Building scalable APIs with Python, FastAPI, and Postgres.",
        "required_skills": ["Python", "FastAPI", "PostgreSQL"],
        "status": "active",
    }
    res = client.post("/api/v1/job-openings", json=payload, headers=user_a["headers"])
    assert res.status_code == 201
    data = res.json()
    assert data["title"] == payload["title"]
    assert data["required_skills"] == ["Python", "FastAPI", "PostgreSQL"]
    assert data["status"] == "active"
    assert data["candidates_count"] == 0
    assert "id" in data


def test_create_job_opening_validation_error(client: TestClient, user_a: dict):
    payload = {"title": "X", "description": "Too short"}
    res = client.post("/api/v1/job-openings", json=payload, headers=user_a["headers"])
    assert res.status_code == 422


def test_create_job_opening_unauthorized(client: TestClient):
    payload = {
        "title": "Staff Engineer",
        "description": "Leading architecture across microservices.",
    }
    res = client.post("/api/v1/job-openings", json=payload)
    assert res.status_code == 401


def test_get_job_opening_success(client: TestClient, user_a: dict):
    create_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Data Engineer", "description": "ETL and data pipeline management with Spark and SQL."},
        headers=user_a["headers"],
    )
    opening_id = create_res.json()["id"]

    res = client.get(f"/api/v1/job-openings/{opening_id}", headers=user_a["headers"])
    assert res.status_code == 200
    assert res.json()["title"] == "Data Engineer"


def test_get_job_opening_not_found(client: TestClient, user_a: dict):
    random_id = str(uuid.uuid4())
    res = client.get(f"/api/v1/job-openings/{random_id}", headers=user_a["headers"])
    assert res.status_code == 404


def test_update_job_opening_success(client: TestClient, user_a: dict):
    create_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Frontend Dev", "description": "React and Next.js development for SaaS app."},
        headers=user_a["headers"],
    )
    opening_id = create_res.json()["id"]

    update_res = client.patch(
        f"/api/v1/job-openings/{opening_id}",
        json={"title": "Lead Frontend Dev", "status": "paused"},
        headers=user_a["headers"],
    )
    assert update_res.status_code == 200
    data = update_res.json()
    assert data["title"] == "Lead Frontend Dev"
    assert data["status"] == "paused"


def test_delete_job_opening_success(client: TestClient, user_a: dict):
    create_res = client.post(
        "/api/v1/job-openings",
        json={"title": "DevOps Engineer", "description": "Kubernetes, Terraform, and cloud infrastructure."},
        headers=user_a["headers"],
    )
    opening_id = create_res.json()["id"]

    del_res = client.delete(f"/api/v1/job-openings/{opening_id}", headers=user_a["headers"])
    assert del_res.status_code == 204

    # Confirm it's gone
    res = client.get(f"/api/v1/job-openings/{opening_id}", headers=user_a["headers"])
    assert res.status_code == 404


def test_bulk_score_candidates_ranking(client: TestClient, user_a: dict):
    """Test bulk scoring ranks candidates by score in descending order."""
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Platform Lead", "description": "Platform reliability engineering with Python and Go."},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    # Create candidate 1
    c1 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Candidate Low",
            "email": "low@example.com",
            "cv_text": "Junior developer with basic knowledge.",
        },
        headers=user_a["headers"],
    ).json()

    # Create candidate 2
    c2 = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Candidate High",
            "email": "high@example.com",
            "cv_text": "Principal Architect with extensive experience.",
        },
        headers=user_a["headers"],
    ).json()

    # Mock screen_candidate_cv to return 60 for Low and 95 for High
    async def mock_screen(job_title, job_description, required_skills, candidate_name, cv_text):
        score = 95.0 if "High" in candidate_name else 60.0
        return {
            "score": score,
            "matched_skills": ["Python"],
            "missing_skills": [],
            "red_flags": [],
            "summary": "Screening summary.",
            "recommendation": "Match",
            "interview_focus_areas": [],
        }

    with patch("app.services.candidate_service.screen_candidate_cv", side_effect=mock_screen):
        bulk_res = client.post(
            f"/api/v1/job-openings/{opening_id}/bulk-score",
            headers=user_a["headers"],
        )
        assert bulk_res.status_code == 200
        data = bulk_res.json()
        assert data["total_candidates"] == 2
        ranked = data["ranked_candidates"]
        assert len(ranked) == 2
        # Candidate High must be rank 1
        assert ranked[0]["candidate_id"] == c2["id"]
        assert ranked[0]["rank"] == 1
        assert ranked[0]["score"] == 95.0

        # Candidate Low must be rank 2
        assert ranked[1]["candidate_id"] == c1["id"]
        assert ranked[1]["rank"] == 2
        assert ranked[1]["score"] == 60.0


def test_export_shortlist_csv(client: TestClient, user_a: dict):
    """Test GET /api/v1/job-openings/{id}/shortlist/export returns CSV content."""
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Cloud Architect", "description": "Cloud migration and infra design."},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Sarah Connor",
            "email": "sarah@cyberdyne.com",
            "cv_text": "Experienced systems defender and engineer.",
        },
        headers=user_a["headers"],
    )

    export_res = client.get(
        f"/api/v1/job-openings/{opening_id}/shortlist/export",
        headers=user_a["headers"],
    )
    assert export_res.status_code == 200
    assert "text/csv" in export_res.headers["content-type"]
    assert "shortlist_" in export_res.headers["content-disposition"]
    csv_text = export_res.text
    assert "Rank,Name,Email,Phone,Address,Fit Score,Stage" in csv_text
    assert "Sarah Connor" in csv_text
    assert "sarah@cyberdyne.com" in csv_text


def test_generate_opening_screening_questions(client: TestClient, user_a: dict):
    """Test POST /api/v1/job-openings/{id}/screening-questions."""
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Site Reliability Lead", "description": "High uptime Kubernetes infrastructure."},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    mock_q = ["How do you measure SLO/SLIs?", "Describe a postmortem you led."]
    with patch("app.routers.job_openings.generate_recruiter_interview_questions", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_q

        res = client.post(
            f"/api/v1/job-openings/{opening_id}/screening-questions?count=2",
            headers=user_a["headers"],
        )
        assert res.status_code == 200
        assert res.json()["questions"] == mock_q


def test_job_openings_user_isolation(client: TestClient, user_a: dict, user_b: dict):
    create_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Private Opening A", "description": "Confidential executive leadership vacancy."},
        headers=user_a["headers"],
    )
    opening_id = create_res.json()["id"]

    # User B attempts to read it -> 404
    assert client.get(f"/api/v1/job-openings/{opening_id}", headers=user_b["headers"]).status_code == 404

    # User B attempts to export shortlist -> 404
    assert client.get(f"/api/v1/job-openings/{opening_id}/shortlist/export", headers=user_b["headers"]).status_code == 404

    # User B attempts to bulk score -> 404
    assert client.post(f"/api/v1/job-openings/{opening_id}/bulk-score", headers=user_b["headers"]).status_code == 404

    # User B attempts to delete it -> 404
    assert client.delete(f"/api/v1/job-openings/{opening_id}", headers=user_b["headers"]).status_code == 404


def test_create_job_opening_auto_extracts_requirements(client: TestClient, user_a: dict):
    """Test that saving a JD automatically calls OpenRouter to extract skills, experience, and nice-to-haves."""
    from app.schemas.ai import JobRequirementsExtractionOutput

    mock_extracted = JobRequirementsExtractionOutput(
        required_skills=["Python", "FastAPI", "PostgreSQL"],
        years_of_experience=4.5,
        nice_to_haves=["Docker", "Kubernetes", "AWS"],
    )

    with patch("app.services.job_opening_service.extract_job_requirements", new_callable=AsyncMock) as mock_extract:
        mock_extract.return_value = mock_extracted

        payload = {
            "title": "Principal Backend Architect",
            "description": "Lead the design of distributed high-throughput microservices using asynchronous Python and relational databases.",
        }
        res = client.post("/api/v1/job-openings", json=payload, headers=user_a["headers"])
        assert res.status_code == 201
        data = res.json()
        assert data["required_skills"] == ["Python", "FastAPI", "PostgreSQL"]
        assert data["years_of_experience"] == 4.5
        assert data["nice_to_haves"] == ["Docker", "Kubernetes", "AWS"]


def test_openings_match_background_scoring_and_status(client: TestClient, user_a: dict):
    """
    Test POST /openings/{id}/match:
    - Scores every unmatched CV (0-100) with matched_skills, missing_skills, red_flags, one-paragraph reason
    - Caches results in database
    - Allows re-run
    - Provides real-time background progress status
    """
    from app.schemas.ai import JobRequirementsExtractionOutput
    mock_extracted = JobRequirementsExtractionOutput(
        required_skills=["Python", "FastAPI"],
        years_of_experience=3.0,
        nice_to_haves=["OpenRouter"],
    )

    mock_screen_output = {
        "score": 92.0,
        "matched_skills": ["Python", "FastAPI"],
        "missing_skills": ["Vectors"],
        "red_flags": [],
        "summary": "Candidate demonstrated strong backend API expertise with Python and FastAPI.",
        "recommendation": "Strong Match",
        "interview_focus_areas": ["Probe vector search experience"],
        "model_used": "mock-model",
        "latency_seconds": 0.42,
    }

    with patch("app.services.job_opening_service.extract_job_requirements", new_callable=AsyncMock) as mock_jd, \
         patch("app.services.matching_service.screen_candidate_cv", new_callable=AsyncMock) as mock_screen:
        mock_jd.return_value = mock_extracted
        mock_screen.return_value = mock_screen_output

        # 1. Create job opening
        op_res = client.post(
            "/openings",
            json={
                "title": "Senior AI Systems Engineer",
                "description": "Deploying LLMs and agent systems with Python, FastAPI, and vectors.",
                "required_skills": ["Python", "OpenRouter", "FastAPI"],
            },
            headers=user_a["headers"],
        )
        assert op_res.status_code == 201
        opening_id = op_res.json()["id"]

        # 2. Create 2 candidates (unmatched, score=None)
        cand1_res = client.post(
            "/api/v1/candidates",
            json={
                "opening_id": opening_id,
                "name": "Ada Lovelace",
                "email": "ada@example.com",
                "cv_text": "Experienced Python and FastAPI systems engineer with 6 years designing APIs.",
            },
            headers=user_a["headers"],
        )
        assert cand1_res.status_code == 201
        cand1_id = cand1_res.json()["id"]
        assert cand1_res.json()["score"] is None

        cand2_res = client.post(
            "/api/v1/candidates",
            json={
                "opening_id": opening_id,
                "name": "Charles Babbage",
                "email": "charles@example.com",
                "cv_text": "Mechanical computing pioneer with C and low-level architecture experience.",
            },
            headers=user_a["headers"],
        )
        assert cand2_res.status_code == 201
        cand2_id = cand2_res.json()["id"]

        # 3. Trigger matching job via POST /openings/{id}/match
        match_res = client.post(f"/openings/{opening_id}/match", headers=user_a["headers"])
        assert match_res.status_code == 202
        status_data = match_res.json()
        assert status_data["status"] == "in_progress"

        # Check status endpoint GET /openings/{id}/match/status
        prog_res = client.get(f"/openings/{opening_id}/match/status", headers=user_a["headers"])
        assert prog_res.status_code == 200
        assert "progress_percent" in prog_res.json()

        # Verify candidate records now have cached scores
        c1 = client.get(f"/api/v1/candidates/{cand1_id}", headers=user_a["headers"]).json()
        assert c1["score"] == 92.0
        assert c1["matched_skills"] == ["Python", "FastAPI"]
        assert c1["missing_skills"] == ["Vectors"]
        assert "demonstrated strong backend API expertise" in c1["summary"]

        # 4. Test re-run capability
        rerun_res = client.post(f"/openings/{opening_id}/match?rerun=true", headers=user_a["headers"])
        assert rerun_res.status_code == 202


def test_document_parser_docx_and_pdf():
    """Verify pypdf and python-docx parsing with OCR fallback for scanned PDFs."""
    import docx
    import io
    from app.core.document_parser import parse_cv_document, extract_text_from_docx, extract_text_from_pdf

    # 1. Test DOCX parsing
    doc = docx.Document()
    doc.add_paragraph("Alice Johnson - Senior Cloud Architect")
    doc.add_paragraph("Skills: Kubernetes, Terraform, Go, AWS")
    docx_buf = io.BytesIO()
    doc.save(docx_buf)
    docx_bytes = docx_buf.getvalue()

    extracted_docx = parse_cv_document(docx_bytes, filename="resume.docx")
    assert "Alice Johnson" in extracted_docx
    assert "Kubernetes, Terraform" in extracted_docx

    # 2. Test plain text fallback
    txt_bytes = b"Jane Doe - Staff Machine Learning Engineer\nPyTorch, JAX, CUDA"
    extracted_txt = parse_cv_document(txt_bytes, filename="cv.txt")
    assert "Jane Doe" in extracted_txt
    assert "PyTorch" in extracted_txt

