"""Tests for Candidate Contact Details & Online Profile Link Extraction and Google Sheets Sync."""
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from app.schemas.extractor import CandidateExtractionLLMOutput
from app.services.extractor_service import extract_regex_fields


def test_regex_extraction_deterministic():
    """Verify regex extraction of email, phone, GitHub, LinkedIn, Kaggle, and portfolio."""
    sample_cv = """
    Jane Doe
    Email: jane.doe@engineering.io
    Phone: +1 (415) 890-1234
    GitHub: https://github.com/janedoe-ai
    LinkedIn: https://www.linkedin.com/in/janedoe-lead
    Kaggle: https://kaggle.com/janedoe
    Portfolio: https://janedoe.dev
    Other: https://medium.com/@janedoe
    """
    results = extract_regex_fields(sample_cv)

    assert results["email"][0] == "jane.doe@engineering.io"
    assert results["email"][1] >= 0.99
    assert results["email"][2] == "regex"

    assert results["phone"][0] == "+1 (415) 890-1234"
    assert results["phone"][1] >= 0.90

    assert "github.com/janedoe-ai" in results["github_url"][0]
    assert "linkedin.com/in/janedoe-lead" in results["linkedin_url"][0]
    assert "kaggle.com/janedoe" in results["kaggle_url"][0]
    assert "janedoe.dev" in results["portfolio_url"][0]


def test_extract_candidate_details_endpoint(client: TestClient, user_a: dict):
    """Test POST /api/v1/candidates/{id}/extract-details."""
    # 1. Create opening
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Data Scientist", "description": "NLP, LLMs, and Python.", "required_skills": ["NLP", "Python"]},
        headers=user_a["headers"],
    )
    assert op_res.status_code == 201
    opening_id = op_res.json()["id"]

    # 2. Create candidate with rich CV text
    cand_cv = """
    Alan Turing
    Contact: alan@bletchley.ac.uk | Tel: (212) 555-0199
    Location: Cambridge, UK
    Code: https://github.com/alanturing
    Kaggle: https://kaggle.com/aturing
    Web: https://alanturing.org
    """
    c_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Alan Turing",
            "email": "alan@bletchley.ac.uk",
            "cv_text": cand_cv,
        },
        headers=user_a["headers"],
    )
    assert c_res.status_code == 201
    cand_id = c_res.json()["id"]

    # 3. Call extract-details endpoint (mock LLM gaps & HEAD verify to avoid live network in tests)
    with patch("app.services.extractor_service.extract_llm_gaps", new_callable=AsyncMock) as mock_llm, \
         patch("app.services.extractor_service.verify_url_resolves", new_callable=AsyncMock) as mock_verify:
        mock_llm.return_value = CandidateExtractionLLMOutput(address="Cambridge, UK")
        mock_verify.return_value = True

        ext_res = client.post(
            f"/api/v1/candidates/{cand_id}/extract-details?verify_urls=true",
            headers=user_a["headers"],
        )
        assert ext_res.status_code == 200
        data = ext_res.json()

        assert data["candidate_id"] == cand_id
        assert data["email"] == "alan@bletchley.ac.uk"
        assert "(212) 555-0199" in data["phone"]
        assert "github.com/alanturing" in data["github_url"]
        assert "kaggle.com/aturing" in data["kaggle_url"]

        # Check metadata
        meta = data["field_metadata"]
        assert meta["github_url"]["source"] in ["regex", "llm"]
        assert meta["github_url"]["confidence"] > 0.8

        # 4. Check links stored in candidate_links
        links_res = client.get(f"/api/v1/candidates/{cand_id}/links", headers=user_a["headers"])
        assert links_res.status_code == 200
        links_list = links_res.json()
        assert len(links_list) >= 2
        link_types = {l["link_type"] for l in links_list}
        assert "github" in link_types
        assert "kaggle" in link_types


def test_hr_manual_edit_candidate_details(client: TestClient, user_a: dict):
    """Test PATCH /api/v1/candidates/{id} allows HR to correct extracted fields."""
    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Frontend Lead", "description": "React, Next.js, and TypeScript.", "required_skills": ["React", "TypeScript"]},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    c_res = client.post(
        "/api/v1/candidates",
        json={
            "opening_id": opening_id,
            "name": "Grace Hopper",
            "email": "grace@navy.mil",
            "cv_text": "Pioneer of compiled languages and COBOL design.",
        },
        headers=user_a["headers"],
    )
    cand_id = c_res.json()["id"]

    # HR corrects phone, address, and portfolio
    patch_payload = {
        "phone": "+1-800-555-9999",
        "address": "Arlington, VA, USA",
        "portfolio_url": "https://gracehopper.dev",
        "github_url": "https://github.com/gracehopper",
    }
    patch_res = client.patch(
        f"/api/v1/candidates/{cand_id}",
        json=patch_payload,
        headers=user_a["headers"],
    )
    assert patch_res.status_code == 200
    updated = patch_res.json()
    assert updated["phone"] == "+1-800-555-9999"
    assert updated["address"] == "Arlington, VA, USA"
    assert updated["portfolio_url"] == "https://gracehopper.dev"
    assert updated["github_url"] == "https://github.com/gracehopper"


def test_google_sheets_sync_endpoint(client: TestClient, user_a: dict):
    """Test POST /api/v1/job-openings/{id}/sync-google-sheet."""
    from app.schemas.extractor import GoogleSheetSyncResponse

    op_res = client.post(
        "/api/v1/job-openings",
        json={"title": "Cloud Architect", "description": "Kubernetes and GCP solutions.", "required_skills": ["Kubernetes", "GCP"]},
        headers=user_a["headers"],
    )
    opening_id = op_res.json()["id"]

    mock_sync_result = GoogleSheetSyncResponse(
        spreadsheet_id="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        spreadsheet_url="https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms",
        total_candidates_synced=5,
        rows_updated=2,
        rows_appended=3,
        synced_at="2026-11-17T20:30:00Z",
    )

    with patch("app.routers.job_openings.google_sheets_service.sync_opening_candidates_to_sheet", new_callable=AsyncMock) as mock_sync:
        mock_sync.return_value = mock_sync_result

        res = client.post(f"/api/v1/job-openings/{opening_id}/sync-google-sheet", headers=user_a["headers"])
        assert res.status_code == 200
        data = res.json()
        assert data["spreadsheet_id"] == "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"
        assert data["total_candidates_synced"] == 5
        assert data["rows_updated"] == 2
        assert data["rows_appended"] == 3
