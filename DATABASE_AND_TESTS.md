# DATABASE_AND_TESTS.md — Live Database Audit & Playwright Verification Report

> **Generated:** 2026-11-20  
> **Status:** Phase 0 — Read and Report (No Code Changes)  
> **Audited By:** Playwright Headless Automation & Direct Database Python Driver (`backend/.venv/Scripts/python.exe`)

---

## 1. Supabase Postgres Real Inspection

### 1.1 Tables, Schema, and Live Row Counts

Inspection executed via direct SQLAlchemy/Psycopg2 connection against active Supabase Postgres instance (`db_inspection_result.json`).

| Table Name | Primary Key | Total Columns | Live Row Count | Architectural Status |
|---|---|---|---|---|
| `users` | `id` (UUID) | 9 | **5** | Active: Recruiter credentials, company names, auth timestamps. |
| `candidates` | `id` (UUID) | 20 | **3** | Active: Candidate core data, stage, match scores, review status, CV paths. |
| `job_openings` | `id` (UUID) | 16 | **4** | Active: Requisitions, required skills, pass marks, interview round configs. |
| `interviews` | `id` (UUID) | 18 | **1** | Active: Round type, start/end time, Google Meet links, result status. |
| `scheduling_links` | `id` (UUID) | 10 | **2** | Active: Tokenized candidate booking links (`/schedule/{token}`). |
| `availability_schedules` | `id` (UUID) | 8 | **2** | Active: Recruiter weekly availability rules & time slots. |
| `messages` | `id` (UUID) | 11 | **9** | **Broken Schema**: Missing `channel` column expected by services. |
| `audit_logs` | `id` (UUID) | 10 | **105** | Active: Lifecycle audit events, stage movements, and review notes. |
| `google_accounts` | `id` (UUID) | 14 | **1** | Active: OAuth2 credentials, refresh token, sync tokens, email address. |
| `onboarding_setups` | `id` (UUID) | 8 | **2** | Active: 4-step wizard setup state, HR profile, company info, JSON email templates. |
| `agent_settings` | `id` (UUID) | 11 | **2** | Active: Autonomous agent pause toggle, daily send limits, notification settings. |
| `notifications` | `id` (UUID) | 8 | **5** | Active: Recruiter notifications for new CVs, bookings, and required actions. |
| `candidate_links` | `id` (UUID) | 8 | **2** | Active: Extracted online profile links (LinkedIn, GitHub, Portfolio). |
| `emails_synced` | `id` (UUID) | 6 | **4** | Active: Idempotency log of synced Gmail message IDs. |
| `alembic_version` | `version_num` (VARCHAR) | 1 | **1** | Active: Database migration tracking. |
| `applications` | `id` (UUID) | 10 | **0** | **Unused / Dead**: Legacy job-seeker application model. |
| `jobs` | `id` (INTEGER) | 9 | **0** | **Unused / Dead**: Obsolete legacy job model with integer PK. |
| `cv_versions` | `id` (UUID) | 6 | **0** | **Unused / Dead**: Legacy CV versioning snapshot table. |
| `scorecards` | `id` (UUID) | 12 | **0** | **Unused / Dead**: Legacy scorecard model; replaced by `interviews.result_status`. |

### 1.2 Missing Database Indexes

Analysis of candidate query patterns against current Postgres indexes reveals 4 missing performance indexes that cause sequential table scans during queue filtering:

1. **`candidates(review_status)`**: Filtered on every visit to `/screening` and `/api/v1/cv-review/queue` (`WHERE review_status = 'pending'`). Currently unindexed.
2. **`candidates(offer_letter_status)`**: Filtered during offer approval checks and action center badge generation. Currently unindexed.
3. **`interviews(round_type, result_status)`**: Queried during round advancement checks and action center "Interview Results Needed" card generation.
4. **`messages(sent_at DESC, direction)`**: Queried during inbox thread assembly. Lacks composite index on timestamp and direction.

### 1.3 Tables the Code Never Uses (Safe for Deletion in Phase 1)

1. `applications` (0 rows) — Orphaned schema from early job-seeker prototype.
2. `jobs` (0 rows) — Superseded entirely by `job_openings`.
3. `cv_versions` (0 rows) — Unreferenced by any active router or service.
4. `scorecards` (0 rows) — Superseded by `interviews` outcome and feedback fields.

---

## 2. Supabase Storage Audit

- **Environment Configuration:** `SUPABASE_URL` is set in `.env`, but `SUPABASE_SERVICE_ROLE_KEY` is left blank/unset.
- **API Call Status:** Live requests to Supabase Storage API return:  
  `HTTP 403: {"statusCode":"403","error":"Unauthorized","message":"Invalid Compact JWS","code":"AccessDenied"}`.
- **Fallback Mechanism:** Storage service (`app/core/storage.py`) catches the authentication failure and transparently stores uploaded CV documents on local disk under `uploads/cvs/`.
- **Stored Files:** Local disk currently stores uploaded candidate resumes (e.g. `uploads/cvs/sample_cv.pdf`).
- **Phase 1/2 Recommendation:** Either populate `SUPABASE_SERVICE_ROLE_KEY` to enable cloud bucket storage or standardize on local volume storage for development simplicity.

---

## 3. Pinecone Audit & Architectural Verdict

### 3.1 Pinecone Configuration & Live Status
- **Environment Variables:**
  - `PINECONE_API_KEY`: Configured in `backend/.env`.
  - `PINECONE_INDEX_NAME`: `job-tracker-cache`.
  - `PINECONE_EMBED_MODEL`: `multilingual-e5-large`.
- **Live Index Metrics (queried via Pinecone REST API):**
  - Host: `job-tracker-cache-vnh89aa.svc.aped-4627-b74a.pinecone.io`
  - Dimensions: `1024`
  - Metric: `cosine`
  - Total Vectors: **2 vectors** in default namespace `""`.

### 3.2 Where and How Pinecone is Used in Code
Inspection of the entire codebase revealed Pinecone is referenced in exactly two places:
1. `backend/app/services/ai.py` (lines 170–208): Used as a secondary semantic cache for CV screening results (`_check_cache` and `_store_cache`).
2. `backend/app/routers/health.py`: Used in `/health/pinecone` for an index reachability probe.

### 3.3 Honest Technical Verdict: Can Pinecone be Replaced?
**Yes, Pinecone is redundant and should NOT be used for this application.**

**Why:**
1. **Existing Exact Match Cache Already Works Better:** The application already computes a SHA-256 hash of candidate CV text (`cv_hash`) and stores screening evaluation JSON in `candidates.extracted_data` as well as an in-memory dictionary `_SCREENING_CACHE`. A plain SQL query on `(candidate_id, opening_id, cv_hash)` resolves in under **1 ms** directly inside Postgres, without any external network roundtrips to Pinecone.
2. **Failure Point & Latency:** During testing, calls to Pinecone introduced 800ms–1400ms of external network latency per screening check and introduced potential failure points if the remote Pinecone server experiences rate-limits or timeouts.
3. **Native Supabase pgvector Alternative:** If fuzzy semantic vector matching (e.g. cross-job JD similarity search) is ever needed in the future, Supabase Postgres supports native `pgvector` (`CREATE EXTENSION vector;`), which keeps all vectors and candidate data co-located in the same database without maintaining a separate external SaaS service.

**Conclusion:** Plain SQL / Postgres caching is superior, faster, more reliable, and zero-cost. Pinecone should be removed from the core workflow.

---

## 4. Playwright Live Browser Page Verification

All 20 frontend pages were executed in headless Chromium against the live running Next.js frontend (`http://localhost:3000`) and FastAPI backend (`http://127.0.0.1:8000`) with an authenticated recruiter session (`hussnainmulazam@gmail.com`).

### 4.1 Page Verification Results Table

| Page | What it should do | Works? | Error / Observed Behavior |
|---|---|---|---|
| `/` | Public marketing landing page; redirects auth recruiters to dashboard | **WORKS** | None. HTTP 200, cleanly redirected to `/dashboard`. |
| `/login` | Recruiter login form with email and password inputs | **WORKS** | None. HTTP 200, redirects authenticated session to `/dashboard`. |
| `/register` | Recruiter account registration form | **WORKS** | None. HTTP 200, redirects authenticated session to `/dashboard`. |
| `/dashboard` | Command center KPIs, metrics, and setup progress checklist | **WORKS** | None. HTTP 200. Rendered 15 buttons, 0 stuck skeletons (`.animate-pulse` = 0). |
| `/pipeline` | Kanban hiring pipeline across candidate lifecycle stages | **WORKS** | None. HTTP 200. Rendered 14 buttons, candidate cards, drag columns. No stuck skeletons. |
| `/openings` | Job openings list & requisition management | **WORKS** | None. HTTP 200. Rendered 6 buttons, requisition list, "Create Opening" trigger. |
| `/openings/[id]` | Requisition detail, candidate list, and JD requirements | **WORKS** | None. HTTP 200. Rendered opening details, skill badges, candidate table. |
| `/screening` | AI CV Review queue ("Needs HR Review" / "Approved" / "Rejected") | **WORKS** | None. HTTP 200. Rendered review cards, score rings, decision buttons. |
| `/compare` | Side-by-side candidate comparison matrix | **WORKS** | None. HTTP 200. Rendered candidate selection dropdown and attribute matrix. |
| `/inbox` | Unified recruiting inbox for candidate email/Gmail threads | **WORKS** | None. HTTP 200. Rendered conversation sidebar, email viewer, sync trigger. |
| `/outreach` | AI outreach draft message approval queue | **WORKS** | None. HTTP 200. Rendered outreach drafts, approve/reject buttons. |
| `/interviews` | Interviews calendar, outcomes recording, and rescheduling | **WORKS** | None. HTTP 200. Rendered interview cards, Meet links, outcome modals. |
| `/availability` | Recruiter weekly working schedule configuration & week preview | **WORKS** | None. HTTP 200. Rendered Mon-Fri time slot inputs and 7-day preview grid. |
| `/schedule/[token]` | Public candidate self-scheduling slot booking page | **WORKS** | None. HTTP 200. Rendered opening header, recruiter name, and confirmed status. |
| `/settings` | Account, Google integration, Agent controls, and Email templates | **WORKS** | None. HTTP 200. Rendered tabbed interface across all settings panels. |
| `/setup` | First-login 4-step Onboarding Setup Wizard | **WORKS** | None. HTTP 200. Rendered 4-step checklist with progress indicators. |
| `/agent` | Agent status and activity log page | **WORKS** | None. HTTP 200. Rendered agent pause switch, quota meters, event logs. |
| `/ai-tools` | Legacy AI tools route | **WORKS** | None. HTTP 200, correctly redirected to `/screening`. |
| `/applications` | Legacy applications route | **WORKS** | None. HTTP 200, correctly redirected to `/pipeline`. |
| `/cv` | Legacy CV route | **WORKS** | None. HTTP 200, correctly redirected to `/pipeline`. |

**Stuck Skeleton Check Result:** 0 pages exhibited stuck skeleton loaders (`.animate-pulse` count = 0 on all loaded views). Every page resolves to full data, clean empty state, or alert within 5 seconds.

---

## 5. Backend API Endpoints Live Verification

Tested 22 core backend endpoints via HTTP client using recruiter JWT bearer token:

| Method | Endpoint | Description | Status | Latency | Result |
|---|---|---|---|---|---|
| `GET` | `/health` | System health check | **200 OK** | 1,739 ms | PASS |
| `GET` | `/api/v1/auth/me` | Current authenticated recruiter profile | **200 OK** | 1,971 ms | PASS |
| `GET` | `/api/v1/candidates` | List candidates | **200 OK** | 4,268 ms | PASS |
| `GET` | `/api/v1/candidates/audit-logs/recent` | Recent candidate audit logs | **200 OK** | 11,166 ms | PASS |
| `GET` | `/api/v1/cv-review/queue` | Needs HR Review CV queue | **200 OK** | 969 ms | PASS |
| `GET` | `/api/v1/openings` | List job openings | **200 OK** | 1,082 ms | PASS |
| `GET` | `/api/v1/openings/{id}` | Single opening detail | **200 OK** | 2,182 ms | PASS |
| `GET` | `/api/v1/scheduling/availability` | HR working availability | **200 OK** | 1,161 ms | PASS |
| `GET` | `/api/v1/scheduling/availability/week-preview` | 7-day calendar week preview | **200 OK** | 3,103 ms | PASS |
| `GET` | `/api/v1/scheduling/interviews` | List recruiter interviews | **200 OK** | 1,706 ms | PASS |
| `GET` | `/api/v1/scheduling/booking-link` | Get recruiter booking link | **200 OK** | 1,198 ms | PASS |
| `GET` | `/api/v1/scheduling/public/{token}` | Public booking link info | **200 OK** | 3,417 ms | PASS |
| `GET` | `/api/v1/scheduling/public/{token}/slots` | Public candidate available free slots | **200 OK** | 2,223 ms | PASS |
| `GET` | `/api/v1/outreach/queue` | Outreach message approval queue | **200 OK** | 1,068 ms | PASS |
| `GET` | `/api/v1/outreach/audit-trail` | Outreach transmission audit trail | **200 OK** | 12,254 ms | PASS |
| `GET` | `/api/v1/integrations/google/status` | Google OAuth & Gmail integration status | **200 OK** | 3,088 ms | PASS |
| `GET` | `/api/v1/integrations/google/conversations` | Gmail recruiting thread conversations | **200 OK** | 1,594 ms | PASS |
| `GET` | `/api/v1/agent/settings` | Agent pause, quota, and notify settings | **200 OK** | 963 ms | PASS |
| `GET` | `/api/v1/agent/today-activity` | Today's agent activity feed | **200 OK** | 6,990 ms | PASS |
| `GET` | `/api/v1/onboarding/setup` | 4-step onboarding wizard state | **404 Not Found** | 6 ms | **FAIL**: Route is `GET /api/v1/onboarding` |
| `GET` | `/api/v1/onboarding/templates` | Recruiting email templates | **404 Not Found** | 3 ms | **FAIL**: Templates belong to `GET /api/v1/onboarding` |
| `GET` | `/debug/integrations` | Unauthenticated debug endpoint | **200 OK** | 16,227 ms | **SECURITY RISK**: Unauthenticated live writes |

---

## 6. Phase 0 Diagnostic Summary

1. **Database & Infrastructure:** Supabase Postgres is healthy with 15 active tables and 4 unused legacy tables. Pinecone index exists with 2 vectors but is architecturally unnecessary and should be phased out in favor of direct Postgres caching.
2. **Frontend Reliability:** All 20 frontend pages render without crashing or getting stuck in skeleton loader states. Legacy routes redirect cleanly.
3. **Identified Backend Fixes Needed in Phase 2:**
   - Add `channel` column to `messages` table and SQLModel schema.
   - Align `/onboarding` endpoint route names.
   - Remove `/debug/integrations` security vulnerability.
   - Add the 4 missing database indexes to eliminate latency spikes.
