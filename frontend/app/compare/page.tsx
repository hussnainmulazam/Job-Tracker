"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Scale,
  Briefcase,
  Users,
  Check,
  X,
  ExternalLink,
  ShieldAlert,
  Sparkles,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import {
  jobOpeningsApi,
  candidatesApi,
  JobOpening,
  Candidate,
  CandidateStage,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { useToast } from "@/components/ui/use-toast";

const STAGE_LABELS: Record<CandidateStage, string> = {
  applied: "Applied",
  screening: "AI Screening",
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  scheduled: "Scheduled",
  interview: "Interview",
  interviewed: "Interviewed",
  offer: "Offer",
  rejected: "Rejected",
};

export default function CandidateComparePage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("");
  const [candidateAId, setCandidateAId] = useState<string>("");
  const [candidateBId, setCandidateBId] = useState<string>("");

  const [drawerCandidate, setDrawerCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 1. Fetch Job Openings
  const { data: openingsData, isLoading: openingsLoading } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list("active", 100),
  });
  const openings = openingsData?.items || [];

  // Default to first opening if none selected
  const activeOpeningId = selectedOpeningId || openings[0]?.id || "";
  const activeOpening = openings.find((op) => op.id === activeOpeningId);

  // 2. Fetch Candidates for the active opening
  const {
    data: candidatesData,
    isLoading: candidatesLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["candidates", activeOpeningId],
    queryFn: () => candidatesApi.list({ opening_id: activeOpeningId, limit: 100 }),
    enabled: !!activeOpeningId,
  });
  const candidates = candidatesData?.items || [];

  // Select candidates A and B
  const candidateA = useMemo(() => {
    if (candidateAId) {
      return candidates.find((c) => c.id === candidateAId) || null;
    }
    return candidates[0] || null;
  }, [candidates, candidateAId]);

  const candidateB = useMemo(() => {
    if (candidateBId) {
      return candidates.find((c) => c.id === candidateBId) || null;
    }
    return candidates.find((c) => c.id !== candidateA?.id) || candidates[1] || null;
  }, [candidates, candidateBId, candidateA]);

  // Stage mutation
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) =>
      candidatesApi.updateStage(id, stage),
    onSuccess: (updated) => {
      toast({
        title: "Candidate Updated",
        description: `${updated.name} has been moved to ${STAGE_LABELS[updated.stage]}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Action Failed",
        description: err.message || "Failed to update candidate stage.",
        variant: "destructive",
      });
    },
  });

  // Calculate skill intersections
  const commonMatchedSkills = useMemo(() => {
    if (!candidateA || !candidateB) return [];
    return candidateA.matched_skills.filter((s) =>
      candidateB.matched_skills.includes(s)
    );
  }, [candidateA, candidateB]);

  const candidateAUniqueSkills = useMemo(() => {
    if (!candidateA || !candidateB) return [];
    return candidateA.matched_skills.filter(
      (s) => !candidateB.matched_skills.includes(s)
    );
  }, [candidateA, candidateB]);

  const candidateBUniqueSkills = useMemo(() => {
    if (!candidateA || !candidateB) return [];
    return candidateB.matched_skills.filter(
      (s) => !candidateA.matched_skills.includes(s)
    );
  }, [candidateA, candidateB]);

  const scoreDiff = useMemo(() => {
    if (
      candidateA?.score !== null &&
      candidateA?.score !== undefined &&
      candidateB?.score !== null &&
      candidateB?.score !== undefined
    ) {
      return Math.round(candidateA.score - candidateB.score);
    }
    return null;
  }, [candidateA, candidateB]);

  const handleSwapCandidates = () => {
    if (candidateA && candidateB) {
      const aId = candidateA.id;
      const bId = candidateB.id;
      setCandidateAId(bId);
      setCandidateBId(aId);
    }
  };

  return (
    <AppShell title="Candidate Comparison">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <PageHeader
          title="Candidate Comparison"
          description="Side-by-side evaluation of technical fit score rings, unique vs shared skills, AI executive summaries, and CV red flags."
          badge={
            <Badge variant="outline" className="gap-1.5 font-mono text-[11px] px-2.5 py-1">
              <Scale className="h-3 w-3 text-primary" />
              <span>{candidates.length} Profiles in Role</span>
            </Badge>
          }
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="gap-1.5 text-xs font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Refresh Profiles</span>
            </Button>
          }
        />

        {/* Selector Control Bar */}
        <div className="p-4 rounded-xl border border-border/80 dark:border-white/[0.08] bg-card shadow-xs space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Requisition Picker */}
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-primary shrink-0" />
              <label htmlFor="compare-opening-select" className="text-xs font-semibold text-foreground shrink-0">
                Requisition:
              </label>
              <select
                id="compare-opening-select"
                value={activeOpeningId}
                onChange={(e) => {
                  setSelectedOpeningId(e.target.value);
                  setCandidateAId("");
                  setCandidateBId("");
                }}
                className="text-xs font-medium h-8 px-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {openings.map((op) => (
                  <option key={op.id} value={op.id}>
                    {op.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Candidate Pickers & Swap */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Candidate A Picker */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-semibold">Candidate A:</span>
                <select
                  aria-label="Candidate A"
                  value={candidateA?.id || ""}
                  onChange={(e) => setCandidateAId(e.target.value)}
                  className="text-xs font-medium h-8 px-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.score !== null && c.score !== undefined ? `${Math.round(c.score)}%` : "Unscored"})
                    </option>
                  ))}
                </select>
              </div>

              {/* Swap Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSwapCandidates}
                disabled={!candidateA || !candidateB}
                className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                title="Swap Candidate A and B"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
              </Button>

              {/* Candidate B Picker */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-muted-foreground font-semibold">Candidate B:</span>
                <select
                  aria-label="Candidate B"
                  value={candidateB?.id || ""}
                  onChange={(e) => setCandidateBId(e.target.value)}
                  className="text-xs font-medium h-8 px-2.5 rounded-lg border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.score !== null && c.score !== undefined ? `${Math.round(c.score)}%` : "Unscored"})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Loading / Error / Empty States */}
        {candidatesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-[460px] rounded-xl" />
            <Skeleton className="h-[460px] rounded-xl" />
          </div>
        ) : isError ? (
          <ErrorState
            title="Comparison unavailable"
            message={(error as Error)?.message || "Failed to load candidate profiles."}
            onRetry={() => refetch()}
          />
        ) : !candidateA || !candidateB ? (
          <EmptyState
            icon={Scale}
            title="Need At Least 2 Candidates"
            description="You need at least 2 candidates under this requisition to run a side-by-side comparison."
            actionText="Go to Candidate Pipeline"
            onAction={() => (window.location.href = "/pipeline")}
          />
        ) : (
          <div className="space-y-6">
            {/* Score Comparison Differential Banner */}
            {scoreDiff !== null && (
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/[0.04] flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary shrink-0">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      AI Match Differential
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {scoreDiff > 0
                        ? `${candidateA.name} leads by +${scoreDiff}% in technical fit score.`
                        : scoreDiff < 0
                        ? `${candidateB.name} leads by +${Math.abs(scoreDiff)}% in technical fit score.`
                        : "Both candidates have identical technical fit scores."}
                    </p>
                  </div>
                </div>

                <div className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                  {scoreDiff > 0 ? `+${scoreDiff}% Lead` : scoreDiff < 0 ? `+${Math.abs(scoreDiff)}% Lead` : "Tied"}
                </div>
              </div>
            )}

            {/* Side-by-Side Comparison Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Candidate A Column */}
              <Card className="border border-border/80 dark:border-white/[0.08] bg-card shadow-xs rounded-xl flex flex-col justify-between">
                <div>
                  <CardHeader className="pb-4 border-b border-border/70">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ScoreRing score={candidateA.score} size="lg" />
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">
                            {candidateA.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{candidateA.email}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          candidateA.stage === "shortlisted"
                            ? "success"
                            : candidateA.stage === "rejected"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px] capitalize font-semibold"
                      >
                        {STAGE_LABELS[candidateA.stage]}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-4 text-xs">
                    {/* Summary */}
                    <div>
                      <h5 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
                        AI Executive Summary
                      </h5>
                      <p className="text-xs text-foreground leading-relaxed">
                        {candidateA.summary || "No AI evaluation summary available."}
                      </p>
                    </div>

                    {/* Matched Skills */}
                    <div>
                      <h5 className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Matched Skills ({candidateA.matched_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {candidateA.matched_skills.map((s) => (
                          <span
                            key={s}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                              candidateAUniqueSkills.includes(s)
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold"
                                : "bg-muted/60 text-muted-foreground border-border/70"
                            }`}
                          >
                            {s} {candidateAUniqueSkills.includes(s) && "★ Unique"}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Skills */}
                    <div>
                      <h5 className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                        <X className="h-3 w-3" />
                        Missing Skills ({candidateA.missing_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {candidateA.missing_skills.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                          >
                            {s}
                          </span>
                        ))}
                        {candidateA.missing_skills.length === 0 && (
                          <span className="text-[11px] text-muted-foreground italic">None detected</span>
                        )}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {candidateA.red_flags && candidateA.red_flags.length > 0 && (
                      <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                        <h5 className="text-[10px] uppercase font-bold tracking-wider text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Red Flags ({candidateA.red_flags.length})
                        </h5>
                        <ul className="text-xs text-foreground space-y-0.5 pl-3 list-disc">
                          {candidateA.red_flags.map((rf, idx) => (
                            <li key={idx}>{rf}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </div>

                <div className="p-4 border-t border-border/70 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDrawerCandidate(candidateA);
                      setDrawerOpen(true);
                    }}
                    className="text-xs h-8 gap-1.5"
                  >
                    <span>Full Profile</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>

                  <Button
                    size="sm"
                    onClick={() =>
                      stageMutation.mutate({ id: candidateA.id, stage: "shortlisted" })
                    }
                    className="text-xs h-8 font-semibold gap-1.5 shadow-xs"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Shortlist {candidateA.name.split(" ")[0]}</span>
                  </Button>
                </div>
              </Card>

              {/* Candidate B Column */}
              <Card className="border border-border/80 dark:border-white/[0.08] bg-card shadow-xs rounded-xl flex flex-col justify-between">
                <div>
                  <CardHeader className="pb-4 border-b border-border/70">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <ScoreRing score={candidateB.score} size="lg" />
                        <div>
                          <CardTitle className="text-sm font-bold text-foreground">
                            {candidateB.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{candidateB.email}</p>
                        </div>
                      </div>
                      <Badge
                        variant={
                          candidateB.stage === "shortlisted"
                            ? "success"
                            : candidateB.stage === "rejected"
                            ? "destructive"
                            : "outline"
                        }
                        className="text-[10px] capitalize font-semibold"
                      >
                        {STAGE_LABELS[candidateB.stage]}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-4 text-xs">
                    {/* Summary */}
                    <div>
                      <h5 className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
                        AI Executive Summary
                      </h5>
                      <p className="text-xs text-foreground leading-relaxed">
                        {candidateB.summary || "No AI evaluation summary available."}
                      </p>
                    </div>

                    {/* Matched Skills */}
                    <div>
                      <h5 className="text-[10px] uppercase font-bold tracking-wider text-emerald-600 dark:text-emerald-400 mb-1.5 flex items-center gap-1">
                        <Check className="h-3 w-3" />
                        Matched Skills ({candidateB.matched_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {candidateB.matched_skills.map((s) => (
                          <span
                            key={s}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded border ${
                              candidateBUniqueSkills.includes(s)
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 font-semibold"
                                : "bg-muted/60 text-muted-foreground border-border/70"
                            }`}
                          >
                            {s} {candidateBUniqueSkills.includes(s) && "★ Unique"}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Missing Skills */}
                    <div>
                      <h5 className="text-[10px] uppercase font-bold tracking-wider text-amber-600 dark:text-amber-400 mb-1.5 flex items-center gap-1">
                        <X className="h-3 w-3" />
                        Missing Skills ({candidateB.missing_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1">
                        {candidateB.missing_skills.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] font-medium px-2 py-0.5 rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 border border-amber-500/20"
                          >
                            {s}
                          </span>
                        ))}
                        {candidateB.missing_skills.length === 0 && (
                          <span className="text-[11px] text-muted-foreground italic">None detected</span>
                        )}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {candidateB.red_flags && candidateB.red_flags.length > 0 && (
                      <div className="p-3 rounded-lg border border-rose-500/20 bg-rose-500/5">
                        <h5 className="text-[10px] uppercase font-bold tracking-wider text-rose-600 dark:text-rose-400 mb-1 flex items-center gap-1">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Red Flags ({candidateB.red_flags.length})
                        </h5>
                        <ul className="text-xs text-foreground space-y-0.5 pl-3 list-disc">
                          {candidateB.red_flags.map((rf, idx) => (
                            <li key={idx}>{rf}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </CardContent>
                </div>

                <div className="p-4 border-t border-border/70 flex items-center justify-between gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setDrawerCandidate(candidateB);
                      setDrawerOpen(true);
                    }}
                    className="text-xs h-8 gap-1.5"
                  >
                    <span>Full Profile</span>
                    <ExternalLink className="h-3 w-3" />
                  </Button>

                  <Button
                    size="sm"
                    onClick={() =>
                      stageMutation.mutate({ id: candidateB.id, stage: "shortlisted" })
                    }
                    className="text-xs h-8 font-semibold gap-1.5 shadow-xs"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Shortlist {candidateB.name.split(" ")[0]}</span>
                  </Button>
                </div>
              </Card>
            </div>

            {/* ── SKILL MATRIX INTERSECTION ─────────────────────────────────── */}
            <div className="p-5 rounded-xl border border-border/80 dark:border-white/[0.08] bg-card shadow-xs space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-foreground flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <span>Skill Matrix Breakdown: Overlaps vs Differentiators</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                {/* Common Skills */}
                <div className="p-3.5 rounded-lg border border-border/70 bg-muted/20 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground">Common Skills</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {commonMatchedSkills.length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {commonMatchedSkills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-2 py-0.5 rounded bg-muted text-foreground border border-border font-medium"
                      >
                        {s}
                      </span>
                    ))}
                    {commonMatchedSkills.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic">No shared skills.</p>
                    )}
                  </div>
                </div>

                {/* Unique to A */}
                <div className="p-3.5 rounded-lg border border-emerald-500/30 bg-emerald-500/[0.04] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                      Unique to {candidateA.name.split(" ")[0]}
                    </span>
                    <Badge variant="success" className="text-[10px]">
                      {candidateAUniqueSkills.length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {candidateAUniqueSkills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-medium"
                      >
                        {s}
                      </span>
                    ))}
                    {candidateAUniqueSkills.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic">No unique skills.</p>
                    )}
                  </div>
                </div>

                {/* Unique to B */}
                <div className="p-3.5 rounded-lg border border-sky-500/30 bg-sky-500/[0.04] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-sky-700 dark:text-sky-300">
                      Unique to {candidateB.name.split(" ")[0]}
                    </span>
                    <Badge variant="outline" className="text-[10px] border-sky-500/40 text-sky-600">
                      {candidateBUniqueSkills.length}
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {candidateBUniqueSkills.map((s) => (
                      <span
                        key={s}
                        className="text-[10px] px-2 py-0.5 rounded bg-sky-500/15 text-sky-700 dark:text-sky-300 border border-sky-500/30 font-medium"
                      >
                        {s}
                      </span>
                    ))}
                    {candidateBUniqueSkills.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic">No unique skills.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Candidate Detail Drawer */}
      <CandidateDrawer
        candidate={drawerCandidate}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setDrawerCandidate(null);
        }}
      />
    </AppShell>
  );
}
