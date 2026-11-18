"""
tests/test_upload_extraction.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Comprehensive test suite for upload-first candidate extraction:
1. CVs with standard layout (PDF)
2. CVs with different layout (DOCX)
3. Scanned PDF (image/minimal text layer with OCR fallback handling)
4. CV with no email (amber flag, confidence=0)
5. CV with two emails (primary and secondary detection)
6. Duplicate upload detection with Merge and Skip resolution
7. Non-PDF / Non-DOCX rejection (HTTP 400)
8. File >10MB rejection (HTTP 400)
9. Auto-screen after upload
"""
import io
import uuid
from unittest.mock import AsyncMock, patch
import pytest
from docx import Document
from fastapi.testclient import TestClient
from pypdf import PdfWriter

from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.schemas.extractor import CandidateExtractionLLMOutput
from sqlmodel import Session, select


@pytest.fixture(autouse=True)
def mock_openrouter_llm_fixture():
    """Ensure tests run lightning-fast without waiting on external LLM network calls."""
    with patch("app.services.ai_router.ai_router.complete_with_chain", new_callable=AsyncMock) as m:
        m.return_value = (
            CandidateExtractionLLMOutput(),
            "google/gemma-4-31b-it:free",
            120.0,
        )
        yield m


def _create_opening(client: TestClient, headers: dict) -> str:
    """Helper to create a test job opening."""
    res = client.post(
        "/api/v1/job-openings",
        json={
            "title": "Senior Cloud Infrastructure Engineer",
            "description": "Looking for a seasoned engineer proficient in Python, Docker, Kubernetes, and AWS.",
            "required_skills": ["Python", "Docker", "Kubernetes", "AWS"],
            "status": "active",
        },
        headers=headers,
    )
    assert res.status_code == 201
    return res.json()["id"]


def _make_pdf_with_text(name: str, email: str, phone: str, title: str, exp_years: int, skills: list[str]) -> bytes:
    """Constructs a valid PDF 1.4 document containing selectable text."""
    skills_str = ", ".join(skills)
    line1 = f"{name}"
    line2 = f"{title} | {email} | {phone}"
    line3 = f"Summary: Experienced professional with {exp_years} years of experience in {skills_str}."
    line4 = "Education: Bachelor of Science in Computer Science"

    stream_content = f"""BT
/F1 12 Tf
72 712 Td
({line1}) Tj
0 -18 Td
({line2}) Tj
0 -18 Td
({line3}) Tj
0 -18 Td
({line4}) Tj
ET""".encode("latin-1")

    stream_len = len(stream_content)
    pdf_bytes = f"""%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length {stream_len} >> stream
""".encode("latin-1") + stream_content + b"""
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000450 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
530
%%EOF"""
    return pdf_bytes


def _make_docx_cv(name: str, email: str, phone: str, title: str, skills: list[str], education: str) -> bytes:
    """Constructs a valid DOCX document using python-docx."""
    doc = Document()
    doc.add_heading(name, level=1)
    doc.add_paragraph(f"{title} • {email} • {phone}")
    doc.add_paragraph("Location: New York, NY | https://linkedin.com/in/sarahconnor | https://github.com/sarahconnor")
    doc.add_heading("Technical Expertise", level=2)
    doc.add_paragraph(", ".join(skills))
    doc.add_heading("Education", level=2)
    doc.add_paragraph(education)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


# ── 1. Standard Layout PDF ───────────────────────────────────────────────────

def test_cv_standard_layout_pdf(client: TestClient, user_a: dict):
    """Test extracting structured fields from a standard layout PDF CV."""
    opening_id = _create_opening(client, user_a["headers"])
    pdf_bytes = _make_pdf_with_text(
        name="Alexander Stone",
        email="alexander.stone@example.com",
        phone="+1 (555) 890-1234",
        title="Full Stack Developer",
        exp_years=5,
        skills=["Python", "React", "PostgreSQL", "Docker", "AWS"],
    )

    res = client.post(
        "/api/v1/candidates/extract-cv",
        data={"opening_id": opening_id},
        files={"file": ("alexander_resume.pdf", pdf_bytes, "application/pdf")},
        headers=user_a["headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()

    extracted = data["extracted_data"]
    assert extracted["name"] == "Alexander Stone"
    assert extracted["email"] == "alexander.stone@example.com"
    assert extracted["years_of_experience"] == 5.0
    assert "Python" in extracted["top_skills"]
    assert "PostgreSQL" in extracted["top_skills"]

    # Verify confidence and metadata
    meta = data["field_metadata"]
    assert meta["email"]["confidence"] >= 0.9
    assert meta["email"]["source"] == "regex"
    assert meta["name"]["confidence"] >= 0.7
    assert data["duplicate_info"]["is_duplicate"] is False


# ── 2. Different Layout DOCX ─────────────────────────────────────────────────

def test_cv_different_layout_docx(client: TestClient, user_a: dict):
    """Test extracting details from a DOCX document with skills and education sections."""
    opening_id = _create_opening(client, user_a["headers"])
    docx_bytes = _make_docx_cv(
        name="Sarah Connor",
        email="sarah.connor@sky.net",
        phone="+1 (415) 555-9876",
        title="Lead Systems Architect",
        skills=["Go", "Kubernetes", "Terraform", "Docker", "Linux"],
        education="Master of Science in Distributed Systems",
    )

    res = client.post(
        "/api/v1/candidates/extract-cv",
        data={"opening_id": opening_id},
        files={"file": ("sarah_connor_cv.docx", docx_bytes, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
        headers=user_a["headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()

    extracted = data["extracted_data"]
    assert extracted["name"] == "Sarah Connor"
    assert extracted["email"] == "sarah.connor@sky.net"
    assert extracted["linkedin_url"] == "https://linkedin.com/in/sarahconnor"
    assert extracted["github_url"] == "https://github.com/sarahconnor"
    assert "Kubernetes" in extracted["top_skills"]
    assert "Terraform" in extracted["top_skills"]
    assert "Master" in extracted["education"]


# ── 3. Scanned PDF (Empty Text Layer / OCR Fallback) ─────────────────────────

def test_scanned_pdf_rejection(client: TestClient, user_a: dict):
    """Test that a scanned PDF with no readable text layer triggers the OCR fallback and handles gracefully."""
    opening_id = _create_opening(client, user_a["headers"])

    # Create empty PDF with zero text
    writer = PdfWriter()
    writer.add_blank_page(width=612, height=792)
    buf = io.BytesIO()
    writer.write(buf)
    scanned_bytes = buf.getvalue()

    res = client.post(
        "/api/v1/candidates/extract-cv",
        data={"opening_id": opening_id},
        files={"file": ("scanned_cv.pdf", scanned_bytes, "application/pdf")},
        headers=user_a["headers"],
    )
    assert res.status_code == 400
    assert "readable text" in res.json()["detail"].lower() or "scanned" in res.json()["detail"].lower()


# ── 4. CV with No Email ──────────────────────────────────────────────────────

def test_cv_no_email(client: TestClient, user_a: dict):
    """Test extraction of a CV where email is absent: confidence=0.0 and flagged in missing_fields."""
    opening_id = _create_opening(client, user_a["headers"])
    cv_text = """
Marcus Aurelius
Lead Platform Engineer
Phone: +1 212-555-0199
Location: Rome, NY
Summary: 8 years of experience building resilient microservices with Python, Go, and Kafka.
Education: Bachelor of Science in Computer Engineering
"""

    res = client.post(
        "/api/v1/candidates/extract-text",
        json={"opening_id": opening_id, "cv_text": cv_text},
        headers=user_a["headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()

    extracted = data["extracted_data"]
    assert extracted["name"] == "Marcus Aurelius"
    assert extracted["email"] is None
    assert "email" in data["missing_fields"]
    assert data["field_metadata"]["email"]["confidence"] == 0.0

    # Confirm candidate with missing email
    confirm_res = client.post(
        "/api/v1/candidates/confirm-extracted",
        json={
            "opening_id": opening_id,
            "name": extracted["name"],
            "email": None,
            "phone": extracted["phone"],
            "cv_text": cv_text,
            "action": "create",
        },
        headers=user_a["headers"],
    )
    assert confirm_res.status_code == 201
    assert "Marcus Aurelius" in confirm_res.json()["name"]


# ── 5. CV with Two Emails ────────────────────────────────────────────────────

def test_cv_two_emails(client: TestClient, user_a: dict):
    """Test that primary email is captured and secondary email is stored in secondary_emails."""
    opening_id = _create_opening(client, user_a["headers"])
    cv_text = """
Elena Rostova
Senior Data Scientist
Primary Email: elena.rostova@techcorp.io
Alternative Email: elena.personal@gmail.com
Phone: +44 20 7946 0991
Location: London, UK
Skills: Python, PyTorch, SQL, Machine Learning, Docker
Years of Experience: 6 years
"""

    res = client.post(
        "/api/v1/candidates/extract-text",
        json={"opening_id": opening_id, "cv_text": cv_text},
        headers=user_a["headers"],
    )
    assert res.status_code == 200, res.text
    data = res.json()

    extracted = data["extracted_data"]
    assert extracted["email"] == "elena.rostova@techcorp.io"
    assert "elena.personal@gmail.com" in extracted["secondary_emails"]


# ── 6. Duplicate Upload Detection, Merge, and Skip ───────────────────────────

def test_duplicate_upload_detection_merge_and_skip(client: TestClient, user_a: dict):
    """
    Test duplicate candidate detection by email:
    1. First upload creates candidate.
    2. Second upload detects duplicate and reports existing candidate metadata.
    3. Confirm with 'merge' updates existing candidate.
    4. Confirm with 'skip' leaves database untouched.
    """
    opening_id = _create_opening(client, user_a["headers"])
    first_cv_text = """
David Kim
Junior Developer
Email: david.kim@example.com
Phone: +1 555-111-2222
Skills: JavaScript, HTML, CSS
Years of experience: 1 year
"""

    # 1. First upload
    create_res = client.post(
        "/api/v1/candidates/confirm-extracted",
        json={
            "opening_id": opening_id,
            "name": "David Kim",
            "email": "david.kim@example.com",
            "phone": "+1 555-111-2222",
            "cv_text": first_cv_text,
            "action": "create",
        },
        headers=user_a["headers"],
    )
    assert create_res.status_code == 201
    candidate_id = create_res.json()["id"]

    # 2. Extract updated CV with the same email
    updated_cv_text = """
David Kim
Senior Developer
Email: david.kim@example.com
Phone: +1 555-111-2222
Skills: Python, React, TypeScript, Next.js, Docker, Kubernetes
Years of experience: 4 years of experience
"""
    preview_res = client.post(
        "/api/v1/candidates/extract-text",
        json={"opening_id": opening_id, "cv_text": updated_cv_text},
        headers=user_a["headers"],
    )
    assert preview_res.status_code == 200
    dup_data = preview_res.json()

    assert dup_data["duplicate_info"]["is_duplicate"] is True
    assert dup_data["duplicate_info"]["matched_by"] == "email"
    assert dup_data["duplicate_info"]["existing_candidate_id"] == candidate_id

    # 3. Confirm with MERGE
    merge_res = client.post(
        "/api/v1/candidates/confirm-extracted",
        json={
            "opening_id": opening_id,
            "name": "David Kim",
            "email": "david.kim@example.com",
            "phone": "+1 555-111-2222",
            "current_title": "Senior Developer",
            "cv_text": updated_cv_text,
            "action": "merge",
            "merge_candidate_id": candidate_id,
        },
        headers=user_a["headers"],
    )
    assert merge_res.status_code == 201
    merged_data = merge_res.json()
    assert merged_data["id"] == candidate_id
    assert merged_data["cv_text"] == updated_cv_text

    # 4. Test SKIP
    skip_res = client.post(
        "/api/v1/candidates/confirm-extracted",
        json={
            "opening_id": opening_id,
            "name": "David Kim",
            "email": "david.kim@example.com",
            "cv_text": updated_cv_text,
            "action": "skip",
        },
        headers=user_a["headers"],
    )
    assert skip_res.status_code == 200
    assert "skipped" in skip_res.json()["detail"].lower()


# ── 7. Non-PDF / Non-DOCX Rejection ──────────────────────────────────────────

def test_non_pdf_non_docx_rejection(client: TestClient, user_a: dict):
    """Test that uploading non-PDF/DOCX file formats (e.g. .exe, .zip) is rejected with HTTP 400."""
    opening_id = _create_opening(client, user_a["headers"])
    dummy_bytes = b"MZ\x90\x00\x03\x00\x00\x00Fake Executable Binary Content"

    res = client.post(
        "/api/v1/candidates/extract-cv",
        data={"opening_id": opening_id},
        files={"file": ("malware.exe", dummy_bytes, "application/octet-stream")},
        headers=user_a["headers"],
    )
    assert res.status_code == 400
    assert "unsupported file format" in res.json()["detail"].lower()


# ── 8. File >10MB Rejection ──────────────────────────────────────────────────

def test_file_exceeds_10mb_rejection(client: TestClient, user_a: dict):
    """Test that files exceeding 10MB are rejected with HTTP 400."""
    opening_id = _create_opening(client, user_a["headers"])
    # 11 Megabytes
    huge_bytes = b"0" * (11 * 1024 * 1024)

    res = client.post(
        "/api/v1/candidates/extract-cv",
        data={"opening_id": opening_id},
        files={"file": ("huge_resume.pdf", huge_bytes, "application/pdf")},
        headers=user_a["headers"],
    )
    assert res.status_code == 400
    assert "10mb" in res.json()["detail"].lower()


# ── 9. Auto-Screen Triggering After Upload ────────────────────────────────────

def test_auto_screen_after_upload(client: TestClient, user_a: dict):
    """Test that setting auto_screen=True initiates candidate screening after confirmation."""
    opening_id = _create_opening(client, user_a["headers"])
    cv_text = """
Lucas Vance
Cloud Solutions Architect
Email: lucas.vance@example.com
Phone: +1 555-789-0123
Summary: 7+ years of experience with AWS, Kubernetes, Terraform, Python, and Docker.
"""

    confirm_res = client.post(
        "/api/v1/candidates/confirm-extracted",
        json={
            "opening_id": opening_id,
            "name": "Lucas Vance",
            "email": "lucas.vance@example.com",
            "phone": "+1 555-789-0123",
            "cv_text": cv_text,
            "action": "create",
            "auto_screen": True,
        },
        headers=user_a["headers"],
    )
    assert confirm_res.status_code == 201
    cand_data = confirm_res.json()
    assert cand_data["name"] == "Lucas Vance"
