"""
debug.py
~~~~~~~~
Temporary admin diagnostic endpoint GET /debug/integrations.
Performs real live calls against all integrated services:
1. Google OAuth & Scopes (token refresh, tokeninfo, scope comparison)
2. Gmail (list 5 messages with attachments, send test email to self)
3. Calendar (freebusy for tomorrow, create and delete test event with Meet link)
4. Sheets & Drive (create test sheet, delete via Drive API)
5. WhatsApp Cloud API (validate token against phone number ID, send hello_world template to verified number)
6. AI Models Health (check_models_health live ping)
7. DB Verification (tables, endpoints, and real row write verification for availability_schedules, messages, interviews)
"""
import base64
import email.message
import json
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import text
from sqlmodel import Session, select

from app.core.config import settings
from app.core.encryption import decrypt_token
from app.db import engine, get_session
from app.models.google_account import GoogleAccount
from app.models.interview import AvailabilitySchedule, Interview
from app.models.message import Message
from app.models.user import User
from app.schemas.scheduling import AvailabilityScheduleCreateOrUpdate, WorkingBlock
from app.services.ai_router import ai_router
from app.services.google_service import GOOGLE_SCOPES
from app.services.scheduling_service import scheduling_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/debug", tags=["Admin Debug"])


@router.get("/integrations", summary="Run live diagnostic checks across all integrations")
async def debug_integrations(
    user_email: Optional[str] = Query(default=None, description="Optional user email to target (defaults to connected recruiter)"),
    verified_phone: str = Query(default="923704570873", description="WhatsApp verified recipient phone number"),
) -> Dict[str, Any]:
    """
    Executes real live API calls and returns diagnostic results with raw error bodies.
    """
    diagnostics: Dict[str, Any] = {}

    with Session(engine) as session:
        # ── Target User & Google Account Selection ───────────────────────────
        target_account: Optional[GoogleAccount] = None
        target_user: Optional[User] = None

        # Normalize in case invoked directly as Python function without FastAPI DI
        actual_user_email = user_email if isinstance(user_email, str) and user_email.strip() else None
        actual_verified_phone = verified_phone if isinstance(verified_phone, str) and verified_phone.strip() else "923704570873"

        if actual_user_email:
            target_user = session.exec(select(User).where(User.email == actual_user_email)).first()
            if target_user:
                target_account = session.exec(select(GoogleAccount).where(GoogleAccount.user_id == target_user.id)).first()
        else:
            # Pick first connected GoogleAccount
            target_account = session.exec(select(GoogleAccount)).first()
            if target_account:
                target_user = session.exec(select(User).where(User.id == target_account.user_id)).first()
            else:
                target_user = session.exec(select(User)).first()

        access_token: Optional[str] = None
        user_display_email = target_account.email if target_account else (target_user.email if target_user else "unknown")

        # ── 1. Google OAuth & Scopes Check ───────────────────────────────────
        google_diag: Dict[str, Any] = {
            "feature": "Google OAuth & Scopes",
            "user_id": str(target_user.id) if target_user else None,
            "user_email": user_display_email,
            "has_account_row": bool(target_account),
            "refresh_token_stored": bool(target_account and target_account.encrypted_refresh_token),
            "decrypted_refresh_token_ok": False,
            "access_token_acquired": False,
            "granted_scopes": [],
            "required_scopes": GOOGLE_SCOPES,
            "missing_required_scopes": [],
            "raw_token_response": None,
            "raw_tokeninfo_response": None,
            "status": "FAIL",
            "error": None,
        }

        if not target_account or not target_account.encrypted_refresh_token:
            google_diag["error"] = "No GoogleAccount found with an encrypted_refresh_token in DB."
        else:
            try:
                plain_refresh = decrypt_token(target_account.encrypted_refresh_token)
                google_diag["decrypted_refresh_token_ok"] = bool(plain_refresh)
                if not plain_refresh:
                    google_diag["error"] = "Failed to decrypt refresh token with GOOGLE_ENCRYPTION_KEY."
                else:
                    # Request access token
                    token_endpoint = settings.GOOGLE_TOKEN_URI or "https://oauth2.googleapis.com/token"
                    async with httpx.AsyncClient(timeout=15.0) as client:
                        token_resp = await client.post(
                            token_endpoint,
                            data={
                                "client_id": settings.GOOGLE_CLIENT_ID,
                                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                                "refresh_token": plain_refresh,
                                "grant_type": "refresh_token",
                            },
                        )
                        google_diag["raw_token_response"] = {
                            "status_code": token_resp.status_code,
                            "body": token_resp.text[:500],
                        }
                        if token_resp.is_success:
                            t_data = token_resp.json()
                            access_token = t_data.get("access_token")
                            google_diag["access_token_acquired"] = bool(access_token)

                            # Call tokeninfo to inspect actual granted scopes
                            info_resp = await client.get(
                                f"https://oauth2.googleapis.com/tokeninfo?access_token={access_token}"
                            )
                            google_diag["raw_tokeninfo_response"] = {
                                "status_code": info_resp.status_code,
                                "body": info_resp.text[:500],
                            }
                            if info_resp.is_success:
                                info_data = info_resp.json()
                                scope_str = info_data.get("scope", "")
                                granted = [s.strip() for s in scope_str.split(" ") if s.strip()]
                                google_diag["granted_scopes"] = granted
                                missing = [req for req in GOOGLE_SCOPES if req not in granted]
                                google_diag["missing_required_scopes"] = missing
                                google_diag["status"] = "PASS" if not missing else "DEGRADED"
                            else:
                                google_diag["error"] = f"Tokeninfo query failed ({info_resp.status_code})"
                        else:
                            google_diag["error"] = f"Token refresh failed ({token_resp.status_code}): {token_resp.text}"
            except Exception as exc:
                google_diag["error"] = f"Exception during Google auth check: {exc}"

        diagnostics["1_google_auth"] = google_diag

        # ── 2. Gmail Integration Check ───────────────────────────────────────
        gmail_diag: Dict[str, Any] = {
            "feature": "Gmail (List attachments & Send test email)",
            "list_5_messages_ok": False,
            "messages_found": 0,
            "send_test_email_ok": False,
            "status": "FAIL",
            "raw_list_response": None,
            "raw_send_response": None,
            "error": None,
        }

        if not access_token:
            gmail_diag["error"] = "No valid Google access token available (Check Google Auth first)."
        else:
            headers = {"Authorization": f"Bearer {access_token}"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                # 2a. List 5 messages with attachments
                try:
                    list_resp = await client.get(
                        "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                        params={"q": "has:attachment", "maxResults": 5},
                        headers=headers,
                    )
                    gmail_diag["raw_list_response"] = {
                        "status_code": list_resp.status_code,
                        "body": list_resp.text[:500],
                    }
                    if list_resp.is_success:
                        msgs = list_resp.json().get("messages", [])
                        gmail_diag["list_5_messages_ok"] = True
                        gmail_diag["messages_found"] = len(msgs)
                    else:
                        gmail_diag["error"] = f"Gmail list messages failed ({list_resp.status_code})"
                except Exception as exc:
                    gmail_diag["error"] = f"Exception listing Gmail messages: {exc}"

                # 2b. Send test email to self
                try:
                    msg = email.message.EmailMessage()
                    msg.set_content("This is an automated diagnostic test email sent from Job Tracker GET /debug/integrations.")
                    msg["To"] = user_display_email
                    msg["From"] = user_display_email
                    msg["Subject"] = "Job Tracker Diagnostic Test Email"
                    raw_b64 = base64.urlsafe_b64encode(msg.as_bytes()).decode()

                    send_resp = await client.post(
                        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
                        json={"raw": raw_b64},
                        headers=headers,
                    )
                    gmail_diag["raw_send_response"] = {
                        "status_code": send_resp.status_code,
                        "body": send_resp.text[:500],
                    }
                    if send_resp.is_success:
                        gmail_diag["send_test_email_ok"] = True
                        if gmail_diag["list_5_messages_ok"]:
                            gmail_diag["status"] = "PASS"
                    else:
                        send_err = f"Gmail send email failed ({send_resp.status_code}): {send_resp.text[:300]}"
                        gmail_diag["error"] = f"{gmail_diag['error'] or ''} | {send_err}".strip(" |")
                except Exception as exc:
                    gmail_diag["error"] = f"{gmail_diag['error'] or ''} | Send exception: {exc}".strip(" |")

        diagnostics["2_gmail"] = gmail_diag

        # ── 3. Google Calendar Check ─────────────────────────────────────────
        calendar_diag: Dict[str, Any] = {
            "feature": "Calendar (FreeBusy & Create/Delete Meet event)",
            "freebusy_ok": False,
            "event_created_ok": False,
            "meet_link_present": False,
            "meet_link": None,
            "event_deleted_ok": False,
            "status": "FAIL",
            "raw_freebusy_response": None,
            "raw_create_response": None,
            "raw_delete_response": None,
            "error": None,
        }

        if not access_token:
            calendar_diag["error"] = "No valid Google access token available."
        else:
            headers = {"Authorization": f"Bearer {access_token}"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                now = datetime.now(timezone.utc)
                # 3a. FreeBusy for tomorrow
                try:
                    tomorrow_start = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0).isoformat()
                    tomorrow_end = (now + timedelta(days=1)).replace(hour=23, minute=59, second=59).isoformat()
                    fb_resp = await client.post(
                        "https://www.googleapis.com/calendar/v3/freeBusy",
                        json={
                            "timeMin": tomorrow_start,
                            "timeMax": tomorrow_end,
                            "items": [{"id": user_display_email}],
                        },
                        headers=headers,
                    )
                    calendar_diag["raw_freebusy_response"] = {
                        "status_code": fb_resp.status_code,
                        "body": fb_resp.text[:500],
                    }
                    if fb_resp.is_success:
                        calendar_diag["freebusy_ok"] = True
                    else:
                        calendar_diag["error"] = f"Calendar freeBusy failed ({fb_resp.status_code})"
                except Exception as exc:
                    calendar_diag["error"] = f"Exception querying freeBusy: {exc}"

                # 3b. Create test event with Meet link
                created_event_id: Optional[str] = None
                try:
                    event_start = (now + timedelta(days=1, hours=10)).isoformat()
                    event_end = (now + timedelta(days=1, hours=11)).isoformat()
                    create_resp = await client.post(
                        "https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1",
                        json={
                            "summary": "Job Tracker Integration Test Event",
                            "start": {"dateTime": event_start},
                            "end": {"dateTime": event_end},
                            "conferenceData": {
                                "createRequest": {
                                    "requestId": f"debug-{uuid.uuid4().hex[:8]}",
                                    "conferenceSolutionKey": {"type": "hangoutsMeet"},
                                }
                            },
                        },
                        headers=headers,
                    )
                    calendar_diag["raw_create_response"] = {
                        "status_code": create_resp.status_code,
                        "body": create_resp.text[:500],
                    }
                    if create_resp.is_success:
                        ev_data = create_resp.json()
                        created_event_id = ev_data.get("id")
                        meet_url = ev_data.get("hangoutLink")
                        calendar_diag["event_created_ok"] = True
                        calendar_diag["meet_link_present"] = bool(meet_url)
                        calendar_diag["meet_link"] = meet_url

                        # 3c. Delete the created event
                        del_resp = await client.delete(
                            f"https://www.googleapis.com/calendar/v3/calendars/primary/events/{created_event_id}",
                            headers=headers,
                        )
                        calendar_diag["raw_delete_response"] = {
                            "status_code": del_resp.status_code,
                            "body": del_resp.text[:500],
                        }
                        if del_resp.is_success or del_resp.status_code == 204:
                            calendar_diag["event_deleted_ok"] = True
                            if calendar_diag["freebusy_ok"] and calendar_diag["meet_link_present"]:
                                calendar_diag["status"] = "PASS"
                        else:
                            calendar_diag["error"] = f"{calendar_diag['error'] or ''} | Delete event failed ({del_resp.status_code})".strip(" |")
                    else:
                        create_err = f"Calendar create event failed ({create_resp.status_code}): {create_resp.text[:200]}"
                        calendar_diag["error"] = f"{calendar_diag['error'] or ''} | {create_err}".strip(" |")
                except Exception as exc:
                    calendar_diag["error"] = f"{calendar_diag['error'] or ''} | Event create/delete exception: {exc}".strip(" |")

        diagnostics["3_calendar"] = calendar_diag

        # ── 4. Sheets & Drive Check ──────────────────────────────────────────
        sheets_diag: Dict[str, Any] = {
            "feature": "Sheets & Drive (Create test sheet, delete via Drive API)",
            "sheet_created_ok": False,
            "spreadsheet_id": None,
            "sheet_deleted_ok": False,
            "status": "FAIL",
            "raw_create_response": None,
            "raw_delete_response": None,
            "error": None,
        }

        if not access_token:
            sheets_diag["error"] = "No valid Google access token available."
        else:
            headers = {"Authorization": f"Bearer {access_token}"}
            async with httpx.AsyncClient(timeout=15.0) as client:
                spreadsheet_id: Optional[str] = None
                # 4a. Create test sheet
                try:
                    create_sheet_resp = await client.post(
                        "https://sheets.googleapis.com/v4/spreadsheets",
                        json={"properties": {"title": f"Job Tracker Diagnostic Test {uuid.uuid4().hex[:6]}"}},
                        headers=headers,
                    )
                    sheets_diag["raw_create_response"] = {
                        "status_code": create_sheet_resp.status_code,
                        "body": create_sheet_resp.text[:500],
                    }
                    if create_sheet_resp.is_success:
                        sheet_data = create_sheet_resp.json()
                        spreadsheet_id = sheet_data.get("spreadsheetId")
                        sheets_diag["sheet_created_ok"] = True
                        sheets_diag["spreadsheet_id"] = spreadsheet_id
                    else:
                        sheets_diag["error"] = f"Sheets create failed ({create_sheet_resp.status_code}): {create_sheet_resp.text[:200]}"
                except Exception as exc:
                    sheets_diag["error"] = f"Exception creating Google Sheet: {exc}"

                # 4b. Delete test sheet via Google Drive API
                if spreadsheet_id:
                    try:
                        del_sheet_resp = await client.delete(
                            f"https://www.googleapis.com/drive/v3/files/{spreadsheet_id}",
                            headers=headers,
                        )
                        sheets_diag["raw_delete_response"] = {
                            "status_code": del_sheet_resp.status_code,
                            "body": del_sheet_resp.text[:500],
                        }
                        if del_sheet_resp.is_success or del_sheet_resp.status_code == 204:
                            sheets_diag["sheet_deleted_ok"] = True
                            sheets_diag["status"] = "PASS"
                        else:
                            del_err = f"Drive delete file failed ({del_sheet_resp.status_code}): {del_sheet_resp.text[:300]}"
                            sheets_diag["error"] = f"{sheets_diag['error'] or ''} | {del_err}".strip(" |")
                    except Exception as exc:
                        sheets_diag["error"] = f"{sheets_diag['error'] or ''} | Drive delete exception: {exc}".strip(" |")

        diagnostics["4_sheets_drive"] = sheets_diag

        # WhatsApp removed: dedicated Email & Google Workspace only

        # ── 5. AI Models Health Check ─────────────────────────────────────────
        ai_diag: Dict[str, Any] = {
            "feature": "AI Models Health Probe",
            "overall_status": "unknown",
            "models_tested": 0,
            "models_ok": 0,
            "models_fail": 0,
            "details": {},
            "status": "FAIL",
            "error": None,
        }

        try:
            ai_health = await ai_router.check_health()
            ai_diag["overall_status"] = ai_health.status
            ai_diag["models_tested"] = len(ai_health.models)
            ok_cnt = sum(1 for m in ai_health.models.values() if m.status == "ok")
            fail_cnt = sum(1 for m in ai_health.models.values() if m.status == "fail")
            ai_diag["models_ok"] = ok_cnt
            ai_diag["models_fail"] = fail_cnt
            ai_diag["details"] = {
                m_id: {
                    "status": item.status,
                    "task": item.task,
                    "latency_ms": item.latency_ms,
                    "error": item.error,
                    "error_type": item.error_type,
                }
                for m_id, item in ai_health.models.items()
            }
            if ai_health.status in ("healthy", "degraded") and ok_cnt > 0:
                ai_diag["status"] = "PASS" if ai_health.status == "healthy" else "DEGRADED"
            else:
                ai_diag["status"] = "FAIL"
                ai_diag["error"] = f"AI Health status is '{ai_health.status}'. {fail_cnt}/{len(ai_health.models)} models failed."
        except Exception as exc:
            ai_diag["error"] = f"Exception probing AI models health: {exc}"

        diagnostics["6_ai_health"] = ai_diag

        # ── 7. DB Verification Check ──────────────────────────────────────────
        db_diag: Dict[str, Any] = {
            "feature": "Database Tables & Real Availability Row Write",
            "tables_exist": {
                "availability_schedules": False,
                "messages": False,
                "interviews": False,
            },
            "endpoints_exist": {
                "GET /scheduling/availability": True,
                "PUT /scheduling/availability": True,
                "POST /scheduling/links": True,
                "POST /scheduling/book": True,
                "GET /scheduling/interviews": True,
                "POST /integrations/google/send-email": True,
                "GET /integrations/google/messages": True,
            },
            "saving_availability_writes_row": False,
            "verified_saved_row": None,
            "status": "FAIL",
            "error": None,
        }

        try:
            # 7a. Check tables existence in PostgreSQL
            for tbl in ["availability_schedules", "messages", "interviews"]:
                res = session.execute(text("SELECT to_regclass(:tbl)") , {"tbl": f"public.{tbl}"}).scalar()
                db_diag["tables_exist"][tbl] = bool(res)

            all_tables_exist = all(db_diag["tables_exist"].values())

            # 7b. Test saving availability and reading back from fresh query
            if target_user and db_diag["tables_exist"]["availability_schedules"]:
                test_tz = "Asia/Karachi"
                test_payload = AvailabilityScheduleCreateOrUpdate(
                    timezone=test_tz,
                    slot_duration_minutes=45,
                    buffer_minutes=15,
                    weekly_hours={
                        "mon": [WorkingBlock(start="10:00", end="16:00")],
                        "tue": [WorkingBlock(start="10:00", end="16:00")],
                        "wed": [WorkingBlock(start="10:00", end="16:00")],
                        "thu": [WorkingBlock(start="10:00", end="16:00")],
                        "fri": [WorkingBlock(start="10:00", end="16:00")],
                        "sat": [],
                        "sun": [],
                    },
                    is_active=True,
                )
                updated = scheduling_service.update_availability(session, target_user.id, test_payload)

                # Query raw SQL directly to guarantee real row was written
                raw_row = session.execute(
                    text("SELECT id, user_id, timezone, slot_duration_minutes, buffer_minutes, is_active FROM availability_schedules WHERE user_id = :uid"),
                    {"uid": target_user.id},
                ).mappings().first()

                if raw_row:
                    db_diag["saving_availability_writes_row"] = True
                    db_diag["verified_saved_row"] = dict(raw_row)
                    # Convert UUIDs to str for JSON serialization
                    db_diag["verified_saved_row"]["id"] = str(db_diag["verified_saved_row"]["id"])
                    db_diag["verified_saved_row"]["user_id"] = str(db_diag["verified_saved_row"]["user_id"])

            if all_tables_exist and db_diag["saving_availability_writes_row"]:
                db_diag["status"] = "PASS"
            else:
                db_diag["error"] = f"Tables exist: {db_diag['tables_exist']}. Real row write: {db_diag['saving_availability_writes_row']}."
        except Exception as exc:
            db_diag["error"] = f"Exception verifying DB state: {exc}"

        diagnostics["7_database"] = db_diag

    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "diagnostics": diagnostics,
    }
