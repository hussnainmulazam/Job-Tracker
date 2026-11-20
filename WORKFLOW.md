# WORKFLOW.md — HR Recruiting Orchestration & Candidate Lifecycle

> **Generated:** 2026-11-20 | **Status:** Phase 0 Complete — Awaiting "go" for Phase 1  
> Lead engineer analysis of full repository. No code changes made in this phase.

---

## 1. Candidate Journey (Step-by-Step Overview)

The recruiting orchestration follows a 9-step candidate lifecycle from initial intake to final offer issuance:

```
[1. CV Arrives] ──> [2. Extract Details] ──> [3. AI Score & Screen]
                                                       │
                                                       ▼
[5b. Reject Email] <── [Reject] ── [4. HR Review Decision] ── [Approve] ──> [5a. CV Passed & Link]
                                                                                   │
                                                                                   ▼
[7. Interview Executed] <── [6. Meet Created] <── [Candidate Books Slot]
         │
         ├──> [Mark Failed] ──> Rejection Email ──> Stage: Rejected
         ├──> [Mark No-Show] ──> Status: No-show ──> Awaiting Reschedule
         └──> [Mark Passed] ──> [8. Next Round Invite OR Offer Letter Draft]
                                                       │
                                                       ▼
                                         [9. HR Approves Offer Letter]
                                                       │
                                                       ▼
                                              Offer Email Dispatched
```

### 1.1 Complete Step-by-Step Transition Matrix

| Step | Lifecycle Stage | Who Triggers? | What Happens? | Tables Used | API Endpoints | Where Code Breaks Flow |
|---|---|---|---|---|---|---|
| **1. CV Ingest** | `applied` | **Agent** (background sync) OR **HR** (manual upload) | CV arrives via Gmail attachment or file upload. Text extracted and initial candidate created. Acknowledgement "CV Received" email queued. | `candidates`, `emails_synced`, `messages` | `GET /integrations/google/sync`<br>`POST /api/v1/candidates/upload`<br>`POST /api/v1/candidates/confirm-extracted` | Sync query only scans for PDF/DOCX attachments; emails with text CVs are missed. Ingestion calls `asyncio.run()` in sync thread. |
| **2. Extract** | `applied` | **Agent** | Structured data parsed (name, email, phone, skills, experience, LinkedIn/GitHub URLs) using regex first, LLM for gaps. Never hallucinates values. | `candidates`, `candidate_links` | `POST /api/v1/candidates/{id}/extract-details`<br>`POST /api/v1/candidates/extract-cv` | None (Extractor functions reliably). |
| **3. AI Score** | `screening` | **Agent** | Evaluates candidate CV against opening JD. Generates match score (0-100), matched skills, missing skills, red flags, and short reason. Flags `review_status='pending'`. | `candidates` | `POST /api/v1/candidates/{id}/score`<br>`POST /api/v1/cv-review/score/{id}` | Three duplicate scoring paths exist (`candidate_service`, `cv_review_service`, `matching_service`). Pinecone cache lookup adds latency and fails silently. |
| **4. HR Review** | `awaiting_hr_review` | **HR** (Explicit human decision) | Candidate sits in "Needs HR Review" queue. Recruiter inspects AI reasoning and clicks **Approve** or **Reject** (bulk allowed). Nothing sends until HR decides. | `candidates`, `audit_logs` | `GET /api/v1/cv-review/queue`<br>`POST /api/v1/cv-review/decision` | **CRITICAL BREAKAGE**: `cv_review_service` attempts to create `Message(channel="email", ...)`. `Message` model lacks `channel` attribute, triggering `ValidationError` 500. |
| **5a. Approved Action** | `shortlisted` | **Agent** (triggered by HR approval) | Marks candidate `approved`. Dispatches "CV Passed" and "Job Details" emails from saved templates, and creates 7-day self-scheduling booking link. | `candidates`, `scheduling_links`, `messages`, `audit_logs` | Internal call triggered by `POST /api/v1/cv-review/decision` | Duplicate email sender in `candidate_service.auto_send_approval_email()` can double-send raw unformatted emails. |
| **5b. Rejected Action** | `rejected` | **Agent** (triggered by HR rejection) | Marks candidate `rejected`. Dispatches polite "Rejection" email from saved templates. Audit trail logged. | `candidates`, `messages`, `audit_logs` | Internal call triggered by `POST /api/v1/cv-review/decision` | Same `Message.channel` 500 error blocks rejection email dispatch. |
| **6. Slot Booking** | `scheduled` | **Candidate** (Public self-booking) | Candidate visits `/schedule/{token}`, checks recruiter availability against Google Calendar freeBusy, and selects a slot. System locks slot, generates Google Meet link, and updates DB. | `interviews`, `scheduling_links`, `candidates`, `audit_logs` | `GET /api/v1/scheduling/public/{token}/slots`<br>`POST /api/v1/scheduling/public/{token}/book` | `get_or_create_recruiter_booking_link()` injects fake candidate `"Applicant Preview"` into DB when table is empty. |
| **7. Interview Run** | `scheduled` | **HR & Candidate** | Google Meet interview takes place at scheduled time. System sends 24-hour and 1-hour email reminders before interview. | `interviews`, `notifications` | `POST /api/v1/scheduling/reminders/process` | Reminders use hardcoded raw text bypassing recruiter templates in `OnboardingSetup`. Background reminder cron is not running autonomously. |
| **8. Interview Result** | `interview` OR `offer` | **HR** (Explicit human decision) | Recruiter records outcome: **Passed**, **Failed**, or **No-show**. Passed advances to next round invite (Behavioral 45m / Final 60m). Final Passed creates Offer Letter draft. Failed sends Rejection. | `interviews`, `scheduling_links`, `candidates`, `messages`, `audit_logs` | `POST /api/v1/scheduling/interviews/{id}/result` | **CRITICAL BREAKAGE**: Fails with 500 because `scheduling_service` calls `Message(channel="email", ...)`. |
| **9. Offer Approval** | `offer` | **HR** (Explicit human decision) | Offer Letter draft generated with candidate name, role, salary, and company. Recruiter previews, edits, and clicks **Approve & Send**. Offer is never dispatched autonomously. | `candidates`, `messages`, `audit_logs` | `GET /api/v1/scheduling/offer-draft/{id}`<br>`POST /api/v1/scheduling/offer-draft/{id}/send` | None once `Message.channel` bug is resolved. Offer draft preview and template variable interpolation work cleanly. |

---

## 2. Seven Explicit Breakage Points in Current Codebase

During the end-to-end audit, 7 technical defects were discovered that halt or corrupt the workflow:

### 1. `Message` Model Missing `channel` Attribute (Halts Review & Interview Result Flows)
- **Files:** `backend/app/services/cv_review_service.py` (lines 303, 318, 430), `backend/app/services/scheduling_service.py` (lines 1804, 1894, 2039, 2257).
- **Defect:** Services instantiate `Message(channel="email", ...)`. The `Message` SQLModel schema in `backend/app/models/message.py` does not define `channel`.
- **Runtime Error:** Pydantic/SQLModel raises `ValidationError: Extra inputs are not permitted` / 500 Internal Server Error when HR approves a CV, rejects a CV, or submits an interview outcome.
- **Fix:** Add `channel: Optional[str] = Field(default="email")` to `Message` model and migrate Postgres column.

### 2. Synchronous `asyncio.run()` Inside Web Thread (Deadlock & Latency Risk)
- **File:** `backend/app/services/candidate_service.py` (`auto_handle_candidate_received()`).
- **Defect:** In-request handler calls `asyncio.run()` with `ThreadPoolExecutor` to execute asynchronous AI scoring.
- **Impact:** Blocks FastAPI event loop threads, introduces request timeout risk, and causes unpredictable concurrency locks.
- **Fix:** Move CV scoring to FastAPI `BackgroundTasks` or LangGraph background worker.

### 3. Hardcoded Email Text Bypassing Recruiter Templates
- **File:** `backend/app/services/scheduling_service.py` (`_send_interview_notification()`).
- **Defect:** Email body is constructed using hardcoded python string formatters instead of querying `OnboardingSetup.templates` or `template_service`.
- **Impact:** Any custom wording, tone, or branding configured by the recruiter in the Setup Wizard or Settings page is completely ignored for booking confirmations and interview reminders.
- **Fix:** Connect all email dispatch paths to `fill_template_variables()`.

### 4. Fake Candidate Injection in Booking Link Preview
- **File:** `backend/app/services/scheduling_service.py` (`get_or_create_recruiter_booking_link()`).
- **Defect:** If no candidates exist in the database, the service automatically creates and inserts a dummy candidate named `"Applicant Preview"` (`applicant@example.com`).
- **Impact:** Pollutes the live database with fake test data that appears in the recruiter's Kanban pipeline and candidate search.
- **Fix:** Remove fake candidate auto-creation; return an explicit 404 or empty state if no valid candidate exists.

### 5. Unauthenticated, Destructive Debug Endpoint in Production
- **File:** `backend/app/routers/debug.py` mounted at `/debug/integrations` in `main.py`.
- **Defect:** The endpoint has no auth dependency. Every time it is called, it makes live outbound Gmail API calls, creates and deletes calendar events, writes test availability records to Postgres, and takes 16+ seconds to execute.
- **Impact:** High security vulnerability and potential rate-limit exhaustion.
- **Fix:** Delete `debug.py` completely from application routers.

### 6. Triple Duplicate Scoring Pipelines
- **Locations:** `candidate_service.score_candidate()`, `cv_review_service.score_and_queue_candidate()`, and `matching_service.run_matching_job()`.
- **Defect:** Three different services maintain independent scoring and caching logic. `matching_service` stores progress in an in-memory dictionary lost on server restart.
- **Fix:** Consolidate into a single canonical screening service with deterministic DB caching.

### 7. Redundant Pinecone Overhead vs Plain SQL Postgres Caching
- **Location:** `backend/app/services/ai.py` (lines 170–208).
- **Defect:** Calls Pinecone REST API for semantic cache checks on every CV.
- **Impact:** Adds 800ms–1400ms latency per check. Postgres already stores `cv_hash` and evaluation results in `candidates.extracted_data`. An exact hash match in SQL takes <1ms and requires zero external credentials.
- **Fix:** Standardize screening cache on Postgres hash lookup; retire Pinecone.

---

## 3. Database Tables Used in Lifecycle

| Table | Stage / Step | Read / Write | Columns Used |
|---|---|---|---|
| `users` | All (Authentication) | Read | `id`, `email`, `full_name`, `company` |
| `job_openings` | Step 3, 5, 6, 8 | Read | `id`, `title`, `description`, `required_skills`, `pass_mark`, `round_config` |
| `candidates` | All | Read & Write | `id`, `opening_id`, `name`, `email`, `stage`, `match_score`, `review_status`, `offer_letter_status`, `extracted_data`, `cv_hash` |
| `candidate_links` | Step 2 (Extraction) | Read & Write | `id`, `candidate_id`, `url`, `link_type`, `is_verified` |
| `scheduling_links` | Step 5a, 6, 8 | Read & Write | `id`, `candidate_id`, `token`, `round_type`, `status`, `expires_at` |
| `availability_schedules`| Step 6 (Booking) | Read | `id`, `user_id`, `schedule_data`, `slot_duration_minutes` |
| `interviews` | Step 6, 7, 8 | Read & Write | `id`, `candidate_id`, `round_type`, `scheduled_at`, `meet_link`, `result_status`, `feedback_notes` |
| `messages` | Step 1, 5a, 5b, 6, 8, 9 | Read & Write | `id`, `candidate_id`, `subject`, `body`, `direction`, `status`, `sent_at`, `channel` |
| `emails_synced` | Step 1 (Gmail Sync) | Read & Write | `id`, `message_id`, `thread_id`, `user_id` |
| `google_accounts` | Step 1, 5, 6, 8, 9 | Read | `id`, `user_id`, `access_token`, `refresh_token`, `email`, `is_active` |
| `onboarding_setups` | Step 1, 5, 8, 9 | Read | `id`, `user_id`, `templates`, `company_name`, `hr_name` |
| `agent_settings` | All | Read | `id`, `user_id`, `is_paused`, `daily_email_limit`, `emails_sent_today` |
| `audit_logs` | All Transitions | Write | `id`, `candidate_id`, `action`, `stage_from`, `stage_to`, `performed_by`, `reason` |

---

## 4. Dead Code & Duplicate Code to Delete in Phase 1

1. **Dead Models:**
   - `backend/app/models/application.py` (0 DB rows, unused).
   - `backend/app/models/job.py` (0 DB rows, superseded by `job_openings`).
   - `backend/app/models/cv_version.py` (0 DB rows, unreferenced).
   - `backend/app/models/scorecard.py` (0 DB rows, superseded by `interviews`).
2. **Dead Routers:**
   - `backend/app/routers/scorecards.py` (Orphaned CRUD).
   - `backend/app/routers/debug.py` (Unauthenticated security risk).
3. **Dead / Duplicate Services:**
   - `backend/app/services/matching_service.py` (In-memory duplicate of scoring pipeline).
   - `backend/app/services/scorecard_service.py` (Unreferenced).
4. **Duplicate Routes & Redirects to Delete in Frontend:**
   - `frontend/app/ai-tools/page.tsx` (Legacy redirect).
   - `frontend/app/applications/page.tsx` (Legacy redirect).
   - `frontend/app/cv/page.tsx` (Legacy redirect).
   - `frontend/components/dashboard/recent-activity.tsx` (Duplicate of `recent-activity-feed.tsx`).
   - `frontend/components/dashboard/applications-timeline-chart.tsx` (Duplicate of `applications-chart.tsx`).


### 2.1 Stage: `applied` (CV Ingested)

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| Gmail sync picks up email with PDF attachment | Agent (background) | Creates `Candidate` row, extracts text from PDF | `candidates` ← `GET /integrations/google/sync` (runs every 15 min via lifespan worker in `main.py`) |
| HR uploads PDF via UI | HR | Parses PDF/DOCX, creates candidate | `candidates` ← `POST /api/v1/candidates/upload` |
| HR pastes CV text | HR | Extracts structured fields, creates candidate | `candidates` ← `POST /api/v1/candidates/extract-text` → `POST /api/v1/candidates/confirm-extracted` |
| `auto_handle_candidate_received()` fires | Agent (sync, in-request) | Sends "CV Received" email using template; sets `auto_reply_sent=True`; runs AI scoring (fragile: `asyncio.run()` + `ThreadPoolExecutor`) | `messages`, `candidates` |

### 2.2 Stage: `screening` (AI Scoring)

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| Auto-scoring inside `confirm_candidate()` or manual call | Agent / HR | LLM scores CV vs opening (score 0-100), stores `matched_skills`, `missing_skills`, `red_flags`, `summary`; sets `review_status=pending` | `candidates` ← `POST /api/v1/candidates/{id}/score` or `POST /api/v1/cv-review/score/{id}` |
| Cache hit | Agent | Returns cached result from in-memory `_SCREENING_CACHE` or DB `cv_hash` match without calling LLM | — |

### 2.3 Stage: `screening` → `awaiting HR review` (CV Review Queue)

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| AI scoring completes | Agent | Sets `review_status=pending`; candidate appears in CV review queue | `candidates` ← `GET /api/v1/cv-review/queue` |

### 2.4 HR Review Decision

#### Approve → `shortlisted`

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| HR clicks Approve (single or bulk) | HR | 1. Sets `review_status=approved`, `stage=shortlisted` | `candidates` |
| | | 2. Creates scheduling link (validity 7 days, `round_type=initial`) | `scheduling_links` ← `POST /api/v1/scheduling/links` (called internally) |
| | | 3. Sends "CV Passed" email (from template) | `messages` ← Gmail API |
| | | 4. Sends "Job Details" email (from template) | `messages` ← Gmail API |
| | | 5. Writes audit log | `audit_logs` |
| Endpoint | HR | `POST /api/v1/cv-review/decision` with `action="approve"` | — |

#### Reject → `rejected`

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| HR clicks Reject (single or bulk) | HR | 1. Sets `review_status=rejected`, `stage=rejected` | `candidates` |
| | | 2. Sends "Rejection" template email | `messages` ← Gmail API |
| | | 3. Writes audit log | `audit_logs` |
| Endpoint | HR | `POST /api/v1/cv-review/decision` with `action="reject"` | — |

### 2.5 Stage: `shortlisted` → `scheduled` (Candidate Books Slot)

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| Candidate opens `/schedule/{token}` and picks a slot | Candidate | 1. Checks Google Calendar FreeBusy + DB conflicts | `GET /api/v1/scheduling/public/{token}/slots` |
| | | 2. Creates Google Calendar event with Meet link | Google Calendar API |
| | | 3. Creates `Interview` row (status=`scheduled`) | `interviews` |
| | | 4. Sets `SchedulingLink.status=booked` | `scheduling_links` |
| | | 5. Moves candidate to `stage=scheduled` | `candidates` |
| | | 6. Sends confirmation email to candidate | Gmail API |
| | | 7. Sends instant HR alert email | Gmail API ← `agent_settings_service.notify_hr_instant()` |
| | | 8. Writes audit log | `audit_logs` |
| Endpoint | Candidate (public, no auth) | `POST /api/v1/scheduling/public/{token}/book` | — |

### 2.6 Interview Lifecycle (Per Round)

#### Initial Round

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| HR marks result | HR | `POST /api/v1/scheduling/interviews/{id}/result` | — |
| **Passed** | | Generates behavioral scheduling link (45m); sends "Initial Passed" template email; moves `stage=interview` | `scheduling_links`, `messages`, `candidates`, `audit_logs` |
| **Failed** | | Sends "Rejection" template email; moves `stage=rejected`, `review_status=rejected` | `messages`, `candidates`, `audit_logs` |
| **No-show** | | Marks `interview.status=no_show`; stage unchanged (can reschedule) | `interviews`, `audit_logs` |

#### Behavioral Round (same logic, different durations)

| Trigger | Who | Action |
|---------|-----|--------|
| **Passed** | HR | Generates final scheduling link (60m); sends "Behavioral Passed" template email; stage stays `interview` |
| **Failed** | HR | Sends "Rejection" email; stage=`rejected` |
| **No-show** | HR | Marks no-show, no stage change |

#### Final Round

| Trigger | Who | Action |
|---------|-----|--------|
| **Passed** | HR | Creates offer letter draft (from template) stored in `candidate.offer_letter_draft`; stage=`offer`; `offer_letter_status=draft`; **NO email sent automatically** |
| **Failed** | HR | Sends "Rejection" email; stage=`rejected` |
| **No-show** | HR | Marks no-show |

### 2.7 Stage: `offer` → Offer Sent

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| HR reviews draft and clicks Send | HR | 1. `offer_letter_status=sent`; `offer_letter_sent_at` set | `candidates` |
| | | 2. Creates `Message` row | `messages` |
| | | 3. Sends offer letter email via Gmail | Gmail API |
| | | 4. Writes audit log | `audit_logs` |
| Endpoint | HR | `POST /api/v1/scheduling/offer-draft/{candidate_id}/send` | — |

### 2.8 Reminders (Background)

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| Background cron / manual trigger | Agent | Finds interviews within 24h or 1h; sends reminder emails | `interviews`, `messages` ← `POST /api/v1/scheduling/reminders/process` |

### 2.9 Daily Summary

| Trigger | Who | Action | Table / Endpoint |
|---------|-----|--------|-----------------|
| Background cron or manual | Agent | Emails HR: new CVs today, waiting review count, today's interviews | Gmail API ← `POST /api/v1/agent-settings/daily-summary` |

---

## 3. All HTTP Endpoints (Exhaustive)

### Authentication
```
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/token-refresh
GET    /api/v1/auth/me
```

### Candidates
```
POST   /api/v1/candidates                          ← create with CV text
POST   /api/v1/candidates/extract-cv               ← upload PDF/DOCX, preview extraction
POST   /api/v1/candidates/extract-text             ← paste text, preview extraction
POST   /api/v1/candidates/confirm-extracted        ← persist reviewed candidate
POST   /api/v1/candidates/upload                   ← simple PDF upload → create
POST   /api/v1/candidates/bulk-stage               ← bulk stage update
POST   /api/v1/candidates/bulk-delete              ← bulk delete
GET    /api/v1/candidates                          ← list (filter: opening, stage, score, search)
GET    /api/v1/candidates/{id}                     ← get one
PATCH  /api/v1/candidates/{id}                     ← update
PATCH  /api/v1/candidates/{id}/stage               ← stage update
POST   /api/v1/candidates/{id}/upload-cv           ← replace CV PDF
POST   /api/v1/candidates/{id}/resend-auto-reply   ← retry "CV received" email
POST   /api/v1/candidates/{id}/score               ← AI score (cached)
POST   /api/v1/candidates/{id}/screen              ← alias for /score
POST   /api/v1/candidates/{id}/screening-questions ← generate interview questions
POST   /api/v1/candidates/{id}/extract-details     ← extract links/contacts
GET    /api/v1/candidates/{id}/links               ← list extracted links
GET    /api/v1/candidates/{id}/export              ← GDPR export
DELETE /api/v1/candidates/{id}                     ← delete with cascade
GET    /api/v1/candidates/audit-logs/recent        ← recent audit logs
GET    /api/v1/candidates/{id}/audit-logs          ← per-candidate audit trail
```

### CV Review
```
GET    /api/v1/cv-review/queue                        ← review queue (filter: opening, status)
POST   /api/v1/cv-review/decision                     ← approve / reject (single or bulk)
POST   /api/v1/cv-review/score/{candidate_id}         ← score + queue candidate
PATCH  /api/v1/cv-review/opening/{id}/pass-mark       ← update pass mark threshold
```

### Scheduling & Interviews
```
GET    /api/v1/scheduling/availability                 ← get HR weekly schedule
PUT    /api/v1/scheduling/availability                 ← update HR weekly schedule
GET    /api/v1/scheduling/availability/week-preview    ← 7-day calendar view
GET    /api/v1/scheduling/booking-link                 ← get/create recruiter booking link
POST   /api/v1/scheduling/links                        ← create candidate scheduling link

GET    /api/v1/scheduling/public/{token}               ← public scheduling page info
GET    /api/v1/scheduling/public/{token}/slots         ← compute free slots
POST   /api/v1/scheduling/public/{token}/book          ← candidate books slot (public)
POST   /api/v1/scheduling/public/{token}/reschedule    ← candidate reschedules (public)
POST   /api/v1/scheduling/public/{token}/cancel        ← candidate cancels (public)

GET    /api/v1/scheduling/interviews                   ← list interviews
POST   /api/v1/scheduling/interviews/{id}/reschedule   ← HR reschedule
POST   /api/v1/scheduling/interviews/{id}/cancel       ← HR cancel
POST   /api/v1/scheduling/interviews/{id}/result       ← HR records passed/failed/no-show

GET    /api/v1/scheduling/offer-draft/{candidate_id}   ← get offer draft
POST   /api/v1/scheduling/offer-draft/{id}/send        ← approve & send offer

POST   /api/v1/scheduling/sync-calendar                ← sync with Google Calendar
POST   /api/v1/scheduling/reminders/process            ← trigger reminder emails
```

### Outreach
```
POST   /api/v1/outreach/draft            ← AI draft personalized message
GET    /api/v1/outreach/queue            ← HR approval queue
PUT    /api/v1/outreach/drafts/{id}      ← HR edits draft
DELETE /api/v1/outreach/drafts/{id}      ← skip/dismiss draft
POST   /api/v1/outreach/approve/{id}     ← HR approves + sends
POST   /api/v1/outreach/bulk-approve     ← HR bulk approves + sends
POST   /api/v1/outreach/retry/{id}       ← retry failed message
GET    /api/v1/outreach/audit-trail      ← outreach audit trail
POST   /api/v1/outreach/sync-stages      ← sync interviewed stages
```

### Google Integrations
```
GET    /api/v1/integrations/google/auth-url            ← OAuth URL
GET    /api/v1/integrations/google/callback            ← OAuth callback
GET    /api/v1/integrations/google/status              ← connection status
DELETE /api/v1/integrations/google/disconnect          ← revoke OAuth
POST   /api/v1/integrations/google/send-email          ← send email via Gmail
GET    /api/v1/integrations/google/messages            ← list sent messages
GET    /api/v1/integrations/google/conversations       ← inbox threads per candidate
GET    /api/v1/integrations/google/threads/{candidate_id} ← full thread for candidate
POST   /api/v1/integrations/google/sync                ← manual Gmail sync trigger
```

### Job Openings
```
POST   /api/v1/openings
GET    /api/v1/openings
GET    /api/v1/openings/{id}
PATCH  /api/v1/openings/{id}
DELETE /api/v1/openings/{id}
POST   /api/v1/openings/{id}/extract-requirements     ← AI extracts JD requirements
GET    /api/v1/openings/{id}/candidates               ← candidates for opening
GET    /api/v1/openings/{id}/match-status             ← bulk match job status
POST   /api/v1/openings/{id}/run-matching             ← trigger bulk match
POST   /api/v1/openings/{id}/export-shortlist         ← CSV export
```

### Templates
```
GET    /api/v1/templates                              ← list all templates
GET    /api/v1/templates/{key}                        ← get one template
PUT    /api/v1/templates/{key}                        ← save/update template
POST   /api/v1/templates/generate-ai                  ← one-click AI generate all
POST   /api/v1/templates/{key}/regenerate-ai          ← regenerate one template
POST   /api/v1/templates/preview                      ← preview with variables filled
```

### Agent Settings
```
GET    /api/v1/agent-settings                         ← get settings + quota
PATCH  /api/v1/agent-settings                         ← update settings
POST   /api/v1/agent-settings/pause                   ← pause/resume toggle
GET    /api/v1/agent-settings/today-activity          ← today's activity dashboard
POST   /api/v1/agent-settings/daily-summary           ← trigger daily summary email
```

### Onboarding / Setup Wizard
```
GET    /api/v1/setup                                  ← get setup state
POST   /api/v1/setup/step-1                           ← HR & company profile
POST   /api/v1/setup/step-2                           ← first job opening
POST   /api/v1/setup/step-3                           ← availability & interview lengths
POST   /api/v1/setup/step-4                           ← email templates
POST   /api/v1/setup/complete                         ← mark wizard done
POST   /api/v1/setup/start-agent                      ← enable agent (requires all 4 done)
```

### Debug (⚠️ Mounted in production — DELETE)
```
GET    /api/v1/debug/integrations                     ← live integration diagnostic
```

### Misc
```
GET    /health
GET    /api/v1/compare                                ← candidate comparison
GET    /api/v1/applications                           ← applications list (dead model)
GET    /api/v1/pinecone/status                        ← Pinecone connectivity
```

---

## 4. Database Tables

| Table | Purpose | Active? |
|-------|---------|---------|
| `users` | Auth, login | ✅ |
| `candidates` | Core candidate record | ✅ |
| `job_openings` | Recruiter job postings | ✅ |
| `interviews` | Scheduled interviews, result | ✅ |
| `scheduling_links` | Tokenized booking URLs | ✅ |
| `availability_schedules` | HR weekly hours | ✅ |
| `messages` | All sent emails (Message table) | ✅ |
| `audit_logs` | Full action history | ✅ |
| `google_accounts` | OAuth tokens (encrypted) | ✅ |
| `onboarding_setups` | Setup wizard state | ✅ |
| `agent_settings` | Pause, daily limit, notify prefs | ✅ |
| `notifications` | In-app alerts | ✅ |
| `scorecards` | Interview scorecards | ✅ (partial) |
| `candidate_links` | Extracted profile URLs | ✅ |
| `applications` | **DEAD** — job-seeker side model | ❌ |
| `jobs` | **DEAD** — old job model (integer PK) | ❌ |
| `cv_versions` | **DEAD** — CV versioning never used | ❌ |

---

## 5. Dead / Duplicate / Fake Code to Delete

### 5.1 DEAD MODELS (safe to remove entirely)

| File | Reason |
|------|--------|
| `backend/app/models/application.py` | Job-seeker side model; no recruiter flow uses it; `ApplicationStatus` enum conflicts with candidate stages; `applications` table never queried in any active service |
| `backend/app/models/job.py` | Old `Job` model with integer PK; replaced by `JobOpening`; `jobs` table is never queried anywhere |
| `backend/app/models/cv_version.py` | CV versioning concept abandoned; `cv_versions` table never written to or read in any active flow |

### 5.2 DEAD / DUPLICATE SERVICES

| File | Reason |
|------|--------|
| `backend/app/services/matching_service.py` | Duplicate of `cv_review_service.score_and_queue_candidate()` and `candidate_service.score_candidate()`. Uses in-memory `MATCH_JOBS` dict for progress tracking which is lost on restart. All CV scoring now flows through `candidate_service.score_candidate()` with `_SCREENING_CACHE`. The `/openings/{id}/run-matching` endpoint in `job_openings.py` triggers `run_matching_job()` from this file — that call chain should be replaced with the proper scoring service. |

### 5.3 DEAD ROUTER

| File | Reason |
|------|--------|
| `backend/app/routers/debug.py` | Diagnostic endpoint. **Mounted in production** at `/api/v1/debug/integrations`. Sends a real test email to the recruiter's Gmail, creates and deletes calendar events, and writes a real availability row on every call. Zero authentication check. Must be **deleted or gated behind an env flag before any production use**. |

### 5.4 BUGS / RUNTIME ERRORS

| Location | Bug | Impact | Fix |
|----------|-----|--------|-----|
| `backend/app/services/cv_review_service.py` lines ~303, ~318, ~430 | `Message(channel="email", ...)` — `channel` field does not exist on `Message` SQLModel | `ValidationError` at runtime when HR approves or rejects a candidate | Remove all `channel="email"` kwargs from `Message(...)` constructors |
| `backend/app/services/scheduling_service.py` lines ~1804, ~1894, ~2034, ~2252 | Same `Message(channel="email", ...)` bug in `record_interview_result()` and `approve_and_send_offer()` | Same `ValidationError` when marking interview results or sending offer | Remove `channel=` from all `Message(...)` constructors |
| `backend/app/services/candidate_service.py` `auto_handle_candidate_received()` | Calls `asyncio.run()` + `ThreadPoolExecutor` to run async scoring inside a sync web request | Blocks the web thread; can deadlock if event loop is already running (FastAPI is async); not idempotent | Move scoring to a background task / worker, not inside the web request |
| `backend/app/services/scheduling_service.py` `get_or_create_recruiter_booking_link()` | Creates a **fake candidate** (`name="Applicant Preview"`, `email="applicant@example.com"`) when no candidates exist | Fake data in DB; shown in UI as a real candidate | Gate: only return link if real candidate exists; never create a fake one |
| `backend/app/routers/integrations_google.py` | (FIXED in prior session) `NameError: CandidateStage` + `'str' object has no attribute 'value'` | Inbox returns 500 | Fixed: added `CandidateStage` import and string-safe `.lower()` comparisons |
| `backend/app/services/candidate_service.py` `auto_send_approval_email()` | Writes raw hardcoded email body, ignores saved templates | Template changes don't propagate to approval emails | Replace with `fill_template_variables()` from saved templates |
| Gmail sync query | Only syncs messages with attachments (`has:attachment filename:pdf OR docx`) | Candidates who email without attaching a PDF are silently missed | Add plain-text CV intake path or widen query |
| `backend/app/services/scheduling_service.py` | Sends 24h/1h reminders with hardcoded raw email body (not from template) in `_send_interview_notification()` | Template edits don't apply to reminders | Use saved `interview_reminder` template |
| `backend/app/services/candidate_service.py` `auto_send_approval_email()` | Still exists alongside `cv_review_service.decide_review()` which also sends approval emails | **Duplicate email dispatch**: both paths can fire for the same approval event | Delete `auto_send_approval_email()` or gate it; `decide_review()` is the canonical path |

### 5.5 DUPLICATE SCORING PATHS (choose one and delete the other)

| Path | File | Called from |
|------|------|-------------|
| A | `candidate_service.score_candidate()` | `POST /candidates/{id}/score`, `POST /candidates/{id}/screen`, `auto_handle_candidate_received()` |
| B | `cv_review_service.score_and_queue_candidate()` | `POST /cv-review/score/{id}` |
| C | `matching_service.run_matching_job()` | `POST /openings/{id}/run-matching` |

All three call `screen_candidate_cv()` from `ai.py`. Paths A and B both set `review_status=pending`. **Keep A (the most complete) and B (the queue endpoint), delete C.** `run-matching` endpoint should call `candidate_service.bulk_score_opening()` instead.

### 5.6 FAKE / PLACEHOLDER DATA

| File | Line(s) | Description |
|------|---------|-------------|
| `scheduling_service.py` | ~1388-1398 | Creates fake `Candidate(name="Applicant Preview", email="applicant@example.com")` |
| `scheduling_service.py` | ~1378-1386 | Creates a default `JobOpening(title="General Interview")` if none exists |

### 5.7 PINECONE — INTEGRATED BUT NOT WIRED INTO MAIN FLOW

`backend/app/services/pinecone_service.py` is fully implemented (embedding, semantic cache, search) but **never called from `candidate_service.score_candidate()` or `cv_review_service`**. The service is only surfaced through `GET /api/v1/pinecone/status`. The in-memory `_SCREENING_CACHE` dict in `candidate_service.py` is used instead.

**Decision for Phase 1:** Wire `pinecone_service.get_cached_screening()` / `cache_screening()` into `score_candidate()` before the LLM call, as the original intent. Or delete it and keep the in-memory + DB hash cache.

---

## 6. Working Infrastructure (Do NOT break)

| Component | Status | Notes |
|-----------|--------|-------|
| Gmail OAuth, token refresh, `send_email()` | ✅ Working | Encrypted refresh token in `google_accounts` |
| Google Calendar FreeBusy | ✅ Working | Used in slot computation |
| Google Calendar event creation + Meet link | ✅ Working | Called on `book_slot()` |
| OpenRouter + Groq AI chain + repair retry | ✅ Working | `ai_router.complete_with_chain()` |
| Supabase Postgres connection | ✅ Working | SQLModel + Supabase pooler |
| Template filling (`fill_template_variables`) | ✅ Working | Pure string substitution, no AI at send time |
| Double-booking prevention | ✅ Working | App-level check + DB exclusion constraint |
| Scheduling link token + public booking page | ✅ Working | `/schedule/{token}` |
| Audit trail recording | ✅ Working | Every stage change logged |
| Agent Pause + daily send limit check | ✅ Working | `agent_settings_service.check_can_send()` |
| Pinecone service class | ✅ Implemented | ⚠️ NOT wired into scoring pipeline yet |
| Setup wizard (4 steps) | ✅ Working | `onboarding_setups` table, all steps persist |
| AI template generation + fallback | ✅ Working | Falls back to hardcoded defaults if LLM fails |

---

## 7. Proposed New Stages (Phase 1 Target)

Replace the current 9-value `CandidateStage` enum with the following 13 canonical stages:

```
ingested              → CV received (Gmail sync or upload), not yet extracted
extracted             → CV text parsed, structured fields extracted
screened              → AI scored vs opening (score, matched/missing skills, reason stored)
awaiting_hr_review    → In HR review queue (review_status=pending)
approved              → HR approved; CV Passed + Job Details emails sent; scheduling link created
rejected              → Rejected at any stage; rejection email sent (terminal)
invited_to_schedule   → Scheduling link sent; waiting for candidate to book
interview_scheduled   → Candidate booked a slot; Google Meet created
awaiting_interview_result → Interview time has passed; waiting for HR to record outcome
passed_round          → Passed this round; next round invite sent
offer_pending_approval → Final round passed; offer draft created; awaiting HR approval
offer_sent            → HR approved and sent offer letter (terminal success)
closed                → Position closed, candidate archived without outcome
```

### Stage Mapping (Current → Proposed)

| Current | Proposed |
|---------|---------|
| `applied` | `ingested` → `extracted` |
| `screening` | `screened` → `awaiting_hr_review` |
| `shortlisted` | `approved` → `invited_to_schedule` |
| `contacted` | (absorbed into `invited_to_schedule`) |
| `scheduled` | `interview_scheduled` |
| `interview` | `passed_round` → `invited_to_schedule` (loop) |
| `interviewed` | `awaiting_interview_result` |
| `offer` | `offer_pending_approval` → `offer_sent` |
| `rejected` | `rejected` |

---

## 8. Phase 1–5 Blockers & Pre-conditions

### BLOCKERS (must resolve before Phase 1 code changes)

| # | Blocker | Action |
|---|---------|--------|
| B1 | `Message.channel` field missing from model | Remove `channel=` from 6+ `Message(...)` constructors in `cv_review_service.py` and `scheduling_service.py` |
| B2 | `asyncio.run()` inside web request in `candidate_service.auto_handle_candidate_received()` | Move scoring to background worker |
| B3 | `debug.py` mounted in production with no auth | Delete `router` import in `api.py` or add `DEBUG_MODE` env gate |
| B4 | Fake candidate creation in `get_or_create_recruiter_booking_link()` | Remove fake Candidate creation |

### PRE-CONDITIONS FOR LANGGRAPH (Phase 2)

| # | Requirement |
|---|------------|
| P1 | `langgraph`, `langgraph-checkpoint-postgres` installed in backend |
| P2 | Supabase Postgres accessible from backend for Postgres checkpointer |
| P3 | All existing tools (gmail_sync, extract_cv, score_cv, send_email, create_meeting, get_free_slots) wrapped with typed Pydantic I/O, timeout, retry |
| P4 | Background worker process (separate from FastAPI web workers) to run the graph |

---

## 9. File Index (Key Files Only)

```
backend/
  app/
    main.py                         ← CORS, lifespan Gmail sync worker, router registration
    models/
      candidate.py                  ← CandidateStage, Candidate (stage + all review/offer fields)
      job_opening.py                ← JobOpening with pass_mark
      interview.py                  ← Interview, SchedulingLink, AvailabilitySchedule
      message.py                    ← Message (⚠️ no channel field)
      audit_log.py                  ← AuditLog
      onboarding.py                 ← OnboardingSetup (4-step wizard)
      agent_settings.py             ← AgentSettings (pause, limit, notify prefs)
      application.py                ← ❌ DEAD
      job.py                        ← ❌ DEAD
      cv_version.py                 ← ❌ DEAD
    services/
      candidate_service.py          ← create, score, approve flow (⚠️ asyncio.run bug)
      cv_review_service.py          ← HR review queue, decide (⚠️ channel= bug)
      scheduling_service.py         ← availability, booking, interview result, offer (⚠️ channel= bug + fake candidate)
      ai_router.py                  ← OpenRouter + Groq chain, schema repair, health check
      ai.py                         ← screen_candidate_cv(), extract_job_requirements()
      extractor_service.py          ← regex-first extraction, LLM gap fill
      template_service.py           ← 11 templates, fill_template_variables(), AI generate
      agent_settings_service.py     ← pause, quota, instant alert, daily summary
      outreach_service.py           ← AI draft, approve-to-send, retry
      google_service.py             ← Gmail send, token refresh
      matching_service.py           ← ❌ DEAD DUPLICATE
      pinecone_service.py           ← ⚠️ Implemented but not wired into scoring pipeline
    routers/
      candidates.py                 ← full CRUD + score/screen/extract/export
      cv_review.py                  ← queue, decision, score-and-queue, pass-mark
      scheduling.py                 ← availability, public booking, interview management, offer
      outreach.py                   ← draft, approve, bulk-approve, retry, audit
      integrations_google.py        ← OAuth, inbox, threads, sync, send-email
      agent_settings.py             ← settings CRUD, pause, activity, daily-summary
      debug.py                      ← ❌ DELETE (unauthenticated, writes real data)
frontend/
  app/
    dashboard/page.tsx              ← setup checklist + agent status
    pipeline/page.tsx               ← Kanban by stage
    inbox/page.tsx                  ← Gmail thread inbox
    screening/page.tsx              ← CV review queue
    interviews/page.tsx             ← interview calendar/list
    availability/page.tsx           ← HR weekly schedule
    schedule/[token]/page.tsx       ← public candidate booking page
    settings/page.tsx               ← integrations, agent settings, templates
    setup/page.tsx                  ← 4-step onboarding wizard
```

---

## 10. Summary for Phase 1

**What to fix immediately (before Phase 1 state machine):**

1. **Delete** `channel=` kwargs from every `Message(...)` constructor (6 locations across `cv_review_service.py` and `scheduling_service.py`) — prevents runtime crash when HR approves/rejects
2. **Delete** `backend/app/routers/debug.py` import from `api.py`
3. **Delete** dead models (`application.py`, `job.py`, `cv_version.py`) and their table references in `main.py` SQLModel.metadata
4. **Delete** `matching_service.py`; redirect `/openings/{id}/run-matching` to `candidate_service.bulk_score_opening()`
5. **Remove** fake candidate creation from `get_or_create_recruiter_booking_link()`

**Then:** Add the 13-stage `CandidateStage` enum, migrate existing data, and proceed to Phase 2 LangGraph implementation.

---

*Phase 0 complete. All findings documented. Waiting for "go" to proceed to Phase 1.*
