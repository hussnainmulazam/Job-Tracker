"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Scale,
  Briefcase,
  Users,
  Check,
  X,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Star,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";
import {
  candidatesApi,
  jobOpeningsApi,
  Candidate,
  JobOpening,
  CandidateStage,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { useToast } from "@/components/ui/use-toast";

const STAGE_LABELS: Record<CandidateStage, string> = {
  applied: "Applied",
  screening: "AI Screening",
  interview: "Interview",
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
    queryFn: () => jobOpeningsApi.list(),
  });
  const openings = openingsData?.items || [];

  // Default to first opening if none selected
  const activeOpeningId = selectedOpeningId || openings[0]?.id || "";

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
  const candidateA =
    candidates.find((c) => c.id === candidateAId) || candidates[0] || null;
  const candidateB =
    candidates.find((c) => c.id === candidateBId) ||
    candidates.find((c) => c.id !== candidateA?.id) ||
    candidates[1] ||
    null;

  // Advance stage mutation
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) =>
      candidatesApi.updateStage(id, stage),
    onSuccess: (updated) => {
      toast({
        title: "Candidate Advanced",
        description: `${updated.name} moved to ${STAGE_LABELS[updated.stage]}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  // Calculate skill intersections
  const commonMatchedSkills =
    candidateA && candidateB
      ? candidateA.matched_skills.filter((s) =>
          candidateB.matched_skills.includes(s)
        )
      : [];

  const candidateAUniqueSkills =
    candidateA && candidateB
      ? candidateA.matched_skills.filter(
          (s) => !candidateB.matched_skills.includes(s)
        )
      : [];

  const candidateBUniqueSkills =
    candidateA && candidateB
      ? candidateB.matched_skills.filter(
          (s) => !candidateA.matched_skills.includes(s)
        )
      : [];

  const scoreDiff =
    candidateA?.score !== null &&
    candidateA?.score !== undefined &&
    candidateB?.score !== null &&
    candidateB?.score !== undefined
      ? Math.round(candidateA.score - candidateB.score)
      : null;

  return (
    <AppShell title="Candidate Comparison Studio">
      <div className="space-y-6 pb-12">
        <PageHeader
          title="Candidate Comparison Studio"
          description="Side-by-side evaluation of technical fit score rings, unique vs shared skills, AI executive summaries, and CV red flags."
          badge={
            <Badge variant="primary" className="gap-1 font-mono text-[11px]">
              <Scale className="h-3 w-3" />
              <span>Side-by-Side</span>
            </Badge>
          }
          actions={
            <Button
              size="sm"
              variant="outline"
              onClick={() => refetch()}
              className="gap-1.5"
            >
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span>Refresh Profiles</span>
            </Button>
          }
        />

        {/* Selector Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-xl border border-border/70 dark:border-white/[0.08] bg-card shadow-xs">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary shrink-0" />
            <span className="text-xs font-semibold text-foreground">Target Requisition:</span>
            <select
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

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Candidate A:</span>
              <select
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

            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">vs</span>

            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground font-medium">Candidate B:</span>
              <select
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

        {/* Loading / Error / Empty States */}
        {candidatesLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Skeleton className="h-[500px] rounded-2xl" />
            <Skeleton className="h-[500px] rounded-2xl" />
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
            title="Not Enough Candidates to Compare"
            description="You need at least 2 candidates under this requisition to run a side-by-side comparison."
            actionText="Go to Candidate Pipeline"
            onAction={() => (window.location.href = "/pipeline")}
          />
        ) : (
          <div className="space-y-6">
            {/* Score Comparison Banner */}
            {scoreDiff !== null && (
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <div>
                    <h4 className="text-xs font-bold text-foreground">
                      AI Match Differential
                    </h4>
                    <p className="text-xs text-muted-foreground">
                      {scoreDiff > 0
                        ? `${candidateA.name} leads by +${scoreDiff}% in technical fit score.`
                        : scoreDiff < 0
                        ? `${candidateB.name} leads by +${Math.abs(scoreDiff)}% in technical fit score.`
                        : "Both candidates have identical fit scores."}
                    </p>
                  </div>
                </div>

                <div className="text-xs font-bold px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20">
                  {scoreDiff > 0 ? `+${scoreDiff}%` : `${scoreDiff}%`}
                </div>
              </div>
            )}

            {/* Side-by-Side Comparison Columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Candidate A Column */}
              <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-card rounded-xl flex flex-col justify-between">
                <div>
                  <CardHeader className="pb-4 border-b border-border/70">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ScoreRing score={candidateA.score} size="lg" />
                        <div>
                          <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                            {candidateA.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{candidateA.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize font-medium">
                        {STAGE_LABELS[candidateA.stage]}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-5">
                    {/* Summary */}
                    <div>
                      <h5 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
                        AI Executive Summary
                      </h5>
                      <p className="text-xs text-foreground leading-relaxed">
                        {candidateA.summary || "No AI summary available."}
                      </p>
                    </div>

                    {/* Matched Skills */}
                    <div>
                      <h5 className="text-[10px] uppercase font-semibold tracking-wider text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />
                        Matched Skills ({candidateA.matched_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {candidateA.matched_skills.map((s) => (
                          <span
                            key={s}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                              candidateAUniqueSkills.includes(s)
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 ring-1 ring-emerald-500/20"
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
                      <h5 className="text-[10px] uppercase font-semibold tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                        <X className="h-3.5 w-3.5" />
                        Missing Skills ({candidateA.missing_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {candidateA.missing_skills.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {candidateA.red_flags && candidateA.red_flags.length > 0 && (
                      <div className="p-3.5 rounded-lg border border-destructive/20 bg-destructive/5">
                        <h5 className="text-[10px] uppercase font-semibold tracking-wider text-destructive mb-1 flex items-center gap-1">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Red Flags ({candidateA.red_flags.length})
                        </h5>
                        <ul className="text-xs text-foreground space-y-1 pl-3 list-disc">
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
                      stageMutation.mutate({ id: candidateA.id, stage: "interview" })
                    }
                    className="text-xs h-8 font-medium shadow-xs"
                  >
                    Advance to Interview
                  </Button>
                </div>
              </Card>

              {/* Candidate B Column */}
              <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-card rounded-xl flex flex-col justify-between">
                <div>
                  <CardHeader className="pb-4 border-b border-border/70">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <ScoreRing score={candidateB.score} size="lg" />
                        <div>
                          <CardTitle className="text-base font-semibold tracking-tight text-foreground">
                            {candidateB.name}
                          </CardTitle>
                          <p className="text-xs text-muted-foreground">{candidateB.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs capitalize font-medium">
                        {STAGE_LABELS[candidateB.stage]}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-5 pt-5">
                    {/* Summary */}
                    <div>
                      <h5 className="text-[10px] uppercase font-semibold tracking-wider text-muted-foreground mb-1.5">
                        AI Executive Summary
                      </h5>
                      <p className="text-xs text-foreground leading-relaxed">
                        {candidateB.summary || "No AI summary available."}
                      </p>
                    </div>

                    {/* Matched Skills */}
                    <div>
                      <h5 className="text-[10px] uppercase font-semibold tracking-wider text-emerald-600 dark:text-emerald-400 mb-2 flex items-center gap-1">
                        <Check className="h-3.5 w-3.5" />
                        Matched Skills ({candidateB.matched_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {candidateB.matched_skills.map((s) => (
                          <span
                            key={s}
                            className={`text-[10px] font-medium px-2 py-0.5 rounded-md border ${
                              candidateBUniqueSkills.includes(s)
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 ring-1 ring-emerald-500/20"
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
                      <h5 className="text-[10px] uppercase font-semibold tracking-wider text-amber-600 dark:text-amber-400 mb-2 flex items-center gap-1">
                        <X className="h-3.5 w-3.5" />
                        Missing Skills ({candidateB.missing_skills.length})
                      </h5>
                      <div className="flex flex-wrap gap-1.5">
                        {candidateB.missing_skills.map((s) => (
                          <span
                            key={s}
                            className="text-[10px] font-medium px-2 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Red Flags */}
                    {candidateB.red_flags && candidateB.red_flags.length > 0 && (
                      <div className="p-3.5 rounded-lg border border-destructive/20 bg-destructive/5">
                        <h5 className="text-[10px] uppercase font-semibold tracking-wider text-destructive mb-1 flex items-center gap-1">
                          <ShieldAlert className="h-3.5 w-3.5" />
                          Red Flags ({candidateB.red_flags.length})
                        </h5>
                        <ul className="text-xs text-foreground space-y-1 pl-3 list-disc">
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
                      stageMutation.mutate({ id: candidateB.id, stage: "interview" })
                    }
                    className="text-xs h-8 font-medium shadow-xs"
                  >
                    Advance to Interview
                  </Button>
                </div>
              </Card>
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
