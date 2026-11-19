"""
app/routers/candidates.py
~~~~~~~~~~~~~~~~~~~~~~~~~
CRUD, PDF CV upload with pypdf extraction, AI scoring (OpenRouter),
stage transitions, and screening question generation for Candidates.

All routes require authentication (CurrentUser) and are strictly scoped
to the authenticated recruiter.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status

from app.core.dependencies import CurrentUser
from app.core.rate_limit import rate_limit
from app.db import SessionDep
from app.models.candidate import CandidateStage
from app.schemas.candidate import (
    CandidateBulkActionResult,
    CandidateBulkDelete,
    CandidateBulkStageUpdate,
    CandidateCreate,
    CandidateDataExportResponse,
    CandidateRead,
    CandidateScreeningQuestionsResponse,
    CandidateScreenResult,
    CandidateStageUpdate,
    CandidateUpdate,
    PaginatedCandidates,
)
from app.schemas.audit_log import AuditLogRead, PaginatedAuditLogs
from app.schemas.extractor import (
    CandidateConfirmPayload,
    CandidateExtractedDetails,
    CandidateExtractionPreviewResponse,
    CandidateExtractTextRequest,
    CandidateLinkRead,
)
from app.core.pdf import parse_cv_document
from app.core.storage import save_candidate_cv_file
from app.models.candidate_link import CandidateLink
from app.services.candidate_service import candidate_service
from app.services.extractor_service import extractor_service
from app.services.audit_log_service import audit_log_service
from sqlmodel import select

router = APIRouter(prefix="/candidates", tags=["Candidates"])


@router.post(
    "",
    response_model=CandidateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a new candidate with CV text",
)
def create_candidate(
    body: CandidateCreate,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateRead:
    """Create a new candidate linked to a recruiter's job opening."""
    return candidate_service.create(
        session=session,
        user_id=current_user.id,
        data=body,
    )


@router.post(
    "/extract-cv",
    response_model=CandidateExtractionPreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Upload-first candidate CV extraction (PDF/DOCX) with heuristics, OCR fallback, and duplicate detection",
)
async def extract_candidate_cv(
    session: SessionDep,
    current_user: CurrentUser,
    opening_id: uuid.UUID = Form(..., description="Target JobOpening ID"),
    file: UploadFile = File(..., description="Candidate CV file (PDF or DOCX)"),
) -> CandidateExtractionPreviewResponse:
    """
    Parses CV document (PDF with pypdf and OCR fallback, or DOCX with python-docx),
    saves file to Supabase storage with local fallback, extracts structured fields
    (name, email, phone, links, title, experience, skills, education) using heuristics
    first then LLM gaps, and checks database for duplicates.
    """
    filename = (file.filename or "cv.pdf").strip()
    lower_fn = filename.lower()

    if not (lower_fn.endswith(".pdf") or lower_fn.endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Please upload PDF or DOCX documents.",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10MB limit.",
        )

    # 1. Parse text from document (PDF / DOCX / OCR fallback)
    extracted_text = parse_cv_document(content, filename)
    if not extracted_text or len(extracted_text.strip()) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not extract readable text from document. Please ensure it contains searchable text.",
        )

    # 2. Save CV file to Supabase Storage with local persistent fallback
    saved_url = save_candidate_cv_file(filename, content, file.content_type or "application/pdf")

    # 3. Run heuristic extraction + LLM gap filling + duplicate check against DB
    return await extractor_service.preview_and_extract_candidate(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        cv_text=extracted_text,
        file_name=filename,
        file_url=saved_url,
    )


@router.post(
    "/extract-text",
    response_model=CandidateExtractionPreviewResponse,
    status_code=status.HTTP_200_OK,
    summary="Extract structured candidate details from pasted CV text with duplicate detection",
)
async def extract_candidate_text(
    body: CandidateExtractTextRequest,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateExtractionPreviewResponse:
    """
    Extracts structured fields from pasted CV text using heuristics first then LLM gaps,
    and checks database for duplicates.
    """
    raw_text = (body.cv_text or "").strip()
    if len(raw_text) < 20:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pasted CV text must be at least 20 characters long.",
        )

    opening_uuid = uuid.UUID(body.opening_id)
    return await extractor_service.preview_and_extract_candidate(
        session=session,
        user_id=current_user.id,
        opening_id=opening_uuid,
        cv_text=raw_text,
        file_name="pasted_text.txt",
        file_url=None,
    )


@router.post(
    "/confirm-extracted",
    response_model=CandidateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Confirm and persist extracted candidate into pipeline with duplicate merge/skip support",
)
async def confirm_extracted_candidate(
    body: CandidateConfirmPayload,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateRead:
    """
    Persists reviewed candidate details into database. Supports creating new candidate
    or merging into existing candidate when duplicate was detected.
    If auto_screen is enabled, queues/triggers AI scoring immediately.
    """
    return await candidate_service.confirm_candidate(
        session=session,
        user_id=current_user.id,
        payload=body,
    )


@router.post(
    "/upload",
    response_model=CandidateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Upload candidate CV (PDF/DOCX) with automatic text extraction",
)
async def upload_candidate_cv(
    session: SessionDep,
    current_user: CurrentUser,
    opening_id: uuid.UUID = Form(..., description="Job opening to associate candidate with"),
    name: Optional[str] = Form(None, description="Candidate name (optional, extracted automatically if omitted)"),
    email: Optional[str] = Form(None, description="Candidate email (optional, extracted automatically if omitted)"),
    file: UploadFile = File(..., description="CV file (PDF or DOCX)"),
) -> CandidateRead:
    """
    Extract text content from uploaded CV using document parser and create a new candidate.
    """
    filename = (file.filename or "cv.pdf").lower()
    if not (filename.endswith(".pdf") or filename.endswith(".docx")):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF (.pdf) and Word (.docx) files are supported for resume text extraction.",
        )

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty (0 bytes).",
        )

    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File size exceeds the 10MB limit.",
        )

    return candidate_service.create_from_pdf(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        name=name,
        email=email,
        pdf_bytes=content,
        cv_file_url=file.filename,
    )


@router.post(
    "/{candidate_id}/upload-cv",
    response_model=CandidateRead,
    status_code=status.HTTP_200_OK,
    summary="Update existing candidate CV via PDF upload",
)
async def update_candidate_cv_pdf(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    file: UploadFile = File(..., description="PDF CV file"),
) -> CandidateRead:
    """
    Replace candidate CV text by parsing an uploaded PDF document.
    """
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files (.pdf) are supported.",
        )

    content = await file.read()
    return candidate_service.upload_pdf_cv(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        pdf_bytes=content,
        cv_file_url=file.filename,
    )


@router.get(
    "",
    response_model=PaginatedCandidates,
    status_code=status.HTTP_200_OK,
    summary="List candidates",
)
def list_candidates(
    session: SessionDep,
    current_user: CurrentUser,
    opening_id: Optional[uuid.UUID] = Query(default=None),
    stage: Optional[CandidateStage] = Query(default=None),
    min_score: Optional[float] = Query(default=None, ge=0.0, le=100.0),
    search: Optional[str] = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
) -> PaginatedCandidates:
    """List candidates belonging to the authenticated recruiter."""
    return candidate_service.list(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        stage=stage,
        min_score=min_score,
        search=search,
        skip=skip,
        limit=limit,
    )


@router.get(
    "/{candidate_id}",
    response_model=CandidateRead,
    status_code=status.HTTP_200_OK,
    summary="Get candidate by ID",
)
def get_candidate(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateRead:
    """Get candidate details including evaluation scores and scorecards."""
    return candidate_service.get_read_by_id(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


@router.patch(
    "/{candidate_id}",
    response_model=CandidateRead,
    status_code=status.HTTP_200_OK,
    summary="Update candidate",
)
def update_candidate(
    candidate_id: uuid.UUID,
    body: CandidateUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateRead:
    """Update candidate details."""
    return candidate_service.update(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        data=body,
    )


@router.patch(
    "/{candidate_id}/stage",
    response_model=CandidateRead,
    status_code=status.HTTP_200_OK,
    summary="Update candidate pipeline stage",
)
def update_candidate_stage(
    candidate_id: uuid.UUID,
    body: CandidateStageUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateRead:
    """Update candidate's pipeline stage (applied, screening, interview, offer, rejected)."""
    return candidate_service.update_stage(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        stage=body.stage,
    )


@router.post(
    "/{candidate_id}/resend-auto-reply",
    response_model=CandidateRead,
    status_code=status.HTTP_200_OK,
    summary="Resend 'CV received' email to candidate from recruiter's Gmail",
)
def resend_auto_reply(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateRead:
    """Manually dispatch or re-try the Initial Message 'CV received' confirmation email."""
    return candidate_service.resend_auto_reply(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


@router.post(
    "/{candidate_id}/score",
    response_model=CandidateScreenResult,
    status_code=status.HTTP_200_OK,
    summary="Score candidate using OpenRouter (strict JSON: score, matched skills, missing skills, red flags, summary)",
    dependencies=[Depends(rate_limit(times=20, seconds=60, scope="candidates:score"))],
)
async def score_candidate(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    re_run: bool = Query(default=False, description="Bypass cache and force AI re-evaluation"),
) -> CandidateScreenResult:
    """
    Score candidate CV against target Job Opening using OpenRouter.
    Returns strict JSON: score, matched_skills, missing_skills, red_flags, summary.
    Updates candidate record in database and transitions stage to 'screening'.
    Supports caching per (candidate_id, opening_id, cv_hash) unless re_run=True.
    """
    return await candidate_service.score_candidate(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        re_run=re_run,
    )


@router.post(
    "/{candidate_id}/screen",
    response_model=CandidateScreenResult,
    status_code=status.HTTP_200_OK,
    summary="Screen candidate with AI (alias for /score)",
    dependencies=[Depends(rate_limit(times=20, seconds=60, scope="candidates:score"))],
)
async def screen_candidate(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    re_run: bool = Query(default=False, description="Bypass cache and force AI re-evaluation"),
) -> CandidateScreenResult:
    """Screen candidate against job requirements (alias for POST /candidates/{id}/score)."""
    return await candidate_service.score_candidate(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        re_run=re_run,
    )


@router.post(
    "/{candidate_id}/screening-questions",
    response_model=CandidateScreeningQuestionsResponse,
    status_code=status.HTTP_200_OK,
    summary="Generate targeted screening questions probing candidate gaps and red flags",
)
async def generate_screening_questions(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    count: int = Query(default=5, ge=1, le=15),
) -> CandidateScreeningQuestionsResponse:
    """
    Generate targeted interview/screening questions tailored specifically to this
    candidate's background, CV gaps, and identified red flags.
    """
    return await candidate_service.generate_screening_questions(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
        count=count,
    )


# ── Contact & Profile Link Extraction ─────────────────────────────────────────

@router.post(
    "/{candidate_id}/extract-details",
    response_model=CandidateExtractedDetails,
    status_code=status.HTTP_200_OK,
    summary="Extract candidate contact info and links (regex first, then LLM, with URL verify)",
)
async def extract_candidate_details(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
    verify_urls: bool = Query(default=True, description="Verify GitHub and Kaggle URLs resolve via HEAD request"),
) -> CandidateExtractedDetails:
    """Extract candidate contact details and online links using hybrid regex + LLM."""
    return await extractor_service.extract_candidate_details(
        session=session,
        candidate_id=candidate_id,
        user_id=current_user.id,
        verify_urls=verify_urls,
    )


@router.get(
    "/{candidate_id}/links",
    response_model=List[CandidateLinkRead],
    summary="List all extracted profile and portfolio links for candidate",
)
def list_candidate_links(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> List[CandidateLinkRead]:
    """Retrieve all extracted and verified online profile links for a candidate."""
    links = session.exec(
        select(CandidateLink).where(
            CandidateLink.candidate_id == candidate_id,
            CandidateLink.user_id == current_user.id,
        )
    ).all()
    return [
        CandidateLinkRead(
            id=str(l.id),
            candidate_id=str(l.candidate_id),
            link_type=l.link_type,
            url=l.url,
            is_verified=l.is_verified,
            confidence=l.confidence,
            source=l.source,
        )
        for l in links
    ]


@router.get(
    "/{candidate_id}/export",
    response_model=CandidateDataExportResponse,
    status_code=status.HTTP_200_OK,
    summary="Export all candidate data (GDPR subject access export)",
)
def export_candidate_data(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateDataExportResponse:
    """
    Retrieve full candidate profile, verified links, scorecards, messages,
    interviews, scheduling links, and audit trail for export.
    """
    return candidate_service.export_candidate_data(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


@router.delete(
    "/{candidate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete candidate",
)
def delete_candidate(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> None:
    """Delete a candidate and their scorecards."""
    candidate_service.delete(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )


# ── Bulk Actions & Audit Log Endpoints ────────────────────────────────────────

@router.post(
    "/bulk-stage",
    response_model=CandidateBulkActionResult,
    summary="Bulk update candidate stages with audit log tracking",
)
def bulk_update_candidate_stage(
    payload: CandidateBulkStageUpdate,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateBulkActionResult:
    """Move multiple candidates to a target pipeline stage simultaneously."""
    updated = candidate_service.bulk_update_stage(
        session=session,
        user_id=current_user.id,
        candidate_ids=payload.candidate_ids,
        stage=payload.stage,
    )
    return CandidateBulkActionResult(
        updated_count=updated,
        message=f"Successfully transitioned {updated} candidate(s) to '{payload.stage.value}'.",
    )


@router.post(
    "/bulk-delete",
    response_model=CandidateBulkActionResult,
    summary="Bulk delete candidates",
)
def bulk_delete_candidates(
    payload: CandidateBulkDelete,
    session: SessionDep,
    current_user: CurrentUser,
) -> CandidateBulkActionResult:
    """Delete multiple candidates in batch."""
    deleted = candidate_service.bulk_delete(
        session=session,
        user_id=current_user.id,
        candidate_ids=payload.candidate_ids,
    )
    return CandidateBulkActionResult(
        updated_count=deleted,
        message=f"Successfully deleted {deleted} candidate(s).",
    )


@router.get(
    "/audit-logs/recent",
    response_model=PaginatedAuditLogs,
    summary="Get recent candidate pipeline audit log entries",
)
def get_recent_audit_logs(
    session: SessionDep,
    current_user: CurrentUser,
    opening_id: Optional[uuid.UUID] = Query(None, description="Optional job opening filter"),
    limit: int = Query(50, ge=1, le=100),
    skip: int = Query(0, ge=0),
) -> PaginatedAuditLogs:
    """Retrieve full audit log feed for recruiter actions and candidate stage changes."""
    return audit_log_service.list_recent(
        session=session,
        user_id=current_user.id,
        opening_id=opening_id,
        limit=limit,
        skip=skip,
    )


@router.get(
    "/{candidate_id}/audit-logs",
    response_model=List[AuditLogRead],
    summary="Get candidate-specific audit log trail",
)
def get_candidate_audit_logs(
    candidate_id: uuid.UUID,
    session: SessionDep,
    current_user: CurrentUser,
) -> List[AuditLogRead]:
    """Retrieve audit history and stage transitions for an individual candidate."""
    return audit_log_service.list_for_candidate(
        session=session,
        user_id=current_user.id,
        candidate_id=candidate_id,
    )
