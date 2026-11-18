"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Briefcase,
  Plus,
  Sparkles,
  Download,
  Users,
  Search,
  RefreshCw,
  ExternalLink,
  Trash2,
  Edit2,
  CheckCircle2,
  MessageSquare,
  AlertCircle,
  Loader2,
} from "lucide-react";
import {
  jobOpeningsApi,
  JobOpening,
  JobOpeningStatus,
  BulkScoreResponse,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateOpeningDialog } from "@/components/openings/create-opening-dialog";
import { EditOpeningDialog } from "@/components/openings/edit-opening-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import { ScoreRing } from "@/components/ui/score-ring";

const STATUS_BADGES: Record<JobOpeningStatus, { label: string; class: string }> = {
  active: { label: "Active", class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  draft: { label: "Draft", class: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20" },
  paused: { label: "Paused", class: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  closed: { label: "Closed", class: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
};

export default function JobOpeningsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingOpening, setEditingOpening] = useState<JobOpening | null>(null);

  // Bulk Score Modal state
  const [bulkScoreResult, setBulkScoreResult] = useState<BulkScoreResponse | null>(null);
  const [bulkScoreModalOpen, setBulkScoreModalOpen] = useState(false);

  // Screening Questions Modal state
  const [roleQuestions, setRoleQuestions] = useState<string[]>([]);
  const [roleQuestionsModalOpen, setRoleQuestionsModalOpen] = useState(false);
  const [roleQuestionsOpeningTitle, setRoleQuestionsOpeningTitle] = useState("");

  // 1. Fetch Openings
  const {
    data: openingsData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["job-openings", statusFilter],
    queryFn: () =>
      jobOpeningsApi.list(statusFilter !== "all" ? statusFilter : undefined),
  });
  const openings = openingsData?.items || [];

  // Bulk Score Mutation
  const bulkScoreMutation = useMutation({
    mutationFn: (id: string) => jobOpeningsApi.bulkScore(id),
    onSuccess: (data) => {
      setBulkScoreResult(data);
      setBulkScoreModalOpen(true);
      toast({
        title: "Bulk Scoring Complete",
        description: `Ranked ${data.ranked_candidates.length} candidate(s) for "${data.opening_title}".`,
      });
      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Bulk Scoring Failed",
        description: err.message || "Could not score candidates.",
        variant: "destructive",
      });
    },
  });

  // Role Questions Mutation
  const questionsMutation = useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      jobOpeningsApi.generateQuestions(id, 5),
    onSuccess: (data, vars) => {
      setRoleQuestions(data.questions);
      setRoleQuestionsOpeningTitle(vars.title);
      setRoleQuestionsModalOpen(true);
    },
    onError: (err: any) => {
      toast({
        title: "Questions Failed",
        description: err.message || "Failed to generate screening questions.",
        variant: "destructive",
      });
    },
  });

  // Delete Mutation
  const deleteMutation = useMutation({
    mutationFn: (id: string) => jobOpeningsApi.delete(id),
    onSuccess: () => {
      toast({ title: "Opening Deleted", description: "Requisition removed successfully." });
      queryClient.invalidateQueries({ queryKey: ["job-openings"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Delete Failed",
        description: err.message || "Could not delete requisition.",
        variant: "destructive",
      });
    },
  });

  const filteredOpenings = openings.filter((op) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      op.title.toLowerCase().includes(q) ||
      op.description.toLowerCase().includes(q) ||
      op.required_skills.some((s) => s.toLowerCase().includes(q))
    );
  });

  const handleExportShortlist = (id: string) => {
    const url = jobOpeningsApi.getShortlistExportUrl(id);
    window.open(url, "_blank");
  };

  return (
    <AppShell
      title="Job Requisitions"
      actions={
        <Button
          size="sm"
          onClick={() => setCreateDialogOpen(true)}
          className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
        >
          <Plus className="h-3.5 w-3.5" />
          <span>New Requisition</span>
        </Button>
      }
    >
      <div className="space-y-6 pb-8">
        {/* Filter & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5 flex-1 max-w-xl">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search requisitions or skills..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 bg-card"
              />
            </div>

            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-lg border border-border">
              {["all", "active", "draft", "paused", "closed"].map((st) => (
                <button
                  key={st}
                  onClick={() => setStatusFilter(st)}
                  className={`text-xs capitalize font-medium px-2.5 py-1 rounded-md transition-colors ${
                    statusFilter === st
                      ? "bg-background text-foreground shadow-2xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            className="text-xs h-8 gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border border-border">
                <CardHeader className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-3 w-64" />
                </CardHeader>
                <CardContent className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-6 w-3/4" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="Could not load requisitions"
            message={(error as Error)?.message || "Failed to query database."}
            onRetry={() => refetch()}
          />
        ) : filteredOpenings.length === 0 ? (
          <EmptyState
            icon={Briefcase}
            title="No Job Requisitions Found"
            description="Create job openings with defined skills so our OpenRouter AI can score and rank candidates automatically."
            actionText="Create Requisition"
            onAction={() => setCreateDialogOpen(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOpenings.map((op) => (
              <Card
                key={op.id}
                className="border border-border bg-card shadow-2xs hover:shadow-sm transition-shadow flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <Link href={`/openings/${op.id}`}>
                        <CardTitle className="text-base font-bold text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5">
                          <span>{op.title}</span>
                          <ExternalLink className="h-3.5 w-3.5 opacity-60" />
                        </CardTitle>
                      </Link>
                      <CardDescription className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                        {op.description}
                      </CardDescription>
                    </div>

                    <Badge
                      variant="outline"
                      className={`capitalize text-[10px] font-semibold shrink-0 border ${
                        STATUS_BADGES[op.status]?.class || ""
                      }`}
                    >
                      {STATUS_BADGES[op.status]?.label || op.status}
                    </Badge>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Required Skills & Experience */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                        Target Skills ({op.required_skills.length})
                      </span>
                      {op.years_of_experience !== undefined && op.years_of_experience !== null && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          Min Exp: {op.years_of_experience} yrs
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {op.required_skills.map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Metadata and Candidate Count */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/60">
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {op.candidates_count || 0} candidate{(op.candidates_count || 0) === 1 ? "" : "s"}
                    </span>
                    <span className="text-[11px]">
                      Created {new Date(op.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Requisition Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2">
                    <Link href={`/openings/${op.id}`}>
                      <Button
                        size="sm"
                        variant="default"
                        className="text-xs h-7 font-semibold gap-1 shadow-2xs"
                      >
                        <Sparkles className="h-3 w-3" />
                        <span>Match & Rank</span>
                      </Button>
                    </Link>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleExportShortlist(op.id)}
                      className="text-xs h-7 gap-1"
                    >
                      <Download className="h-3 w-3" />
                      Shortlist CSV
                    </Button>

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        questionsMutation.mutate({ id: op.id, title: op.title })
                      }
                      disabled={questionsMutation.isPending}
                      className="text-xs h-7 gap-1"
                    >
                      <MessageSquare className="h-3 w-3" />
                      Questions
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditingOpening(op)}
                      className="text-xs h-7 w-7 p-0 text-muted-foreground hover:text-foreground ml-auto"
                      title="Edit Requisition"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        if (confirm(`Delete requisition "${op.title}" and its candidates?`)) {
                          deleteMutation.mutate(op.id);
                        }
                      }}
                      className="text-xs h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      title="Delete Requisition"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Create Opening Dialog */}
      <CreateOpeningDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
      />

      {/* Edit Opening Dialog */}
      <EditOpeningDialog
        opening={editingOpening}
        open={!!editingOpening}
        onClose={() => setEditingOpening(null)}
      />

      {/* Bulk Scoring Results Dialog */}
      <Dialog open={bulkScoreModalOpen} onOpenChange={setBulkScoreModalOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Ranked Candidate Shortlist
            </DialogTitle>
            <DialogDescription className="text-xs">
              AI screened {bulkScoreResult?.total_candidates} candidate(s) for &ldquo;{bulkScoreResult?.opening_title}&rdquo; ranked by match fit score.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2">
            {bulkScoreResult?.ranked_candidates && bulkScoreResult.ranked_candidates.length > 0 ? (
              bulkScoreResult.ranked_candidates.map((cand, idx) => (
                <div
                  key={cand.candidate_id}
                  className="p-3.5 rounded-xl border border-border bg-card/60 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <ScoreRing score={cand.score} size="sm" />
                    <div>
                      <p className="font-bold text-xs text-foreground">
                        {cand.candidate_name}
                      </p>
                      <p className="text-[11px] text-muted-foreground line-clamp-1">
                        {cand.summary}
                      </p>
                    </div>
                  </div>

                  <Link href={`/pipeline?candidate_id=${cand.candidate_id}`}>
                    <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                      <span>View</span>
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </Link>
                </div>
              ))
            ) : (
              <p className="text-xs text-muted-foreground text-center py-6">
                No candidates available to rank for this opening.
              </p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Role Questions Dialog */}
      <Dialog open={roleQuestionsModalOpen} onOpenChange={setRoleQuestionsModalOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              Screening Questions: {roleQuestionsOpeningTitle}
            </DialogTitle>
            <DialogDescription className="text-xs">
              AI-formulated questions tailored to probe the core requirements of this requisition.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2.5 py-2">
            {roleQuestions.map((q, idx) => (
              <div
                key={idx}
                className="p-3 rounded-lg border border-border bg-muted/20 text-xs font-medium text-foreground flex items-start gap-2.5"
              >
                <span className="h-4 w-4 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                  {idx + 1}
                </span>
                <span>{q}</span>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
