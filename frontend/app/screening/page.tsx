"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Briefcase,
  Users,
  CheckCircle2,
  AlertTriangle,
  MessageSquare,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  ShieldAlert,
  RefreshCw,
} from "lucide-react";
import {
  candidatesApi,
  jobOpeningsApi,
  Candidate,
  JobOpening,
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

export default function ScreeningHubPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [copiedQuestionIdx, setCopiedQuestionIdx] = useState<number | null>(null);
  const [drawerCandidate, setDrawerCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 1. Fetch Candidates
  const { data: candidatesData, isLoading: candidatesLoading, isError, error, refetch } = useQuery({
    queryKey: ["candidates"],
    queryFn: () => candidatesApi.list({ limit: 100 }),
  });
  const candidates = candidatesData?.items || [];

  // Active Candidate
  const activeCandidate =
    candidates.find((c) => c.id === selectedCandidateId) || candidates[0] || null;

  // Screening Mutation
  const scoreMutation = useMutation({
    mutationFn: ({ id, rerun }: { id: string; rerun?: boolean }) =>
      candidatesApi.score(id, rerun),
    onSuccess: (data) => {
      toast({
        title: "Candidate Screened",
        description: `Fit score calculated: ${Math.round(data.score)}%`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Screening Failed",
        description: err.message || "Failed to evaluate candidate with OpenRouter.",
        variant: "destructive",
      });
    },
  });

  // Questions Mutation
  const questionsMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.generateQuestions(id, 5),
    onSuccess: (data) => {
      toast({
        title: "Questions Ready",
        description: `Generated ${data.questions.length} tailored interview questions.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Generation Failed",
        description: err.message || "Could not generate interview questions.",
        variant: "destructive",
      });
    },
  });

  const handleCopyQuestion = (q: string, idx: number) => {
    navigator.clipboard.writeText(q);
    setCopiedQuestionIdx(idx);
    setTimeout(() => setCopiedQuestionIdx(null), 2000);
    toast({ title: "Copied", description: "Question copied to clipboard." });
  };

  return (
    <AppShell title="AI Screening Studio">
      <div className="space-y-6 pb-12">
        <PageHeader
          title="AI Candidate Screening & Question Studio"
          description="Automated qualification scoring, matched skills vs gaps analysis, and targeted interview question generation."
          badge={
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>OpenRouter AI</span>
            </Badge>
          }
          actions={
            activeCandidate ? (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setDrawerCandidate(activeCandidate);
                    setDrawerOpen(true);
                  }}
                  className="gap-1.5"
                >
                  <span>Candidate Drawer</span>
                  <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                </Button>

                {activeCandidate.score !== null && activeCandidate.score !== undefined ? (
                  <Button
                    id="btn-rerun-screen"
                    size="sm"
                    onClick={() => scoreMutation.mutate({ id: activeCandidate.id, rerun: true })}
                    disabled={scoreMutation.isPending}
                    className="font-medium gap-1.5 shadow-xs"
                  >
                    {scoreMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    <span>Re-evaluate</span>
                  </Button>
                ) : (
                  <Button
                    id="btn-run-screen"
                    size="sm"
                    onClick={() => scoreMutation.mutate({ id: activeCandidate.id, rerun: false })}
                    disabled={scoreMutation.isPending}
                    className="font-medium gap-1.5 shadow-xs"
                  >
                    {scoreMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    <span>Run AI Screen</span>
                  </Button>
                )}
              </div>
            ) : undefined
          }
        >
          {/* Candidate Selector */}
          <div className="flex items-center gap-2 pt-1">
            <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-medium text-muted-foreground">Select Candidate:</span>
            <select
              value={activeCandidate?.id || ""}
              onChange={(e) => setSelectedCandidateId(e.target.value)}
              className="text-xs font-semibold h-8 px-2.5 rounded-md border border-border/80 bg-card focus:outline-none focus:ring-1 focus:ring-primary min-w-[240px] cursor-pointer"
            >
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.opening_title ? `— ${c.opening_title}` : ""}
                </option>
              ))}
            </select>
          </div>
        </PageHeader>

        {/* Body */}
        {candidatesLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 rounded-2xl" />
            <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          </div>
        ) : isError ? (
          <ErrorState
            title="Screening studio unavailable"
            message={(error as Error)?.message || "Failed to load candidate list."}
            onRetry={() => refetch()}
          />
        ) : !activeCandidate ? (
          <EmptyState
            icon={Sparkles}
            title="No Candidates to Screen"
            description="Add candidate profiles or upload resume PDFs in the pipeline to run AI screening."
            actionText="Go to Pipeline"
            onAction={() => (window.location.href = "/pipeline")}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left Card: Score Ring & Highlights */}
            <Card className="border border-border bg-card shadow-xs flex flex-col justify-between">
              <CardHeader className="text-center pb-4">
                <div className="mx-auto mb-3">
                  <ScoreRing score={activeCandidate.score} size="xl" />
                </div>
                <CardTitle className="text-lg font-bold text-foreground">
                  {activeCandidate.name}
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  {activeCandidate.email}
                  {activeCandidate.opening_title && ` • ${activeCandidate.opening_title}`}
                </CardDescription>
              </CardHeader>

              <CardContent className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-border/60">
                  <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                    <span className="text-xs font-black text-emerald-600 dark:text-emerald-400 block">
                      {activeCandidate.matched_skills.length}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">
                      Matched
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <span className="text-xs font-black text-amber-600 dark:text-amber-400 block">
                      {activeCandidate.missing_skills.length}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">
                      Missing
                    </span>
                  </div>

                  <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/20">
                    <span className="text-xs font-black text-rose-600 dark:text-rose-400 block">
                      {activeCandidate.red_flags.length}
                    </span>
                    <span className="text-[10px] text-muted-foreground uppercase font-bold">
                      Red Flags
                    </span>
                  </div>
                </div>

                {activeCandidate.summary && (
                  <div className="p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-xs text-foreground leading-relaxed">
                    <span className="font-bold text-primary block mb-1 uppercase tracking-wider text-[10px]">
                      AI Summary
                    </span>
                    {activeCandidate.summary}
                  </div>
                )}
              </CardContent>

              <div className="p-4 border-t border-border/60">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => questionsMutation.mutate(activeCandidate.id)}
                  disabled={questionsMutation.isPending}
                  className="w-full text-xs font-semibold gap-1.5"
                >
                  {questionsMutation.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <MessageSquare className="h-3.5 w-3.5" />
                  )}
                  Generate Interview Questions
                </Button>
              </div>
            </Card>

            {/* Right Card: Skills Breakdown & Interview Questions */}
            <div className="lg:col-span-2 space-y-6">
              {/* Matched & Missing Skills Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className="border border-border bg-card shadow-2xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4" />
                      Matched Skills ({activeCandidate.matched_skills.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {activeCandidate.matched_skills.map((s) => (
                        <span
                          key={s}
                          className="text-xs font-semibold px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                        >
                          {s}
                        </span>
                      ))}
                      {activeCandidate.matched_skills.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">
                          No matched skills yet.
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <Card className="border border-border bg-card shadow-2xs">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4" />
                      Missing Skills ({activeCandidate.missing_skills.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {activeCandidate.missing_skills.map((s) => (
                        <span
                          key={s}
                          className="text-xs font-semibold px-2.5 py-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                        >
                          {s}
                        </span>
                      ))}
                      {activeCandidate.missing_skills.length === 0 && (
                        <span className="text-xs text-muted-foreground italic">
                          No missing skill gaps detected.
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Red Flags Alert if present */}
              {activeCandidate.red_flags.length > 0 && (
                <div className="p-4 rounded-xl border border-rose-500/30 bg-rose-500/5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Potential Red Flags Identified by AI
                  </h4>
                  <ul className="space-y-1 text-xs text-foreground pl-4 list-disc">
                    {activeCandidate.red_flags.map((flag, idx) => (
                      <li key={idx}>{flag}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Questions List (if generated) */}
              {questionsMutation.data?.questions && (
                <Card className="border border-border bg-card shadow-2xs">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 text-primary" />
                      Tailored Screening Questions
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {questionsMutation.data.questions.map((q, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-lg border border-border bg-muted/20 flex items-start justify-between gap-3 text-xs group"
                      >
                        <div className="flex items-start gap-2.5">
                          <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                            {idx + 1}
                          </span>
                          <p className="font-medium text-foreground leading-relaxed">{q}</p>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleCopyQuestion(q, idx)}
                          className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          title="Copy question"
                        >
                          {copiedQuestionIdx === idx ? (
                            <Check className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}
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
