# APP_MAP.md — Comprehensive Repository Architecture Map

> **Generated:** 2026-11-20  
> **Status:** Phase 0 — Read and Report (No Code Changes)  
> **Classification Legend:**  
> - `WORKS`: Fully operational, tested against live backend, database, and browser.  
> - `BROKEN`: Code is present and wired, but fails at runtime due to schema mismatch, runtime exception, or invalid parameters.  
> - `STUB`: Incomplete mock, placeholder return, or UI that renders empty/mocked without persistence.  
> - `DUPLICATE`: Redundant duplicate implementation of existing functionality (e.g. duplicate routers or dual scoring engines).  
> - `DEAD`: Obsolete, unreferenced, or orphaned code/tables left over from older iterations.

---

## 1. Frontend Pages (20 Pages)

| Page Route | File Path | Status | Purpose & Behavior in Playwright Run | Target in 6-Page Plan |
|---|---|---|---|---|
| `/` | `frontend/app/page.tsx` | `WORKS` | Public landing page; redirects authenticated recruiters cleanly to `/dashboard` (Status: 200). | Keep as auth redirect |
| `/login` | `frontend/app/login/page.tsx` | `WORKS` | Recruiter login form with email/password; stores JWT in localStorage and redirects to `/dashboard`. | Keep as auth gate |
| `/register` | `frontend/app/register/page.tsx` | `WORKS` | Recruiter account registration form with name, email, company, password. | Keep as auth gate |
| `/dashboard` | `frontend/app/dashboard/page.tsx` | `WORKS` | Central KPI dashboard: active openings, candidates, upcoming interviews, and 4-step setup checklist widget. | **Merge into Action Center** |
| `/pipeline` | `frontend/app/pipeline/page.tsx` | `WORKS` | Drag-and-drop Kanban hiring pipeline across 8 candidate lifecycle stages; includes candidate detail drawer and filter bar. | **Keep as Canonical Page 2 (Pipeline)** |
| `/inbox` | `frontend/app/inbox/page.tsx` | `WORKS` | Unified Gmail recruiting thread inbox: list conversations, view message history, sync Gmail on demand, AI reply drafts. | **Keep as Canonical Page 3 (Inbox)** |
| `/interviews` | `frontend/app/interviews/page.tsx` | `WORKS` | Interview schedule list with round indicators, Google Meet launch links, and outcome recording modals (Passed/Failed/No-show). | **Keep as Canonical Page 4 (Interviews)** |
| `/openings` | `frontend/app/openings/page.tsx` | `WORKS` | Job opening requisition management: create opening dialog, status badges (active/closed), candidate counts. | **Keep as Canonical Page 5 (Openings)** |
| `/openings/[id]` | `frontend/app/openings/[id]/page.tsx` | `WORKS` | Single requisition details view: JD requirements, candidate applicant list, match scoring trigger, Google Sheets export. | Sub-page of Canonical Page 5 |
| `/settings` | `frontend/app/settings/page.tsx` | `WORKS` | Multi-tab settings: Profile, Google OAuth integration, Agent settings (pause switch, daily limits), Email templates. | **Keep as Canonical Page 6 (Settings)** |
| `/setup` | `frontend/app/setup/page.tsx` | `WORKS` | First-login 4-step Onboarding Setup Wizard: Company Profile -> Opening -> Availability -> Templates. Saves state to DB. | Modal/Wizard accessible from Settings |
| `/screening` | `frontend/app/screening/page.tsx` | `WORKS` | AI CV Review queue ("Needs HR Review" / "Approved" / "Rejected") with match score ring, matched/missing skills, and short reasoning. | **Merge into Action Center** |
| `/outreach` | `frontend/app/outreach/page.tsx` | `WORKS` | Candidate outreach draft queue and transmission audit log; permits approving and dispatching first-contact emails. | **Merge into Action Center** |
| `/agent` | `frontend/app/agent/page.tsx` | `WORKS` | Agent status control hub: live agent pause switch, daily quota meters, and activity event log. | **Merge into Action Center** |
| `/compare` | `frontend/app/compare/page.tsx` | `WORKS` | Side-by-side multi-candidate comparison matrix evaluating skills, experience, and match scores. | **Merge into Pipeline (as "Compare" modal/view)** |
| `/availability` | `frontend/app/availability/page.tsx` | `WORKS` | Weekly HR working hours schedule editor (Mon-Fri slots) and 7-day calendar slot preview. | **Merge into Interviews (as "Availability" tab)** |
| `/schedule/[token]` | `frontend/app/schedule/[token]/page.tsx` | `WORKS` | Public candidate self-booking page: displays interview round, computes available time slots, books calendar Meet event. | Public external candidate route (Required) |
| `/ai-tools` | `frontend/app/ai-tools/page.tsx` | `DUPLICATE` | Legacy redirect stub: immediately executes `redirect('/screening')`. | **DELETE (Clean up dead route)** |
| `/applications` | `frontend/app/applications/page.tsx` | `DUPLICATE` | Legacy redirect stub: immediately executes `redirect('/pipeline')`. | **DELETE (Clean up dead route)** |
| `/cv` | `frontend/app/cv/page.tsx` | `DUPLICATE` | Legacy redirect stub: immediately executes `redirect('/pipeline')`. | **DELETE (Clean up dead route)** |

---

## 2. Frontend Next.js API Routes / Proxies (4 Routes)

| Route Path | File Path | Status | Purpose & Behavior |
|---|---|---|---|
| `/api/auth/login` | `frontend/app/api/auth/login/route.ts` | `WORKS` | Proxies credentials to backend `POST /api/v1/auth/login`, sets HTTP-only auth cookies if desired. |
| `/api/auth/register` | `frontend/app/api/auth/register/route.ts` | `WORKS` | Proxies user registration data to backend `POST /api/v1/auth/register`. |
| `/api/auth/me` | `frontend/app/api/auth/me/route.ts` | `WORKS` | Proxies current user profile requests to backend `GET /api/v1/auth/me`. |
| `/api/auth/logout` | `frontend/app/api/auth/logout/route.ts` | `WORKS` | Clears session cookies and invalidates frontend state. |

---

## 3. Frontend Components (56 Components)

### 3.1 Candidate & Pipeline Components (11)
| Component | Path | Status | Description |
|---|---|---|---|
| `AddCandidateDialog` | `components/candidates/add-candidate-dialog.tsx` | `WORKS` | Modal for manual candidate creation and CV file upload (PDF/DOCX). |
| `CandidateDrawer` | `components/candidates/candidate-drawer.tsx` | `WORKS` | Slide-over drawer detailing candidate contact, stage history, and CV analysis. |
| `ContactCandidateDialog` | `components/candidates/contact-candidate-dialog.tsx` | `WORKS` | Email dialog to initiate ad-hoc message threads with candidates. |
| `SendEmailDialog` | `components/candidates/send-email-dialog.tsx` | `WORKS` | Template-driven email dispatch dialog with variable interpolation. |
| `KanbanBoard` | `components/kanban/kanban-board.tsx` | `WORKS` | Main Kanban drag-and-drop board managing stage transitions. |
| `KanbanCard` | `components/kanban/kanban-card.tsx` | `WORKS` | Candidate card displaying score badge, stage, and quick-action menu. |
| `KanbanColumn` | `components/kanban/kanban-column.tsx` | `WORKS` | Stage column container with candidate count counter and drop target. |
| `KanbanTable` | `components/kanban/kanban-table.tsx` | `WORKS` | Alternative tabular view for candidate pipeline. |
| `BulkActionsToolbar` | `components/kanban/bulk-actions-toolbar.tsx` | `WORKS` | Floating toolbar for bulk stage updates, screening, or deletion. |
| `PipelineAuditDrawer` | `components/kanban/pipeline-audit-drawer.tsx` | `WORKS` | Drawer displaying timestamped transition audit logs for a candidate. |
| `types.ts` | `components/kanban/types.ts` | `WORKS` | TypeScript interface definitions for candidate cards and columns. |

### 3.2 Dashboard & Overview Components (8)
| Component | Path | Status | Description |
|---|---|---|---|
| `StatsHeader` | `components/dashboard/stats-header.tsx` | `WORKS` | Metric cards: Total Candidates, Active Openings, Upcoming Interviews, Time-to-Hire. |
| `SetupChecklist` | `components/dashboard/setup-checklist.tsx` | `WORKS` | 4-step first-login onboarding checklist banner with progress indicator. |
| `UpcomingInterviewsList` | `components/dashboard/upcoming-interviews-list.tsx` | `WORKS` | Compact list of today's and tomorrow's confirmed interviews with Meet links. |
| `RecentActivityFeed` | `components/dashboard/recent-activity-feed.tsx` | `WORKS` | Live audit activity stream of candidate creations, reviews, and bookings. |
| `RecentActivity` | `components/dashboard/recent-activity.tsx` | `DUPLICATE` | Redundant previous iteration of `RecentActivityFeed`. Can be deleted. |
| `ApplicationsChart` | `components/dashboard/applications-chart.tsx` | `WORKS` | Bar chart displaying inbound candidate volume over time. |
| `ApplicationsTimelineChart` | `components/dashboard/applications-timeline-chart.tsx` | `DUPLICATE` | Alternative timeline chart; duplicates `ApplicationsChart` functionality. |
| `HiringFunnelChart` | `components/dashboard/hiring-funnel-chart.tsx` | `WORKS` | Visual funnel chart showing stage drop-off rates across the recruitment process. |
| `DashboardWidgets` | `components/dashboard/dashboard-widgets.tsx` | `WORKS` | Container layout structuring dashboard grid items. |

### 3.3 Scheduling & Interview Modals (5)
| Component | Path | Status | Description |
|---|---|---|---|
| `ScheduleInviteModal` | `components/scheduling/schedule-invite-modal.tsx` | `WORKS` | Generates candidate self-scheduling link and dispatches invitation email. |
| `InterviewResultModal` | `components/scheduling/interview-result-modal.tsx` | `BROKEN` | Submits Passed/Failed/No-show. Fails backend if `channel` field is omitted from Message model. |
| `OfferLetterModal` | `components/scheduling/offer-letter-modal.tsx` | `WORKS` | Preview, edit, and approve candidate offer letter draft before sending. |
| `RescheduleCancelModal` | `components/scheduling/reschedule-cancel-modal.tsx` | `WORKS` | Allows recruiter to cancel or reschedule confirmed interviews. |
| `AvailabilityModal` | `components/scheduling/availability-modal.tsx` | `WORKS` | Modal dialog for configuring weekly recurring working hours. |

### 3.4 Openings & Setup (3)
| Component | Path | Status | Description |
|---|---|---|---|
| `CreateOpeningDialog` | `components/openings/create-opening-dialog.tsx` | `WORKS` | Requisition creation dialog with title, department, JD text, and auto-skill extraction. |
| `EditOpeningDialog` | `components/openings/edit-opening-dialog.tsx` | `WORKS` | Requisition editor dialog for modifying existing opening details and pass marks. |
| `SetupWizardDialog` | `components/setup/setup-wizard-dialog.tsx` | `WORKS` | 4-step wizard dialog covering profile, opening, availability, and AI templates. |

### 3.5 App Shell, Layout & Global UI (28)
| Component | Path | Status | Description |
|---|---|---|---|
| `AppShell` | `components/layout/app-shell.tsx` | `WORKS` | Primary layout shell with responsive sidebar, top navbar, and user profile badge. |
| `CommandPalette` | `components/layout/command-palette.tsx` | `WORKS` | Global `Cmd+K` keyboard shortcut quick navigator across candidates and pages. |
| `NotificationPopover` | `components/layout/notification-popover.tsx` | `WORKS` | Notification bell dropdown with real-time candidate actions and alerts. |
| `LogoutButton` | `components/logout-button.tsx` | `WORKS` | Session termination trigger. |
| `AgentControlHub` | `components/agent/agent-control-hub.tsx` | `WORKS` | Widget featuring Pause switch, daily quota meter, and trigger manual summary. |
| `ThemeProvider` | `components/theme-provider.tsx` | `WORKS` | Next-themes provider wrapper for dark/light themes. |
| `ThemeToggle` | `components/theme-toggle.tsx` | `WORKS` | Dark/light mode theme toggle button. |
| `Providers` | `components/providers.tsx` | `WORKS` | Global React context wrapper (React Query, Toaster, AuthContext). |
| `Badge` | `components/ui/badge.tsx` | `WORKS` | Radix-based status and tag badge. |
| `Button` | `components/ui/button.tsx` | `WORKS` | Standard button primitive with variant styling. |
| `Card` | `components/ui/card.tsx` | `WORKS` | Card container primitive. |
| `Dialog` | `components/ui/dialog.tsx` | `WORKS` | Radix UI modal dialog primitive. |
| `DropdownMenu` | `components/ui/dropdown-menu.tsx` | `WORKS` | Radix UI dropdown primitive. |
| `EmptyState` | `components/ui/empty-state.tsx` | `WORKS` | Consistent empty queue/list placeholder illustration. |
| `ErrorState` | `components/ui/error-state.tsx` | `WORKS` | Error alert card with Retry button. |
| `Input` | `components/ui/input.tsx` | `WORKS` | Standard text input primitive. |
| `Label` | `components/ui/label.tsx` | `WORKS` | Form input label. |
| `PageHeader` | `components/ui/page-header.tsx` | `WORKS` | Standardized page title, description, and action button header. |
| `ScoreRing` | `components/ui/score-ring.tsx` | `WORKS` | SVG circular radial gauge for candidate match score (0-100%). |
| `Select` | `components/ui/select.tsx` | `WORKS` | Select dropdown primitive. |
| `Sheet` | `components/ui/sheet.tsx` | `WORKS` | Slide-over drawer primitive. |
| `Skeleton` | `components/ui/skeleton.tsx` | `WORKS` | Loading skeleton pulse placeholder. |
| `Table` | `components/ui/table.tsx` | `WORKS` | Standard data table primitive. |
| `Tabs` | `components/ui/tabs.tsx` | `WORKS` | Tabbed navigation container primitive. |
| `Textarea` | `components/ui/textarea.tsx` | `WORKS` | Multiline text input primitive. |
| `Toast` | `components/ui/toast.tsx` | `WORKS` | Floating notification toast item. |
| `Toaster` | `components/ui/toaster.tsx` | `WORKS` | Global toast provider container. |
| `use-toast.ts` | `components/ui/use-toast.ts` | `WORKS` | React hook managing toast queue and dismissals. |

---

## 4. Backend Routers & API Endpoints (128 Endpoints)

FastAPI application exposes 128 registered HTTP endpoints. Below is the functional classification:

### 4.1 Authentication & Recruiter Profile (`app/routers/auth.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/register` | `WORKS` | Registers new recruiter account; creates hashed password in `users` table. |
| `POST` | `/api/v1/auth/login` | `WORKS` | Generates JWT bearer token from email & password. |
| `POST` | `/api/v1/auth/login/form` | `WORKS` | Standard OAuth2 Password Request Form endpoint for Swagger UI. |
| `GET` | `/api/v1/auth/me` | `WORKS` | Returns authenticated user profile (`id`, `email`, `full_name`, `company`). |

### 4.2 Candidate Management (`app/routers/candidates.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/candidates` | `WORKS` | Lists candidates with stage, score, and opening filters. |
| `POST` | `/api/v1/candidates` | `WORKS` | Manually creates a new candidate with CV text. |
| `GET` | `/api/v1/candidates/{id}` | `WORKS` | Retrieves detailed candidate record including extracted data and stage history. |
| `PATCH` | `/api/v1/candidates/{id}` | `WORKS` | Modifies candidate attributes (name, email, notes). |
| `DELETE` | `/api/v1/candidates/{id}` | `WORKS` | Deletes candidate record and cascades to linked records. |
| `PATCH` | `/api/v1/candidates/{id}/stage` | `WORKS` | Transitions candidate pipeline stage and logs event in `audit_logs`. |
| `POST` | `/api/v1/candidates/upload` | `WORKS` | Uploads CV file (PDF/DOCX), saves to disk, extracts text. |
| `POST` | `/api/v1/candidates/extract-cv` | `WORKS` | Upload-first candidate CV extraction with heuristics & duplicate detection. |
| `POST` | `/api/v1/candidates/extract-text` | `WORKS` | Extracts structured candidate details from raw pasted text. |
| `POST` | `/api/v1/candidates/confirm-extracted` | `WORKS` | Persists extracted candidate into database with duplicate merge support. |
| `POST` | `/api/v1/candidates/{id}/score` | `WORKS` | Evaluates CV against job opening using OpenRouter LLM. |
| `POST` | `/api/v1/candidates/{id}/screen` | `DUPLICATE` | Alias for `/score`; calls identical matching pipeline. |
| `POST` | `/api/v1/candidates/{id}/extract-details`| `WORKS` | Regex-first extractor for phone, LinkedIn, GitHub, portfolio links. |
| `GET` | `/api/v1/candidates/{id}/links` | `WORKS` | Retrieves extracted online profile links for a candidate. |
| `POST` | `/api/v1/candidates/bulk-stage` | `WORKS` | Updates stages for multiple candidates simultaneously. |
| `POST` | `/api/v1/candidates/bulk-delete` | `WORKS` | Deletes multiple candidates in batch. |
| `GET` | `/api/v1/candidates/audit-logs/recent` | `WORKS` | Fetches global candidate lifecycle audit logs. |
| `GET` | `/api/v1/candidates/{id}/audit-logs` | `WORKS` | Fetches candidate-specific timestamped audit history. |
| `GET` | `/api/v1/candidates/{id}/export` | `WORKS` | GDPR-compliant JSON dump of candidate record. |
| `POST` | `/api/v1/candidates/{id}/resend-auto-reply` | `WORKS` | Dispatches initial "CV Received" acknowledgement email via Gmail. |
| `POST` | `/api/v1/candidates/{id}/screening-questions` | `WORKS` | Generates 3-5 tailored interview questions probing candidate's missing skills. |

### 4.3 CV Review Queue (`app/routers/cv_review.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/cv-review/queue` | `WORKS` | Lists candidates pending HR review (`review_status='pending'`). |
| `POST` | `/api/v1/cv-review/decision` | `BROKEN` | Submits Approve/Reject decision. Fails with 500 when creating `Message` without `channel` column. |
| `POST` | `/api/v1/cv-review/bulk-decision` | `BROKEN` | Submits batch Approve/Reject decisions; encounters same `Message.channel` validation bug. |

### 4.4 Job Openings / Requisitions (`app/routers/job_openings.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/job-openings` | `WORKS` | Lists active recruiter job requisitions. |
| `POST` | `/api/v1/job-openings` | `WORKS` | Creates new opening; uses LLM to parse required skills, experience, and pass marks. |
| `GET` | `/api/v1/job-openings/{id}` | `WORKS` | Retrieves single requisition details and required skill breakdown. |
| `PATCH` | `/api/v1/job-openings/{id}` | `WORKS` | Updates opening fields (JD, pass mark, rounds enabled). |
| `DELETE` | `/api/v1/job-openings/{id}` | `WORKS` | Archives or deletes job opening. |
| `POST` | `/api/v1/job-openings/{id}/match` | `WORKS` | Computes AI match scores for all unmatched candidates attached to opening. |
| `GET` | `/api/v1/job-openings/{id}/match/status` | `WORKS` | Polling endpoint for background matching progress. |
| `POST` | `/api/v1/job-openings/{id}/bulk-score` | `DUPLICATE` | Redundant bulk scoring endpoint duplicating `/match`. |
| `POST` | `/api/v1/job-openings/{id}/extract-all` | `WORKS` | Extracts contact info and skills across all candidates in an opening. |
| `GET` | `/api/v1/job-openings/{id}/shortlist/export`| `WORKS` | Generates CSV export of shortlisted candidates. |
| `POST` | `/api/v1/job-openings/{id}/sync-google-sheet`| `WORKS` | Syncs candidate shortlist rows directly into recruiter's Google Spreadsheet. |
| `POST` | `/api/v1/job-openings/{id}/screening-questions`| `WORKS` | Generates standardized screening questions for opening. |
| `ALL` | `/job-openings/*` | `DUPLICATE` | Root-level aliases for all above endpoints (mounted for legacy compatibility). |

### 4.5 Scheduling, Availability & Interviews (`app/routers/scheduling.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/scheduling/availability` | `WORKS` | Retrieves recruiter's weekly recurring availability schedule. |
| `POST` | `/api/v1/scheduling/availability` | `WORKS` | Sets weekly working hours (e.g. Mon-Fri 09:00-17:00, 30m slots). |
| `GET` | `/api/v1/scheduling/availability/week-preview` | `WORKS` | Returns computed free slots for the upcoming 7 days. |
| `GET` | `/api/v1/scheduling/interviews` | `WORKS` | Lists all scheduled, completed, and cancelled interviews. |
| `POST` | `/api/v1/scheduling/interviews` | `WORKS` | Directly creates interview record. |
| `GET` | `/api/v1/scheduling/interviews/{id}` | `WORKS` | Retrieves single interview record with candidate and meet link. |
| `PATCH` | `/api/v1/scheduling/interviews/{id}` | `WORKS` | Updates interview details (time, notes). |
| `POST` | `/api/v1/scheduling/interviews/{id}/cancel` | `WORKS` | Cancels interview and frees up calendar time. |
| `POST` | `/api/v1/scheduling/interviews/{id}/reschedule` | `WORKS` | Changes interview slot and updates Google Calendar event. |
| `POST` | `/api/v1/scheduling/interviews/{id}/result` | `BROKEN` | Records Passed/Failed/No-show. Fails with 500 when creating `Message` without `channel` column. |
| `POST` | `/api/v1/scheduling/links` | `WORKS` | Generates unique tokenized candidate self-booking invitation link. |
| `GET` | `/api/v1/scheduling/booking-link` | `WORKS` | Retrieves recruiter's general booking link. |
| `GET` | `/api/v1/scheduling/public/{token}` | `WORKS` | Public booking page endpoint; returns opening, recruiter, and candidate details. |
| `GET` | `/api/v1/scheduling/public/{token}/slots` | `WORKS` | Computes available slots: HR availability minus Calendar freeBusy minus DB bookings. |
| `POST` | `/api/v1/scheduling/public/{token}/book` | `WORKS` | Candidate slot reservation: creates Google Meet event, updates DB, sends confirmation. |
| `POST` | `/api/v1/scheduling/public/{token}/reschedule` | `WORKS` | Candidate self-reschedule endpoint. |
| `POST` | `/api/v1/scheduling/public/{token}/cancel` | `WORKS` | Candidate self-cancellation endpoint. |
| `GET` | `/api/v1/scheduling/offer-draft/{candidate_id}` | `WORKS` | Retrieves generated Offer Letter draft for HR review. |
| `POST` | `/api/v1/scheduling/offer-draft/{candidate_id}/send` | `WORKS` | HR approves & dispatches Offer Letter email to candidate. |
| `POST` | `/api/v1/scheduling/sync-calendar` | `WORKS` | Syncs interviews with connected Google Calendar. |
| `POST` | `/api/v1/scheduling/reminders/process` | `WORKS` | Dispatches automated 24-hour and 1-hour interview reminder emails. |

### 4.6 Outreach & Email Communication (`app/routers/outreach.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/outreach/queue` | `WORKS` | Lists candidates pending first-contact outreach message. |
| `POST` | `/api/v1/outreach/queue/{id}/approve` | `WORKS` | HR approves draft outreach email; dispatches via Gmail API. |
| `POST` | `/api/v1/outreach/queue/{id}/reject` | `WORKS` | Rejects/cancels outreach draft. |
| `POST` | `/api/v1/outreach/queue/{id}/regenerate`| `WORKS` | Uses LLM to rewrite outreach email based on candidate profile. |
| `POST` | `/api/v1/outreach/bulk-approve` | `WORKS` | Approves and sends multiple queued outreach emails in batch. |
| `GET` | `/api/v1/outreach/audit-trail` | `WORKS` | Detailed log of all outreach emails sent, delivered, or failed. |
| `GET` | `/api/v1/outreach/auto-update-status` | `WORKS` | Background check marking passed interviews as `interviewed`. |

### 4.7 Google Integrations & Gmail Inbox (`app/routers/integrations_google.py` & `auth_google.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/auth/google/login` | `WORKS` | Generates OAuth2 consent URL requesting Gmail & Calendar scopes. |
| `GET` | `/api/v1/auth/google/callback` | `WORKS` | Handles Google OAuth2 redirect, exchanges authorization code for tokens, saves to `google_accounts`. |
| `GET` | `/api/v1/integrations/google/status` | `WORKS` | Returns Google connection status, token validity, and sync statistics. |
| `POST` | `/api/v1/integrations/google/sync` | `WORKS` | Triggers background sync of candidate Gmail threads. |
| `GET` | `/api/v1/integrations/google/conversations` | `WORKS` | Retrieves candidate Gmail email threads for Recruiting Inbox. |
| `GET` | `/api/v1/integrations/google/threads/{candidate_id}` | `WORKS` | Retrieves full email message history for single candidate. |
| `POST` | `/api/v1/integrations/google/send-email` | `WORKS` | Dispatches outbound email from recruiter's Gmail address. |
| `POST` | `/api/v1/integrations/google/reply` | `WORKS` | Posts in-thread reply to candidate email thread. |
| `POST` | `/api/v1/integrations/google/ai-draft-reply` | `WORKS` | Generates context-aware suggested reply using LLM. |
| `POST` | `/api/v1/integrations/google/preview-email` | `WORKS` | Returns rendered email body with interpolated variables. |
| `PATCH` | `/api/v1/integrations/google/settings` | `WORKS` | Updates Gmail sync query, label, and default opening assignment. |
| `POST` | `/api/v1/integrations/google/disconnect` | `WORKS` | Revokes Google OAuth tokens and disconnects integration. |
| `ALL` | `/integrations/google/*` | `DUPLICATE` | Root-level mount duplicates `/api/v1/integrations/google/*`. |
| `ALL` | `/auth/google/*` | `DUPLICATE` | Root-level mount duplicates `/api/v1/auth/google/*`. |

### 4.8 Agent Settings & Monitoring (`app/routers/agent_settings.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/agent/settings` | `WORKS` | Returns Agent Settings: pause switch status, daily send quota, email notification toggles. |
| `PUT` | `/api/v1/agent/settings` | `WORKS` | Updates Agent Settings. |
| `POST` | `/api/v1/agent/pause` | `WORKS` | Toggles autonomous recruiter agent between active and paused. |
| `GET` | `/api/v1/agent/today-activity` | `WORKS` | Status dashboard feed: CVs ingested, evaluated, and interviews conducted today. |
| `POST` | `/api/v1/agent/send-daily-summary` | `WORKS` | Dispatches daily recruiter recap email on-demand. |
| `POST` | `/api/v1/agent/test-failure-alert` | `WORKS` | Dispatches test failure alert to verify recruiter email delivery. |

### 4.9 Onboarding Setup Wizard (`app/routers/onboarding.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/onboarding` | `WORKS` | Retrieves current 4-step onboarding state and email templates. |
| `POST` | `/api/v1/onboarding` | `WORKS` | Saves completed wizard steps (profile, opening, availability, templates). |
| `POST` | `/api/v1/onboarding/generate-templates` | `WORKS` | One-click AI generation of 11 recruitment templates tailored to company tone. |
| `GET` | `/api/v1/onboarding/setup` | `BROKEN` | Returns 404 (Route misnamed: router defines `GET /api/v1/onboarding`, frontend queried `/setup`). |
| `GET` | `/api/v1/onboarding/templates` | `BROKEN` | Returns 404 (Route not registered; templates are nested inside `GET /api/v1/onboarding`). |

### 4.10 AI Services & OpenRouter Health (`app/routers/ai.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/ai/models/health` | `WORKS` | Checks latency and operational status of OpenRouter LLM endpoints. |
| `POST` | `/api/v1/ai/screen-candidate` | `WORKS` | Direct stateless CV screening endpoint against JD text. |
| `POST` | `/api/v1/ai/interview-questions` | `WORKS` | Generates behavioral/technical questions from JD. |
| `ALL` | `/ai/*` | `DUPLICATE` | Root-level aliases for the above endpoints. |

### 4.11 Dashboard, Notifications & Search (`app/routers/dashboard.py`, `notifications.py`, `search.py`)
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `GET` | `/api/v1/dashboard/stats` | `WORKS` | Aggregates high-level recruitment metrics and stage breakdowns. |
| `GET` | `/api/v1/notifications` | `WORKS` | Lists active recruiter notifications and alerts. |
| `PATCH` | `/api/v1/notifications/{id}/read` | `WORKS` | Marks single notification as read. |
| `POST` | `/api/v1/notifications/read-all` | `WORKS` | Marks all notifications as read. |
| `GET` | `/api/v1/search` | `WORKS` | Full-text global search across candidates, jobs, and audit notes. |

### 4.12 Legacy & Dead Routers / Endpoints
| Method | Endpoint | Status | Description |
|---|---|---|---|
| `ALL` | `/api/v1/scorecards/*` | `DEAD` | Legacy scorecards router (`app/routers/scorecards.py`); 0 DB rows, unreferenced by UI. |
| `GET` | `/debug/integrations` | `DEAD` / `BROKEN` | Mounted at root with zero authentication; runs 16s diagnostic and writes live records to DB on every call. **Security risk: MUST DELETE.** |

---

## 5. Background Jobs (5 Background Jobs)

| Job Identifier | Implementation Location | Trigger & Interval | Status | Description |
|---|---|---|---|---|
| `periodic_gmail_sync` | `backend/app/main.py` (`_periodic_gmail_sync_worker`) | `asyncio.create_task` every 15 minutes | `WORKS` | Loops through all connected Google accounts; scans Gmail for inbound CVs and replies; ingests candidates. |
| `ondemand_gmail_sync` | `backend/app/routers/integrations_google.py` | FastAPI `BackgroundTasks` via `POST /sync` | `WORKS` | Immediately triggers incremental Gmail inbox sync in background worker. |
| `batch_cv_matching` | `backend/app/routers/job_openings.py` | FastAPI `BackgroundTasks` via `POST /{id}/match` | `WORKS` | Iterates over unmatched candidates in opening; invokes OpenRouter LLM concurrently to produce match scores. |
| `interview_notifications`| `backend/app/routers/scheduling.py` | FastAPI `BackgroundTasks` on booking/reschedule | `WORKS` | Sends Google Meet confirmation emails to candidate and HR; creates Google Calendar event. |
| `interview_reminders` | `backend/app/routers/scheduling.py` | Manual trigger `POST /reminders/process` | `STUB` | Dispatches 24h & 1h interview reminders. Needs cron or background loop to execute autonomously. |

---

## 6. Database Tables (19 Tables)

| Table Name | Model File | Rows | Status | Purpose & Architecture Role |
|---|---|---|---|---|
| `users` | `app/models/user.py` | 5 | `WORKS` | Recruiter user accounts (id, email, password_hash, full_name, company). |
| `candidates` | `app/models/candidate.py` | 3 | `WORKS` | Core candidate records: contact info, stage, AI match score, review status, offer status. |
| `job_openings` | `app/models/job_opening.py` | 4 | `WORKS` | Job requisitions: title, description, required skills, pass mark, rounds enabled. |
| `interviews` | `app/models/interview.py` | 1 | `WORKS` | Scheduled interviews: round type, start/end time, meet link, result status. |
| `scheduling_links` | `app/models/interview.py` | 2 | `WORKS` | Unique candidate self-scheduling tokens (`/schedule/{token}`) with round and expiration. |
| `availability_schedules`| `app/models/interview.py` | 2 | `WORKS` | Weekly recurring recruiter working hours (Mon-Fri time windows, slot duration). |
| `messages` | `app/models/message.py` | 9 | `BROKEN` | Email communications log. **Missing `channel` column**, breaking review and result transitions. |
| `audit_logs` | `app/models/audit_log.py` | 105 | `WORKS` | Immutable audit trail for every candidate stage transition, action, and decision. |
| `google_accounts` | `app/models/google_account.py` | 1 | `WORKS` | OAuth2 refresh tokens, email, sync history, and active credentials for Google services. |
| `onboarding_setups` | `app/models/onboarding.py` | 2 | `WORKS` | Recruiter profile, company info, working availability, and JSON email templates. |
| `agent_settings` | `app/models/agent_settings.py` | 2 | `WORKS` | Recruiter autonomous agent controls (is_paused, daily_limit, notification preferences). |
| `notifications` | `app/models/notification.py` | 5 | `WORKS` | In-app alerts for bookings, incoming CVs, and review requirements. |
| `candidate_links` | `app/models/candidate_link.py`| 2 | `WORKS` | Extracted profile URLs (LinkedIn, GitHub, portfolio) with verification status. |
| `emails_synced` | `app/models/email_synced.py` | 4 | `WORKS` | Dedup tracking table storing processed Gmail message IDs to prevent re-processing. |
| `alembic_version` | Internal Alembic | 1 | `WORKS` | Tracks current database migration revision. |
| `applications` | `app/models/application.py` | 0 | `DEAD` | Legacy job-seeker application tracking model. Unused by recruiter workflow. |
| `jobs` | `app/models/job.py` | 0 | `DEAD` | Legacy job model with integer primary key. Replaced by `job_openings`. |
| `cv_versions` | `app/models/cv_version.py` | 0 | `DEAD` | Legacy CV version snapshot model. Never queried or populated by any service. |
| `scorecards` | `app/models/scorecard.py` | 0 | `DEAD` | Legacy interview scorecard model. Replaced by `interviews.result_status` and feedback notes. |

---

## 7. Summary of Artifacts to Prune in Phase 1

1. **Delete Dead Tables:** `applications`, `jobs`, `cv_versions`, `scorecards`.
2. **Delete Dead Routers:** `app/routers/scorecards.py`, `app/routers/debug.py`.
3. **Delete Root-Level Aliases:** Remove duplicate root routers `/ai/*`, `/job-openings/*`, `/integrations/google/*`, `/auth/google/*`.
4. **Fix Schema Mismatch:** Add `channel: Optional[str] = Field(default="email")` to `Message` model and migrate Postgres column.
5. **Consolidate Pages to 6:**
   - **Page 1: Action Center** (Merged: Dashboard + AI Screening + Outreach Agent + Agent Status)
   - **Page 2: Pipeline** (With embedded Candidate Comparison)
   - **Page 3: Inbox** (Gmail Thread Conversations & AI Reply)
   - **Page 4: Interviews** (With embedded Weekly Availability tab)
   - **Page 5: Openings** (Requisitions, JD requirements, Candidate ranking)
   - **Page 6: Settings** (Google Integration, Email Templates, Agent Controls, Profile)
