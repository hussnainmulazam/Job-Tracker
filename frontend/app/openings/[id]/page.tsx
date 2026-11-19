"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Briefcase,
  Sparkles,
  Download,
  Users,
  Search,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileText,
  SlidersHorizontal,
  ChevronRight,
  Loader2,
  ExternalLink,
  MessageSquare,
  Award,
  Layers,
  FileSpreadsheet,
  Table,
  LayoutGrid,
  Save,
  SearchCheck,
  Phone,
  MapPin,
  Globe,
  Github,
  Linkedin,
  Database,
  Check,
  Edit2,
} from "lucide-react";

import {
  jobOpeningsApi,
  candidatesApi,
  JobOpening,
  Candidate,
  CandidateStage,
  MatchProgressStatus,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

type ScoreFilter = "all" | "strong" | "potential" | "low" | "unscored";
type ViewMode = "table" | "cards";

const STAGE_OPTIONS: { value: CandidateStage; label: string }[] = [
  { value: "applied", label: "Applied" },
  { value: "screening", label: "Screening" },
  { value: "interview", label: "Interview" },
  { value: "offer", label: "Offer" },
  { value: "rejected", label: "Rejected" },
];

export default function JobOpeningDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const openingId = params?.id as string;

  const [searchQuery, setSearchQuery] = useState("");
  const [scoreFilter, setScoreFilter] = useState<ScoreFilter>("all");
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rerunMatching, setRerunMatching] = useState(false);

  // Screening Questions Modal
  const [questionsModalOpen, setQuestionsModalOpen] = useState(false);
  const [roleQuestions, setRoleQuestions] = useState<string[]>([]);

  // HR Table Inline Editing State (candidate_id -> edits)
  const [editedCandidates, setEditedCandidates] = useState<Record<string, Partial<Candidate>>>({});

  // Links Edit Modal State
  const [linksModalOpen, setLinksModalOpen] = useState(false);
  const [targetCandidateForLinks, setTargetCandidateForLinks] = useState<Candidate | null>(null);
  const [linksForm, setLinksForm] = useState({
    github_url: "",
    linkedin_url: "",
    kaggle_url: "",
    portfolio_url: "",
  });

  // 1. Fetch Job Opening Details
  const {
    data: opening,
    isLoading: isOpeningLoading,
    isError: isOpeningError,
    error: openingError,
  } = useQuery<JobOpening>({
    queryKey: ["job-opening", openingId],
    queryFn: () => jobOpeningsApi.get(openingId),
    enabled: !!openingId,
  });

  // 2. Fetch Candidates for this opening
  const {
    data: candidatesData,
    isLoading: isCandidatesLoading,
    refetch: refetchCandidates,
  } = useQuery({
    queryKey: ["candidates", openingId],
    queryFn: () => candidatesApi.list({ opening_id: openingId, limit: 100 }),
    enabled: !!openingId,
  });

  const candidates = candidatesData?.items || [];

  // 3. Poll Background Match Status when in_progress
  const { data: matchStatus } = useQuery<MatchProgressStatus>({
    queryKey: ["match-status", openingId],
    queryFn: () => jobOpeningsApi.getMatchStatus(openingId),
    enabled: !!openingId,
    refetchInterval: (query) => {
      const current = query.state.data;
      return current?.status === "in_progress" ? 2000 : false;
    },
  });

  const isMatching = matchStatus?.status === "in_progress";

  // Invalidate candidates when matching finishes
  useEffect(() => {
    if (matchStatus?.status === "completed") {
      queryClient.invalidateQueries({ queryKey: ["candidates", openingId] });
      queryClient.invalidateQueries({ queryKey: ["job-opening", openingId] });
    }
  }, [matchStatus?.status, openingId, queryClient]);

  // 4. Trigger Matching Mutation
  const matchMutation = useMutation({
    mutationFn: (rerun: boolean) => jobOpeningsApi.match(openingId, rerun),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["match-status", openingId] });
      toast({
        title: "AI Matching Job Started",
        description: "Scoring candidates in background with OpenRouter. Results will appear live.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Match Execution Failed",
        description: err.message || "Failed to initiate candidate matching.",
        variant: "destructive",
      });
    },
  });

  // 5. Screening Questions Mutation
  const questionsMutation = useMutation({
    mutationFn: (count: number) => jobOpeningsApi.generateQuestions(openingId, count),
    onSuccess: (data) => {
      setRoleQuestions(data.questions || []);
      setQuestionsModalOpen(true);
    },
    onError: (err: any) => {
      toast({
        title: "Question Generation Failed",
        description: err.message || "Could not generate interview questions.",
        variant: "destructive",
      });
    },
  });

  // 6. Sync to Google Sheet Mutation
  const syncGoogleSheetMutation = useMutation({
    mutationFn: () => jobOpeningsApi.syncGoogleSheet(openingId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["job-opening", openingId] });
      queryClient.invalidateQueries({ queryKey: ["candidates", openingId] });
      toast({
        title: "Synced to Google Sheet",
        description: `Successfully synced ${data.total_candidates_synced} candidates (${data.rows_updated} updated, ${data.rows_appended} appended).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Google Sheet Sync Failed",
        description: err.message || "Ensure your Google account is connected in Settings > Integrations.",
        variant: "destructive",
      });
    },
  });

  // 7. Extract All Details Mutation
  const extractAllMutation = useMutation({
    mutationFn: () => jobOpeningsApi.extractAll(openingId, true),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["candidates", openingId] });
      toast({
        title: "Batch Extraction Complete",
        description: `Extracted contact info & profile links for ${data.candidates_processed} candidates.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Extraction Failed",
        description: err.message || "Failed to batch extract candidate details.",
        variant: "destructive",
      });
    },
  });

  // 8. Update Candidate Mutation (for HR table corrections)
  const updateCandidateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Candidate> }) =>
      candidatesApi.update(id, data),
    onSuccess: (updated) => {
      setEditedCandidates((prev) => {
        const copy = { ...prev };
        delete copy[updated.id];
        return copy;
      });
      queryClient.invalidateQueries({ queryKey: ["candidates", openingId] });
      toast({
        title: "Saved",
        description: `Updated details for ${updated.name}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Save Failed",
        description: err.message || "Failed to save candidate corrections.",
        variant: "destructive",
      });
    },
  });

  // 9. Extract Single Candidate Mutation
  const extractSingleMutation = useMutation({
    mutationFn: (candId: string) => candidatesApi.extractDetails(candId, true),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["candidates", openingId] });
      toast({
        title: "Details Extracted",
        description: "Extracted contact details and verified profile links.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Extraction Failed",
        description: err.message || "Could not extract candidate details.",
        variant: "destructive",
      });
    },
  });

  const handleExportShortlist = () => {
    const url = jobOpeningsApi.getShortlistExportUrl(openingId);
    window.open(url, "_blank");
  };

  // Sort candidates by score descending (Ranked #1, #2, ...)
  const rankedCandidates = [...candidates].sort((a, b) => {
    const scoreA = a.score ?? -1;
    const scoreB = b.score ?? -1;
    return scoreB - scoreA;
  });

  // Filter candidates by search & score tier
  const filteredCandidates = rankedCandidates.filter((c) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const nameMatch = c.name.toLowerCase().includes(q);
      const emailMatch = c.email.toLowerCase().includes(q);
      const skillMatch = c.matched_skills.some((s) => s.toLowerCase().includes(q));
      if (!nameMatch && !emailMatch && !skillMatch) return false;
    }

    const score = c.score;
    if (scoreFilter === "strong") return score !== null && score !== undefined && score >= 80;
    if (scoreFilter === "potential") return score !== null && score !== undefined && score >= 60 && score < 80;
    if (scoreFilter === "low") return score !== null && score !== undefined && score < 60;
    if (scoreFilter === "unscored") return score === null || score === undefined;

    return true;
  });

  // Score tier counts
  const countAll = candidates.length;
  const countStrong = candidates.filter((c) => (c.score ?? -1) >= 80).length;
  const countPotential = candidates.filter((c) => (c.score ?? -1) >= 60 && (c.score ?? -1) < 80).length;
  const countLow = candidates.filter((c) => c.score !== null && c.score !== undefined && c.score < 60).length;
  const countUnscored = candidates.filter((c) => c.score === null || c.score === undefined).length;

  // HR Table Field Handlers
  const handleFieldChange = (candId: string, field: keyof Candidate, value: any) => {
    setEditedCandidates((prev) => ({
      ...prev,
      [candId]: {
        ...prev[candId],
        [field]: value,
      },
    }));
  };

  const handleSaveCandidate = (candId: string) => {
    const edits = editedCandidates[candId];
    if (!edits) return;
    updateCandidateMutation.mutate({ id: candId, data: edits });
  };

  const handleSaveAll = async () => {
    const candidateIds = Object.keys(editedCandidates);
    if (candidateIds.length === 0) return;

    for (const id of candidateIds) {
      await updateCandidateMutation.mutateAsync({ id, data: editedCandidates[id] });
    }
    toast({
      title: "All Edits Saved",
      description: `Persisted changes for ${candidateIds.length} candidate(s).`,
    });
  };

  // Links Modal Handlers
  const openLinksModal = (cand: Candidate) => {
    setTargetCandidateForLinks(cand);
    setLinksForm({
      github_url: cand.github_url || "",
      linkedin_url: cand.linkedin_url || "",
      kaggle_url: cand.kaggle_url || "",
      portfolio_url: cand.portfolio_url || "",
    });
    setLinksModalOpen(true);
  };

  const handleSaveLinks = () => {
    if (!targetCandidateForLinks) return;
    updateCandidateMutation.mutate({
      id: targetCandidateForLinks.id,
      data: {
        github_url: linksForm.github_url.trim() || null,
        linkedin_url: linksForm.linkedin_url.trim() || null,
        kaggle_url: linksForm.kaggle_url.trim() || null,
        portfolio_url: linksForm.portfolio_url.trim() || null,
      },
    });
    setLinksModalOpen(false);
  };

  const unsavedCount = Object.keys(editedCandidates).length;

  if (isOpeningLoading) {
    return (
      <AppShell title="Job Requisition">
        <div className="space-y-6 max-w-6xl">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </AppShell>
    );
  }

  if (isOpeningError || !opening) {
    return (
      <AppShell title="Job Requisition">
        <div className="space-y-4 max-w-2xl">
          <Link href="/openings" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back to Requisitions</span>
          </Link>
          <ErrorState
            title="Requisition Not Found"
            message={(openingError as Error)?.message || "Could not load the requested job requisition."}
            onRetry={() => router.push("/openings")}
          />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={opening.title}>
      <div className="space-y-6 max-w-6xl pb-16">
        <PageHeader
          title={opening.title}
          description={opening.description}
          breadcrumbs={[
            { label: "Job Requisitions", href: "/openings" },
            { label: opening.title },
          ]}
          badge={
            <Badge variant="outline" className="text-[11px] capitalize font-medium">
              Status: {opening.status}
            </Badge>
          }
        />

        {/* 1. Job Requisition Header Card */}
        <Card className="border border-border/70 dark:border-white/[0.08] shadow-xs bg-card">
          <CardHeader className="pb-3">
            <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
              <div className="space-y-1">
                <CardTitle className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                  <Briefcase className="h-5 w-5 text-primary" />
                  <span>{opening.title}</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground line-clamp-3 pt-1">
                  {opening.description}
                </CardDescription>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <Button
                  size="sm"
                  onClick={() => matchMutation.mutate(rerunMatching)}
                  disabled={matchMutation.isPending || isMatching}
                  className="text-xs h-8 font-semibold gap-1.5 shadow-2xs"
                >
                  {isMatching || matchMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                  <span>{isMatching ? "Matching..." : "Match Candidates"}</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => extractAllMutation.mutate()}
                  disabled={extractAllMutation.isPending}
                  className="text-xs h-8 gap-1.5"
                  title="Run hybrid regex + AI contact and link extraction for all candidates"
                >
                  {extractAllMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <SearchCheck className="h-3.5 w-3.5 text-primary" />
                  )}
                  <span>Extract All</span>
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => syncGoogleSheetMutation.mutate()}
                  disabled={syncGoogleSheetMutation.isPending}
                  className="text-xs h-8 gap-1.5 border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  title="Upsert shortlist candidates to Google Sheet"
                >
                  {syncGoogleSheetMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                  )}
                  <span>Sync Google Sheet</span>
                </Button>

                {opening.google_sheet_url && (
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="text-xs h-8 gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                  >
                    <a href={opening.google_sheet_url} target="_blank" rel="noreferrer">
                      <span>Open Sheet</span>
                      <ExternalLink className="h-3 w-3 ml-0.5" />
                    </a>
                  </Button>
                )}

                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportShortlist}
                  className="text-xs h-8 gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Shortlist CSV</span>
                </Button>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => questionsMutation.mutate(5)}
                  disabled={questionsMutation.isPending}
                  className="text-xs h-8 gap-1.5"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Questions</span>
                </Button>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-3 pt-1 text-xs">
            {/* Extracted Attributes Bar */}
            <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-border/60">
              {opening.years_of_experience !== undefined && opening.years_of_experience !== null && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-muted/40 border border-border/70 text-[11px] font-medium text-foreground">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  <span>Experience: {opening.years_of_experience} yrs</span>
                </div>
              )}

              <div className="flex items-center gap-1 text-[11px] text-muted-foreground font-medium">
                <Users className="h-3.5 w-3.5 text-primary" />
                <span>{candidates.length} Candidate{candidates.length === 1 ? "" : "s"} Ingested</span>
              </div>

              {opening.google_sheet_id && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  <FileSpreadsheet className="h-3.5 w-3.5" />
                  <span>Sheet Connected: {opening.google_sheet_id.slice(0, 12)}...</span>
                </div>
              )}

              <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground cursor-pointer select-none ml-auto">
                <input
                  type="checkbox"
                  checked={rerunMatching}
                  onChange={(e) => setRerunMatching(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                />
                <span>Re-score already matched candidates (re-run)</span>
              </label>
            </div>

            {/* Target Skills Chips */}
            <div className="space-y-1.5 pt-1">
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Required Core Skills ({opening.required_skills.length})
              </span>
              <div className="flex flex-wrap gap-1.5">
                {opening.required_skills.map((skill) => (
                  <Badge
                    key={skill}
                    variant="secondary"
                    className="text-[11px] font-medium px-2 py-0.5 bg-primary/10 text-primary border-primary/20"
                  >
                    {skill}
                  </Badge>
                ))}
                {opening.nice_to_haves && opening.nice_to_haves.length > 0 && (
                  <>
                    <span className="text-[10px] text-muted-foreground self-center px-1">Bonus:</span>
                    {opening.nice_to_haves.map((nice) => (
                      <Badge
                        key={nice}
                        variant="outline"
                        className="text-[10px] font-normal px-2 py-0.5 text-muted-foreground border-dashed"
                      >
                        {nice}
                      </Badge>
                    ))}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Real-time Background Matching Progress Card */}
        {isMatching && (
          <div className="p-4 rounded-xl border border-primary/30 bg-primary/5 space-y-2.5 animate-in fade-in-50 duration-200">
            <div className="flex items-center justify-between text-xs font-semibold text-primary">
              <span className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>AI Candidate Scoring in Progress (OpenRouter)...</span>
              </span>
              <span className="font-mono text-[11px]">
                {matchStatus?.processed_candidates || 0} / {matchStatus?.total_candidates || 0} scored ({matchStatus?.progress_percent || 0}%)
              </span>
            </div>

            {/* Progress Bar */}
            <div className="h-2 w-full bg-primary/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 rounded-full"
                style={{ width: `${matchStatus?.progress_percent || 5}%` }}
              />
            </div>
          </div>
        )}

        {/* 3. Filter Controls & View Switcher Bar */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search candidates by name, email, or skill..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs h-8 pl-8"
              />
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto">
              {/* View Switcher Toggle */}
              <div className="flex items-center gap-1 bg-muted/60 p-0.5 rounded-lg border border-border">
                <Button
                  size="sm"
                  variant={viewMode === "table" ? "secondary" : "ghost"}
                  onClick={() => setViewMode("table")}
                  className="h-7 px-2.5 text-xs gap-1.5"
                  title="Editable Shortlist Table with Inline Correction"
                >
                  <Table className="h-3.5 w-3.5" />
                  <span>Table View (HR Edit)</span>
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "cards" ? "secondary" : "ghost"}
                  onClick={() => setViewMode("cards")}
                  className="h-7 px-2.5 text-xs gap-1.5"
                  title="Ranked Candidate Cards"
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Ranked Cards</span>
                </Button>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchCandidates()}
                className="text-xs h-8 gap-1.5"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                <span>Refresh</span>
              </Button>
            </div>
          </div>

          {/* Filter by Score Tier Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-b border-border/60 pb-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1 mr-1">
                <SlidersHorizontal className="h-3 w-3" />
                <span>Score Tier:</span>
              </span>

              <Button
                variant={scoreFilter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreFilter("all")}
                className="text-xs h-7 px-2.5 rounded-full"
              >
                All ({countAll})
              </Button>

              <Button
                variant={scoreFilter === "strong" ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreFilter("strong")}
                className={`text-xs h-7 px-2.5 rounded-full ${
                  scoreFilter === "strong" ? "" : "text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                }`}
              >
                Strong 80+ ({countStrong})
              </Button>

              <Button
                variant={scoreFilter === "potential" ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreFilter("potential")}
                className={`text-xs h-7 px-2.5 rounded-full ${
                  scoreFilter === "potential" ? "" : "text-amber-600 dark:text-amber-400 border-amber-500/20"
                }`}
              >
                Potential 60-79 ({countPotential})
              </Button>

              <Button
                variant={scoreFilter === "low" ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreFilter("low")}
                className={`text-xs h-7 px-2.5 rounded-full ${
                  scoreFilter === "low" ? "" : "text-rose-600 dark:text-rose-400 border-rose-500/20"
                }`}
              >
                Low &lt;60 ({countLow})
              </Button>

              <Button
                variant={scoreFilter === "unscored" ? "default" : "outline"}
                size="sm"
                onClick={() => setScoreFilter("unscored")}
                className="text-xs h-7 px-2.5 rounded-full text-muted-foreground"
              >
                Unscored ({countUnscored})
              </Button>
            </div>

            {/* Unsaved Changes Banner */}
            {unsavedCount > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                  {unsavedCount} unsaved candidate correction{unsavedCount === 1 ? "" : "s"}
                </span>
                <Button
                  size="sm"
                  onClick={handleSaveAll}
                  disabled={updateCandidateMutation.isPending}
                  className="h-7 text-xs font-bold gap-1 bg-amber-600 hover:bg-amber-700 text-white"
                >
                  <Save className="h-3 w-3" />
                  <span>Save All Changes</span>
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 4. Main Candidate View: Shortlist Table (HR Edit) or Ranked Cards */}
        {isCandidatesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-xl" />
            ))}
          </div>
        ) : filteredCandidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Candidates Match Filters"
            description="Try loosening your score filters, search terms, or trigger 'Match Candidates' to calculate fit scores."
            actionText="Clear Filters"
            onAction={() => {
              setSearchQuery("");
              setScoreFilter("all");
            }}
          />
        ) : viewMode === "table" ? (
          /* ── View A: Shortlist Table (HR Editable) ─────────────────── */
          <div className="rounded-xl border border-border bg-card shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-3 w-16 text-center">Rank</th>
                    <th className="py-3 px-3 w-20 text-center">Fit Score</th>
                    <th className="py-3 px-3 min-w-[160px]">Candidate Name</th>
                    <th className="py-3 px-3 min-w-[180px]">Email</th>
                    <th className="py-3 px-3 min-w-[140px]">Phone</th>
                    <th className="py-3 px-3 min-w-[140px]">Address / City</th>
                    <th className="py-3 px-3 min-w-[170px]">Profiles & Links</th>
                    <th className="py-3 px-3 w-28">Stage</th>
                    <th className="py-3 px-3 w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredCandidates.map((cand, idx) => {
                    const rank = idx + 1;
                    const edits = editedCandidates[cand.id] || {};
                    const isModified = Object.keys(edits).length > 0;

                    const currentName = edits.name !== undefined ? edits.name : cand.name;
                    const currentEmail = edits.email !== undefined ? edits.email : cand.email;
                    const currentPhone = edits.phone !== undefined ? edits.phone : (cand.phone || "");
                    const currentAddress = edits.address !== undefined ? edits.address : (cand.address || "");
                    const currentStage = edits.stage !== undefined ? edits.stage : cand.stage;

                    return (
                      <tr
                        key={cand.id}
                        className={`hover:bg-muted/30 transition-colors ${
                          isModified ? "bg-amber-500/5 dark:bg-amber-500/10" : ""
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-2.5 px-3 text-center font-mono font-bold text-muted-foreground">
                          #{rank}
                        </td>

                        {/* Fit Score Ring */}
                        <td className="py-2.5 px-3 text-center">
                          <div className="inline-flex justify-center">
                            <ScoreRing score={cand.score} size="sm" />
                          </div>
                        </td>

                        {/* Editable Name */}
                        <td className="py-2.5 px-3">
                          <Input
                            value={currentName}
                            onChange={(e) => handleFieldChange(cand.id, "name", e.target.value)}
                            className="h-7 text-xs font-semibold px-2"
                            placeholder="Full name"
                          />
                        </td>

                        {/* Editable Email */}
                        <td className="py-2.5 px-3">
                          <Input
                            value={currentEmail}
                            onChange={(e) => handleFieldChange(cand.id, "email", e.target.value)}
                            className="h-7 text-xs px-2 font-mono text-[11px]"
                            placeholder="Email address"
                          />
                        </td>

                        {/* Editable Phone */}
                        <td className="py-2.5 px-3">
                          <Input
                            value={currentPhone || ""}
                            onChange={(e) => handleFieldChange(cand.id, "phone", e.target.value)}
                            className="h-7 text-xs px-2 font-mono text-[11px]"
                            placeholder="+1 (555) 000-0000"
                          />
                        </td>

                        {/* Editable Address */}
                        <td className="py-2.5 px-3">
                          <Input
                            value={currentAddress || ""}
                            onChange={(e) => handleFieldChange(cand.id, "address", e.target.value)}
                            className="h-7 text-xs px-2"
                            placeholder="City, State / Country"
                          />
                        </td>

                        {/* Online Links & Verification Badges */}
                        <td className="py-2.5 px-3">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {cand.github_url && (
                              <a
                                href={cand.github_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono hover:bg-accent text-foreground transition-colors"
                                title={cand.github_url}
                              >
                                <Github className="h-2.5 w-2.5" />
                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                              </a>
                            )}
                            {cand.linkedin_url && (
                              <a
                                href={cand.linkedin_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-mono hover:bg-blue-500/20 transition-colors"
                                title={cand.linkedin_url}
                              >
                                <Linkedin className="h-2.5 w-2.5" />
                              </a>
                            )}
                            {cand.kaggle_url && (
                              <a
                                href={cand.kaggle_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[10px] font-mono hover:bg-cyan-500/20 transition-colors"
                                title={cand.kaggle_url}
                              >
                                <Database className="h-2.5 w-2.5" />
                                <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                              </a>
                            )}
                            {cand.portfolio_url && (
                              <a
                                href={cand.portfolio_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-mono hover:bg-emerald-500/20 transition-colors"
                                title={cand.portfolio_url}
                              >
                                <Globe className="h-2.5 w-2.5" />
                              </a>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openLinksModal(cand)}
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              title="Edit candidate profile & portfolio links"
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>

                        {/* Editable Stage Selector */}
                        <td className="py-2.5 px-3">
                          <select
                            value={currentStage}
                            onChange={(e) => handleFieldChange(cand.id, "stage", e.target.value as CandidateStage)}
                            className="h-7 text-xs font-medium px-1.5 py-0.5 rounded border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none cursor-pointer w-full"
                          >
                            {STAGE_OPTIONS.map((opt) => (
                              <option key={opt.value} value={opt.value}>
                                {opt.label}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* Action Buttons: Save, Extract, View Drawer */}
                        <td className="py-2.5 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {isModified ? (
                              <Button
                                size="sm"
                                onClick={() => handleSaveCandidate(cand.id)}
                                disabled={updateCandidateMutation.isPending}
                                className="h-7 px-2 text-[11px] font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                title="Save candidate edits"
                              >
                                <Save className="h-3 w-3" />
                                <span>Save</span>
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => extractSingleMutation.mutate(cand.id)}
                                disabled={extractSingleMutation.isPending}
                                className="h-7 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
                                title="Run regex & AI gap extraction on CV text"
                              >
                                <SearchCheck className="h-3.5 w-3.5" />
                              </Button>
                            )}

                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setSelectedCandidate(cand);
                                setDrawerOpen(true);
                              }}
                              className="h-7 px-1.5 text-muted-foreground hover:text-foreground"
                              title="Open candidate drawer"
                            >
                              <ChevronRight className="h-4 w-4" />
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
        ) : (
          /* ── View B: Ranked Candidate Cards ───────────────────────── */
          <div className="space-y-3">
            {filteredCandidates.map((cand, idx) => {
              const rank = idx + 1;
              const hasScore = cand.score !== null && cand.score !== undefined;

              return (
                <div
                  key={cand.id}
                  onClick={() => {
                    setSelectedCandidate(cand);
                    setDrawerOpen(true);
                  }}
                  className="p-4 rounded-xl border border-border bg-card shadow-2xs hover:shadow-md hover:border-primary/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  {/* Left: Rank, Name, Email, Stage */}
                  <div className="flex items-start gap-3.5">
                    {/* Rank Badge */}
                    <div className="flex flex-col items-center justify-center shrink-0 w-8 h-8 rounded-lg bg-muted/60 border border-border text-xs font-black font-mono">
                      {rank <= 3 && hasScore ? (
                        <Award
                          className={`h-4 w-4 ${
                            rank === 1
                              ? "text-amber-500"
                              : rank === 2
                              ? "text-slate-400"
                              : "text-amber-700"
                          }`}
                        />
                      ) : (
                        <span>#{rank}</span>
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-foreground hover:text-primary transition-colors">
                          {cand.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {cand.stage}
                        </Badge>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{cand.email}</span>
                        {cand.phone && <span>• {cand.phone}</span>}
                        {cand.address && <span>• {cand.address}</span>}
                      </div>

                      {/* One-paragraph Reason / Summary Excerpt */}
                      {cand.summary && (
                        <p className="text-[11px] text-muted-foreground line-clamp-2 max-w-xl italic pt-0.5">
                          "{cand.summary}"
                        </p>
                      )}

                      {/* Profile Links */}
                      {(cand.linkedin_url || cand.github_url || cand.kaggle_url || cand.portfolio_url) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px]">
                          {cand.github_url && (
                            <span className="inline-flex items-center gap-1 font-mono text-muted-foreground">
                              <Github className="h-3 w-3" />
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                            </span>
                          )}
                          {cand.linkedin_url && (
                            <span className="inline-flex items-center gap-1 font-mono text-blue-600 dark:text-blue-400">
                              <Linkedin className="h-3 w-3" />
                            </span>
                          )}
                          {cand.kaggle_url && (
                            <span className="inline-flex items-center gap-1 font-mono text-cyan-600 dark:text-cyan-400">
                              <Database className="h-3 w-3" />
                              <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                            </span>
                          )}
                          {cand.portfolio_url && (
                            <span className="inline-flex items-center gap-1 font-mono text-emerald-600 dark:text-emerald-400">
                              <Globe className="h-3 w-3" />
                            </span>
                          )}
                        </div>
                      )}

                      {/* Skill Chips */}
                      <div className="flex flex-wrap items-center gap-1 pt-1.5">
                        {cand.matched_skills && cand.matched_skills.length > 0 && (
                          <>
                            {cand.matched_skills.slice(0, 4).map((s) => (
                              <span
                                key={s}
                                className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                <span>{s}</span>
                              </span>
                            ))}
                            {cand.matched_skills.length > 4 && (
                              <span className="text-[10px] text-muted-foreground font-mono">
                                +{cand.matched_skills.length - 4} more
                              </span>
                            )}
                          </>
                        )}

                        {cand.missing_skills && cand.missing_skills.length > 0 && (
                          <>
                            {cand.missing_skills.slice(0, 2).map((ms) => (
                              <span
                                key={ms}
                                className="inline-flex items-center gap-0.5 text-[10px] font-medium px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                              >
                                <span>Missing: {ms}</span>
                              </span>
                            ))}
                          </>
                        )}

                        {cand.red_flags && cand.red_flags.length > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                            <AlertTriangle className="h-2.5 w-2.5" />
                            <span>{cand.red_flags.length} Flag{cand.red_flags.length === 1 ? "" : "s"}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Score Ring & Drawer Opener Chevron */}
                  <div className="flex items-center gap-4 shrink-0 self-end md:self-center">
                    <div className="flex flex-col items-center gap-0.5">
                      <ScoreRing score={cand.score} size="md" />
                      <span className="text-[9px] uppercase tracking-wider font-bold text-muted-foreground">
                        {hasScore ? "Fit Score" : "Unscored"}
                      </span>
                    </div>

                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 5. Candidate Slide-Over Drawer */}
        <CandidateDrawer
          candidate={selectedCandidate}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          onCandidateUpdated={(updated) => {
            setSelectedCandidate(updated);
            queryClient.invalidateQueries({ queryKey: ["candidates", openingId] });
          }}
        />

        {/* 6. Screening Questions Modal */}
        <Dialog open={questionsModalOpen} onOpenChange={setQuestionsModalOpen}>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle className="text-base font-bold flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-primary" />
                <span>Screening Questions: {opening.title}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                High-signal questions generated by OpenRouter AI specifically calibrated for this role.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto py-2 text-xs">
              {roleQuestions.map((q, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-lg border bg-muted/20 text-foreground flex items-start gap-2.5"
                >
                  <span className="font-bold font-mono text-primary shrink-0">{idx + 1}.</span>
                  <span className="leading-relaxed">{q}</span>
                </div>
              ))}
            </div>
          </DialogContent>
        </Dialog>

        {/* 7. Edit Candidate Online Links Modal */}
        <Dialog open={linksModalOpen} onOpenChange={setLinksModalOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold flex items-center gap-2">
                <Edit2 className="h-4 w-4 text-primary" />
                <span>Edit Online Profile Links</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Correct or supply verified GitHub, LinkedIn, Kaggle, or portfolio URLs for{" "}
                <span className="font-semibold text-foreground">{targetCandidateForLinks?.name}</span>.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2 text-xs">
              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Github className="h-3.5 w-3.5" />
                  <span>GitHub URL</span>
                </Label>
                <Input
                  value={linksForm.github_url}
                  onChange={(e) => setLinksForm((f) => ({ ...f, github_url: e.target.value }))}
                  placeholder="https://github.com/username"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Linkedin className="h-3.5 w-3.5 text-blue-600" />
                  <span>LinkedIn URL</span>
                </Label>
                <Input
                  value={linksForm.linkedin_url}
                  onChange={(e) => setLinksForm((f) => ({ ...f, linkedin_url: e.target.value }))}
                  placeholder="https://linkedin.com/in/username"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Database className="h-3.5 w-3.5 text-cyan-600" />
                  <span>Kaggle URL</span>
                </Label>
                <Input
                  value={linksForm.kaggle_url}
                  onChange={(e) => setLinksForm((f) => ({ ...f, kaggle_url: e.target.value }))}
                  placeholder="https://kaggle.com/username"
                  className="h-8 text-xs font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Portfolio URL</span>
                </Label>
                <Input
                  value={linksForm.portfolio_url}
                  onChange={(e) => setLinksForm((f) => ({ ...f, portfolio_url: e.target.value }))}
                  placeholder="https://myportfolio.dev"
                  className="h-8 text-xs font-mono"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setLinksModalOpen(false)}
                className="text-xs h-8"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveLinks}
                disabled={updateCandidateMutation.isPending}
                className="text-xs h-8 font-semibold"
              >
                Save Links
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  );
}
