"""
Google Sheets Sync Service for Shortlisted Candidates.
Creates a spreadsheet per job opening (or updates existing),
upserts rows by candidate_id, and keeps columns strictly stable.
"""
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import httpx
from sqlmodel import Session, select

from app.models.candidate import Candidate
from app.models.google_account import GoogleAccount
from app.models.job_opening import JobOpening
from app.schemas.extractor import GoogleSheetSyncResponse
from app.services.google_service import GoogleService

logger = logging.getLogger(__name__)

SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets"

COLUMNS = [
    "Candidate ID",
    "Rank",
    "Name",
    "Email",
    "Phone",
    "Address",
    "Fit Score",
    "Stage",
    "LinkedIn",
    "GitHub",
    "Kaggle",
    "Portfolio",
    "Matched Skills",
    "Missing Skills",
    "Summary",
    "Last Updated",
]


class GoogleSheetsService:
    def _candidate_to_row(self, cand: Candidate, rank: int) -> List[Any]:
        """Convert a candidate model to a stable spreadsheet row format."""
        score_val = f"{cand.score:.1f}%" if cand.score is not None else "Unscored"
        matched = ", ".join(cand.matched_skills or [])
        missing = ", ".join(cand.missing_skills or [])
        summary = (cand.summary or "").replace("\n", " ").strip()

        return [
            str(cand.id),
            str(rank),
            cand.name,
            cand.email,
            cand.phone or "",
            cand.address or "",
            score_val,
            cand.stage.capitalize() if hasattr(cand.stage, "capitalize") else str(cand.stage),
            cand.linkedin_url or "",
            cand.github_url or "",
            cand.kaggle_url or "",
            cand.portfolio_url or "",
            matched,
            missing,
            summary,
            datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
        ]

    async def sync_opening_candidates_to_sheet(
        self,
        session: Session,
        opening_id: uuid.UUID,
        user_id: uuid.UUID,
    ) -> GoogleSheetSyncResponse:
        """
        Synchronize opening candidates to Google Sheets:
          1. Verifies linked Google Workspace account.
          2. Finds or creates a spreadsheet for this opening.
          3. Upserts rows by Candidate ID.
          4. Returns spreadsheet URL and sync summary.
        """
        # 1. Check Google Account
        google_service = GoogleService(session)
        account = session.exec(
            select(GoogleAccount).where(GoogleAccount.user_id == user_id)
        ).first()

        if not account:
            raise ValueError(
                "No Google account connected. Please connect your Google Workspace account in Settings first."
            )

        access_token = google_service.get_valid_access_token(account)

        # 2. Fetch Opening
        opening = session.exec(
            select(JobOpening).where(
                JobOpening.id == opening_id,
                JobOpening.user_id == user_id,
            )
        ).first()

        if not opening:
            raise ValueError(f"Job opening '{opening_id}' not found.")

        # 3. Fetch Candidates (sorted by score descending for ranking)
        candidates = session.exec(
            select(Candidate)
            .where(
                Candidate.opening_id == opening_id,
                Candidate.user_id == user_id,
            )
            .order_by(Candidate.score.desc().nullslast())
        ).all()

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/json",
        }

        async with httpx.AsyncClient(timeout=30.0) as client:
            spreadsheet_id = opening.google_sheet_id
            spreadsheet_url = opening.google_sheet_url

            # 4. Check or Create Spreadsheet
            if not spreadsheet_id:
                create_payload = {
                    "properties": {
                        "title": f"Candidate Shortlist — {opening.title}",
                    },
                    "sheets": [
                        {
                            "properties": {
                                "title": "Candidates",
                                "gridProperties": {
                                    "frozenRowCount": 1,
                                },
                            }
                        }
                    ],
                }
                resp = await client.post(SHEETS_API_BASE, json=create_payload, headers=headers)
                if not resp.is_success:
                    logger.error("Failed to create Google Sheet: %s", resp.text)
                    raise ValueError(f"Failed to create Google Sheet: {resp.text}")

                sheet_data = resp.json()
                spreadsheet_id = sheet_data["spreadsheetId"]
                spreadsheet_url = sheet_data.get(
                    "spreadsheetUrl",
                    f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}",
                )

                # Save spreadsheet ID on opening
                opening.google_sheet_id = spreadsheet_id
                opening.google_sheet_url = spreadsheet_url
                session.add(opening)
                session.commit()

                # Add headers row
                await client.put(
                    f"{SHEETS_API_BASE}/{spreadsheet_id}/values/Candidates!A1:P1?valueInputOption=USER_ENTERED",
                    json={"values": [COLUMNS]},
                    headers=headers,
                )

            # 5. Read Existing Data to map candidate IDs
            read_resp = await client.get(
                f"{SHEETS_API_BASE}/{spreadsheet_id}/values/Candidates!A:P",
                headers=headers,
            )
            existing_values = read_resp.json().get("values", []) if read_resp.is_success else []

            # Map candidate_id -> 1-based row index (Row 1 is headers)
            row_map: Dict[str, int] = {}
            for idx, row in enumerate(existing_values):
                if idx == 0 or not row:
                    continue
                cid = row[0].strip()
                row_map[cid] = idx + 1

            rows_updated = 0
            rows_appended = 0

            # 6. Upsert rows by Candidate ID
            for rank_idx, cand in enumerate(candidates, start=1):
                row_data = self._candidate_to_row(cand, rank=rank_idx)
                cid_str = str(cand.id)

                if cid_str in row_map:
                    # Update existing row
                    row_num = row_map[cid_str]
                    update_resp = await client.put(
                        f"{SHEETS_API_BASE}/{spreadsheet_id}/values/Candidates!A{row_num}:P{row_num}?valueInputOption=USER_ENTERED",
                        json={"values": [row_data]},
                        headers=headers,
                    )
                    if update_resp.is_success:
                        rows_updated += 1
                else:
                    # Append new row
                    append_resp = await client.post(
                        f"{SHEETS_API_BASE}/{spreadsheet_id}/values/Candidates!A:P:append?valueInputOption=USER_ENTERED",
                        json={"values": [row_data]},
                        headers=headers,
                    )
                    if append_resp.is_success:
                        rows_appended += 1

            return GoogleSheetSyncResponse(
                spreadsheet_id=spreadsheet_id,
                spreadsheet_url=spreadsheet_url or f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}",
                total_candidates_synced=len(candidates),
                rows_updated=rows_updated,
                rows_appended=rows_appended,
                synced_at=datetime.now(timezone.utc).isoformat(),
            )


google_sheets_service = GoogleSheetsService()
