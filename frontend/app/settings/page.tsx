"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Settings,
  User as UserIcon,
  Moon,
  Sun,
  Monitor,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Cpu,
  Database,
  Shield,
  LogOut,
  ExternalLink,
  Mail,
  Calendar,
  FileSpreadsheet,
  Check,
  Unlink,
  Save,
  KeyRound,
  Inbox,
  Filter,
  AlertTriangle,
  Clock,
  MessageSquare,
  Phone,
  UserCheck,
  FileText,
} from "lucide-react";

import {
  api,
  apiFetch,
  googleApi,
  jobOpeningsApi,
  healthApi,
  DbHealthResponse,
  GoogleAccountStatus,
  GmailSyncResponse,
  removeAuthToken,
} from "@/lib/api";
import { useTheme } from "@/components/theme-provider";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

interface UserProfile {
  id: string;
  email: string;
  created_at: string;
}

interface ModelHealthItem {
  model: string;
  role?: string;
  task?: string;
  status: "ok" | "fail";
  latency_ms: number;
  error?: string | null;
  error_type?: string | null;
}

interface AIModelsHealthResponse {
  status: "healthy" | "degraded" | "failing";
  models: ModelHealthItem[];
}

export default function SettingsPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Local state for Gmail sync filters
  const [filterQuery, setFilterQuery] = useState("");
  const [filterLabel, setFilterLabel] = useState("");
  const [defaultOpeningId, setDefaultOpeningId] = useState("");
  const [filterInitialized, setFilterInitialized] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState<GmailSyncResponse | null>(null);

  // Fetch active job openings for Gmail resume assignment
  const { data: openingsData } = useQuery({
    queryKey: ["settings-job-openings"],
    queryFn: () => jobOpeningsApi.list("active", 100),
    retry: false,
  });
  const activeOpenings = openingsData?.items || [];

  // 1. Fetch User Profile
  const { data: user, isLoading: isUserLoading } = useQuery<UserProfile>({
    queryKey: ["current-user"],
    queryFn: async () => {
      return apiFetch<UserProfile>("/api/v1/auth/me");
    },
    retry: false,
  });

  // 2. Fetch Backend Health
  const {
    data: backendHealth,
    isLoading: isHealthLoading,
    refetch: refetchBackendHealth,
  } = useQuery({
    queryKey: ["backend-health"],
    queryFn: async () => {
      return api.get<{
        status: string;
        database?: string;
        app: string;
        version: string;
        environment: string;
      }>("/health");
    },
  });

  // 2b. Fetch Live PostgreSQL Database Latency & Health
  const {
    data: dbHealth,
    isLoading: isDbHealthLoading,
    isFetching: isDbHealthFetching,
    refetch: refetchDbHealth,
  } = useQuery<DbHealthResponse>({
    queryKey: ["db-health"],
    queryFn: () => healthApi.checkDb(),
    retry: false,
  });

  // 3. Fetch Live AI Model Health
  const {
    data: aiHealth,
    isLoading: isAIHealthLoading,
    isRefetching: isAIRefetching,
    refetch: refetchAIHealth,
  } = useQuery<AIModelsHealthResponse>({
    queryKey: ["ai-models-health"],
    queryFn: async () => {
      return api.get<AIModelsHealthResponse>("/api/v1/ai/models/health");
    },
  });

  // 4. Fetch Google Account Status
  const {
    data: googleStatus,
    isLoading: isGoogleStatusLoading,
    refetch: refetchGoogleStatus,
  } = useQuery<GoogleAccountStatus>({
    queryKey: ["google-status"],
    queryFn: async () => {
      return googleApi.getStatus();
    },
    retry: false,
  });

  // Synchronize filter input defaults with backend status
  useEffect(() => {
    if (googleStatus && !filterInitialized) {
      setFilterQuery(googleStatus.sync_query || "has:attachment (filename:pdf OR filename:docx) newer_than:30d");
      setFilterLabel(googleStatus.sync_label || "INBOX");
      setDefaultOpeningId(googleStatus.default_opening_id || "");
      setFilterInitialized(true);
    }
  }, [googleStatus, filterInitialized]);

  // Handle OAuth callback search parameters (success or error notifications)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const urlParams = new URLSearchParams(window.location.search);
    const connectedParam = urlParams.get("google_connected");
    const errorParam = urlParams.get("google_error");

    if (connectedParam === "1") {
      toast({
        title: "Google Workspace Connected",
        description: "Your Google account was linked with encrypted offline refresh credentials.",
      });
      refetchGoogleStatus();
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    } else if (errorParam) {
      toast({
        title: "Google Connection Failed",
        description: decodeURIComponent(errorParam),
        variant: "destructive",
      });
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  }, [toast, refetchGoogleStatus]);

  // Mutations for Google actions
  const connectMutation = useMutation({
    mutationFn: async () => {
      const res = await googleApi.getLoginUrl();
      return res;
    },
    onSuccess: (data) => {
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      }
    },
    onError: (err: any) => {
      toast({
        title: "OAuth Initialization Failed",
        description: err.message || "Failed to initialize Google authorization flow.",
        variant: "destructive",
      });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      return googleApi.disconnect();
    },
    onSuccess: () => {
      toast({
        title: "Google Account Disconnected",
        description: "Integration disconnected and encrypted tokens cleared.",
      });
      setLastSyncResult(null);
      queryClient.invalidateQueries({ queryKey: ["google-status"] });
    },
    onError: (err: any) => {
      toast({
        title: "Disconnection Failed",
        description: err.message || "Could not disconnect Google account.",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      return googleApi.syncGmail({
        query: filterQuery || undefined,
        label: filterLabel || undefined,
      });
    },
    onSuccess: (data) => {
      setLastSyncResult(data);
      queryClient.invalidateQueries({ queryKey: ["google-status"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Gmail Sync Completed",
        description: `Found ${data.messages_found} messages. Processed ${data.messages_processed}, saved ${data.attachments_saved} resumes, created ${data.candidates_created} candidates.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Gmail Sync Failed",
        description: err.message || "An error occurred while fetching candidate resumes.",
        variant: "destructive",
      });
    },
  });

  const saveSettingsMutation = useMutation({
    mutationFn: async () => {
      return googleApi.updateSettings({
        sync_query: filterQuery,
        sync_label: filterLabel,
        default_opening_id: defaultOpeningId || null,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["google-status"] });
      toast({
        title: "Filter Settings Saved",
        description: "Gmail resume search query, label, and default opening updated.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to Save Settings",
        description: err.message || "Could not update filter settings.",
        variant: "destructive",
      });
    },
  });

  const handleLogout = async () => {
    try {
      removeAuthToken();
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      window.location.href = "/login";
    }
  };

  return (
    <AppShell title="Settings & Infrastructure">
      <div className="space-y-6 max-w-4xl pb-12">
        {/* 1. User Profile Card */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <UserIcon className="h-4 w-4 text-primary" />
              <span>User Profile</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Your authenticated identity and Supabase session credentials
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isUserLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-72" />
              </div>
            ) : user ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">Email Address</span>
                  <p className="font-semibold text-foreground truncate">{user.email}</p>
                </div>
                <div className="p-3 rounded-lg border bg-muted/20 space-y-1">
                  <span className="text-[11px] text-muted-foreground font-medium">User Identifier (UUID)</span>
                  <p className="font-mono text-[11px] text-foreground truncate">{user.id}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No active session.</p>
            )}
          </CardContent>
        </Card>

        {/* 2. Google Workspace & Gmail Sync Integration */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="flex flex-row items-start justify-between pb-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Mail className="h-4 w-4 text-primary" />
                <span>Google Workspace Integration</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                OAuth2 offline authorization for automated candidate resume ingestion and scheduling
              </CardDescription>
            </div>
            {isGoogleStatusLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <Badge
                className={`text-[11px] font-medium capitalize ${
                  googleStatus?.is_connected
                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                    : "bg-muted text-muted-foreground border-border"
                }`}
              >
                {googleStatus?.is_connected ? "Connected" : "Not Connected"}
              </Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-5 text-xs">
            {isGoogleStatusLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : googleStatus?.is_connected ? (
              <div className="space-y-4">
                {/* ── Reconnect Needed Banner ─────────────────────────────────── */}
                {googleStatus.reconnect_needed && (
                  <div className="p-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-semibold text-xs">
                        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                        <span>Google Workspace Reconnect Needed</span>
                      </div>
                      <p className="text-[11px] text-amber-800 dark:text-amber-300">
                        {googleStatus.reconnect_reason || "Missing required API permissions or token expired."}
                      </p>
                      {googleStatus.missing_scopes && googleStatus.missing_scopes.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 pt-1">
                          <span className="text-[10px] font-medium mr-1 text-amber-900 dark:text-amber-200">Missing permissions:</span>
                          {googleStatus.missing_scopes.map((s) => (
                            <Badge
                              key={s}
                              variant="outline"
                              className="text-[10px] bg-amber-500/20 border-amber-500/40 text-amber-900 dark:text-amber-200 font-mono py-0 px-1.5"
                            >
                              {s.replace("https://www.googleapis.com/auth/", "")}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button
                      size="sm"
                      onClick={() => connectMutation.mutate()}
                      disabled={connectMutation.isPending}
                      className="bg-amber-600 hover:bg-amber-700 text-white text-xs shrink-0 font-medium h-8 gap-1.5"
                    >
                      <RefreshCw className={`h-3.5 w-3.5 ${connectMutation.isPending ? "animate-spin" : ""}`} />
                      <span>{connectMutation.isPending ? "Connecting..." : "Reconnect Google"}</span>
                    </Button>
                  </div>
                )}

                {/* Connected Account Details */}
                <div className="p-3.5 rounded-lg border bg-muted/20 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="space-y-0.5">
                      <span className="text-[11px] text-muted-foreground font-medium">Linked Google Account</span>
                      <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        <span>{googleStatus.email}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => syncMutation.mutate()}
                        disabled={syncMutation.isPending}
                        className="h-8 text-xs gap-1.5 font-medium"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? "animate-spin" : ""}`} />
                        <span>{syncMutation.isPending ? "Syncing Resumes..." : "Sync Now"}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => disconnectMutation.mutate()}
                        disabled={disconnectMutation.isPending}
                        className="h-8 text-xs gap-1.5 text-destructive hover:bg-destructive/10"
                      >
                        <Unlink className="h-3.5 w-3.5" />
                        <span>Disconnect</span>
                      </Button>
                    </div>
                  </div>

                  {/* Scopes and Security Badges */}
                  <div className="pt-2 border-t border-border/60 space-y-1.5">
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <Shield className="h-3 w-3 text-primary" />
                      <span>Authorized Scopes (Tokens Fernet-Encrypted at Rest)</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {googleStatus.scopes.map((scope) => {
                        const cleanScope = scope.replace("https://www.googleapis.com/auth/", "");
                        return (
                          <Badge
                            key={scope}
                            variant="secondary"
                            className="text-[10px] font-mono px-2 py-0.5 font-normal"
                          >
                            {cleanScope}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Sync Status Stats */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
                  <div className="p-3 rounded-lg border bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground">Synced from Gmail</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-sm flex items-center gap-1.5">
                      <UserCheck className="h-4 w-4" />
                      <span>{googleStatus.synced_from_gmail_count ?? 0} Candidates</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground">Last Synced</span>
                    <p className="font-medium text-foreground text-xs truncate">
                      {googleStatus.last_synced_at
                        ? new Date(googleStatus.last_synced_at).toLocaleString()
                        : "Never Synced"}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground">Last Sync Status</span>
                    <div>
                      <Badge
                        variant="outline"
                        className={`text-[10px] capitalize font-medium ${
                          googleStatus.last_sync_status === "success"
                            ? "border-emerald-500/20 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                            : googleStatus.last_sync_status === "failed" || googleStatus.last_sync_status === "token_revoked"
                            ? "border-destructive/20 text-destructive bg-destructive/10"
                            : "text-muted-foreground"
                        }`}
                      >
                        {googleStatus.last_sync_status}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 rounded-lg border bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground">Total Ingested Resumes</span>
                    <p className="font-semibold text-foreground text-sm">
                      {googleStatus.total_emails_synced}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg border bg-card space-y-1">
                    <span className="text-[11px] text-muted-foreground">Automatic Sync</span>
                    <p className="font-semibold text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1.5 pt-0.5">
                      <Clock className="h-3.5 w-3.5" />
                      <span>Every 15 minutes</span>
                    </p>
                  </div>
                </div>

                {/* Last Sync Execution Feedback */}
                {lastSyncResult && (
                  <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 space-y-2">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                      <span className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-4 w-4" />
                        <span>Recent Sync Outcome: {lastSyncResult.status}</span>
                      </span>
                      <span className="font-mono text-[11px] text-muted-foreground">
                        {new Date(lastSyncResult.last_synced_at).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] pt-1">
                      <div className="p-2 rounded bg-background/50 border">
                        <span className="text-muted-foreground block">Found</span>
                        <span className="font-bold text-foreground">{lastSyncResult.messages_found}</span>
                      </div>
                      <div className="p-2 rounded bg-background/50 border">
                        <span className="text-muted-foreground block">Processed</span>
                        <span className="font-bold text-foreground">{lastSyncResult.messages_processed}</span>
                      </div>
                      <div className="p-2 rounded bg-background/50 border">
                        <span className="text-muted-foreground block">Resumes Saved</span>
                        <span className="font-bold text-foreground">{lastSyncResult.attachments_saved}</span>
                      </div>
                      <div className="p-2 rounded bg-background/50 border">
                        <span className="text-muted-foreground block">Candidates Created</span>
                        <span className="font-bold text-foreground">{lastSyncResult.candidates_created}</span>
                      </div>
                    </div>
                    {lastSyncResult.errors.length > 0 && (
                      <div className="pt-2 border-t border-destructive/20 text-destructive text-[11px] space-y-1">
                        <span className="font-medium">Warnings / Notices:</span>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {lastSyncResult.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {/* Per-Email Resume Ingestion Results */}
                {((lastSyncResult?.results && lastSyncResult.results.length > 0) ||
                  (googleStatus.recent_sync_results && googleStatus.recent_sync_results.length > 0)) && (
                  <div className="p-3.5 rounded-lg border bg-card space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5 font-medium text-foreground text-xs">
                        <FileText className="h-4 w-4 text-primary" />
                        <span>Recent Gmail Resume Ingestion Outcomes</span>
                      </div>
                      <Badge variant="outline" className="text-[10px]">
                        {(lastSyncResult?.results || googleStatus.recent_sync_results || []).length} Synced Emails
                      </Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-[11px] text-left border-collapse">
                        <thead>
                          <tr className="border-b text-muted-foreground">
                            <th className="pb-1.5 font-medium">Outcome</th>
                            <th className="pb-1.5 font-medium">Email Details</th>
                            <th className="pb-1.5 font-medium">Job Opening</th>
                            <th className="pb-1.5 font-medium">Result & Details</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40">
                          {(lastSyncResult?.results || googleStatus.recent_sync_results || []).map((item, idx) => {
                            const isCreated = item.status === "created";
                            const isDuplicate = item.status === "duplicate";
                            return (
                              <tr key={item.message_id || idx} className="hover:bg-muted/30">
                                <td className="py-2.5 pr-2 whitespace-nowrap align-top">
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] font-medium capitalize ${
                                      isCreated
                                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                        : isDuplicate
                                        ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
                                        : "bg-destructive/10 text-destructive border-destructive/20"
                                    }`}
                                  >
                                    {isCreated ? "Created" : isDuplicate ? "Duplicate / Updated" : "Failed"}
                                  </Badge>
                                </td>
                                <td className="py-2.5 pr-2 max-w-[220px] align-top">
                                  <p className="font-semibold text-foreground truncate">{item.subject || "No Subject"}</p>
                                  <p className="text-[10px] text-muted-foreground truncate">{item.sender || "Unknown Sender"}</p>
                                </td>
                                <td className="py-2.5 pr-2 text-foreground truncate max-w-[150px] align-top">
                                  {item.opening_title || "General Applications"}
                                </td>
                                <td className="py-2.5 text-muted-foreground align-top">
                                  <span>{item.reason}</span>
                                  {item.candidate_id && (
                                    <a
                                      href={`/pipeline?candidate_id=${item.candidate_id}`}
                                      className="ml-2 text-primary hover:underline font-medium inline-flex items-center gap-0.5"
                                    >
                                      View in Pipeline &rarr;
                                    </a>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Filter Settings Configuration */}
                <div className="p-3.5 rounded-lg border bg-card space-y-3">
                  <div className="flex items-center gap-1.5 font-medium text-foreground">
                    <Filter className="h-3.5 w-3.5 text-primary" />
                    <span>Recruiter Resume Ingestion Filters</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="sync_query" className="text-[11px] text-muted-foreground">
                        Gmail Search Query
                      </Label>
                      <Input
                        id="sync_query"
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        placeholder="has:attachment (filename:pdf OR filename:docx) newer_than:30d"
                        className="text-xs h-8 font-mono"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="sync_label" className="text-[11px] text-muted-foreground">
                        Gmail Label
                      </Label>
                      <Input
                        id="sync_label"
                        value={filterLabel}
                        onChange={(e) => setFilterLabel(e.target.value)}
                        placeholder="INBOX"
                        className="text-xs h-8 font-mono"
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label htmlFor="default_opening" className="text-[11px] text-muted-foreground">
                        Default Job Opening (for resumes without a matching subject title)
                      </Label>
                      <select
                        id="default_opening"
                        value={defaultOpeningId}
                        onChange={(e) => setDefaultOpeningId(e.target.value)}
                        className="w-full text-xs h-8 px-2.5 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                      >
                        <option value="">-- Automatically select latest active opening --</option>
                        {activeOpenings.map((op) => (
                          <option key={op.id} value={op.id}>
                            {op.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex justify-end pt-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => saveSettingsMutation.mutate()}
                      disabled={saveSettingsMutation.isPending}
                      className="h-7 text-xs gap-1.5"
                    >
                      <Save className="h-3 w-3" />
                      <span>{saveSettingsMutation.isPending ? "Saving..." : "Save Filter Rules"}</span>
                    </Button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border bg-muted/10 space-y-4">
                <div className="space-y-1.5">
                  <p className="font-medium text-foreground text-xs">
                    Connect your Google Workspace account for seamless recruiting automation:
                  </p>
                  <ul className="space-y-1.5 text-muted-foreground text-[11px]">
                    <li className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5 text-primary" />
                      <span>
                        <strong>Gmail Sync:</strong> Automatically fetch incoming CV attachments (PDF/DOCX) and import candidates into your pipeline.
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-primary" />
                      <span>
                        <strong>Google Calendar:</strong> Sync interview slots and inspect free/busy recruiter schedules.
                      </span>
                    </li>
                    <li className="flex items-center gap-2">
                      <FileSpreadsheet className="h-3.5 w-3.5 text-primary" />
                      <span>
                        <strong>Google Sheets:</strong> Export candidate rankings and interview shortlists.
                      </span>
                    </li>
                  </ul>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-border/60">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <KeyRound className="h-3.5 w-3.5 text-primary" />
                    <span>Tokens are symmetrically encrypted with Fernet (AES-128-CBC) before storage.</span>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => connectMutation.mutate()}
                    disabled={connectMutation.isPending}
                    className="h-8 text-xs gap-2 font-medium"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{connectMutation.isPending ? "Connecting..." : "Connect Google Workspace"}</span>
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 3. Theme Preferences */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
              <Sun className="h-4 w-4 text-amber-500" />
              <span>Appearance & Theme</span>
            </CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Customize the visual palette of your dashboard interface
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3 max-w-md">
              <Button
                variant={theme === "light" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("light")}
                className="text-xs h-9 gap-2"
              >
                <Sun className="h-3.5 w-3.5" />
                <span>Light</span>
              </Button>
              <Button
                variant={theme === "dark" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("dark")}
                className="text-xs h-9 gap-2"
              >
                <Moon className="h-3.5 w-3.5" />
                <span>Dark</span>
              </Button>
              <Button
                variant={theme === "system" ? "default" : "outline"}
                size="sm"
                onClick={() => setTheme("system")}
                className="text-xs h-9 gap-2"
              >
                <Monitor className="h-3.5 w-3.5" />
                <span>System</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 4. AI Models Health Monitor */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div className="space-y-0.5">
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Cpu className="h-4 w-4 text-primary" />
                <span>OpenRouter AI Models Health</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Live health, latency, and error diagnostics across configured model chains
              </CardDescription>
            </div>
            <Button
              id="btn-check-ai-models"
              variant="outline"
              size="sm"
              onClick={() => refetchAIHealth()}
              disabled={isAIRefetching}
              className="h-8 text-xs gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${isAIRefetching ? "animate-spin" : ""}`} />
              <span>Check AI models</span>
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {isAIHealthLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-10 w-full rounded-md" />
                ))}
              </div>
            ) : !aiHealth?.models ? (
              <p className="text-xs text-muted-foreground">Model status unavailable.</p>
            ) : (
              <div className="border rounded-lg overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b bg-muted/40 text-muted-foreground font-semibold">
                      <th className="py-2.5 px-3">Model</th>
                      <th className="py-2.5 px-3">Chain / Task</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Latency</th>
                      <th className="py-2.5 px-3">Error / Diagnostics</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {(Array.isArray(aiHealth.models)
                      ? aiHealth.models
                      : (Object.values(aiHealth.models) as ModelHealthItem[])
                    ).map((m: ModelHealthItem) => (
                      <tr key={m.model} className="hover:bg-muted/20">
                        <td className="py-2.5 px-3 font-mono font-medium text-foreground">
                          {m.model}
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge variant="outline" className="text-[10px] uppercase font-mono">
                            {m.task || m.role || "Task"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3">
                          <Badge
                            className={`text-[10px] capitalize font-medium ${
                              m.status === "ok"
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-destructive/10 text-destructive border-destructive/20"
                            }`}
                          >
                            {m.status === "ok" ? "OK" : "FAIL"}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-3 font-mono text-muted-foreground">
                          {m.latency_ms ? `${m.latency_ms.toFixed(0)} ms` : "—"}
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground text-[11px]">
                          {m.status === "ok" ? (
                            <span className="text-emerald-600 dark:text-emerald-400 font-medium">Ready</span>
                          ) : (
                            <div className="space-y-0.5">
                              {m.error_type && (
                                <Badge variant="destructive" className="text-[9px] uppercase font-mono mr-1">
                                  {m.error_type}
                                </Badge>
                              )}
                              <span>{m.error || "Request failed"}</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 5. Infrastructure Health */}
        <Card className="border border-border shadow-xs">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                <span>Backend & Database Infrastructure</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                FastAPI service layer and Supabase PostgreSQL connection
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchBackendHealth();
                refetchDbHealth();
              }}
              disabled={isDbHealthFetching || isHealthLoading}
              className="text-xs h-7 px-2.5 gap-1.5"
            >
              <RefreshCw className={`h-3 w-3 ${isDbHealthFetching ? "animate-spin" : ""}`} />
              Test Now
            </Button>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">FastAPI Backend Status</span>
              <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[10px]">
                {backendHealth?.status || "Online"}
              </Badge>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-border/60">
              <span className="text-muted-foreground">Supabase PostgreSQL Connection</span>
              <div className="flex items-center gap-2">
                {dbHealth?.latency_ms !== undefined && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      dbHealth.latency_ms < 150
                        ? "text-emerald-600 border-emerald-500/30 bg-emerald-500/10"
                        : dbHealth.latency_ms < 400
                        ? "text-amber-600 border-amber-500/30 bg-amber-500/10"
                        : "text-rose-600 border-rose-500/30 bg-rose-500/10"
                    }`}
                  >
                    {dbHealth.latency_ms} ms
                  </Badge>
                )}
                <Badge
                  className={`text-[10px] ${
                    dbHealth?.status === "connected"
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                      : "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20"
                  }`}
                >
                  {dbHealth?.status === "connected" ? "Connected (Pooler)" : "Unreachable"}
                </Badge>
              </div>
            </div>
            {dbHealth?.host && (
              <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                <span className="text-muted-foreground">Connection Endpoint</span>
                <span className="font-mono text-muted-foreground text-[11px]">
                  {dbHealth.host}:{dbHealth.port} ({dbHealth.mode} pooler)
                </span>
              </div>
            )}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">API Version</span>
              <span className="font-mono text-muted-foreground text-[11px]">
                {backendHealth?.version || "0.1.0"}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* 6. Session Actions */}
        <div className="pt-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={handleLogout}
            className="text-xs h-9 gap-2"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out of Account</span>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
