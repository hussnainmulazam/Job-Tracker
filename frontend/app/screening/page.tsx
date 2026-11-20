"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Briefcase,
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  Search,
  Filter,
  Check,
  X,
  XCircle,
  UserCheck,
  Play,
  ArrowUpDown,
  AlertCircle,
  Loader2,
  HelpCircle,
  CheckSquare,
  Square,
  MinusSquare,
  Sliders,
  Send,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Info,
  Calendar,
  Save,
} from "lucide-react";
import {
  candidatesApi,
  jobOpeningsApi,
  cvReviewApi,
  Candidate,
  JobOpening,
  CandidateStage,
  CVReviewQueueItem,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScoreRing } from "@/components/ui/score-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";

/**
 * Maps raw backend / provider exceptions to friendly, human-intelligible explanations.
 * Never leaks raw provider tokens, HTTP codes, or stack traces to recruiters.
 */
function sanitizeErrorMessage(rawError: any): string {
  if (!rawError) {
    return "AI evaluation could not be completed at this time. Please try again.";
  }
  const msg =
    typeof rawError === "string"
      ? rawError
      : rawError.message || rawError.detail || "";
  const lower = msg.toLowerCase();

  if (lower.includes("rate limit") || lower.includes("429")) {
    return "AI evaluation service is temporarily handling high traffic. Please wait a moment and click Re-run.";
  }
  if (lower.includes("timeout") || lower.includes("timed out") || lower.includes("deadline")) {
    return "Evaluation request took longer than expected for this CV. Please click Re-run.";
  }
  if (lower.includes("cv_text") || lower.includes("empty cv") || lower.includes("no extracted")) {
    return "Unable to parse text from candidate resume. Please verify the uploaded CV.";
  }
  if (lower.includes("opening") && lower.includes("not found")) {
    return "Target job opening is no longer available.";
  }
  if (lower.includes("json") || lower.includes("decode") || lower.includes("parse")) {
    return "AI assessment response was incomplete. Please click Re-run to re-evaluate.";
  }
  if (lower.includes("unauthorized") || lower.includes("401") || lower.includes("403")) {
    return "Session expired. Please refresh the page.";
  }
  if (
    lower.includes("openrouter") ||
    lower.includes("provider") ||
    lower.includes("api key") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return "AI screening service is momentarily unavailable. Please retry in a few moments.";
  }
  if (msg.includes("Traceback") || msg.includes("Exception") || msg.length > 100) {
    return "Screening could not be completed for this candidate. Click Re-run to try again.";
  }

  return msg || "Unable to complete screening. Please retry.";
}

export default function ScreeningPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── 1. Selection & Filter State ─────────────────────────────────────────────
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("all");
  const [reviewTab, setReviewTab] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"score_desc" | "score_asc" | "name" | "recent">("score_desc");

  // Pass mark editor state per opening
  const [passMarkInput, setPassMarkInput] = useState<number>(80);
  const [isUpdatingPassMark, setIsUpdatingPassMark] = useState(false);

  // ── 2. Modal / Drawer State ─────────────────────────────────────────────────
  const [drawerCandidate, setDrawerCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Decision Confirmation Modal State
  const [decisionModal, setDecisionModal] = useState<{
    open: boolean;
    action: "approve" | "reject";
    candidateIds: string[];
    candidateNames: string[];
  } | null>(null);
  const [isExecutingDecision, setIsExecutingDecision] = useState(false);

  // ── 3. Batch Screening Progress & Error State ──────────────────────────────
  const [isRunningBatch, setIsRunningBatch] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    total: number;
    current: number;
    candidateName: string;
    completed: number;
    failed: number;
  } | null>(null);
  const [candidateErrors, setCandidateErrors] = useState<Record<string, string>>({});
  const [singleRunningId, setSingleRunningId] = useState<string | null>(null);
  const cancelBatchRef = useRef(false);

  // ── 4. Queries ─────────────────────────────────────────────────────────────
  // Fetch Job Openings
  const { data: openingsData, isLoading: openingsLoading } = useQuery({
    queryKey: ["jobOpenings"],
    queryFn: () => jobOpeningsApi.list("active", 100),
  });
  const openings: JobOpening[] = openingsData?.items || [];

  // Currently selected opening object
  const activeOpening = useMemo(() => {
    if (selectedOpeningId === "all") return null;
    return openings.find((op) => op.id === selectedOpeningId) || null;
  }, [openings, selectedOpeningId]);

  // Sync passMarkInput when opening changes
  useEffect(() => {
    if (activeOpening) {
      setPassMarkInput(activeOpening.pass_mark ?? 80);
    } else {
      setPassMarkInput(80);
    }
  }, [activeOpening]);

  // Fetch CV Review Queue (pending, approved, rejected, or all)
  const {
    data: queueItems = [],
    isLoading: queueLoading,
    isError: queueError,
    error: loadError,
    refetch: refetchQueue,
  } = useQuery<CVReviewQueueItem[]>({
    queryKey: ["cvReviewQueue", selectedOpeningId, reviewTab, searchQuery],
    queryFn: () =>
      cvReviewApi.getQueue({
        opening_id: selectedOpeningId !== "all" ? selectedOpeningId : undefined,
        status: reviewTab,
        search: searchQuery.trim() || undefined,
      }),
  });

  // Query counts for queue tabs (fetch all to get accurate tab badges)
  const { data: allReviewCandidates = [] } = useQuery<CVReviewQueueItem[]>({
    queryKey: ["cvReviewQueueAllCounts", selectedOpeningId],
    queryFn: () =>
      cvReviewApi.getQueue({
        opening_id: selectedOpeningId !== "all" ? selectedOpeningId : undefined,
        status: "all",
      }),
  });

  const tabCounts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const item of allReviewCandidates) {
      if (item.review_status === "approved") approved++;
      else if (item.review_status === "rejected") rejected++;
      else pending++;
    }
    return {
      pending,
      approved,
      rejected,
      all: allReviewCandidates.length,
    };
  }, [allReviewCandidates]);

  // ── 5. Filtering and Sorting ────────────────────────────────────────────────
  const sortedCandidates = useMemo(() => {
    return [...queueItems].sort((a, b) => {
      if (sortBy === "score_desc") {
        const sa = a.score ?? -1;
        const sb = b.score ?? -1;
        return sb - sa;
      }
      if (sortBy === "score_asc") {
        const sa = a.score ?? 999;
        const sb = b.score ?? 999;
        return sa - sb;
      }
      if (sortBy === "name") {
        return a.name.localeCompare(b.name);
      }
      if (sortBy === "recent") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return 0;
    });
  }, [queueItems, sortBy]);

  // Derived counts
  const unscoredCount = useMemo(() => {
    return sortedCandidates.filter((c) => c.score === null || c.score === undefined).length;
  }, [sortedCandidates]);

  // ── 6. Selection Helpers ───────────────────────────────────────────────────
  const allFilteredSelected =
    sortedCandidates.length > 0 &&
    sortedCandidates.every((c) => selectedCandidateIds.includes(c.id));

  const someFilteredSelected =
    sortedCandidates.some((c) => selectedCandidateIds.includes(c.id)) && !allFilteredSelected;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedCandidateIds((prev) =>
        prev.filter((id) => !sortedCandidates.some((c) => c.id === id))
      );
    } else {
      const filteredIds = sortedCandidates.map((c) => c.id);
      setSelectedCandidateIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
    }
  };

  const selectAllUnscored = () => {
    const unscoredIds = sortedCandidates
      .filter((c) => c.score === null || c.score === undefined)
      .map((c) => c.id);
    setSelectedCandidateIds(unscoredIds);
    if (unscoredIds.length === 0) {
      toast({
        title: "All Candidates Scored",
        description: "There are no unscored candidates in the current queue view.",
      });
    } else {
      toast({
        title: "Unscored Candidates Selected",
        description: `Selected ${unscoredIds.length} candidate${
          unscoredIds.length === 1 ? "" : "s"
        } ready for AI evaluation.`,
      });
    }
  };

  const toggleCandidateSelection = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  // ── 7. Pass Mark Update Handler ────────────────────────────────────────────
  const handleSavePassMark = async () => {
    if (!activeOpening) {
      toast({
        title: "Select an Opening First",
        description: "Please select a specific job opening to customize its pass mark.",
        variant: "destructive",
      });
      return;
    }

    if (passMarkInput < 1 || passMarkInput > 100) {
      toast({
        title: "Invalid Pass Mark",
        description: "Pass mark must be a percentage between 1 and 100.",
        variant: "destructive",
      });
      return;
    }

    setIsUpdatingPassMark(true);
    try {
      await cvReviewApi.updatePassMark(activeOpening.id, passMarkInput);
      toast({
        title: "Pass Mark Updated",
        description: `Pass mark for "${activeOpening.title}" is now ${passMarkInput}%. Recommendations recomputed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["cvReviewQueue"] });
      queryClient.invalidateQueries({ queryKey: ["cvReviewQueueAllCounts"] });
      queryClient.invalidateQueries({ queryKey: ["jobOpenings"] });
    } catch (err: any) {
      toast({
        title: "Update Failed",
        description: sanitizeErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsUpdatingPassMark(false);
    }
  };

  // ── 8. Run AI Screening (Batch & Single) ───────────────────────────────────
  const runBatchScreening = async (candidateIdsToScreen: string[], forceRerun: boolean = false) => {
    if (candidateIdsToScreen.length === 0) return;
    setIsRunningBatch(true);
    cancelBatchRef.current = false;

    let completed = 0;
    let failed = 0;

    for (let i = 0; i < candidateIdsToScreen.length; i++) {
      if (cancelBatchRef.current) break;
      const cid = candidateIdsToScreen[i];
      const targetCandidate = sortedCandidates.find((c) => c.id === cid);
      const name = targetCandidate?.name || "Candidate";

      setBatchProgress({
        total: candidateIdsToScreen.length,
        current: i + 1,
        candidateName: name,
        completed,
        failed,
      });

      try {
        await cvReviewApi.scoreCandidate(cid, forceRerun);
        completed++;
        // Clear error if previously present
        setCandidateErrors((prev) => {
          const next = { ...prev };
          delete next[cid];
          return next;
        });
        queryClient.invalidateQueries({ queryKey: ["cvReviewQueue"] });
        queryClient.invalidateQueries({ queryKey: ["cvReviewQueueAllCounts"] });
      } catch (err: any) {
        failed++;
        const friendlyMsg = sanitizeErrorMessage(err);
        setCandidateErrors((prev) => ({
          ...prev,
          [cid]: friendlyMsg,
        }));
      }
    }

    setBatchProgress(null);
    setIsRunningBatch(false);
    queryClient.invalidateQueries({ queryKey: ["cvReviewQueue"] });
    queryClient.invalidateQueries({ queryKey: ["cvReviewQueueAllCounts"] });
    queryClient.invalidateQueries({ queryKey: ["candidates"] });
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });

    if (completed > 0) {
      toast({
        title: "AI Screening Complete",
        description: `Successfully scored ${completed} candidate${
          completed === 1 ? "" : "s"
        }. Candidates are now in Needs HR Review.${failed > 0 ? ` (${failed} had issues)` : ""}`,
      });
    } else if (failed > 0) {
      toast({
        title: "Evaluation Incomplete",
        description: "AI screening could not be completed for selected candidates. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Single candidate re-run handler
  const handleSingleRerun = async (candidateId: string) => {
    setSingleRunningId(candidateId);
    try {
      await cvReviewApi.scoreCandidate(candidateId, true);
      setCandidateErrors((prev) => {
        const next = { ...prev };
        delete next[candidateId];
        return next;
      });
      queryClient.invalidateQueries({ queryKey: ["cvReviewQueue"] });
      queryClient.invalidateQueries({ queryKey: ["cvReviewQueueAllCounts"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      toast({
        title: "Candidate Re-evaluated",
        description: "Fit score, recommendation tier, and skill match analysis updated.",
      });
    } catch (err: any) {
      const friendlyMsg = sanitizeErrorMessage(err);
      setCandidateErrors((prev) => ({
        ...prev,
        [candidateId]: friendlyMsg,
      }));
      toast({
        title: "Screening Notice",
        description: friendlyMsg,
        variant: "destructive",
      });
    } finally {
      setSingleRunningId(null);
    }
  };

  // ── 9. HR Review Decision Execution (Approve / Reject) ─────────────────────
  const openDecisionModal = (action: "approve" | "reject", candidateIds: string[]) => {
    const names = sortedCandidates
      .filter((c) => candidateIds.includes(c.id))
      .map((c) => c.name);
    setDecisionModal({
      open: true,
      action,
      candidateIds,
      candidateNames: names.length > 0 ? names : [`${candidateIds.length} candidate(s)`],
    });
  };

  const executeDecision = async () => {
    if (!decisionModal) return;
    setIsExecutingDecision(true);
    try {
      const res = await cvReviewApi.decide({
        candidate_ids: decisionModal.candidateIds,
        action: decisionModal.action,
      });

      // Clear selection
      setSelectedCandidateIds((prev) =>
        prev.filter((id) => !decisionModal.candidateIds.includes(id))
      );

      // Invalidate all related queries
      queryClient.invalidateQueries({ queryKey: ["cvReviewQueue"] });
      queryClient.invalidateQueries({ queryKey: ["cvReviewQueueAllCounts"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["auditLogs"] });

      const desc =
        decisionModal.action === "approve"
          ? `Approved ${res.approved_count} candidate(s). Dispatched CV Passed and Job Details emails with scheduling links.`
          : `Rejected ${res.rejected_count} candidate(s). Dispatched rejection notification emails.`;

      toast({
        title: decisionModal.action === "approve" ? "Candidates Approved" : "Candidates Rejected",
        description: desc,
      });

      setDecisionModal(null);
    } catch (err: any) {
      toast({
        title: "Decision Failed",
        description: sanitizeErrorMessage(err),
        variant: "destructive",
      });
    } finally {
      setIsExecutingDecision(false);
    }
  };

  return (
    <AppShell title="AI Screening & CV Review">
      <div className="space-y-6 pb-24">
        {/* Page Header */}
        <PageHeader
          title="AI Screening & CV Review"
          description="AI reads each CV and scores it against the job opening. Candidates land in Needs HR Review. Nothing is sent before HR decides."
          badge={
            <Badge variant="outline" className="gap-1.5 font-mono text-[11px] px-2.5 py-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>HR Decision Gate</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchQueue()}
                disabled={queueLoading || isRunningBatch}
                className="gap-1.5 text-xs font-medium"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-muted-foreground ${
                    queueLoading ? "animate-spin" : ""
                  }`}
                />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* ── SAFETY ASSURANCE CALLOUT ────────────────────────────────────── */}
        <div className="rounded-xl border border-border/80 bg-muted/30 p-3.5 flex items-start gap-3 shadow-2xs">
          <ShieldAlert className="w-4 h-4 text-primary shrink-0 mt-0.5" />
          <div className="text-xs space-y-0.5">
            <p className="font-semibold text-foreground">
              Strict Gatekeeper Policy: Zero Automated Outreach Before HR Decision
            </p>
            <p className="text-muted-foreground leading-relaxed">
              When a CV arrives or is evaluated, it is scored and held in the{" "}
              <strong className="text-foreground">Needs HR Review</strong> queue. Outreach emails
              (CV Passed, Job Details, Scheduling Link or Rejection) are only dispatched when HR
              explicitly clicks Approve or Reject. Every decision is immutably logged in the Audit Trail.
            </p>
          </div>
        </div>

        {/* ── 3-STEP FLOW CONTROL PANEL & PASS MARK EDITOR ──────────────────── */}
        <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-border/50">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary font-bold text-xs">
                1
              </div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Screening Flow: Job Opening, Pass Mark & Candidates
              </h2>
            </div>

            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{sortedCandidates.length} in Queue</span>
              <span>•</span>
              <span className="font-semibold text-foreground">
                {selectedCandidateIds.length} Selected
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
            {/* Step 1: Pick an Opening */}
            <div className="md:col-span-5 space-y-1.5">
              <label
                htmlFor="screening-opening-picker"
                className="text-xs font-medium text-foreground flex items-center gap-1.5"
              >
                <Briefcase className="w-3.5 h-3.5 text-primary" />
                <span>1. Target Job Opening</span>
              </label>
              <select
                id="screening-opening-picker"
                value={selectedOpeningId}
                onChange={(e) => {
                  setSelectedOpeningId(e.target.value);
                  setSelectedCandidateIds([]);
                }}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">All Active Job Openings</option>
                {openings.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.title} (Pass Mark: {op.pass_mark ?? 80}%)
                  </option>
                ))}
              </select>
            </div>

            {/* Step 2: Pick Candidates */}
            <div className="md:col-span-4 space-y-1.5">
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5 text-primary" />
                <span>2. Pick Candidates</span>
              </span>
              <div className="flex items-center gap-2">
                <Button
                  id="btn-select-unscored"
                  variant="outline"
                  size="sm"
                  onClick={selectAllUnscored}
                  className="flex-1 text-xs gap-1.5 h-9 font-medium"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-amber-500" />
                  <span>Select Unscored</span>
                  {unscoredCount > 0 && (
                    <Badge variant="warning" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                      {unscoredCount}
                    </Badge>
                  )}
                </Button>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={toggleSelectAll}
                  className="text-xs h-9 px-2 text-muted-foreground hover:text-foreground"
                >
                  {allFilteredSelected ? "Clear" : "All"}
                </Button>
              </div>
            </div>

            {/* Step 3: Run AI Screening */}
            <div className="md:col-span-3 space-y-1.5">
              <span className="text-xs font-medium text-foreground flex items-center gap-1.5">
                <Play className="w-3.5 h-3.5 text-primary" />
                <span>3. Execute AI Evaluation</span>
              </span>
              <Button
                id="btn-run-ai-screening"
                size="sm"
                onClick={() => runBatchScreening(selectedCandidateIds, false)}
                disabled={selectedCandidateIds.length === 0 || isRunningBatch}
                className="w-full h-9 gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-xs"
              >
                {isRunningBatch ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Evaluating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>
                      Run AI Screening{" "}
                      {selectedCandidateIds.length > 0 ? `(${selectedCandidateIds.length})` : ""}
                    </span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Opening Pass Mark Setting Row */}
          <div className="pt-3 border-t border-border/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-muted/20 p-3 rounded-lg">
            <div className="flex items-center gap-2">
              <Sliders className="w-3.5 h-3.5 text-primary" />
              <span className="font-semibold text-foreground">
                Opening Pass Mark:
              </span>
              {activeOpening ? (
                <span className="text-muted-foreground">
                  Minimum score required for <span className="text-emerald-600 font-semibold">Recommended</span> recommendation
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Default: 80% (Select a specific opening above to customize its pass mark)
                </span>
              )}
            </div>

            {activeOpening && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    value={passMarkInput}
                    onChange={(e) => setPassMarkInput(Number(e.target.value))}
                    className="w-16 h-8 text-xs text-center font-bold"
                  />
                  <span className="text-muted-foreground font-mono">%</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSavePassMark}
                  disabled={isUpdatingPassMark || passMarkInput === (activeOpening.pass_mark ?? 80)}
                  className="h-8 text-xs gap-1 font-medium"
                >
                  {isUpdatingPassMark ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Save className="w-3 h-3 text-primary" />
                  )}
                  <span>Save Pass Mark</span>
                </Button>
              </div>
            )}
          </div>

          {/* Active Batch Progress Display */}
          {isRunningBatch && batchProgress && (
            <div className="mt-3 p-4 rounded-xl bg-primary/[0.04] border border-primary/20 space-y-2.5 animate-in fade-in duration-200">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  <span className="font-semibold text-foreground">
                    Screening Candidate {batchProgress.current} of {batchProgress.total}:
                  </span>
                  <span className="text-primary font-medium">{batchProgress.candidateName}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-muted-foreground">
                    {Math.round((batchProgress.current / batchProgress.total) * 100)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      cancelBatchRef.current = true;
                      toast({
                        title: "Cancelling Run",
                        description: "Screening batch will halt after current candidate.",
                      });
                    }}
                    className="text-[11px] h-6 px-2 text-muted-foreground hover:text-destructive"
                  >
                    Stop
                  </Button>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-muted/60 rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-primary h-full transition-all duration-300 rounded-full"
                  style={{
                    width: `${Math.round((batchProgress.current / batchProgress.total) * 100)}%`,
                  }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-0.5">
                <span>
                  {batchProgress.completed} completed • {batchProgress.failed} failed
                </span>
                <span>AI scores CV evidence and places candidate in Needs HR Review</span>
              </div>
            </div>
          )}
        </div>

        {/* ── QUEUE TABS & SEARCH TOOLBAR ───────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Queue Tab Segmented Buttons */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/70 text-xs">
            <button
              onClick={() => {
                setReviewTab("pending");
                setSelectedCandidateIds([]);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                reviewTab === "pending"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-500" />
              <span>Needs HR Review</span>
              <Badge
                variant={tabCounts.pending > 0 ? "warning" : "secondary"}
                className="text-[10px] px-1.5 py-0 h-4 ml-0.5"
              >
                {tabCounts.pending}
              </Badge>
            </button>

            <button
              onClick={() => {
                setReviewTab("approved");
                setSelectedCandidateIds([]);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                reviewTab === "approved"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              <span>Approved</span>
              <span className="text-[10px] font-mono text-muted-foreground">({tabCounts.approved})</span>
            </button>

            <button
              onClick={() => {
                setReviewTab("rejected");
                setSelectedCandidateIds([]);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition flex items-center gap-1.5 ${
                reviewTab === "rejected"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <XCircle className="w-3.5 h-3.5 text-rose-500" />
              <span>Rejected</span>
              <span className="text-[10px] font-mono text-muted-foreground">({tabCounts.rejected})</span>
            </button>

            <button
              onClick={() => {
                setReviewTab("all");
                setSelectedCandidateIds([]);
              }}
              className={`px-3 py-1.5 rounded-md font-medium transition ${
                reviewTab === "all"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>All ({tabCounts.all})</span>
            </button>
          </div>

          {/* Search & Sort Controls */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search candidates, skills..."
                className="w-full bg-background border border-input rounded-lg pl-9 pr-3 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-background border border-input rounded-lg px-2.5 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-medium"
            >
              <option value="score_desc">Score: High to Low</option>
              <option value="score_asc">Score: Low to High</option>
              <option value="name">Name (A–Z)</option>
              <option value="recent">Recently Added</option>
            </select>
          </div>
        </div>

        {/* ── BULK ACTION BAR (VISIBLE WHEN CANDIDATES ARE SELECTED) ─────────── */}
        {selectedCandidateIds.length > 0 && (
          <div className="p-3.5 rounded-xl bg-card border-2 border-primary/40 shadow-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center gap-2">
              <Badge variant="default" className="text-xs px-2.5 py-0.5">
                {selectedCandidateIds.length} Selected
              </Badge>
              <span className="text-xs text-muted-foreground">
                Apply bulk HR decision across selected candidates:
              </span>
            </div>

            <div className="flex items-center gap-2">
              <Button
                id="btn-bulk-approve"
                size="sm"
                onClick={() => openDecisionModal("approve", selectedCandidateIds)}
                className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Approve Selected ({selectedCandidateIds.length})</span>
              </Button>

              <Button
                id="btn-bulk-reject"
                size="sm"
                variant="outline"
                onClick={() => openDecisionModal("reject", selectedCandidateIds)}
                className="h-8 gap-1.5 text-xs font-semibold text-rose-600 border-rose-300 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reject Selected ({selectedCandidateIds.length})</span>
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => setSelectedCandidateIds([])}
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
              >
                Deselect All
              </Button>
            </div>
          </div>
        )}

        {/* ── CV REVIEW TABLE ──────────────────────────────────────────────── */}
        {queueLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-20 rounded-xl bg-card border border-border/70 p-4 animate-pulse"
              />
            ))}
          </div>
        ) : queueError ? (
          <ErrorState
            title="Unable to load review queue"
            message={sanitizeErrorMessage(loadError)}
            onRetry={() => refetchQueue()}
          />
        ) : sortedCandidates.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={
              reviewTab === "pending"
                ? "All caught up! No candidates pending review"
                : searchQuery
                ? "No matching candidates"
                : `No ${reviewTab} candidates found`
            }
            description={
              reviewTab === "pending"
                ? "When new CVs arrive or are scored by AI, they will appear here awaiting your Approve or Reject decision."
                : searchQuery
                ? `No candidates matched "${searchQuery}". Clear your search or change the queue filter.`
                : "Candidates will appear in this list after you review them."
            }
            actionText={searchQuery ? "Clear Search" : reviewTab !== "pending" ? "View Pending Review" : "Go to Pipeline"}
            onAction={() => {
              if (searchQuery) setSearchQuery("");
              else if (reviewTab !== "pending") setReviewTab("pending");
              else window.location.href = "/pipeline";
            }}
          />
        ) : (
          <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    {/* Checkbox */}
                    <th className="py-3 px-3.5 w-10 text-center">
                      <button
                        onClick={toggleSelectAll}
                        className="text-muted-foreground hover:text-foreground inline-flex items-center justify-center p-0.5 rounded cursor-pointer"
                        title={allFilteredSelected ? "Deselect All" : "Select All"}
                      >
                        {allFilteredSelected ? (
                          <CheckSquare className="w-4 h-4 text-primary" />
                        ) : someFilteredSelected ? (
                          <MinusSquare className="w-4 h-4 text-primary" />
                        ) : (
                          <Square className="w-4 h-4" />
                        )}
                      </button>
                    </th>
                    <th className="py-3 px-3 min-w-[190px]">Candidate & Opening</th>
                    <th className="py-3 px-3 w-24 text-center">AI Fit Score</th>
                    <th className="py-3 px-3 w-36 text-center">AI Recommendation</th>
                    <th className="py-3 px-3 min-w-[160px]">Matched Skills</th>
                    <th className="py-3 px-3 min-w-[160px]">Missing Skills</th>
                    <th className="py-3 px-3 min-w-[200px]">Reason & Assessment</th>
                    <th className="py-3 px-3 w-44 text-right pr-4">HR Decision</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {sortedCandidates.map((cand) => {
                    const isSelected = selectedCandidateIds.includes(cand.id);
                    const isScored = cand.score !== null && cand.score !== undefined;
                    const isSingleRunning = singleRunningId === cand.id;
                    const errorMsg = candidateErrors[cand.id];

                    return (
                      <tr
                        key={cand.id}
                        className={`transition-colors hover:bg-muted/30 ${
                          isSelected ? "bg-primary/[0.02]" : ""
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="py-3 px-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleCandidateSelection(cand.id)}
                            className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                          />
                        </td>

                        {/* Candidate Details */}
                        <td className="py-3 px-3">
                          <div className="space-y-1">
                            <button
                              onClick={() => {
                                setDrawerCandidate(cand as unknown as Candidate);
                                setDrawerOpen(true);
                              }}
                              className="font-semibold text-foreground hover:text-primary transition-colors text-left flex items-center gap-1 group"
                            >
                              <span>{cand.name}</span>
                              <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-70 transition-opacity" />
                            </button>
                            <div className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                              {cand.email}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                              {cand.opening_title && (
                                <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0">
                                  {cand.opening_title}
                                </Badge>
                              )}
                              {cand.review_status === "approved" ? (
                                <Badge variant="success" className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 gap-1">
                                  <Check className="w-2.5 h-2.5" />
                                  Approved
                                </Badge>
                              ) : cand.review_status === "rejected" ? (
                                <Badge variant="destructive" className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 gap-1">
                                  <X className="w-2.5 h-2.5" />
                                  Rejected
                                </Badge>
                              ) : (
                                <Badge variant="warning" className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0 gap-1">
                                  <Clock className="w-2.5 h-2.5" />
                                  Needs Review
                                </Badge>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Score Ring */}
                        <td className="py-3 px-3 text-center">
                          {isSingleRunning ? (
                            <div className="flex flex-col items-center justify-center">
                              <Loader2 className="w-6 h-6 animate-spin text-primary" />
                              <span className="text-[9px] text-muted-foreground mt-1">Scoring</span>
                            </div>
                          ) : isScored ? (
                            <div className="flex flex-col items-center justify-center gap-1">
                              <ScoreRing score={cand.score} size="md" />
                              <span className="text-[10px] text-muted-foreground font-mono">
                                Pass: {cand.opening_pass_mark ?? cand.pass_mark ?? 80}%
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center justify-center text-muted-foreground">
                              <div className="w-10 h-10 rounded-full border border-dashed border-border flex items-center justify-center text-xs font-mono">
                                —
                              </div>
                              <span className="text-[9px] text-muted-foreground mt-0.5">Unscored</span>
                            </div>
                          )}
                        </td>

                        {/* AI Recommendation Badge */}
                        <td className="py-3 px-3 text-center">
                          {cand.recommendation === "Recommended" ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-2xs">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              <span>Recommended</span>
                            </div>
                          ) : cand.recommendation === "Borderline" ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 shadow-2xs">
                              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                              <span>Borderline</span>
                            </div>
                          ) : cand.recommendation === "Not recommended" ? (
                            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-400 border border-rose-500/20 shadow-2xs">
                              <XCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0" />
                              <span>Not recommended</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] text-muted-foreground bg-muted/50 border border-border">
                              <span>Unscored</span>
                            </div>
                          )}
                        </td>

                        {/* Matched Skills */}
                        <td className="py-3 px-3">
                          {cand.matched_skills && cand.matched_skills.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {cand.matched_skills.slice(0, 3).map((skill, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20"
                                >
                                  {skill}
                                </span>
                              ))}
                              {cand.matched_skills.length > 3 && (
                                <span className="text-[10px] text-muted-foreground font-mono self-center">
                                  +{cand.matched_skills.length - 3}
                                </span>
                              )}
                            </div>
                          ) : isScored ? (
                            <span className="text-[11px] text-muted-foreground italic">
                              No direct matches
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60">—</span>
                          )}
                        </td>

                        {/* Missing Skills */}
                        <td className="py-3 px-3">
                          {cand.missing_skills && cand.missing_skills.length > 0 ? (
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {cand.missing_skills.slice(0, 3).map((skill, sIdx) => (
                                <span
                                  key={sIdx}
                                  className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                                >
                                  {skill}
                                </span>
                              ))}
                              {cand.missing_skills.length > 3 && (
                                <span className="text-[10px] text-muted-foreground font-mono self-center">
                                  +{cand.missing_skills.length - 3}
                                </span>
                              )}
                            </div>
                          ) : isScored ? (
                            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                              No gaps detected
                            </span>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/60">—</span>
                          )}
                        </td>

                        {/* Short Reason / AI Summary or Friendly Error */}
                        <td className="py-3 px-3">
                          {errorMsg ? (
                            <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-200 space-y-1">
                              <div className="flex items-center gap-1 font-semibold text-[10px]">
                                <AlertCircle className="w-3 h-3 text-amber-500" />
                                <span>Evaluation Notice</span>
                              </div>
                              <p className="text-[11px] leading-relaxed">{errorMsg}</p>
                            </div>
                          ) : cand.summary ? (
                            <div className="space-y-1">
                              <p className="text-[11px] text-foreground leading-relaxed line-clamp-3">
                                {cand.summary}
                              </p>
                              {cand.red_flags && cand.red_flags.length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {cand.red_flags.slice(0, 2).map((flag, fIdx) => (
                                    <span
                                      key={fIdx}
                                      className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[9px] font-medium bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20"
                                    >
                                      <AlertTriangle className="w-2.5 h-2.5 text-rose-500" />
                                      <span className="truncate max-w-[120px]">{flag}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/70 italic">
                              Not evaluated yet. Click Run to score against opening requirements.
                            </span>
                          )}
                        </td>

                        {/* HR Decision Actions: Approve / Reject / Re-run */}
                        <td className="py-3 px-3 text-right pr-4">
                          <div className="flex items-center justify-end gap-1.5">
                            {/* Approve Button */}
                            <Button
                              size="sm"
                              onClick={() => openDecisionModal("approve", [cand.id])}
                              disabled={cand.review_status === "approved"}
                              className={`h-7 px-2 text-[11px] gap-1 font-medium transition ${
                                cand.review_status === "approved"
                                  ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30 cursor-default"
                                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                              }`}
                              title="Approve candidate (dispatches CV Passed, Job Details, and scheduling link)"
                            >
                              <Check className="w-3 h-3" />
                              <span>{cand.review_status === "approved" ? "Approved" : "Approve"}</span>
                            </Button>

                            {/* Reject Button */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => openDecisionModal("reject", [cand.id])}
                              disabled={cand.review_status === "rejected"}
                              className={`h-7 px-2 text-[11px] gap-1 font-medium transition ${
                                cand.review_status === "rejected"
                                  ? "bg-rose-500/10 text-rose-600 border border-rose-500/30 cursor-default"
                                  : "text-rose-600 border-rose-300 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/20"
                              }`}
                              title="Reject candidate (dispatches Rejection template)"
                            >
                              <X className="w-3 h-3" />
                              <span>{cand.review_status === "rejected" ? "Rejected" : "Reject"}</span>
                            </Button>

                            {/* Re-run Button */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSingleRerun(cand.id)}
                              disabled={isSingleRunning || isRunningBatch}
                              className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              title="Re-run AI evaluation"
                            >
                              <RefreshCw
                                className={`w-3 h-3 ${isSingleRunning ? "animate-spin" : ""}`}
                              />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DECISION CONFIRMATION DIALOG ─────────────────────────────────── */}
        <Dialog
          open={!!decisionModal?.open}
          onOpenChange={(v) => !v && !isExecutingDecision && setDecisionModal(null)}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                {decisionModal?.action === "approve" ? (
                  <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-600">
                    <CheckCircle2 className="w-5 h-5" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-rose-500/15 flex items-center justify-center text-rose-600">
                    <XCircle className="w-5 h-5" />
                  </div>
                )}
                <DialogTitle className="text-base font-bold">
                  {decisionModal?.action === "approve" ? "Approve Candidates" : "Reject Candidates"}
                </DialogTitle>
              </div>

              <DialogDescription className="text-xs pt-2 space-y-2">
                <p>
                  You are about to{" "}
                  <strong className="text-foreground uppercase">
                    {decisionModal?.action}
                  </strong>{" "}
                  {decisionModal?.candidateNames.length} candidate(s):
                </p>

                <div className="max-h-28 overflow-y-auto p-2 rounded-md bg-muted/40 border border-border/70 text-[11px] text-foreground font-medium">
                  {decisionModal?.candidateNames.join(", ")}
                </div>

                <div className="p-3 rounded-lg bg-primary/[0.04] border border-primary/20 space-y-1.5 text-[11px]">
                  <p className="font-semibold text-foreground flex items-center gap-1.5">
                    <Send className="w-3 h-3 text-primary" />
                    <span>Automated Action on Confirmation:</span>
                  </p>
                  {decisionModal?.action === "approve" ? (
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                      <li>Candidate moves to <strong className="text-foreground">Shortlisted</strong></li>
                      <li>
                        Dispatches <strong className="text-foreground">CV Passed</strong> and{" "}
                        <strong className="text-foreground">Job Details</strong> emails
                      </li>
                      <li>Generates personalized Google Meet scheduling link</li>
                      <li>Records action in the Audit Trail</li>
                    </ul>
                  ) : (
                    <ul className="list-disc list-inside space-y-0.5 text-muted-foreground pl-1">
                      <li>Candidate moves to <strong className="text-foreground">Rejected</strong></li>
                      <li>
                        Dispatches <strong className="text-foreground">Rejection template</strong> email
                      </li>
                      <li>Records decision & rejection notice in the Audit Trail</li>
                    </ul>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>

            <DialogFooter className="pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDecisionModal(null)}
                disabled={isExecutingDecision}
                className="text-xs"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={executeDecision}
                disabled={isExecutingDecision}
                className={`text-xs gap-1.5 font-semibold ${
                  decisionModal?.action === "approve"
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-destructive hover:bg-destructive/90 text-white"
                }`}
              >
                {isExecutingDecision ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Executing & Dispatching...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>
                      Confirm & Send {decisionModal?.action === "approve" ? "Invitations" : "Rejection"}
                    </span>
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── CANDIDATE DETAIL DRAWER ──────────────────────────────────────── */}
        <CandidateDrawer
          candidate={drawerCandidate}
          open={drawerOpen}
          onClose={() => {
            setDrawerOpen(false);
            setDrawerCandidate(null);
          }}
        />
      </div>
    </AppShell>
  );
}
