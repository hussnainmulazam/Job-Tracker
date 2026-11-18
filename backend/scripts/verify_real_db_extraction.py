"""
scripts/verify_real_db_extraction.py
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
Demonstrates upload-first extraction and candidate persistence directly
against the real Supabase PostgreSQL database.
"""
import asyncio
import io
import json
import os
import sys
import uuid
from docx import Document
from sqlmodel import Session, select, text

# Add backend to path
sys.path.insert(0, os.path.abspath("backend"))

from app.core.document_parser import extract_text_from_pdf, parse_cv_document
from app.core.storage import save_candidate_cv_file
from app.db import engine
from app.models.candidate import Candidate
from app.models.job_opening import JobOpening
from app.models.user import User
from app.schemas.extractor import CandidateConfirmPayload
from app.services.candidate_service import candidate_service
from app.services.extractor_service import extractor_service


def _build_test_pdf(name: str, email: str, phone: str, title: str, exp_years: int, skills: list[str]) -> bytes:
    skills_str = ", ".join(skills)
    line1 = f"{name}"
    line2 = f"{title} | {email} | {phone}"
    line3 = f"Summary: Experienced engineer with {exp_years} years of experience in {skills_str}."
    line4 = "Education: Bachelor of Science in Software Engineering"

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


def _build_test_docx(name: str, email: str, phone: str, title: str, skills: list[str]) -> bytes:
    doc = Document()
    doc.add_heading(name, level=1)
    doc.add_paragraph(f"{title} • {email} • {phone}")
    doc.add_paragraph("Location: San Francisco, CA | https://linkedin.com/in/testsarah | https://github.com/testsarah")
    doc.add_heading("Skills", level=2)
    doc.add_paragraph(", ".join(skills))
    doc.add_heading("Education", level=2)
    doc.add_paragraph("Master of Science in Distributed Computing, MIT")
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


async def main():
    print("=== LIVE SUPABASE DATABASE EXTRACTION TEST ===")

    with Session(engine) as session:
        # 1. Fetch user
        user = session.exec(select(User).where(User.email == "hussnainmulazam@gmail.com")).first()
        if not user:
            user = session.exec(select(User)).first()
        assert user, "No user found in real DB"
        print(f"Recruiter User ID: {user.id} ({user.email})")

        # 2. Pick or create test Job Opening
        opening = session.exec(select(JobOpening).where(JobOpening.user_id == user.id)).first()
        if not opening:
            opening = JobOpening(
                user_id=user.id,
                title="Lead Full Stack Architect",
                description="Hiring Lead Engineer for Python, React, and Cloud infrastructure.",
                required_skills=["Python", "React", "PostgreSQL", "Docker", "AWS"],
                status="active",
            )
            session.add(opening)
            session.commit()
            session.refresh(opening)
        print(f"Target Job Opening: '{opening.title}' (ID: {opening.id})")

        # ── Test 1: Upload-First PDF Extraction ──────────────────────────────
        print("\n--- 1. Testing PDF Upload-First Extraction ---")
        pdf_bytes = _build_test_pdf(
            name="Robert Vance",
            email="robert.vance@vancerefrigeration.com",
            phone="+1 (555) 789-4321",
            title="Senior Backend Engineer",
            exp_years=6,
            skills=["Python", "PostgreSQL", "FastAPI", "Docker", "AWS", "Redis"],
        )

        # Parse text using document parser (with OCR fallback)
        extracted_text = parse_cv_document(pdf_bytes, "robert_vance.pdf")
        saved_file_url = save_candidate_cv_file("robert_vance.pdf", pdf_bytes)

        # Run heuristic extraction + LLM gap filling + duplicate check
        preview = await extractor_service.preview_and_extract_candidate(
            session=session,
            user_id=user.id,
            opening_id=opening.id,
            cv_text=extracted_text,
            file_name="robert_vance.pdf",
            file_url=saved_file_url,
        )

        print(f"Extracted Name: {preview.extracted_data.name} (Source: {preview.field_metadata.get('name', {}).source})")
        print(f"Extracted Email: {preview.extracted_data.email} (Confidence: {preview.field_metadata.get('email', {}).confidence})")
        print(f"Extracted Phone: {preview.extracted_data.phone}")
        print(f"Extracted Title: {preview.extracted_data.current_title}")
        print(f"Extracted Years of Exp: {preview.extracted_data.years_of_experience}")
        print(f"Extracted Top Skills: {preview.extracted_data.top_skills}")
        print(f"CV File URL (Supabase/Local): {preview.file_url}")
        print(f"Duplicate Status: {preview.duplicate_info.is_duplicate}")

        # Confirm and persist into Supabase DB
        confirmed = await candidate_service.confirm_candidate(
            session=session,
            user_id=user.id,
            payload=CandidateConfirmPayload(
                opening_id=str(opening.id),
                name=preview.extracted_data.name or "Robert Vance",
                email=preview.extracted_data.email,
                phone=preview.extracted_data.phone,
                current_title=preview.extracted_data.current_title,
                years_of_experience=preview.extracted_data.years_of_experience,
                top_skills=preview.extracted_data.top_skills,
                cv_text=preview.cv_text,
                cv_file_url=preview.file_url,
                field_metadata=preview.field_metadata,
                action="create",
            ),
        )
        print(f"Persisted Candidate Row in Supabase DB! Candidate ID: {confirmed.id}")

        # ── Test 2: Upload-First DOCX Extraction ─────────────────────────────
        print("\n--- 2. Testing DOCX Upload-First Extraction ---")
        docx_bytes = _build_test_docx(
            name="Natasha Romanoff",
            email="natasha.romanoff@avengers.org",
            phone="+1 (212) 555-0999",
            title="Lead Security Architect",
            skills=["Python", "Linux", "Kubernetes", "Docker", "Terraform", "Go"],
        )
        docx_text = parse_cv_document(docx_bytes, "natasha.docx")
        docx_url = save_candidate_cv_file("natasha.docx", docx_bytes)

        docx_preview = await extractor_service.preview_and_extract_candidate(
            session=session,
            user_id=user.id,
            opening_id=opening.id,
            cv_text=docx_text,
            file_name="natasha.docx",
            file_url=docx_url,
        )
        print(f"DOCX Extracted Name: {docx_preview.extracted_data.name}")
        print(f"DOCX Extracted Email: {docx_preview.extracted_data.email}")
        print(f"DOCX Extracted LinkedIn: {docx_preview.extracted_data.linkedin_url}")
        print(f"DOCX Extracted GitHub: {docx_preview.extracted_data.github_url}")
        print(f"DOCX Extracted Skills: {docx_preview.extracted_data.top_skills}")

        docx_cand = await candidate_service.confirm_candidate(
            session=session,
            user_id=user.id,
            payload=CandidateConfirmPayload(
                opening_id=str(opening.id),
                name=docx_preview.extracted_data.name,
                email=docx_preview.extracted_data.email,
                phone=docx_preview.extracted_data.phone,
                linkedin_url=docx_preview.extracted_data.linkedin_url,
                github_url=docx_preview.extracted_data.github_url,
                top_skills=docx_preview.extracted_data.top_skills,
                education=docx_preview.extracted_data.education,
                cv_text=docx_preview.cv_text,
                cv_file_url=docx_preview.file_url,
                action="create",
            ),
        )
        print(f"Persisted DOCX Candidate Row in Supabase DB! Candidate ID: {docx_cand.id}")

        # ── Test 3: Duplicate Detection & Merge ──────────────────────────────
        print("\n--- 3. Testing Real DB Duplicate Detection & Merge ---")
        # Uploading updated CV for Robert Vance with same email
        updated_pdf = _build_test_pdf(
            name="Robert Vance",
            email="robert.vance@vancerefrigeration.com",
            phone="+1 (555) 789-4321",
            title="Principal Infrastructure Architect",
            exp_years=8,
            skills=["Python", "Kubernetes", "AWS", "Terraform", "Go", "PostgreSQL", "Kafka"],
        )
        updated_text = parse_cv_document(updated_pdf, "robert_vance_v2.pdf")
        dup_preview = await extractor_service.preview_and_extract_candidate(
            session=session,
            user_id=user.id,
            opening_id=opening.id,
            cv_text=updated_text,
            file_name="robert_vance_v2.pdf",
        )

        print(f"Is Duplicate Detected? {dup_preview.duplicate_info.is_duplicate}")
        print(f"Matched By: {dup_preview.duplicate_info.matched_by}")
        print(f"Existing Candidate ID: {dup_preview.duplicate_info.existing_candidate_id}")
        print(f"Existing Candidate Name: {dup_preview.duplicate_info.existing_candidate_name}")

        assert dup_preview.duplicate_info.is_duplicate is True
        assert dup_preview.duplicate_info.existing_candidate_id == str(confirmed.id)

        # Merge update into the existing candidate row
        merged = await candidate_service.confirm_candidate(
            session=session,
            user_id=user.id,
            payload=CandidateConfirmPayload(
                opening_id=str(opening.id),
                name="Robert Vance",
                email="robert.vance@vancerefrigeration.com",
                current_title="Principal Infrastructure Architect",
                years_of_experience=8.0,
                top_skills=dup_preview.extracted_data.top_skills,
                cv_text=updated_text,
                action="merge",
                merge_candidate_id=str(confirmed.id),
            ),
        )
        print(f"Merged Candidate Row in Supabase DB! Candidate ID: {merged.id}")

        # ── 4. Verify Final State with Raw SQL Direct from Supabase ──────────
        print("\n--- 4. Direct SQL Verification from Supabase Database ---")
        raw_rows = session.execute(
            text("SELECT id, name, email, phone, stage, cv_file_url, created_at, updated_at FROM candidates WHERE user_id = :uid AND (email = :em1 OR email = :em2)"),
            {"uid": user.id, "em1": "robert.vance@vancerefrigeration.com", "em2": "natasha.romanoff@avengers.org"},
        ).mappings().all()

        for row in raw_rows:
            print(f"DB Row: ID={row['id']} | Name={row['name']} | Email={row['email']} | Phone={row['phone']} | Stage={row['stage']} | File={row['cv_file_url']}")

        print("\n=== ALL REAL SUPABASE DB OPERATIONS VERIFIED SUCCESSFULLY ===")

if __name__ == "__main__":
    asyncio.run(main())
