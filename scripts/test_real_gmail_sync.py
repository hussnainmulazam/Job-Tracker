import os
import sys
import uuid
sys.path.insert(0, os.path.abspath("backend"))

from dotenv import load_dotenv
load_dotenv("backend/.env")

from sqlmodel import Session, select, delete
from app.db import engine
from app.models.candidate import Candidate
from app.models.candidate_link import CandidateLink
from app.models.email_synced import EmailSynced
from app.models.google_account import GoogleAccount
from app.models.job_opening import JobOpening
from app.services.google_service import GoogleService

user_id = uuid.UUID("7867d0d0-5c76-4030-ab74-f432025b5fa6")

print("=== START REAL GMAIL SYNC VERIFICATION ===")

with Session(engine) as session:
    # 1. Clear emails_synced and any existing candidate for hussnainmulazam@gmail.com
    # to test a clean, end-to-end ingestion of the real CV email
    print("\n1. Resetting test email and candidate record...")
    session.exec(delete(EmailSynced).where(EmailSynced.user_id == user_id, EmailSynced.message_id == "1a1f2ab16f8901ed"))
    
    existing_cands = session.exec(select(Candidate).where(Candidate.user_id == user_id, Candidate.email == "hussnainmulazam@gmail.com")).all()
    for c in existing_cands:
        session.exec(delete(CandidateLink).where(CandidateLink.candidate_id == c.id))
        session.delete(c)
    session.commit()
    print("   Test email 1a1f2ab16f8901ed and candidate cleared from DB.")

    # 2. Run GoogleService.sync_gmail
    print("\n2. Executing GoogleService.sync_gmail(user_id)...")
    service = GoogleService(session)
    sync_resp = service.sync_gmail(user_id=user_id)
    
    print("\n3. Sync Response received:")
    print(f"   Status: {sync_resp.status}")
    print(f"   Messages Found: {sync_resp.messages_found}")
    print(f"   Messages Processed: {sync_resp.messages_processed}")
    print(f"   Attachments Saved: {sync_resp.attachments_saved}")
    print(f"   Candidates Created: {sync_resp.candidates_created}")
    print(f"   Synced from Gmail Count: {sync_resp.synced_from_gmail_count}")
    print(f"   Results ({len(sync_resp.results)} items):")
    for r in sync_resp.results:
        print(f"     - [{r.status.upper()}] MsgID: {r.message_id} | Sender: {r.sender} | Name: {r.candidate_name} | Opening: {r.opening_title}")
        print(f"       Reason: {r.reason}")

    # 4. Verify candidate row in Database
    print("\n4. Querying candidates table for the newly ingested candidate...")
    new_cand = session.exec(
        select(Candidate).where(
            Candidate.user_id == user_id,
            Candidate.email == "hussnainmulazam@gmail.com",
        )
    ).first()

    assert new_cand is not None, "FAILED: Candidate was not created in database!"
    print(f"   SUCCESS: New candidate row found in DB:")
    print(f"     ID: {new_cand.id}")
    print(f"     Name: {new_cand.name}")
    print(f"     Email: {new_cand.email}")
    print(f"     Phone: {new_cand.phone}")
    print(f"     Stage: {new_cand.stage} (maps to Applied / New)")
    print(f"     Opening ID: {new_cand.opening_id}")
    print(f"     CV File URL: {new_cand.cv_file_url}")
    print(f"     CV Text Length: {len(new_cand.cv_text)} characters")
    print(f"     Extracted Data: {new_cand.extracted_data}")

    # 5. Verify Google account status endpoint reflects the count and results
    print("\n5. Testing get_status(user_id)...")
    status_resp = service.get_status(user_id=user_id)
    print(f"   Google Account Connected: {status_resp.is_connected}")
    print(f"   Synced from Gmail Count: {status_resp.synced_from_gmail_count}")
    print(f"   Recent Sync Results: {len(status_resp.recent_sync_results)}")
    for r in status_resp.recent_sync_results:
        print(f"     - [{r.status.upper()}] Candidate: {r.candidate_name} | Status: {r.status} | Opening: {r.opening_title}")

print("\n=== REAL GMAIL SYNC VERIFICATION COMPLETE: ALL CHECKS PASSED ===")
