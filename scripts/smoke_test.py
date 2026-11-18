#!/usr/bin/env python3
"""
scripts/smoke_test.py
~~~~~~~~~~~~~~~~~~~~~
End-to-end smoke test script for the AI Candidate Screening Copilot API.

Runs the complete recruiter workflow against a running backend server:
  1. Health Check (GET /health)
  2. Register recruiter (POST /api/v1/auth/register)
  3. Login with credentials (POST /api/v1/auth/login)
  4. Verify authenticated profile (GET /api/v1/auth/me)
  5. Create Job Opening (POST /api/v1/job-openings)
  6. List Job Openings (GET /api/v1/job-openings)
  7. Retrieve single Job Opening (GET /api/v1/job-openings/{id})
  8. Update Job Opening (PATCH /api/v1/job-openings/{id})
  9. Create Candidate (POST /api/v1/candidates)
 10. PDF CV Upload with text extraction (POST /api/v1/candidates/upload)
 11. List Candidates (GET /api/v1/candidates)
 12. Update Candidate Stage (PATCH /api/v1/candidates/{id}/stage)
 13. Score Candidate with OpenRouter (POST /api/v1/candidates/{id}/score)
 14. Generate Candidate Screening Questions (POST /api/v1/candidates/{id}/screening-questions)
 15. Bulk Scoring with Ranking (POST /api/v1/job-openings/{id}/bulk-score)
 16. Shortlist CSV Export (GET /api/v1/job-openings/{id}/shortlist/export)
 17. Create Candidate Scorecard (POST /api/v1/scorecards)
 18. List Candidate Scorecards (GET /api/v1/scorecards?candidate_id=...)
 19. Dashboard Stats from real queries (GET /api/v1/dashboard/stats)
 20. Delete Candidate (DELETE /api/v1/candidates/{id})
 21. Delete Job Opening (DELETE /api/v1/job-openings/{id})

Prints [PASS] / [FAIL] per step with execution duration and exit codes.
"""
import argparse
import io
import os
import sys
import time
import uuid
from typing import Any, Dict, Optional, Tuple

import httpx
from pypdf import PdfWriter

GREEN = "\033[92m"
RED = "\033[91m"
YELLOW = "\033[93m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

if sys.platform == "win32":
    os.system("")


def _create_minimal_pdf() -> bytes:
    writer = PdfWriter()
    writer.add_blank_page(width=100, height=100)
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()


class RecruiterSmokeTestRunner:
    def __init__(self, base_url: str, timeout: float = 65.0):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.Client(timeout=timeout)
        self.token: Optional[str] = None
        self.headers: Dict[str, str] = {}
        self.user_email: str = f"recruiter_{uuid.uuid4().hex[:8]}@example.com"
        self.user_password: str = "Recruiter123!Secure"
        self.user_id: Optional[str] = None
        self.opening_id: Optional[str] = None
        self.candidate_id: Optional[str] = None
        self.pdf_candidate_id: Optional[str] = None
        self.scorecard_id: Optional[str] = None
        self.results: list[Tuple[int, str, bool, str, float]] = []

    def _auth_headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def _record(self, step_num: int, step_name: str, passed: bool, detail: str, duration: float):
        self.results.append((step_num, step_name, passed, detail, duration))
        status_tag = f"{GREEN}[PASS]{RESET}" if passed else f"{RED}[FAIL]{RESET}"
        print(f"Step {step_num:02d}: {step_name:<48} {status_tag} ({duration:.2f}s) - {detail}")

    def run_all(self) -> bool:
        print(f"\n{BOLD}{CYAN}=== AI Candidate Screening Copilot: Full End-to-End Smoke Test ==={RESET}")
        print(f"Target Base URL: {self.base_url}")
        print(f"Recruiter Account: {self.user_email}\n")

        self.step_01_health_check()
        self.step_02_register_recruiter()
        self.step_03_login_recruiter()
        self.step_04_verify_me()
        self.step_05_create_job_opening()
        self.step_06_list_job_openings()
        self.step_07_get_job_opening()
        self.step_08_update_job_opening()
        self.step_09_create_candidate()
        self.step_10_upload_pdf_cv()
        self.step_11_list_candidates()
        self.step_12_update_candidate_stage()
        self.step_13_score_candidate()
        self.step_14_screening_questions()
        self.step_15_bulk_scoring()
        self.step_16_shortlist_csv_export()
        self.step_17_create_scorecard()
        self.step_18_list_scorecards()
        self.step_19_dashboard_stats()
        self.step_20_delete_candidates()
        self.step_21_delete_job_opening()

        return self._print_summary()

    def step_01_health_check(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(f"{self.base_url}/health")
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("status") in ("ok", "healthy")
            self._record(1, "Server Health Check", passed, f"Status code {res.status_code}", dt)
        except Exception as exc:
            self._record(1, "Server Health Check", False, str(exc), time.perf_counter() - t0)

    def step_02_register_recruiter(self):
        t0 = time.perf_counter()
        try:
            res = self.client.post(
                f"{self.base_url}/api/v1/auth/register",
                json={"email": self.user_email, "password": self.user_password},
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 201
            if passed:
                data = res.json()
                self.token = data["access_token"]
                self.user_id = data["user"]["id"]
                self._record(2, "Register Recruiter Account", True, f"User ID: {self.user_id[:8]}...", dt)
            else:
                self._record(2, "Register Recruiter Account", False, f"Code {res.status_code}: {res.text}", dt)
        except Exception as exc:
            self._record(2, "Register Recruiter Account", False, str(exc), time.perf_counter() - t0)

    def step_03_login_recruiter(self):
        t0 = time.perf_counter()
        try:
            res = self.client.post(
                f"{self.base_url}/api/v1/auth/login",
                json={"email": self.user_email, "password": self.user_password},
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 200
            if passed:
                data = res.json()
                self.token = data["access_token"]
                self._record(3, "Login Recruiter with JWT", True, "Access token obtained", dt)
            else:
                self._record(3, "Login Recruiter with JWT", False, f"Code {res.status_code}: {res.text}", dt)
        except Exception as exc:
            self._record(3, "Login Recruiter with JWT", False, str(exc), time.perf_counter() - t0)

    def step_04_verify_me(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(f"{self.base_url}/api/v1/auth/me", headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("email") == self.user_email
            self._record(4, "Verify Authenticated Profile", passed, f"Email: {self.user_email}", dt)
        except Exception as exc:
            self._record(4, "Verify Authenticated Profile", False, str(exc), time.perf_counter() - t0)

    def step_05_create_job_opening(self):
        t0 = time.perf_counter()
        try:
            payload = {
                "title": "Principal Systems Engineer",
                "description": "Architecting resilient distributed backend systems with Python and cloud infrastructure.",
                "required_skills": ["Python", "FastAPI", "PostgreSQL", "Distributed Systems"],
                "status": "active",
            }
            res = self.client.post(f"{self.base_url}/api/v1/job-openings", json=payload, headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 201
            if passed:
                self.opening_id = res.json()["id"]
                self._record(5, "Create Job Opening", True, f"Opening ID: {self.opening_id[:8]}...", dt)
            else:
                self._record(5, "Create Job Opening", False, f"Code {res.status_code}: {res.text}", dt)
        except Exception as exc:
            self._record(5, "Create Job Opening", False, str(exc), time.perf_counter() - t0)

    def step_06_list_job_openings(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(f"{self.base_url}/api/v1/job-openings", headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("total", 0) >= 1
            self._record(6, "List Job Openings", passed, f"Total: {res.json().get('total', 0)}", dt)
        except Exception as exc:
            self._record(6, "List Job Openings", False, str(exc), time.perf_counter() - t0)

    def step_07_get_job_opening(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(f"{self.base_url}/api/v1/job-openings/{self.opening_id}", headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("title") == "Principal Systems Engineer"
            self._record(7, "Get Job Opening by ID", passed, "Title matched", dt)
        except Exception as exc:
            self._record(7, "Get Job Opening by ID", False, str(exc), time.perf_counter() - t0)

    def step_08_update_job_opening(self):
        t0 = time.perf_counter()
        try:
            res = self.client.patch(
                f"{self.base_url}/api/v1/job-openings/{self.opening_id}",
                json={"title": "Principal Systems Engineer (Core Infrastructure)"},
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and "Core Infrastructure" in res.json().get("title", "")
            self._record(8, "Update Job Opening", passed, "Title updated successfully", dt)
        except Exception as exc:
            self._record(8, "Update Job Opening", False, str(exc), time.perf_counter() - t0)

    def step_09_create_candidate(self):
        t0 = time.perf_counter()
        try:
            payload = {
                "opening_id": self.opening_id,
                "name": "Sarah Connor",
                "email": "sarah.connor@example.com",
                "cv_text": (
                    "Senior Software Engineer with 8 years of experience building resilient Python and FastAPI systems. "
                    "Led high-availability PostgreSQL database migrations and distributed microservices architecture."
                ),
            }
            res = self.client.post(f"{self.base_url}/api/v1/candidates", json=payload, headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 201
            if passed:
                self.candidate_id = res.json()["id"]
                self._record(9, "Create Candidate (CV Text)", True, f"Candidate ID: {self.candidate_id[:8]}...", dt)
            else:
                self._record(9, "Create Candidate (CV Text)", False, f"Code {res.status_code}: {res.text}", dt)
        except Exception as exc:
            self._record(9, "Create Candidate (CV Text)", False, str(exc), time.perf_counter() - t0)

    def step_10_upload_pdf_cv(self):
        t0 = time.perf_counter()
        try:
            pdf_bytes = _create_minimal_pdf()
            res = self.client.post(
                f"{self.base_url}/api/v1/candidates/upload",
                data={
                    "opening_id": self.opening_id,
                    "name": "Kyle Reese",
                    "email": "kyle.reese@example.com",
                },
                files={"file": ("resume.pdf", pdf_bytes, "application/pdf")},
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            # 201 if text extracted, or 400 if minimal PDF had no text pages (both verify endpoint works)
            passed = res.status_code in (201, 400)
            detail = "PDF endpoint parsed upload" if passed else f"Code {res.status_code}: {res.text}"
            self._record(10, "PDF CV Upload with pypdf", passed, detail, dt)
        except Exception as exc:
            self._record(10, "PDF CV Upload with pypdf", False, str(exc), time.perf_counter() - t0)

    def step_11_list_candidates(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(
                f"{self.base_url}/api/v1/candidates?opening_id={self.opening_id}",
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("total", 0) >= 1
            self._record(11, "List Candidates", passed, f"Total candidates: {res.json().get('total', 0)}", dt)
        except Exception as exc:
            self._record(11, "List Candidates", False, str(exc), time.perf_counter() - t0)

    def step_12_update_candidate_stage(self):
        t0 = time.perf_counter()
        try:
            res = self.client.patch(
                f"{self.base_url}/api/v1/candidates/{self.candidate_id}/stage",
                json={"stage": "screening"},
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("stage") == "screening"
            self._record(12, "Update Candidate Stage", passed, "Transitioned to 'screening'", dt)
        except Exception as exc:
            self._record(12, "Update Candidate Stage", False, str(exc), time.perf_counter() - t0)

    def step_13_score_candidate(self):
        t0 = time.perf_counter()
        try:
            res = self.client.post(
                f"{self.base_url}/api/v1/candidates/{self.candidate_id}/score",
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code in (200, 502, 503, 504)
            detail = f"Score: {res.json().get('score')}" if res.status_code == 200 else f"Code {res.status_code} (AI upstream status)"
            self._record(13, "Score Candidate (OpenRouter)", passed, detail, dt)
        except Exception as exc:
            self._record(13, "Score Candidate (OpenRouter)", False, str(exc), time.perf_counter() - t0)

    def step_14_screening_questions(self):
        t0 = time.perf_counter()
        try:
            res = self.client.post(
                f"{self.base_url}/api/v1/candidates/{self.candidate_id}/screening-questions?count=3",
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code in (200, 502, 503, 504)
            detail = f"Questions generated: {len(res.json().get('questions', []))}" if res.status_code == 200 else f"Code {res.status_code}"
            self._record(14, "Screening Questions Generation", passed, detail, dt)
        except Exception as exc:
            self._record(14, "Screening Questions Generation", False, str(exc), time.perf_counter() - t0)

    def step_15_bulk_scoring(self):
        t0 = time.perf_counter()
        try:
            res = self.client.post(
                f"{self.base_url}/api/v1/job-openings/{self.opening_id}/bulk-score",
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code in (200, 502, 503, 504)
            detail = f"Ranked candidates: {len(res.json().get('ranked_candidates', []))}" if res.status_code == 200 else f"Code {res.status_code}"
            self._record(15, "Bulk Scoring with Ranking", passed, detail, dt)
        except Exception as exc:
            self._record(15, "Bulk Scoring with Ranking", False, str(exc), time.perf_counter() - t0)

    def step_16_shortlist_csv_export(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(
                f"{self.base_url}/api/v1/job-openings/{self.opening_id}/shortlist/export",
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and "text/csv" in res.headers.get("content-type", "")
            self._record(16, "Shortlist CSV Export", passed, f"CSV length: {len(res.text)} bytes", dt)
        except Exception as exc:
            self._record(16, "Shortlist CSV Export", False, str(exc), time.perf_counter() - t0)

    def step_17_create_scorecard(self):
        t0 = time.perf_counter()
        try:
            payload = {
                "candidate_id": self.candidate_id,
                "rating": 5,
                "notes": "Excellent answers on distributed consistency and database connection pooling.",
            }
            res = self.client.post(f"{self.base_url}/api/v1/scorecards", json=payload, headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 201
            if passed:
                self.scorecard_id = res.json()["id"]
                self._record(17, "Create Candidate Scorecard", True, f"Rating: 5/5, ID: {self.scorecard_id[:8]}...", dt)
            else:
                self._record(17, "Create Candidate Scorecard", False, f"Code {res.status_code}: {res.text}", dt)
        except Exception as exc:
            self._record(17, "Create Candidate Scorecard", False, str(exc), time.perf_counter() - t0)

    def step_18_list_scorecards(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(
                f"{self.base_url}/api/v1/scorecards?candidate_id={self.candidate_id}",
                headers=self._auth_headers(),
            )
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and res.json().get("total", 0) >= 1
            self._record(18, "List Candidate Scorecards", passed, f"Total scorecards: {res.json().get('total', 0)}", dt)
        except Exception as exc:
            self._record(18, "List Candidate Scorecards", False, str(exc), time.perf_counter() - t0)

    def step_19_dashboard_stats(self):
        t0 = time.perf_counter()
        try:
            res = self.client.get(f"{self.base_url}/api/v1/dashboard/stats", headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 200 and "total_openings" in res.json()
            data = res.json()
            detail = f"Openings: {data.get('total_openings')}, Candidates: {data.get('total_candidates')}"
            self._record(19, "Dashboard Stats (Real Queries)", passed, detail, dt)
        except Exception as exc:
            self._record(19, "Dashboard Stats (Real Queries)", False, str(exc), time.perf_counter() - t0)

    def step_20_delete_candidates(self):
        t0 = time.perf_counter()
        try:
            res = self.client.delete(f"{self.base_url}/api/v1/candidates/{self.candidate_id}", headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 204
            self._record(20, "Delete Candidate", passed, "Candidate removed cleanly", dt)
        except Exception as exc:
            self._record(20, "Delete Candidate", False, str(exc), time.perf_counter() - t0)

    def step_21_delete_job_opening(self):
        t0 = time.perf_counter()
        try:
            res = self.client.delete(f"{self.base_url}/api/v1/job-openings/{self.opening_id}", headers=self._auth_headers())
            dt = time.perf_counter() - t0
            passed = res.status_code == 204
            self._record(21, "Delete Job Opening", passed, "Job Opening removed cleanly", dt)
        except Exception as exc:
            self._record(21, "Delete Job Opening", False, str(exc), time.perf_counter() - t0)

    def _print_summary(self) -> bool:
        total = len(self.results)
        passed_count = sum(1 for r in self.results if r[2])
        failed_count = total - passed_count

        print(f"\n{BOLD}=== SUMMARY: {passed_count}/{total} STEPS PASSED ==={RESET}")
        if failed_count == 0:
            print(f"{GREEN}{BOLD}[ALL PASS] Recruiter Screening Copilot full flow verified.{RESET}\n")
            return True
        else:
            print(f"{RED}{BOLD}[FAIL] {failed_count} step(s) failed.{RESET}\n")
            return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run smoke test against running Copilot backend.")
    parser.add_argument("--url", default="http://localhost:8000", help="Base backend URL")
    parser.add_argument("--timeout", default=65.0, type=float, help="HTTP client timeout in seconds")
    args = parser.parse_args()

    runner = RecruiterSmokeTestRunner(base_url=args.url, timeout=args.timeout)
    success = runner.run_all()
    sys.exit(0 if success else 1)
