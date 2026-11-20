"use client";

import React, { useState, useEffect, useMemo, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Briefcase,
  Users,
  Plus,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Search,
  Filter,
  Check,
  X,
  UserCheck,
  Calendar,
  Clock,
  Send,
  Zap,
  Play,
  Pause,
  Mail,
  ArrowRight,
  ShieldAlert,
  FileText,
  ThumbsUp,
  ThumbsDown,
  ChevronRight,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

import {
  dashboardApi,
  candidatesApi,
  jobOpeningsApi,
  cvReviewApi,
  schedulingApi,
  agentApi,
  googleApi,
  onboardingApi,
  Candidate,
  JobOpening,
  CVReviewQueueItem,
  InterviewRead,
  OnboardingStatusResponse,
  AgentSettingsRead,
} from "@/lib/api";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { SetupChecklist } from "@/components/dashboard/setup-checklist";
import { SetupWizardDialog } from "@/components/setup/setup-wizard-dialog";
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog";
import { CreateOpeningDialog } from "@/components/openings/create-opening-dialog";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { OfferLetterModal } from "@/components/scheduling/offer-letter-modal";
import { ScoreRing } from "@/components/ui/score-ring";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";

function ActionCenterContent() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const searchParams = useSearchParams();

  // Active Queue tab: 'cv_review' | 'interview_results' | 'offer_approvals' | 'agent'
  const initialQueue = searchParams?.get("queue") || "cv_review";
  const [activeQueue, setActiveQueue] = useState<string>(initialQueue);

  // Dialog states
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [createOpeningOpen, setCreateOpeningOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Offer Modal State
  const [offerCandidateId, setOfferCandidateId] = useState<string | null>(null);
  const [offerCandidateName, setOfferCandidateName] = useState<string | undefined>(undefined);
  const [offerRoleTitle, setOfferRoleTitle] = useState<string | undefined>(undefined);

  // CV Review Queue filters
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedReviewIds, setSelectedReviewIds] = useState<string[]>([]);
  const [decisionPendingId, setDecisionPendingId] = useState<string | null>(null);

  // 5-second graceful loading timeout to guarantee no stuck skeletons
  const [timeoutExpired, setTimeoutExpired] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setTimeoutExpired(true), 5000);
    return () => clearTimeout(timer);
  }, []);

  // ── 1. Fetch 4 Real Numbers & Dashboard Stats ──────────────────────────────
  const {
    data: stats,
    isLoading: isStatsLoading,
    isError: isStatsError,
    refetch: refetchStats,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.getStats(),
    retry: 1,
  });

  // ── 2. Fetch Job Openings ──────────────────────────────────────────────────
  const { data: openingsData } = useQuery({
    queryKey: ["jobOpenings"],
    queryFn: () => jobOpeningsApi.list("active", 100),
    retry: 1,
  });
  const openings: JobOpening[] = openingsData?.items || [];

  // ── 3. Fetch CV Review Queue ("Needs HR Review") ───────────────────────────
  const {
    data: cvQueue = [],
    isLoading: isCvQueueLoading,
    isError: isCvQueueError,
    refetch: refetchCvQueue,
  } = useQuery<CVReviewQueueItem[]>({
    queryKey: ["cvReviewQueue", selectedOpeningId, searchQuery],
    queryFn: () =>
      cvReviewApi.getQueue({
        opening_id: selectedOpeningId !== "all" ? selectedOpeningId : undefined,
        status: "pending",
        search: searchQuery.trim() || undefined,
      }),
    retry: 1,
  });

  // ── 4. Fetch Interviews Needing Outcome Evaluation ─────────────────────────
  const {
    data: allInterviews = [],
    isLoading: isInterviewsLoading,
    refetch: refetchInterviews,
  } = useQuery<InterviewRead[]>({
    queryKey: ["interviews-all"],
    queryFn: () => schedulingApi.listInterviews(),
    retry: 1,
  });

  // Filter for interviews requiring HR outcome: scheduled / no result recorded
  const pendingInterviews = useMemo(() => {
    return allInterviews.filter(
      (inv) =>
        inv.status !== "cancelled" &&
        (!inv.result_status || inv.result_status === "pending")
    );
  }, [allInterviews]);

  // ── 5. Fetch Candidates in Offer Stage ─────────────────────────────────────
  const {
    data: candidatesData,
    isLoading: isCandidatesLoading,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: ["candidates-offer-stage"],
    queryFn: () => candidatesApi.list({ stage: "offer", limit: 50 }),
    retry: 1,
  });
  const offerCandidates = candidatesData?.items || [];

  // ── 6. Fetch Agent Settings & Controls ─────────────────────────────────────
  const {
    data: agentSettings,
    refetch: refetchAgentSettings,
  } = useQuery<AgentSettingsRead>({
    queryKey: ["agent-settings"],
    queryFn: () => agentApi.getSettings(),
    retry: 1,
  });

  // ── 7. Fetch Onboarding / Setup Wizard Status ──────────────────────────────
  const {
    data: onboarding,
    refetch: refetchOnboarding,
  } = useQuery<OnboardingStatusResponse>({
    queryKey: ["onboarding-status"],
    queryFn: () => onboardingApi.getStatus(),
    retry: 1,
  });

  // ── 4 Real Numbers Calculations ───────────────────────────────────────────
  const realNumbers = useMemo(() => {
    const pendingCvCount = cvQueue.length;
    const pendingInterviewCount = pendingInterviews.length;
    const pendingOfferCount = offerCandidates.length;
    const activeRequisitionsCount = openings.length || stats?.active_openings || 0;

    return {
      pendingCvReviews: pendingCvCount,
      interviewsToEvaluate: pendingInterviewCount,
      offersAwaitingApproval: pendingOfferCount,
      activeRequisitions: activeRequisitionsCount,
      totalPendingActions: pendingCvCount + pendingInterviewCount + pendingOfferCount,
    };
  }, [cvQueue, pendingInterviews, offerCandidates, openings, stats]);

  // ── Actions & Mutations ───────────────────────────────────────────────────

  // CV Review Decision (Approve or Reject)
  const cvDecisionMutation = useMutation({
    mutationFn: ({ candidateId, action }: { candidateId: string; action: "approve" | "reject" }) =>
      cvReviewApi.decide({ candidate_ids: [candidateId], action }),
    onMutate: ({ candidateId }) => {
      setDecisionPendingId(candidateId);
    },
    onSuccess: (res, vars) => {
      setDecisionPendingId(null);
      toast({
        title: vars.action === "approve" ? "Candidate Approved!" : "Candidate Rejected",
        description: `Successfully processed ${vars.action}. ${res.approved_count} approved, ${res.rejected_count} rejected.`,
      });
      refetchCvQueue();
      refetchStats();
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (err: any) => {
      setDecisionPendingId(null);
      toast({
        title: "Decision Failed",
        description: err?.message || "Could not record decision. Please retry.",
        variant: "destructive",
      });
    },
  });

  // Bulk CV Decision
  const bulkCvDecisionMutation = useMutation({
    mutationFn: ({ action }: { action: "approve" | "reject" }) =>
      cvReviewApi.decide({ candidate_ids: selectedReviewIds, action }),
    onSuccess: (res, vars) => {
      toast({
        title: `Bulk ${vars.action === "approve" ? "Approval" : "Rejection"} Completed`,
        description: `Successfully processed ${res.approved_count + res.rejected_count} candidate(s).`,
      });
      setSelectedReviewIds([]);
      refetchCvQueue();
      refetchStats();
    },
    onError: (err: any) => {
      toast({
        title: "Bulk Action Failed",
        description: err?.message || "Failed to process bulk review.",
        variant: "destructive",
      });
    },
  });

  // Record Interview Outcome (Passed / Failed / No-show)
  const recordInterviewOutcomeMutation = useMutation({
    mutationFn: ({
      interviewId,
      result,
    }: {
      interviewId: string;
      result: "passed" | "failed" | "no_show";
    }) => schedulingApi.recordResult(interviewId, { result }),
    onSuccess: (res, vars) => {
      toast({
        title:
          vars.result === "passed"
            ? "Interview Marked as Passed"
            : vars.result === "failed"
            ? "Interview Marked as Failed"
            : "Interview Marked as No-Show",
        description: res.next_action || "Interview status updated successfully.",
      });
      refetchInterviews();
      refetchStats();
      refetchCandidates();
    },
    onError: (err: any) => {
      toast({
        title: "Evaluation Failed",
        description: err?.message || "Failed to record interview result.",
        variant: "destructive",
      });
    },
  });

  // Agent Pause Toggle
  const togglePauseMutation = useMutation({
    mutationFn: () => agentApi.togglePause(),
    onSuccess: (res) => {
      refetchAgentSettings();
      toast({
        title: res.is_paused ? "Recruiter Agent Paused" : "Recruiter Agent Active",
        description: res.is_paused ? "Autonomous screening paused" : "Autonomous screening active",
      });
    },
  });

  // Send Daily Summary
  const sendDailySummaryMutation = useMutation({
    mutationFn: () => agentApi.sendDailySummary(),
    onSuccess: () => {
      toast({
        title: "Daily Summary Dispatched",
        description: "Sent hiring summary email to your HR address.",
      });
    },
  });

  // Gmail Sync
  const syncGmailMutation = useMutation({
    mutationFn: () => googleApi.syncGmail(),
    onSuccess: (res) => {
      refetchCvQueue();
      refetchStats();
      toast({
        title: "Gmail Sync Completed",
        description: `Found ${res.messages_found} messages. Created ${res.candidates_created} new candidate(s).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Sync Failed",
        description: err?.message || "Google Workspace credentials not configured.",
        variant: "destructive",
      });
    },
  });

  // Global Refresh
  const handleRefreshAll = () => {
    refetchStats();
    refetchCvQueue();
    refetchInterviews();
    refetchCandidates();
    refetchAgentSettings();
  };

  const isInitialLoading = (isStatsLoading || isCvQueueLoading) && !timeoutExpired;

  return (
    <AppShell title="Action Center">
      <div className="space-y-6 pb-16 max-w-7xl mx-auto">
        {/* ── 1. Top Command Header ────────────────────────────────────────── */}
        <PageHeader
          title="Action Center"
          description="High-velocity recruiter command center. Act on pending candidate reviews, record interview results, and approve job offers."
          badge={
            <div className="flex items-center gap-2">
              <Badge
                variant="outline"
                className={`gap-1.5 font-mono text-[11px] font-semibold px-2.5 py-1 ${
                  agentSettings?.is_paused
                    ? "border-amber-500/40 text-amber-600 bg-amber-500/10"
                    : "border-emerald-500/40 text-emerald-600 bg-emerald-500/10"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    agentSettings?.is_paused ? "bg-amber-500" : "bg-emerald-500 animate-pulse"
                  }`}
                />
                <span>Agent: {agentSettings?.is_paused ? "Paused" : "Active"}</span>
              </Badge>
              {realNumbers.totalPendingActions > 0 && (
                <Badge className="bg-primary text-primary-foreground font-mono text-[11px] font-bold">
                  {realNumbers.totalPendingActions} Actions Required
                </Badge>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {/* Pause / Resume Agent Button */}
              <Button
                variant={agentSettings?.is_paused ? "default" : "outline"}
                size="sm"
                onClick={() => togglePauseMutation.mutate()}
                disabled={togglePauseMutation.isPending}
                className="gap-1.5 text-xs h-8 font-semibold"
                title={agentSettings?.is_paused ? "Resume autonomous operations" : "Pause autonomous actions"}
              >
                {agentSettings?.is_paused ? (
                  <>
                    <Play className="w-3.5 h-3.5 text-emerald-500 fill-current" />
                    <span>Resume Agent</span>
                  </>
                ) : (
                  <>
                    <Pause className="w-3.5 h-3.5 text-amber-500 fill-current" />
                    <span>Pause Agent</span>
                  </>
                )}
              </Button>

              {/* Gmail Sync Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncGmailMutation.mutate()}
                disabled={syncGmailMutation.isPending}
                className="gap-1.5 text-xs h-8 font-semibold"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-primary ${
                    syncGmailMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                <span>{syncGmailMutation.isPending ? "Syncing..." : "Sync Gmail"}</span>
              </Button>

              {/* New Opening */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpeningOpen(true)}
                className="gap-1.5 text-xs h-8 font-semibold"
              >
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">New Opening</span>
              </Button>

              {/* Add Candidate */}
              <Button
                size="sm"
                onClick={() => setAddCandidateOpen(true)}
                className="gap-1.5 text-xs h-8 font-medium shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Candidate</span>
              </Button>
            </div>
          }
        />

        {/* ── 2. Onboarding Setup Checklist (if incomplete) ───────────────── */}
        {onboarding && !onboarding.is_completed && (
          <SetupChecklist
            onboarding={onboarding}
            onResumeSetup={(step?: number) => {
              setWizardStep(step || 1);
              setWizardOpen(true);
            }}
            onStartAgent={() => {}}
            isStartingAgent={false}
          />
        )}

        {/* ── 3. Four Real Numbers (KPI Cards) ────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Pending CV Reviews */}
          <Card
            onClick={() => setActiveQueue("cv_review")}
            className={`border cursor-pointer transition-all hover:shadow-card-hover ${
              activeQueue === "cv_review"
                ? "border-primary/60 ring-2 ring-primary/20 bg-primary/[0.02]"
                : "border-border/80"
            }`}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Pending CV Reviews
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <Sparkles className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isInitialLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-foreground">
                  {realNumbers.pendingCvReviews}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Awaiting HR approval/rejection
              </p>
            </CardContent>
          </Card>

          {/* Card 2: Interview Results Needed */}
          <Card
            onClick={() => setActiveQueue("interview_results")}
            className={`border cursor-pointer transition-all hover:shadow-card-hover ${
              activeQueue === "interview_results"
                ? "border-primary/60 ring-2 ring-primary/20 bg-primary/[0.02]"
                : "border-border/80"
            }`}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Interview Results
              </span>
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <Calendar className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isInitialLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-foreground">
                  {realNumbers.interviewsToEvaluate}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Record Passed / Failed / No-show
              </p>
            </CardContent>
          </Card>

          {/* Card 3: Offers Awaiting Approval */}
          <Card
            onClick={() => setActiveQueue("offer_approvals")}
            className={`border cursor-pointer transition-all hover:shadow-card-hover ${
              activeQueue === "offer_approvals"
                ? "border-primary/60 ring-2 ring-primary/20 bg-primary/[0.02]"
                : "border-border/80"
            }`}
          >
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Offer Approvals
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isInitialLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-foreground">
                  {realNumbers.offersAwaitingApproval}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Ready for final review & dispatch
              </p>
            </CardContent>
          </Card>

          {/* Card 4: Active Requisitions */}
          <Card className="border border-border/80">
            <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Active Requisitions
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <Briefcase className="w-4 h-4" />
              </div>
            </CardHeader>
            <CardContent>
              {isInitialLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold font-mono text-foreground">
                  {realNumbers.activeRequisitions}
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-1">
                Open roles receiving applicants
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── 4. Recruiter Operational Control Bar ─────────────────────────── */}
        <div className="rounded-xl border border-border/70 bg-card p-3 flex flex-wrap items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-semibold text-foreground flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Today&apos;s Quota:</span>
            </span>
            <Badge variant="outline" className="font-mono">
              {agentSettings?.sends_today || 0} / {agentSettings?.daily_send_limit || 50} emails sent
            </Badge>
            <span className="text-muted-foreground">|</span>
            <span className="text-muted-foreground">
              Notifications:{" "}
              <strong className="text-foreground">
                {agentSettings?.notify_on_booking ? "Instant Alerts Enabled" : "Silent"}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => sendDailySummaryMutation.mutate()}
              disabled={sendDailySummaryMutation.isPending}
              className="h-7 text-xs font-semibold gap-1 text-muted-foreground hover:text-foreground"
            >
              <Mail className="w-3 h-3 text-primary" />
              <span>Send Daily Summary Now</span>
            </Button>
            <Link href="/settings?tab=agent">
              <Button variant="ghost" size="sm" className="h-7 text-xs font-medium">
                Configure Agent →
              </Button>
            </Link>
          </div>
        </div>

        {/* ── 5. What HR Must Act On — Three Core Queues ───────────────────── */}
        <Tabs value={activeQueue} onValueChange={setActiveQueue} className="space-y-6">
          <TabsList className="bg-muted/40 p-1 border border-border/70 rounded-xl flex gap-1 w-full justify-start overflow-x-auto">
            <TabsTrigger
              value="cv_review"
              className="gap-2 text-xs font-semibold px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>1. CV Review Queue ({cvQueue.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="interview_results"
              className="gap-2 text-xs font-semibold px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <Calendar className="w-3.5 h-3.5 text-blue-500" />
              <span>2. Interview Results Needed ({pendingInterviews.length})</span>
            </TabsTrigger>
            <TabsTrigger
              value="offer_approvals"
              className="gap-2 text-xs font-semibold px-4 py-2 rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>3. Offer Approvals ({offerCandidates.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* ══════════════════════════════════════════════════════════════════
              QUEUE 1: CV REVIEW QUEUE ("Needs HR Review")
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="cv_review" className="space-y-4">
            {/* Filter & Bulk Action Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-card rounded-xl border border-border/70 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-[260px]">
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Filter by name or skill..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-background border border-border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>

                <select
                  value={selectedOpeningId}
                  onChange={(e) => setSelectedOpeningId(e.target.value)}
                  className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="all">All Requisitions ({openings.length})</option>
                  {openings.map((op) => (
                    <option key={op.id} value={op.id}>
                      {op.title} (Pass Mark: {op.pass_mark || 80}%)
                    </option>
                  ))}
                </select>
              </div>

              {selectedReviewIds.length > 0 && (
                <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-lg">
                  <span className="text-xs font-semibold text-primary">
                    {selectedReviewIds.length} Selected
                  </span>
                  <Button
                    size="sm"
                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1"
                    onClick={() => bulkCvDecisionMutation.mutate({ action: "approve" })}
                    disabled={bulkCvDecisionMutation.isPending}
                  >
                    <Check className="w-3 h-3" />
                    <span>Approve Selected</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs text-rose-500 hover:bg-rose-500/10 gap-1"
                    onClick={() => bulkCvDecisionMutation.mutate({ action: "reject" })}
                    disabled={bulkCvDecisionMutation.isPending}
                  >
                    <X className="w-3 h-3" />
                    <span>Reject Selected</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Candidate Queue Cards */}
            {isInitialLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-32 rounded-xl" />
                ))}
              </div>
            ) : cvQueue.length === 0 ? (
              <EmptyState
                icon={UserCheck}
                title="All caught up!"
                description="No candidate CVs currently require HR review. Inbound applications from Gmail or direct uploads will automatically score and appear here."
                actionText="Add Candidate"
                onAction={() => setAddCandidateOpen(true)}
              />
            ) : (
              <div className="space-y-3">
                {cvQueue.map((item) => {
                  const isPendingThis = decisionPendingId === item.id;
                  const isChecked = selectedReviewIds.includes(item.id);

                  return (
                    <Card
                      key={item.id}
                      className="border border-border/80 shadow-xs hover:border-border transition-all"
                    >
                      <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        {/* Left: Checkbox + Candidate Details */}
                        <div className="flex items-start gap-3 flex-1 min-w-[280px]">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedReviewIds((prev) => [...prev, item.id]);
                              } else {
                                setSelectedReviewIds((prev) => prev.filter((id) => id !== item.id));
                              }
                            }}
                            className="mt-1 rounded border-border"
                          />

                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm text-foreground">
                                {item.name}
                              </span>
                              <Badge variant="outline" className="text-[10px] font-mono">
                                {item.opening_title || "General Application"}
                              </Badge>
                              <Badge
                                variant="outline"
                                className={`text-[10px] font-semibold ${
                                  item.recommendation === "Recommended"
                                    ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                                    : item.recommendation === "Borderline"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                    : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                                }`}
                              >
                                {item.recommendation}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground font-mono">{item.email}</p>

                            {/* Skills badges */}
                            <div className="flex items-center gap-1.5 flex-wrap pt-1">
                              {(item.matched_skills || []).slice(0, 4).map((skill, idx) => (
                                <Badge
                                  key={idx}
                                  variant="secondary"
                                  className="text-[9.5px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                                >
                                  ✓ {skill}
                                </Badge>
                              ))}
                              {(item.missing_skills || []).slice(0, 2).map((skill, idx) => (
                                <Badge
                                  key={idx}
                                  variant="outline"
                                  className="text-[9.5px] text-muted-foreground"
                                >
                                  ✗ {skill}
                                </Badge>
                              ))}
                            </div>

                            {item.summary && (
                              <p className="text-[11px] text-muted-foreground/90 italic pt-1 line-clamp-2">
                                &ldquo;{item.summary}&rdquo;
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Middle: Score Ring */}
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="text-center">
                            <ScoreRing score={item.score} size="md" />
                            <span className="text-[9.5px] text-muted-foreground font-mono block mt-0.5">
                              Pass: {item.opening_pass_mark || 80}%
                            </span>
                          </div>
                        </div>

                        {/* Right: Actions */}
                        <div className="flex items-center gap-2 shrink-0 w-full md:w-auto justify-end">
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() =>
                              cvDecisionMutation.mutate({ candidateId: item.id, action: "approve" })
                            }
                            disabled={isPendingThis || cvDecisionMutation.isPending}
                            className="h-8 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                            title="Approve: Sends CV Passed + Job Details + Self-scheduling link"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              cvDecisionMutation.mutate({ candidateId: item.id, action: "reject" })
                            }
                            disabled={isPendingThis || cvDecisionMutation.isPending}
                            className="h-8 px-3 text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 border-border gap-1.5"
                            title="Reject: Sends Rejection template email"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              QUEUE 2: INTERVIEW RESULTS QUEUE ("Interview Outcomes Needed")
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="interview_results" className="space-y-4">
            {isInitialLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : pendingInterviews.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No interview outcomes waiting"
                description="When candidates book interview slots and complete rounds, they appear here so you can mark Passed, Failed, or No-show with one click."
                actionText="View Interviews Calendar"
                onAction={() => (window.location.href = "/interviews")}
              />
            ) : (
              <div className="space-y-3">
                {pendingInterviews.map((inv) => {
                  const start = new Date(inv.start_time);
                  const end = new Date(inv.end_time);
                  const round = (inv.round_type || "initial").toLowerCase();
                  const roundLabel =
                    round === "behavioral"
                      ? "Behavioral (45m)"
                      : round === "final"
                      ? "Final (60m)"
                      : "Initial (30m)";

                  return (
                    <Card
                      key={inv.id}
                      className="border border-border/80 shadow-xs hover:border-border transition-all"
                    >
                      <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                        {/* Details */}
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-sm text-foreground">
                              {inv.candidate_name}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {roundLabel}
                            </Badge>
                            <Badge variant="secondary" className="text-[10px] font-mono">
                              {inv.opening_title || "General Requisition"}
                            </Badge>
                          </div>

                          <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap pt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-primary" />
                              <span>{start.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-primary" />
                              <span>
                                {start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} –{" "}
                                {end.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                              </span>
                            </span>
                            {inv.meet_link && (
                              <a
                                href={inv.meet_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline flex items-center gap-1 font-semibold"
                              >
                                <span>Google Meet</span>
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>

                        {/* One-Click Evaluation Buttons */}
                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              recordInterviewOutcomeMutation.mutate({
                                interviewId: inv.id,
                                result: "passed",
                              })
                            }
                            disabled={recordInterviewOutcomeMutation.isPending}
                            className="h-8 px-3 text-xs font-semibold bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 gap-1.5"
                            title="Passed: Triggers next round invite link or generates offer draft"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Passed</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              recordInterviewOutcomeMutation.mutate({
                                interviewId: inv.id,
                                result: "failed",
                              })
                            }
                            disabled={recordInterviewOutcomeMutation.isPending}
                            className="h-8 px-3 text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border-rose-500/30 gap-1.5"
                            title="Failed: Dispatches rejection template email"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Failed</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              recordInterviewOutcomeMutation.mutate({
                                interviewId: inv.id,
                                result: "no_show",
                              })
                            }
                            disabled={recordInterviewOutcomeMutation.isPending}
                            className="h-8 px-3 text-xs font-semibold text-muted-foreground hover:text-foreground gap-1.5"
                            title="No-show: Leaves stage open for candidate to reschedule"
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>No-show</span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          {/* ══════════════════════════════════════════════════════════════════
              QUEUE 3: OFFER APPROVALS QUEUE ("Offer Letters Ready for Review")
          ══════════════════════════════════════════════════════════════════ */}
          <TabsContent value="offer_approvals" className="space-y-4">
            {isInitialLoading ? (
              <div className="space-y-3">
                {[1, 2].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : offerCandidates.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="No offer letters pending approval"
                description="When candidates pass their final interview round, an offer letter draft is prepared for your human review before sending."
              />
            ) : (
              <div className="space-y-3">
                {offerCandidates.map((cand) => (
                  <Card
                    key={cand.id}
                    className="border border-border/80 shadow-xs hover:border-border transition-all"
                  >
                    <CardContent className="p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">{cand.name}</span>
                          <Badge className="bg-emerald-600 text-white text-[10px] font-semibold">
                            Offer Draft Ready
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{cand.email}</p>
                        <p className="text-[11px] text-muted-foreground">
                          Passed all interview rounds. Offer letter draft ready for human review.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          onClick={() => {
                            setOfferCandidateId(cand.id);
                            setOfferCandidateName(cand.name);
                            setOfferRoleTitle("Selected Role");
                          }}
                          className="h-8 px-3 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 shadow-xs"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Review & Send Offer</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Modals & Drawers ────────────────────────────────────────────── */}
        <AddCandidateDialog
          open={addCandidateOpen}
          onClose={() => setAddCandidateOpen(false)}
          openings={openings}
          onSuccess={() => {
            refetchCvQueue();
            refetchStats();
          }}
        />

        <CreateOpeningDialog
          open={createOpeningOpen}
          onClose={() => setCreateOpeningOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ["jobOpenings"] });
            refetchStats();
          }}
        />

        <OfferLetterModal
          isOpen={!!offerCandidateId}
          candidateId={offerCandidateId}
          candidateName={offerCandidateName}
          roleTitle={offerRoleTitle}
          onClose={() => {
            setOfferCandidateId(null);
            setOfferCandidateName(undefined);
            setOfferRoleTitle(undefined);
            refetchCandidates();
            refetchStats();
          }}
        />

        {onboarding && (
          <SetupWizardDialog
            open={wizardOpen}
            onClose={() => setWizardOpen(false)}
            initialStep={wizardStep}
            onboardingData={onboarding}
            onSuccess={() => {
              refetchOnboarding();
              refetchStats();
            }}
          />
        )}
      </div>
    </AppShell>
  );
}

export default function ActionCenterPage() {
  return (
    <Suspense
      fallback={
        <AppShell title="Action Center">
          <div className="max-w-7xl mx-auto space-y-4 p-6">
            <Skeleton className="h-10 w-48 rounded-xl" />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </AppShell>
      }
    >
      <ActionCenterContent />
    </Suspense>
  );
}
