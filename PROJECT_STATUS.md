# Project Status — TalentFlow / Job Tracker AI Recruiting Copilot

**Phase:** 1 complete (read-only audit). Phase 2 findings section reserved below.  
**Date:** 2026-11-18  
**Stack:** Next.js 15 + TypeScript frontend · FastAPI + SQLModel backend · Supabase Postgres · OpenRouter · Google OAuth/Gmail/Calendar/Meet/Sheets · WhatsApp Cloud API  
**Git:** No repository initialized yet (commits will start after Phase 1 doc + git init).

---

## 1. Architecture map

```
┌─────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js App Router, port 3000)                       │
│  middleware.ts → cookie auth_token for subset of routes         │
│  lib/api.ts → JWT in localStorage + Bearer to FastAPI           │
│  app/api/auth/* → BFF proxies that set httpOnly cookie          │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTP / CORS
┌────────────────────────────▼────────────────────────────────────┐
│  Backend (FastAPI, port 8000)                                   │
│  main.py lifespan: init_db, Gmail sync every 15m, WA token check│
│  /api/v1/* routers + root aliases (Google, WhatsApp, openings)  │
│  SQLModel → Supabase Postgres (DATABASE_URL)                    │
│  Services: AI router, extractor, Google, WhatsApp, scheduling…  │
└─────────────────────────────────────────────────────────────────┘
```

### Auth model (important mismatch)

| Layer | Mechanism |
|-------|-----------|
| Browser API calls | `localStorage` key `job_tracker_token` + `Authorization: Bearer` |
| Middleware / page gate | Cookie `auth_token` (set by Next.js `/api/auth/login|register`) |
| Backend | JWT (`JWT_SECRET_KEY`, HS256) via `CurrentUser` dependency |

Login UI must hit both Next BFF (cookie) and persist token for API client, or middleware and API get out of sync.

---

## 2. Frontend pages

| Route | File | Purpose |
|-------|------|---------|
| `/` | `app/page.tsx` | Marketing landing (“TalentFlow”) |
| `/login` | `app/login/page.tsx` | Email/password login |
| `/register` | `app/register/page.tsx` | Registration |
| `/dashboard` | `app/dashboard/page.tsx` | KPI dashboard from `/api/v1/dashboard/stats` |
| `/pipeline` | `app/pipeline/page.tsx` | Kanban hiring pipeline |
| `/openings` | `app/openings/page.tsx` | Requisitions list |
| `/openings/[id]` | `app/openings/[id]/page.tsx` | Opening detail, candidates, score/match |
| `/screening` | `app/screening/page.tsx` | AI screening workspace |
| `/compare` | `app/compare/page.tsx` | Side-by-side candidate compare |
| `/inbox` | `app/inbox/page.tsx` | Unified WhatsApp (+ related) inbox |
| `/outreach` | `app/outreach/page.tsx` | Contact agent drafts + approval queue |
| `/interviews` | `app/interviews/page.tsx` | Interview list / manage |
| `/availability` | `app/availability/page.tsx` | Recruiter weekly availability |
| `/schedule/[token]` | `app/schedule/[token]/page.tsx` | Public candidate booking page |
| `/settings` | `app/settings/page.tsx` | Profile, theme, Google, WhatsApp, AI health |
| `/applications` | `app/applications/page.tsx` | Legacy → middleware redirects to `/pipeline` |
| `/ai-tools` | `app/ai-tools/page.tsx` | Legacy → `/screening` |
| `/cv` | `app/cv/page.tsx` | Legacy → `/pipeline` |

**Error boundaries:** root `error.tsx`, `global-error.tsx`, `not-found.tsx` exist.

**Middleware protection gaps:** `/inbox`, `/outreach`, `/interviews`, `/availability` are **not** in `isProtectedPage` / matcher — unauthenticated access possible at the edge (pages may still 401 on API).

---

## 3. Frontend components (non-ui primitives)

| Component | Role |
|-----------|------|
| `layout/app-shell.tsx` | Nav shell, command palette, quick-add |
| `layout/command-palette.tsx` | Global search / navigation |
| `layout/notification-popover.tsx` | Notifications |
| `candidates/add-candidate-dialog.tsx` | Bulk PDF/DOCX + paste → extract → review |
| `candidates/candidate-drawer.tsx` | Candidate detail drawer |
| `candidates/contact-candidate-dialog.tsx` | WhatsApp / contact |
| `candidates/send-email-dialog.tsx` | Gmail send with **hardcoded** template list |
| `openings/create-opening-dialog.tsx` | Create requisition |
| `openings/edit-opening-dialog.tsx` | Edit requisition |
| `kanban/*` | Board, columns, cards, bulk actions, audit drawer |
| `scheduling/*` | Availability modal, invite, reschedule/cancel |
| `dashboard/*` | Stats, chart, activity, widgets |
| `theme-provider.tsx` / `theme-toggle.tsx` | Dark mode |
| `logout-button.tsx` | Logout |
| `providers.tsx` | React Query + toaster |

**UI primitives:** `components/ui/*` (button, dialog, skeleton, empty-state, error-state, toast, etc.).

---

## 4. Frontend API proxies

| Path | Purpose |
|------|---------|
| `POST /api/auth/login` | Proxy login + set `auth_token` httpOnly cookie |
| `POST /api/auth/register` | Proxy register + cookie |
| `POST /api/auth/logout` | Clear cookie |
| `GET /api/auth/me` | Proxy `/api/v1/auth/me` with cookie token |

---

## 5. Backend endpoints (canonical `/api/v1` + notable aliases)

OpenAPI reports **119 paths / 134 method+path** (includes root aliases duplicating Google, WhatsApp, job-openings, AI).

### Auth
| Method | Path | Auth |
|--------|------|------|
| POST | `/api/v1/auth/register` | No |
| POST | `/api/v1/auth/login` | No |
| POST | `/api/v1/auth/login/form` | No |
| GET | `/api/v1/auth/me` | Yes |

### Google OAuth / integrations
| Method | Path | Auth |
|--------|------|------|
| GET | `/auth/google/login` and `/api/v1/auth/google/login` | Yes (state) |
| GET | `/auth/google/callback` and `/api/v1/.../callback` | OAuth |
| GET/POST/PATCH | `/integrations/google/{status,sync,disconnect,settings,send-email,preview-email}` (+ `/api/v1/...`) | Yes |

### Job openings
CRUD + `bulk-score`, `extract-all`, `match`, `match/status`, `screening-questions`, `shortlist/export`, `sync-google-sheet` under `/api/v1/job-openings` and root `/job-openings`.

### Candidates
`upload`, `extract-cv`, `extract-text`, `confirm-extracted`, list/get/patch/delete, stage, score, screen, screening-questions, links, export, bulk-stage, bulk-delete, audit-logs, upload-cv, extract-details.

### AI
`/ai/*` and `/api/v1/ai/*`: `models/health`, `screen-candidate`, `interview-questions`.

### WhatsApp
status, templates, send-template, send-freeform, contact, opt-in, conversations, threads, webhook GET/POST, batch, AI draft, retry — root + `/api/v1`.

### Outreach
draft, queue, approve, bulk-approve, retry, audit-trail, sync-stages, edit drafts.

### Scheduling
availability GET/PUT, links, public token book/slots/cancel/reschedule, interviews list/cancel/reschedule, reminders/process.

### Other
dashboard/stats, scorecards CRUD, notifications, search, `/health`, **`GET /debug/integrations` (unauthenticated live diagnostic — security risk)**.

---

## 6. Database tables (SQLModel)

| Table | Model | Notes |
|-------|-------|-------|
| `users` | User | Auth accounts |
| `job_openings` | JobOpening | Requisitions + JD + skills + optional Sheet IDs |
| `candidates` | Candidate | CV text, scores, skills, stage, WhatsApp opt-in, extracted fields |
| `candidate_links` | CandidateLink | github/linkedin/kaggle/portfolio/other + confidence |
| `scorecards` | Scorecard | Manual ratings |
| `google_accounts` | GoogleAccount | Encrypted refresh token, scopes, sync filters |
| `emails_synced` | EmailSynced | Gmail CV sync dedupe |
| `messages` | Message | Email/WhatsApp outreach + delivery status |
| `availability_schedules` | AvailabilitySchedule | Weekly hours, TZ, blocked dates |
| `scheduling_links` | SchedulingLink | Expiring public booking tokens |
| `interviews` | Interview | Calendar/Meet, reminders, cancel/reschedule |
| `audit_logs` | AuditLog | Action trail |
| `notifications` | Notification | In-app notifications |
| `applications` | Application | Legacy job-tracker entity |
| `cv_versions` | CVVersion | Legacy CV versions |
| `jobs` | Job | Legacy jobs table |

**Migrations:** Alembic under `backend/migrations/versions/` (users→applications→openings/candidates→Google→links→WhatsApp→scheduling→audit/notifications).

---

## 7. Services (backend)

| Service | Role | Real vs stub signals |
|---------|------|----------------------|
| `auth_service` | Register/login/JWT | Real |
| `job_opening_service` | Requisition CRUD/export | Real |
| `candidate_service` | Intake, stage, screen hooks | Real |
| `extractor_service` | Regex → LLM gap fill, confidence | Real (by design) |
| `ai_router` / `ai` | OpenRouter free model chains, JSON+Pydantic | Real; **no response cache found** |
| `matching_service` | Opening match/rank | Real |
| `google_service` | OAuth, Gmail sync/send, scopes | Real + **mock_/simulated token paths** when creds/codes fake |
| `google_sheets_service` | Sheet sync | Real (needs Google) |
| `whatsapp_service` | Templates, freeform, webhook, opt-in | Real + **simulates send** for test/mock phones / TESTING |
| `outreach_service` | Draft → approval → send → stage | Real |
| `scheduling_service` | Availability, FreeBusy, Meet | Real + **simulated Meet/event** when Google simulated |
| `dashboard_service` | Direct DB counts | Real (no mock stats) |
| `scorecard_service` | Ratings | Real |
| `notification_service` | Notifications | Real |
| `audit_log_service` | Audit writes | Real |

---

## 8. Environment keys (from `.env.example` only — no secret values)

**Backend:** `ENVIRONMENT`, `PROJECT_NAME`, `VERSION`, `API_V1_STR`, `DATABASE_URL`, `CORS_ORIGINS`, `JWT_*`, `OPENROUTER_API_KEY`, `MODELS_*`, `AI_TIMEOUT_SECONDS`, `GOOGLE_*`, `FRONTEND_URL`, `SUPABASE_*`, `WHATSAPP_TOKEN`, `PHONE_NUMBER_ID`, `WHATSAPP_API_VERSION`, `VERIFY_TOKEN`, `APP_SECRET`, `WHATSAPP_DEFAULT_TEMPLATE`.

**Frontend:** `NEXT_PUBLIC_API_URL`.

### Credential readiness (names only; values never logged)

| Key | Status |
|-----|--------|
| DATABASE_URL | SET |
| JWT_SECRET_KEY | SET |
| OPENROUTER_API_KEY | SET |
| GOOGLE_CLIENT_ID / SECRET | SET |
| GOOGLE_ENCRYPTION_KEY | SET |
| WHATSAPP_TOKEN / PHONE_NUMBER_ID | SET |
| APP_SECRET | **PLACEHOLDER_OR_EMPTY** → WhatsApp webhook HMAC **BLOCKED** until set |
| SUPABASE_SERVICE_ROLE_KEY | **PLACEHOLDER_OR_EMPTY** → cloud storage may fall back to local uploads |
| SUPABASE_URL | SET |

---

## 9. Existing tests

### Pytest (`backend/tests/`) — ~132 test functions

| File | Focus |
|------|-------|
| `test_auth.py` | Register/login/me |
| `test_job_openings.py` | Requisitions |
| `test_candidates.py` / `test_upload_extraction.py` / `test_extraction.py` | Intake + extract |
| `test_ai.py` / `test_ai_router.py` | AI screening / router |
| `test_scorecards.py` | Scorecards |
| `test_dashboard*.py` | Dashboard |
| `test_google_integration.py` | Google (mocked) |
| `test_whatsapp.py` | WhatsApp |
| `test_outreach.py` | Approval flow |
| `test_scheduling.py` | Availability/booking |
| `test_data_isolation.py` | Ownership |
| `test_health.py` | Health |
| `test_candidate_export_delete.py` | Export/delete |
| `test_playwright_flow.py` | Thin bridge |

### Playwright (`frontend/tests-e2e/`)

`01`–`08` feature suites + `main-flows`, `recruiter-full-lifecycle`, `add-candidate-dialog`.

---

## 10. Feature checklist (Phase 3 targets)

Status legend: **WORKS** · **BROKEN** · **STUB** · **MISSING** · **BLOCKED** (needs external credential/approval).  
Phase 1 statuses are code-audit based; Phase 2 will confirm runtime.

| # | Feature | Status | Notes |
|---|---------|--------|-------|
| 1 | Auth, session, protected routes, error/not-found | **BROKEN** / partial | Cookie vs localStorage split; middleware misses inbox/outreach/interviews/availability; error pages exist |
| 2 | Requisitions CRUD + JD saved | **WORKS** (code) | Full API + UI dialogs; verify close/delete in Phase 2 |
| 3 | Candidate intake auto-extract + review + duplicates | **WORKS** (code) | Regex+LLM extractor with confidence; review dialog; setTimeout only for UX step transition |
| 4 | AI router (OpenRouter free, fallback, JSON, cache, friendly errors) | **STUB** / partial | Fallback + Pydantic + friendly errors present; **cache MISSING**; global 500 handler can leak `str(exc)` |
| 5 | Pipeline DnD persist, filters, search, CSV, compare | **BROKEN** / partial | DnD API exists; kanban columns omit backend stages `shortlisted/contacted/scheduled/interviewed`; FE `CandidateStage` type incomplete |
| 6 | Google connect/scopes/Gmail sync/send/replies/inbox | **STUB** / partial | Real paths + mock/simulated OAuth & send; 15m sync worker real; unified inbox is WhatsApp-centric |
| 7 | Email Templates dialog (full categories, vars, preview, defaults) | **STUB** | Hardcoded 4 templates in `send-email-dialog.tsx`; categories from Phase 3 brief **MISSING** as first-class DB/UI |
| 8 | WhatsApp token, normalize 92, 24h window, webhook sig, opt-in | **BLOCKED** / partial | Implementation present; `APP_SECRET` placeholder blocks real signature verification; mock-number simulation in service |
| 9 | Availability, FreeBusy slots, booking token, Meet, reminders | **STUB** / partial | DB + public booking UI exist; Meet/calendar fall back to simulated IDs without live Google |
| 10 | Contact agent draft → approval → send → stage moves | **WORKS** (code) | Outreach queue + approve endpoints; stage enums include contacted/scheduled/interviewed |
| 11 | Dashboard DB counts, audit trail, Integration Health “Test now” | **STUB** / partial | Dashboard uses real counts; audit APIs exist; Settings has health cards; dedicated Integration Health “Test now” per service incomplete vs `/debug/integrations` (unsafe) |

---

## 11. Fake / mock / hardcoded / TODO inventory

### Backend (app code — meaningful)

| Location | Snippet / behavior |
|----------|-------------------|
| `services/google_service.py:85` | `placeholder-google-client-id` if client id missing |
| `services/google_service.py:133–169` | `mock_` / `test_` codes → simulated tokens; also simulates if no client secret |
| `services/google_service.py:182` | Default profile email `recruiter@gmail.com` when profile fetch skipped |
| `services/google_service.py:273–274` | Simulated refresh tokens short-circuit refresh |
| `services/google_service.py:986` | `mock_msg_…` when Gmail send not live |
| `services/whatsapp_service.py:270–283` | `mock_`/`test_` token → fake “Connected” status |
| `services/whatsapp_service.py:364–380` | Missing creds / TESTING / mock phone numbers → **simulated successful send** |
| `services/scheduling_service.py:343–405` | Simulated Meet link + calendar event id on missing/simulated Google |
| `main.py:132–137` | Global exception handler returns raw `str(exc)` to clients |
| `routers/debug.py` | Unauthenticated live multi-service diagnostic (should not ship as-is) |
| `schemas/*.py` `pass` | Empty Pydantic model bodies (normal for inheritance) — not stubs |

### Frontend (app/components — meaningful)

| Location | Snippet / behavior |
|----------|-------------------|
| `components/candidates/send-email-dialog.tsx:39–44` | **Hardcoded** `EMAIL_TEMPLATES` (4 items only) |
| `components/candidates/send-email-dialog.tsx:57` | Hardcoded company default `"Talent Acquisition"` |
| `components/candidates/add-candidate-dialog.tsx:315–318, 384–387` | `setTimeout(…, 500–600)` before review step (cosmetic delay, not fake data) |
| `components/candidates/candidate-drawer.tsx` / `screening/page.tsx` / `schedule-invite-modal.tsx` | `setTimeout` for copy-to-clipboard UI reset |
| `lib/api.ts` `CandidateStage` | Missing `shortlisted`, `contacted`, `scheduled`, `interviewed` vs backend enum |
| `components/kanban/types.ts` | Pipeline UI only 5 columns — stages can “disappear” after outreach auto-move |
| `app/error.tsx` / `global-error.tsx` | `console.error` for runtime errors |
| `app/dashboard/page.tsx:64` | `console.error` on candidate detail load failure |
| `components/logout-button.tsx` | `console.error` on logout failure |

### Acceptable / test-only

- `frontend/tests-e2e/**` `test.setTimeout`, sample PDF fixtures, `console.log` in dialog spec for debugging.
- `backend/tests/**` and `conftest.py` mock external APIs / in-memory SQLite (allowed).

---

## 12. Phase 2 — Run & reproduce

> Filled in Phase 2. Placeholder until install/build/lint/Playwright audit completes.

| Check | Result |
|-------|--------|
| Backend install / run | Pending |
| Frontend install / run | Pending (`python run.py` already active in workspace) |
| `pytest` | Pending |
| `npm run build` | Pending |
| `npx tsc --noEmit` | Pending |
| Lint | Pending |
| Playwright page crawl (console + network) | Pending |

---

## 13. Final proof table (Phase 5)

| Feature | Status | Proof | Known limitation |
|---------|--------|-------|------------------|
| _(filled after Phase 5)_ | | | |

---

## 14. Immediate risks for later phases

1. **No git repo** — initialize before first feature commit.  
2. **Auth cookie vs localStorage** + incomplete middleware matcher.  
3. **Pipeline stage drift** between DB enum and Kanban UI.  
4. **Production simulation paths** in Google/WhatsApp/Calendar that can silently “succeed” without sending.  
5. **`APP_SECRET` placeholder** → webhook signature verification blocked.  
6. **Unauthenticated `/debug/integrations`**.  
7. **Email template system** not meeting Phase 3 category/default requirements.  
8. **AI response cache** not implemented.  
9. **SUPABASE_SERVICE_ROLE_KEY** placeholder may force local disk uploads only.
