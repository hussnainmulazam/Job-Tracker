/**
 * lib/api.ts
 * ~~~~~~~~~~
 * Type-safe HTTP client for the AI Candidate Screening Copilot (Recruiting SaaS).
 * Connects directly to FastAPI backend with JWT bearer authentication.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8000";

const TOKEN_STORAGE_KEY = "job_tracker_token";

// ── Auth Token Storage ────────────────────────────────────────────────────────

export function getAuthToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
      window.dispatchEvent(new Event("auth-change"));
    } catch (e) {
      console.error("Failed to persist auth token:", e);
    }
  }
}

export function removeAuthToken(): void {
  if (typeof window !== "undefined") {
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
      window.dispatchEvent(new Event("auth-change"));
    } catch (e) {
      console.error("Failed to remove auth token:", e);
    }
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

export type JobOpeningStatus = "draft" | "active" | "paused" | "closed";

export type CandidateStage =
  | "applied"
  | "screening"
  | "interview"
  | "offer"
  | "rejected";

export interface JobOpening {
  id: string;
  user_id: string;
  title: string;
  description: string;
  required_skills: string[];
  years_of_experience?: number | null;
  nice_to_haves?: string[];
  status: JobOpeningStatus;
  google_sheet_id?: string | null;
  google_sheet_url?: string | null;
  created_at: string;
  updated_at: string;
  candidates_count?: number;
}

export interface PaginatedJobOpenings {
  items: JobOpening[];
  total: number;
  skip: number;
  limit: number;
}

export interface Scorecard {
  id: string;
  user_id: string;
  candidate_id: string;
  rating: number; // 1-5
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaginatedScorecards {
  items: Scorecard[];
  total: number;
}

export interface ExtractedFieldMeta {
  value?: string | null;
  confidence: number;
  source: string;
}

export interface ExtractedCandidateData {
  name?: string | null;
  email?: string | null;
  secondary_emails?: string[];
  phone?: string | null;
  secondary_phones?: string[];
  address?: string | null;
  current_title?: string | null;
  years_of_experience?: number | null;
  top_skills?: string[];
  education?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  kaggle_url?: string | null;
  portfolio_url?: string | null;
  other_links?: string[];
}

export interface CandidateDuplicateInfo {
  is_duplicate: boolean;
  matched_by?: "email" | "phone" | null;
  existing_candidate_id?: string | null;
  existing_candidate_name?: string | null;
  existing_candidate_email?: string | null;
  existing_opening_id?: string | null;
  existing_opening_title?: string | null;
  existing_stage?: string | null;
  existing_score?: number | null;
}

export interface CandidateExtractionPreviewResponse {
  file_name?: string | null;
  file_url?: string | null;
  cv_text: string;
  opening_id: string;
  extracted_data: ExtractedCandidateData;
  field_metadata: Record<string, ExtractedFieldMeta>;
  duplicate_info: CandidateDuplicateInfo;
  low_confidence_fields: string[];
  missing_fields: string[];
}

export interface CandidateConfirmPayload {
  opening_id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  current_title?: string | null;
  years_of_experience?: number | null;
  top_skills?: string[];
  education?: string | null;
  linkedin_url?: string | null;
  github_url?: string | null;
  kaggle_url?: string | null;
  portfolio_url?: string | null;
  other_links?: string[];
  cv_text: string;
  cv_file_url?: string | null;
  field_metadata?: Record<string, ExtractedFieldMeta>;
  extracted_data?: Record<string, any>;
  auto_screen?: boolean;
  action?: "create" | "merge" | "skip";
  merge_candidate_id?: string | null;
}

export interface CandidateLinkRead {
  id: string;
  candidate_id: string;
  link_type: "github" | "linkedin" | "kaggle" | "portfolio" | "other" | string;
  url: string;
  is_verified?: boolean | null;
  confidence: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface ExtractedFieldMeta {
  value?: string | null;
  confidence: number;
  source: string;
}

export interface CandidateExtractedDetails {
  candidate_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  kaggle_url?: string | null;
  other_links: string[];
  field_metadata: Record<string, ExtractedFieldMeta>;
  links_verified: Record<string, boolean | null>;
}

export interface GoogleSheetSyncResponse {
  spreadsheet_id: string;
  spreadsheet_url: string;
  total_candidates_synced: number;
  rows_updated: number;
  rows_appended: number;
  synced_at: string;
}

export interface Candidate {
  id: string;
  user_id: string;
  opening_id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  github_url?: string | null;
  linkedin_url?: string | null;
  portfolio_url?: string | null;
  kaggle_url?: string | null;
  extracted_data?: Record<string, { value: string | null; confidence: number; source: string }> | null;
  cv_text: string;
  cv_file_url?: string | null;
  score?: number | null;
  matched_skills: string[];
  missing_skills: string[];
  red_flags: string[];
  summary?: string | null;
  stage: CandidateStage;
  created_at: string;
  updated_at: string;
  whatsapp_opt_in?: boolean;
  whatsapp_opt_in_at?: string | null;
  last_inbound_whatsapp_at?: string | null;
  opening_title?: string;
  scorecards?: Scorecard[];
  links?: CandidateLinkRead[];
}

export interface PaginatedCandidates {
  items: Candidate[];
  total: number;
  skip: number;
  limit: number;
}

export interface CandidateScreenResult {
  candidate_id: string;
  candidate_name: string;
  score: number;
  matched_skills: string[];
  missing_skills: string[];
  red_flags: string[];
  summary: string;
  recommendation?: string;
  interview_focus_areas?: string[];
  rank?: number;
  stage?: CandidateStage;
  model_used?: string;
  latency_seconds?: number;
}

export interface BulkScoreResponse {
  opening_id: string;
  opening_title: string;
  total_candidates: number;
  ranked_candidates: CandidateScreenResult[];
}

export interface FunnelStageItem {
  stage: string;
  label: string;
  count: number;
  percentage: number;
}

export interface UpcomingInterviewItem {
  id: string;
  title: string;
  candidate_name: string;
  candidate_email: string;
  opening_title?: string | null;
  start_time: string;
  end_time: string;
  meet_link?: string | null;
  status: string;
}

export interface AwaitingReplyThreadItem {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  opening_title?: string | null;
  last_message: string;
  received_at: string;
  hours_ago: number;
}

export interface DashboardStats {
  total_openings: number;
  active_openings: number;
  total_candidates: number;
  screened_candidates: number;
  shortlisted_candidates: number;
  average_score: number | null;
  new_cvs_today: number;
  pending_reviews: number;
  messages_awaiting_reply: number;
  interviews_this_week: number;
  time_to_shortlist_hours: number | null;
  stage_breakdown: Record<CandidateStage, number>;
  funnel_by_stage: FunnelStageItem[];
  recent_candidates: Array<{
    id: string;
    name: string;
    email: string;
    opening_title?: string;
    stage: CandidateStage;
    score: number | null;
    created_at: string;
  }>;
  openings_summary: Array<{
    id: string;
    title: string;
    status: JobOpeningStatus;
    candidates_count?: number;
    total_candidates?: number;
    average_score: number | null;
  }>;
  upcoming_interviews: UpcomingInterviewItem[];
  awaiting_reply_threads: AwaitingReplyThreadItem[];
}

export interface AuditLog {
  id: string;
  user_id: string;
  candidate_id?: string | null;
  candidate_name?: string | null;
  opening_id?: string | null;
  opening_title?: string | null;
  action: string;
  from_stage?: string | null;
  to_stage?: string | null;
  details?: string | null;
  created_at: string;
}

export interface PaginatedAuditLogs {
  items: AuditLog[];
  total: number;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: string;
  link?: string | null;
  is_read: boolean;
  created_at: string;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  unread_count: number;
}

export interface SearchResultItem {
  id: string;
  type: "candidate" | "opening" | "action";
  title: string;
  subtitle: string;
  link: string;
  score?: number | null;
  stage_or_status?: string | null;
  matched_skills: string[];
}

export interface SearchResponse {
  query: string;
  candidates: SearchResultItem[];
  openings: SearchResultItem[];
  quick_actions: SearchResultItem[];
  total_results: number;
}

export interface WhatsAppConversationSummary {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string | null;
  opening_id?: string | null;
  opening_title?: string | null;
  candidate_stage: string;
  candidate_score?: number | null;
  whatsapp_opt_in: boolean;
  last_message_body?: string | null;
  last_message_direction?: string | null;
  last_message_status?: string | null;
  last_message_at?: string | null;
  total_messages: number;
  awaiting_reply: boolean;
  care_window_open: boolean;
  care_window_expires_at?: string | null;
  seconds_remaining?: number | null;
}

export interface WhatsAppConversationsResponse {
  conversations: WhatsAppConversationSummary[];
  total_conversations: number;
  awaiting_reply_count: number;
}

// ── Custom API Error Class ──────────────────────────────────────────────────

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(status: number, message: string, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

// ── Core Fetch Wrapper ──────────────────────────────────────────────────────

export interface ApiFetchOptions extends RequestInit {
  token?: string | null;
  skipAuth?: boolean;
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<T> {
  const { token, skipAuth = false, headers, ...customConfig } = options;

  let url = endpoint;
  if (!endpoint.startsWith("http://") && !endpoint.startsWith("https://")) {
    const cleanPath = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    url = `${API_BASE_URL}${cleanPath}`;
  }

  const reqHeaders = new Headers(headers);

  if (!skipAuth) {
    const activeToken = token ?? getAuthToken();
    if (activeToken) {
      reqHeaders.set("Authorization", `Bearer ${activeToken}`);
    }
  }

  if (
    customConfig.body &&
    typeof customConfig.body === "string" &&
    !reqHeaders.has("Content-Type")
  ) {
    reqHeaders.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...customConfig,
    headers: reqHeaders,
  });

  if (response.status === 401) {
    removeAuthToken();

    if (typeof window !== "undefined") {
      try {
        fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        document.cookie = "auth_token=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      } catch {}

      const currentPath = window.location.pathname;
      if (!currentPath.startsWith("/login") && !currentPath.startsWith("/register")) {
        // Use replace to avoid browser back history loop and clear ongoing polling
        window.location.replace(`/login?redirect=${encodeURIComponent(currentPath)}`);
      }
    }

    throw new ApiError(401, "Session expired or invalid credentials.", null);
  }

  if (!response.ok) {
    let errorDetail = `Request failed with status ${response.status}`;
    let errorData: unknown = null;

    try {
      errorData = await response.json();
      if (typeof errorData === "object" && errorData !== null) {
        const errorRecord = errorData as Record<string, unknown>;
        if (typeof errorRecord.detail === "string") {
          errorDetail = errorRecord.detail;
        } else if (Array.isArray(errorRecord.detail)) {
          errorDetail = errorRecord.detail
            .map((err: { msg?: string; loc?: (string | number)[] }) => {
              const field = err.loc ? err.loc.slice(-1)[0] : "field";
              return `${field}: ${err.msg || "Invalid value"}`;
            })
            .join(", ");
        } else if (typeof errorRecord.message === "string") {
          errorDetail = errorRecord.message;
        }
      }
    } catch {
      // Body not JSON
    }

    throw new ApiError(response.status, errorDetail, errorData);
  }

  if (response.status === 204) {
    return undefined as unknown as T;
  }

  return response.json();
}

// ── Generic API Methods ─────────────────────────────────────────────────────

export const api = {
  get: <T>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "GET" }),

  post: <T>(endpoint: string, data?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: "POST",
      body:
        data instanceof FormData
          ? data
          : data
          ? JSON.stringify(data)
          : undefined,
    }),

  patch: <T>(endpoint: string, data?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    }),

  put: <T>(endpoint: string, data?: unknown, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, {
      ...options,
      method: "PUT",
      body:
        data instanceof FormData
          ? data
          : data
          ? JSON.stringify(data)
          : undefined,
    }),

  delete: <T>(endpoint: string, options?: ApiFetchOptions) =>
    apiFetch<T>(endpoint, { ...options, method: "DELETE" }),
};

// ── Domain API Services ─────────────────────────────────────────────────────

export interface MatchProgressStatus {
  opening_id: string;
  status: "idle" | "in_progress" | "completed" | "failed";
  total_candidates: number;
  processed_candidates: number;
  matched_candidates: number;
  progress_percent: number;
  errors: string[];
  started_at?: string | null;
  completed_at?: string | null;
}

export const jobOpeningsApi = {
  list: (status?: string, limit: number = 50, skip: number = 0) => {
    const params = new URLSearchParams({ limit: String(limit), skip: String(skip) });
    if (status) params.append("status", status);
    return api.get<PaginatedJobOpenings>(`/api/v1/job-openings?${params.toString()}`);
  },

  get: (id: string) => api.get<JobOpening>(`/api/v1/job-openings/${id}`),

  create: (data: {
    title: string;
    description: string;
    required_skills: string[];
    status?: JobOpeningStatus;
  }) => api.post<JobOpening>("/api/v1/job-openings", data),

  update: (
    id: string,
    data: Partial<{
      title: string;
      description: string;
      required_skills: string[];
      status: JobOpeningStatus;
    }>
  ) => api.patch<JobOpening>(`/api/v1/job-openings/${id}`, data),

  delete: (id: string) => api.delete<void>(`/api/v1/job-openings/${id}`),

  bulkScore: (id: string) =>
    api.post<BulkScoreResponse>(`/api/v1/job-openings/${id}/bulk-score`),

  match: (id: string, rerun: boolean = false) =>
    api.post<MatchProgressStatus>(`/api/v1/job-openings/${id}/match?rerun=${rerun}`),

  getMatchStatus: (id: string) =>
    api.get<MatchProgressStatus>(`/api/v1/job-openings/${id}/match/status`),

  generateQuestions: (id: string, count: number = 5) =>
    api.post<{ questions: string[] }>(
      `/api/v1/job-openings/${id}/screening-questions?count=${count}`
    ),

  getShortlistExportUrl: (id: string, minScore?: number) => {
    const params = new URLSearchParams();
    if (minScore !== undefined) params.append("min_score", String(minScore));
    const token = getAuthToken();
    return `${API_BASE_URL}/api/v1/job-openings/${id}/shortlist/export?${params.toString()}`;
  },

  syncGoogleSheet: (id: string) =>
    api.post<GoogleSheetSyncResponse>(`/api/v1/job-openings/${id}/sync-google-sheet`),

  extractAll: (id: string, verifyUrls: boolean = true) =>
    api.post<{ opening_id: string; candidates_processed: number; results: CandidateExtractedDetails[] }>(
      `/api/v1/job-openings/${id}/extract-all?verify_urls=${verifyUrls}`
    ),
};

export const candidatesApi = {
  list: (params?: {
    opening_id?: string;
    stage?: CandidateStage;
    limit?: number;
    skip?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.opening_id) searchParams.append("opening_id", params.opening_id);
    if (params?.stage) searchParams.append("stage", params.stage);
    if (params?.limit) searchParams.append("limit", String(params.limit));
    if (params?.skip) searchParams.append("skip", String(params.skip));
    return api.get<PaginatedCandidates>(`/api/v1/candidates?${searchParams.toString()}`);
  },

  get: (id: string) => api.get<Candidate>(`/api/v1/candidates/${id}`),

  create: (data: {
    opening_id: string;
    name: string;
    email: string;
    cv_text: string;
  }) => api.post<Candidate>("/api/v1/candidates", data),

  extractCv: (formData: FormData) =>
    api.post<CandidateExtractionPreviewResponse>("/api/v1/candidates/extract-cv", formData),

  extractText: (data: { opening_id: string; cv_text: string }) =>
    api.post<CandidateExtractionPreviewResponse>("/api/v1/candidates/extract-text", data),

  confirmExtracted: (data: CandidateConfirmPayload) =>
    api.post<Candidate>("/api/v1/candidates/confirm-extracted", data),

  uploadPdf: (formData: FormData) =>
    api.post<Candidate>("/api/v1/candidates/upload", formData),

  updatePdf: (id: string, formData: FormData) =>
    api.put<Candidate>(`/api/v1/candidates/${id}/upload-cv`, formData),

  update: (
    id: string,
    data: Partial<{
      name: string;
      email: string;
      phone: string | null;
      address: string | null;
      github_url: string | null;
      linkedin_url: string | null;
      portfolio_url: string | null;
      kaggle_url: string | null;
      cv_text: string;
      stage: CandidateStage;
      score: number | null;
    }>
  ) => api.patch<Candidate>(`/api/v1/candidates/${id}`, data),

  extractDetails: (id: string, verifyUrls: boolean = true) =>
    api.post<CandidateExtractedDetails>(`/api/v1/candidates/${id}/extract-details?verify_urls=${verifyUrls}`),

  getLinks: (id: string) =>
    api.get<CandidateLinkRead[]>(`/api/v1/candidates/${id}/links`),

  updateStage: (id: string, stage: CandidateStage) =>
    api.patch<Candidate>(`/api/v1/candidates/${id}/stage`, { stage }),

  score: (id: string, rerun: boolean = false) =>
    api.post<CandidateScreenResult>(
      `/api/v1/candidates/${id}/score${rerun ? "?re_run=true" : ""}`
    ),

  generateQuestions: (id: string, count: number = 5) =>
    api.post<{ candidate_id: string; candidate_name: string; questions: string[] }>(
      `/api/v1/candidates/${id}/screening-questions?count=${count}`
    ),

  bulkStage: (candidateIds: string[], stage: CandidateStage) =>
    api.post<{ updated_count: number; message: string }>("/api/v1/candidates/bulk-stage", {
      candidate_ids: candidateIds,
      stage,
    }),

  bulkDelete: (candidateIds: string[]) =>
    api.post<{ updated_count: number; message: string }>("/api/v1/candidates/bulk-delete", {
      candidate_ids: candidateIds,
    }),

  getAuditLogs: (candidateId: string) =>
    api.get<AuditLog[]>(`/api/v1/candidates/${candidateId}/audit-logs`),

  delete: (id: string) => api.delete<void>(`/api/v1/candidates/${id}`),
};

export const auditLogsApi = {
  listRecent: (params?: { opening_id?: string; limit?: number; skip?: number }) => {
    const searchParams = new URLSearchParams();
    if (params?.opening_id) searchParams.append("opening_id", params.opening_id);
    if (params?.limit) searchParams.append("limit", String(params.limit));
    if (params?.skip) searchParams.append("skip", String(params.skip));
    return api.get<PaginatedAuditLogs>(`/api/v1/candidates/audit-logs/recent?${searchParams.toString()}`);
  },
  listForCandidate: (candidateId: string) =>
    api.get<AuditLog[]>(`/api/v1/candidates/${candidateId}/audit-logs`),
};

export const notificationsApi = {
  list: (limit: number = 30) =>
    api.get<NotificationListResponse>(`/api/v1/notifications?limit=${limit}`),
  markRead: (id: string) =>
    api.patch<NotificationItem>(`/api/v1/notifications/${id}/read`, {}),
  markAllRead: () =>
    api.post<{ updated: number; message: string }>("/api/v1/notifications/read-all", {}),
};

export const searchApi = {
  search: (q: string) =>
    api.get<SearchResponse>(`/api/v1/search?q=${encodeURIComponent(q)}`),
};

export const scorecardsApi = {
  list: (candidate_id?: string) => {
    const params = candidate_id ? `?candidate_id=${candidate_id}` : "";
    return api.get<PaginatedScorecards>(`/api/v1/scorecards${params}`);
  },

  create: (data: { candidate_id: string; rating: number; notes?: string }) =>
    api.post<Scorecard>("/api/v1/scorecards", data),

  update: (id: string, data: { rating?: number; notes?: string }) =>
    api.patch<Scorecard>(`/api/v1/scorecards/${id}`, data),

  delete: (id: string) => api.delete<void>(`/api/v1/scorecards/${id}`),
};

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>("/api/v1/dashboard/stats"),
};

// ── Google Integrations API ──────────────────────────────────────────────────

export interface EmailSyncItemResult {
  message_id: string;
  sender?: string | null;
  subject?: string | null;
  status: "created" | "duplicate" | "failed" | string;
  candidate_id?: string | null;
  candidate_name?: string | null;
  opening_title?: string | null;
  reason?: string | null;
}

export interface GoogleAccountStatus {
  is_connected: boolean;
  email: string | null;
  scopes: string[];
  missing_scopes?: string[];
  reconnect_needed?: boolean;
  reconnect_reason?: string | null;
  last_synced_at: string | null;
  last_sync_status: string;
  sync_query: string;
  sync_label: string;
  default_opening_id?: string | null;
  default_opening_title?: string | null;
  total_emails_synced: number;
  synced_from_gmail_count?: number;
  recent_sync_results?: EmailSyncItemResult[];
}

export interface GoogleAuthUrlResponse {
  auth_url: string;
  state: string;
}

export interface GmailSyncResponse {
  status: string;
  messages_found: number;
  messages_processed: number;
  attachments_saved: number;
  candidates_created: number;
  synced_from_gmail_count?: number;
  results?: EmailSyncItemResult[];
  errors: string[];
  last_synced_at: string;
}

export interface GooglePreviewEmailRequest {
  candidate_id: string;
  template_name: string;
  custom_subject?: string;
  custom_body?: string;
  slot_link?: string;
  company_name?: string;
}

export interface GooglePreviewEmailResponse {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  subject: string;
  body: string;
  variables: Record<string, string>;
}

export interface GoogleSendEmailRequest {
  candidate_id: string;
  subject: string;
  body: string;
  template_name?: string;
}

export interface GoogleSendEmailResponse {
  message_id: string;
  candidate_id: string;
  recipient_email: string;
  subject: string;
  status: string;
  sent_at: string;
  google_message_id?: string;
}

export const googleApi = {
  getLoginUrl: () => api.get<GoogleAuthUrlResponse>("/api/v1/auth/google/login"),
  getStatus: () => api.get<GoogleAccountStatus>("/api/v1/integrations/google/status"),
  disconnect: () => api.post<{ detail: string }>("/api/v1/integrations/google/disconnect"),
  syncGmail: (params?: { query?: string; label?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.query) searchParams.set("query", params.query);
    if (params?.label) searchParams.set("label", params.label);
    const qs = searchParams.toString();
    return api.post<GmailSyncResponse>(`/api/v1/integrations/google/sync${qs ? `?${qs}` : ""}`);
  },
  updateSettings: (data: { sync_query?: string; sync_label?: string; default_opening_id?: string | null }) =>
    api.patch<GoogleAccountStatus>("/api/v1/integrations/google/settings", data),
  previewEmail: (data: GooglePreviewEmailRequest) =>
    api.post<GooglePreviewEmailResponse>("/api/v1/integrations/google/preview-email", data),
  sendEmail: (data: GoogleSendEmailRequest) =>
    api.post<GoogleSendEmailResponse>("/api/v1/integrations/google/send-email", data),
  listConversations: (filterStatus?: string) => {
    const params = filterStatus && filterStatus !== "all" ? `?filter_status=${filterStatus}` : "";
    return api.get<EmailConversationsResponse>(`/api/v1/integrations/google/conversations${params}`);
  },
  getThread: (candidateId: string) =>
    api.get<EmailThreadResponse>(`/api/v1/integrations/google/threads/${candidateId}`),
  sendReply: (data: { candidate_id: string; message: string; subject?: string }) =>
    api.post<GoogleSendEmailResponse>("/api/v1/integrations/google/reply", data),
  aiDraftReply: (data: { candidate_id: string; instructions?: string | null }) =>
    api.post<{ candidate_id: string; drafted_subject: string; drafted_message: string }>(
      "/api/v1/integrations/google/ai-draft-reply",
      data
    ),
};

// ── Email Conversations & Messaging ────────────────────────────────────────

export interface EmailConversationSummary {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_stage: string;
  opening_title?: string | null;
  last_message_body?: string | null;
  last_message_subject?: string | null;
  last_message_direction?: string | null;
  last_message_at?: string | null;
  unread: boolean;
}

export interface EmailConversationsResponse {
  conversations: EmailConversationSummary[];
  total_conversations: number;
  awaiting_reply_count: number;
}

export interface EmailMessageItem {
  id: string;
  candidate_id: string;
  direction: "inbound" | "outbound" | string;
  subject?: string | null;
  body: string;
  status: string;
  sent_at?: string | null;
  created_at: string;
}

export interface EmailThreadResponse {
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_stage: string;
  opening_title?: string | null;
  messages: EmailMessageItem[];
}

// ── Scheduling & Interviews API ──────────────────────────────────────────────

export interface AvailabilityScheduleRead {
  id: string;
  user_id: string;
  timezone: string;
  slot_duration_minutes: number;
  buffer_minutes: number;
  weekly_hours: Record<string, { start: string; end: string }[]>;
  blocked_dates?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityScheduleCreateOrUpdate {
  timezone?: string;
  slot_duration_minutes?: number;
  buffer_minutes?: number;
  weekly_hours: Record<string, { start: string; end: string }[]>;
  blocked_dates?: string[];
  is_active?: boolean;
}

export interface SchedulingLinkRead {
  id: string;
  token: string;
  user_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  opening_id: string;
  opening_title: string;
  slot_duration_minutes: number;
  status: string;
  expires_at: string;
  public_url: string;
  created_at: string;
}

export interface TimeSlot {
  start_time: string;
  end_time: string;
  start_time_local: string;
  end_time_local: string;
  date_str: string;
  timezone: string;
}

export interface PublicSlotsResponse {
  token: string;
  timezone: string;
  slot_duration_minutes: number;
  slots_by_date: Record<string, TimeSlot[]>;
  total_slots_available: number;
}

export interface InterviewRead {
  id: string;
  user_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string | null;
  opening_id: string;
  opening_title: string;
  scheduling_link_id?: string | null;
  title: string;
  start_time: string;
  end_time: string;
  timezone: string;
  google_calendar_event_id?: string | null;
  meet_link?: string | null;
  interviewer_email: string;
  status: "scheduled" | "rescheduled" | "cancelled" | "completed" | string;
  cancellation_reason?: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  reminder_24h_sent: boolean;
  reminder_1h_sent: boolean;
  created_at: string;
  updated_at: string;
}

export interface PublicSchedulePageInfo {
  token: string;
  status: "active" | "expired" | "booked" | "cancelled" | string;
  expires_at: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string | null;
  opening_title: string;
  slot_duration_minutes: number;
  default_timezone: string;
  interviewer_email: string;
  existing_interview?: InterviewRead | null;
}

export const schedulingApi = {
  getAvailability: () =>
    api.get<AvailabilityScheduleRead>("/api/v1/scheduling/availability"),

  updateAvailability: (data: AvailabilityScheduleCreateOrUpdate) =>
    api.put<AvailabilityScheduleRead>("/api/v1/scheduling/availability", data),

  createLink: (data: { candidate_id: string; slot_duration_minutes?: number; validity_days?: number }) =>
    api.post<SchedulingLinkRead>("/api/v1/scheduling/links", data),

  getPublicPage: (token: string) =>
    api.get<PublicSchedulePageInfo>(`/api/v1/scheduling/public/${token}`),

  getPublicSlots: (
    token: string,
    params?: { start_date?: string; end_date?: string; tz?: string }
  ) => {
    const q = new URLSearchParams();
    if (params?.start_date) q.set("start_date", params.start_date);
    if (params?.end_date) q.set("end_date", params.end_date);
    if (params?.tz) q.set("tz", params.tz);
    const qs = q.toString();
    return api.get<PublicSlotsResponse>(`/api/v1/scheduling/public/${token}/slots${qs ? `?${qs}` : ""}`);
  },

  bookSlot: (token: string, data: { start_time: string; timezone?: string; notes?: string }) =>
    api.post<InterviewRead>(`/api/v1/scheduling/public/${token}/book`, data),

  candidateReschedule: (
    token: string,
    data: { new_start_time: string; timezone?: string; reason?: string }
  ) => api.post<InterviewRead>(`/api/v1/scheduling/public/${token}/reschedule`, data),

  candidateCancel: (token: string, data: { reason?: string }) =>
    api.post<InterviewRead>(`/api/v1/scheduling/public/${token}/cancel`, data),

  listInterviews: (params?: {
    opening_id?: string;
    candidate_id?: string;
    status?: string;
    from_date?: string;
    to_date?: string;
  }) => {
    const q = new URLSearchParams();
    if (params?.opening_id) q.set("opening_id", params.opening_id);
    if (params?.candidate_id) q.set("candidate_id", params.candidate_id);
    if (params?.status) q.set("status", params.status);
    if (params?.from_date) q.set("from_date", params.from_date);
    if (params?.to_date) q.set("to_date", params.to_date);
    const qs = q.toString();
    return api.get<InterviewRead[]>(`/api/v1/scheduling/interviews${qs ? `?${qs}` : ""}`);
  },

  rescheduleInterview: (
    id: string,
    data: { new_start_time: string; timezone?: string; reason?: string }
  ) => api.post<InterviewRead>(`/api/v1/scheduling/interviews/${id}/reschedule`, data),

  cancelInterview: (id: string, data: { reason?: string; cancelled_by?: string }) =>
    api.post<InterviewRead>(`/api/v1/scheduling/interviews/${id}/cancel`, data),
};

export interface OutreachDraftRequest {
  candidate_id: string;
  channel?: "whatsapp" | "email";
  language?: "english" | "hinglish";
  instructions?: string;
}

export interface OutreachDraftResponse {
  message_id: string;
  candidate_id: string;
  candidate_name: string;
  channel: string;
  language: string;
  body: string;
  subject?: string;
  scheduling_url?: string;
  status: string;
  ai_drafted: boolean;
  hr_approved: boolean;
  created_at: string;
}

export interface ApprovalQueueItem {
  message_id: string;
  candidate_id: string;
  candidate_name: string;
  candidate_email: string;
  candidate_phone?: string;
  candidate_stage: string;
  opening_id?: string;
  opening_title?: string;
  channel: string;
  language: string;
  body: string;
  subject?: string;
  scheduling_url?: string;
  status: string;
  error_message?: string;
  retry_count: number;
  created_at: string;
}

export interface BulkApproveResponse {
  total: number;
  approved_count: number;
  sent_count: number;
  failed_count: number;
  results: Array<{
    message_id: string;
    candidate_id: string;
    candidate_name: string;
    channel: string;
    status: string;
    error?: string;
  }>;
}

export interface OutreachAuditItem {
  id: string;
  action: string;
  candidate_id?: string;
  candidate_name?: string;
  opening_title?: string;
  from_stage?: string;
  to_stage?: string;
  details?: string;
  failure_reason?: string;
  message_id?: string;
  retryable: boolean;
  created_at: string;
}

export interface StageSyncResponse {
  interviews_checked: number;
  stages_updated_to_interviewed: number;
  candidate_ids_updated: string[];
}

export const outreachApi = {
  draft: (data: OutreachDraftRequest) =>
    api.post<OutreachDraftResponse>("/api/v1/outreach/draft", data),

  getQueue: (params?: { candidate_id?: string; channel?: string }) => {
    const q = new URLSearchParams();
    if (params?.candidate_id) q.set("candidate_id", params.candidate_id);
    if (params?.channel) q.set("channel", params.channel);
    const qs = q.toString();
    return api.get<ApprovalQueueItem[]>(`/api/v1/outreach/queue${qs ? `?${qs}` : ""}`);
  },

  updateDraft: (messageId: string, data: { body: string; subject?: string }) =>
    api.put<ApprovalQueueItem>(`/api/v1/outreach/drafts/${messageId}`, data),

  approve: (messageId: string) =>
    api.post<{ message_id: string; status: string; error?: string }>(`/api/v1/outreach/approve/${messageId}`),

  bulkApprove: (messageIds: string[]) =>
    api.post<BulkApproveResponse>("/api/v1/outreach/bulk-approve", { message_ids: messageIds }),

  retry: (messageId: string) =>
    api.post<{ message_id: string; status: string; error?: string }>(`/api/v1/outreach/retry/${messageId}`),

  getAuditTrail: (params?: { candidate_id?: string; limit?: number }) => {
    const q = new URLSearchParams();
    if (params?.candidate_id) q.set("candidate_id", params.candidate_id);
    if (params?.limit) q.set("limit", String(params.limit));
    const qs = q.toString();
    return api.get<OutreachAuditItem[]>(`/api/v1/outreach/audit-trail${qs ? `?${qs}` : ""}`);
  },

  syncStages: () =>
    api.post<StageSyncResponse>("/api/v1/outreach/sync-stages"),
};

// ── Health API ─────────────────────────────────────────────────────────────

export interface DbHealthResponse {
  status: "connected" | "error";
  latency_ms: number;
  host?: string;
  port?: number;
  mode?: "session" | "transaction";
  error?: string;
}

export const healthApi = {
  checkDb: () => api.get<DbHealthResponse>("/health/db"),
  checkBackend: () => api.get<{ status: string; database?: string; version: string; environment?: string }>("/health"),
};
