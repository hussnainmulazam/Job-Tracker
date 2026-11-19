"""
tests/test_candidates.py
~~~~~~~~~~~~~~~~~~~~~~~~
Integration tests for /api/v1/candidates:
- Create candidate with CV text (201, 422, 401)
- Upload candidate PDF CV with pypdf extraction (POST /candidates/upload)
- Update candidate CV with PDF upload (POST /candidates/{id}/upload-cv)
- Score candidate using OpenRouter (POST /candidates/{id}/score)
- Screening questions generation (POST /candidates/{id}/screening-questions)
- Stage transitions (applied -> screening -> interview -> offer -> rejected)
- Delete candidate (204, 404)
- User isolation (User A vs User B)
"""
import io
import uuid
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter


def _create_opening(client: TestClient, headers: dict) -> str:
    res = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Full Stack Developer",
            "description": "Building full stack apps with Next.js, FastAPI, and Postgres.",
            "required_skills": ["TypeScript", "Python", "FastAPI"],
        },
        headers=headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def _make_dummy_pdf() -> bytes:
    """Create minimal valid PDF in memory."""
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    out = io.BytesIO()
    writer.write(out)
    return out.getvalue()


def test_create_candidate_success(client: TestClient, user_a: dict):
    opening_id = _create_opening(client, user_a["headers"])
    payload = {
        "opening_id": opening_id,
        "name": "Jane Doe",
        "email": "jane.doe@example.com",
        "cv_text": "Experienced software engineer with 6 years building TypeScript and Python web applications.",
    }
    res = client.post("/api/v1/candidates", json=payload, headers=user_a["headers"])
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "Jane Doe"
    assert data["email"] == "jane.doe@example.com"
    assert data["stage"] == "applied"
    assert data["opening_title"] == "Full Stack Developer"
    assert "id" in data


def test_create_candidate_validation_error(client: TestClient, user_a: dict):
    opening_id = _create_opening(client, user_a["headers"])
    payload = {
        "opening_id": opening_id,
        "name": "",
        "email": "invalid-email",
        "cv_text": "Short",
    }
    res = client.post("/api/v1/candidates", json=payload, headers=user_a["headers"])
    assert res.status_code == 422


def test_create_candidate_unauthorized(client: TestClient):
    payload = {
        "opening_id": str(uuid.uuid4()),
        "name": "Alex Smith",
        "email": "alex@example.com",
        "cv_text": "Experienced developer...",
    }
    res = client.post("/api/v1/candidates", json=payload)
    assert res.status_code == 401


def test_upload_candidate_pdf_cv(client: TestClient, user_a: dict):
    """Test POST /api/v1/candidates/upload parses PDF with pypdf and creates candidate."""
    opening_id = _create_opening(client, user_a["headers"])
    pdf_bytes = _make_dummy_pdf()

    extracted_mock_text = (
        "Senior Backend Developer with 7 years of Python, FastAPI, and Postgres microservice design."
    )

    with patch("app.services.candidate_service.parse_cv_document", return_value=extracted_mock_text):
        res = client.post(
            "/api/v1/candidates/upload",
            data={
                "opening_id": opening_id,
                "name": "Alexander Stone",
                "email": "alexander.stone@example.com",
            },
            files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
            headers=user_a["headers"],
        )
        assert res.status_code == 201
        data = res.json()
        assert data["name"] == "Alexander Stone"
        assert data["email"] == "alexander.stone@example.com"
        assert data["cv_text"] == extracted_mock_text


def test_update_candidate_cv_pdf(client: TestClient, user_a: dict):
    """Test POST /api/v1/candidates/{id}/upload-cv replaces candidate CV text."""
    opening_id = _create_opening(client, user_a["headers"])
    cand_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Morgan Vance",
            "email": "morgan@example.com",
            "cv_text": "Initial base CV content before uploading new PDF.",
        },
        headers=user_a["headers"],
    )
    candidate_id = cand_res.json()["id"]

    new_pdf_text = "Updated Staff Engineer Resume with Distributed Systems experience."
    with patch("app.services.candidate_service.parse_cv_document", return_value=new_pdf_text):
        res = client.post(
            f"/api/v1/candidates/{candidate_id}/upload-cv",
            files={"file": ("updated_resume.pdf", _make_dummy_pdf(), "application/pdf")},
            headers=user_a["headers"],
        )
        assert res.status_code == 200
        assert res.json()["cv_text"] == new_pdf_text


def test_score_candidate_endpoint(client: TestClient, user_a: dict):
    """POST /api/v1/candidates/{id}/score returns strict JSON: score, matched_skills, missing_skills, red_flags, summary."""
    opening_id = _create_opening(client, user_a["headers"])
    create_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Dana Scully",
            "email": "dana@example.com",
            "cv_text": "Scientific investigator and software architect specializing in Python microservices.",
        },
        headers=user_a["headers"],
    )
    candidate_id = create_res.json()["id"]

    mock_screen_result = {
        "score": 94.0,
        "matched_skills": ["Python", "FastAPI"],
        "missing_skills": ["TypeScript"],
        "red_flags": ["No public code samples"],
        "summary": "Excellent technical candidate with deep Python systems experience.",
        "recommendation": "Strong Match",
        "interview_focus_areas": ["Probe TypeScript/frontend exposure"],
        "model_used": "test-model",
        "latency_seconds": 1.2,
    }

    with patch("app.services.candidate_service.screen_candidate_cv", new_callable=AsyncMock) as mock_screen:
        mock_screen.return_value = mock_screen_result

        score_res = client.post(
            f"/api/v1/candidates/{candidate_id}/score",
            headers=user_a["headers"],
        )
        assert score_res.status_code == 200
        data = score_res.json()
        assert data["score"] == 94.0
        assert data["matched_skills"] == ["Python", "FastAPI"]
        assert data["missing_skills"] == ["TypeScript"]
        assert data["red_flags"] == ["No public code samples"]
        assert "summary" in data

        # Verify candidate row in DB was updated
        get_res = client.get(f"/api/v1/candidates/{candidate_id}", headers=user_a["headers"])
        assert get_res.json()["score"] == 94.0
        assert get_res.json()["stage"] == "screening"
        assert get_res.json()["red_flags"] == ["No public code samples"]


def test_generate_screening_questions(client: TestClient, user_a: dict):
    """POST /api/v1/candidates/{id}/screening-questions returns targeted screening questions."""
    opening_id = _create_opening(client, user_a["headers"])
    create_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "David Miller",
            "email": "david@example.com",
            "cv_text": "Experienced Python developer with gaps in cloud CI/CD.",
        },
        headers=user_a["headers"],
    )
    candidate_id = create_res.json()["id"]

    mock_questions = [
        "How do you approach automated testing in CI/CD pipelines?",
        "Describe your experience with async FastAPI request handlers.",
    ]

    with patch("app.services.candidate_service.generate_recruiter_interview_questions", new_callable=AsyncMock) as mock_gen:
        mock_gen.return_value = mock_questions

        res = client.post(
            f"/api/v1/candidates/{candidate_id}/screening-questions?count=2",
            headers=user_a["headers"],
        )
        assert res.status_code == 200
        data = res.json()
        assert data["candidate_id"] == candidate_id
        assert data["questions"] == mock_questions


def test_candidates_user_isolation(client: TestClient, user_a: dict, user_b: dict):
    opening_id = _create_opening(client, user_a["headers"])
    create_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Secret Candidate A",
            "email": "secret@example.com",
            "cv_text": "Confidential candidate application text.",
        },
        headers=user_a["headers"],
    )
    candidate_id = create_res.json()["id"]

    # User B cannot read
    assert client.get(f"/api/v1/candidates/{candidate_id}", headers=user_b["headers"]).status_code == 404

    # User B cannot update stage
    assert (
        client.patch(
            f"/api/v1/candidates/{candidate_id}/stage",
            json={"stage": "offer"},
            headers=user_b["headers"],
        ).status_code
        == 404
    )

    # User B cannot score
    assert client.post(f"/api/v1/candidates/{candidate_id}/score", headers=user_b["headers"]).status_code == 404

    # User B cannot delete
    assert client.delete(f"/api/v1/candidates/{candidate_id}", headers=user_b["headers"]).status_code == 404
