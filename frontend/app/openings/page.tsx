"use client";

import React, { useState, useMemo } from "react";
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
  LayoutGrid,
  Table as TableIcon,
  X,
  FileSpreadsheet,
} from "lucide-react";
import {
  jobOpeningsApi,
  JobOpening,
  JobOpeningStatus,
  BulkScoreResponse,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  active: {
    label: "Active",
    class: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  },
  draft: {
    label: "Draft",
    class: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20",
  },
  paused: {
    label: "Paused",
    class: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  },
  closed: {
    label: "Closed",
    class: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
  },
};

export default function JobOpeningsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
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
      jobOpeningsApi.list(statusFilter !== "all" ? statusFilter : undefined, 100),
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

  const filteredOpenings = useMemo(() => {
    return openings.filter((op) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        op.title.toLowerCase().includes(q) ||
        op.description.toLowerCase().includes(q) ||
        op.required_skills.some((s) => s.toLowerCase().includes(q))
      );
    });
  }, [openings, searchQuery]);

  const activeCount = useMemo(() => {
    return openings.filter((op) => op.status === "active").length;
  }, [openings]);

  const handleExportShortlist = (id: string) => {
    const url = jobOpeningsApi.getShortlistExportUrl(id);
    window.open(url, "_blank");
  };

  return (
    <AppShell title="Job Requisitions">
      <div className="space-y-6 pb-16">
        {/* Page Header */}
        <PageHeader
          title="Job Requisitions"
          description="Manage open positions, target technical qualifications, and monitor applicant pipelines."
          badge={
            <Badge variant="outline" className="gap-1.5 font-mono text-[11px] px-2.5 py-1">
              <Briefcase className="h-3 w-3 text-primary" />
              <span>{activeCount} Active Openings</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5 text-xs font-medium"
              >
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Button
                size="sm"
                onClick={() => setCreateDialogOpen(true)}
                className="gap-1.5 text-xs font-semibold shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Requisition</span>
              </Button>
            </div>
          }
        />

        {/* Filters & View Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border/70 text-xs overflow-x-auto">
            {["all", "active", "draft", "paused", "closed"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 rounded-md font-medium capitalize transition shrink-0 ${
                  statusFilter === st
                    ? "bg-background text-foreground shadow-xs font-semibold"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          {/* Search Bar & View Toggle */}
          <div className="flex items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search openings, skills..."
                className="w-full bg-background border border-input rounded-lg pl-9 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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

            {/* View Mode Toggle */}
            <div className="flex items-center p-0.5 rounded-lg border border-border/70 bg-muted/40">
              <button
                onClick={() => setViewMode("grid")}
                className={`p-1.5 rounded-md text-xs transition ${
                  viewMode === "grid"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Grid Cards View"
              >
                <LayoutGrid className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode("table")}
                className={`p-1.5 rounded-md text-xs transition ${
                  viewMode === "table"
                    ? "bg-background text-foreground shadow-2xs"
                    : "text-muted-foreground hover:text-foreground"
                }`}
                title="Table View"
              >
                <TableIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Card key={i} className="border border-border/70 p-4 space-y-3">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-4 w-full" />
                <div className="flex gap-1.5">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-16" />
                </div>
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
            title={searchQuery ? "No matching requisitions" : "No Job Requisitions Found"}
            description={
              searchQuery
                ? `No job openings matched "${searchQuery}". Clear your search or change the status filter.`
                : "Create job openings with defined skills so our AI can score and rank candidates automatically."
            }
            actionText={searchQuery ? "Clear Search" : "New Requisition"}
            onAction={() => {
              if (searchQuery) setSearchQuery("");
              else setCreateDialogOpen(true);
            }}
          />
        ) : viewMode === "grid" ? (
          /* ── GRID CARDS VIEW ─────────────────────────────────────────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredOpenings.map((op) => (
              <Card
                key={op.id}
                className="border border-border/80 dark:border-white/[0.08] bg-card shadow-xs hover:shadow-card-hover transition-all flex flex-col justify-between"
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <Link href={`/openings/${op.id}`}>
                        <CardTitle className="text-sm font-bold text-foreground hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5 group">
                          <span>{op.title}</span>
                          <ExternalLink className="h-3 w-3 opacity-0 group-hover:opacity-70 transition-opacity" />
                        </CardTitle>
                      </Link>
                      <CardDescription className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
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
                      <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                        Target Skills ({op.required_skills.length})
                      </span>
                      {op.years_of_experience !== undefined && op.years_of_experience !== null && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          Min: {op.years_of_experience} yrs
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {op.required_skills.slice(0, 6).map((s) => (
                        <span
                          key={s}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                        >
                          {s}
                        </span>
                      ))}
                      {op.required_skills.length > 6 && (
                        <span className="text-[10px] text-muted-foreground font-mono self-center">
                          +{op.required_skills.length - 6} more
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Metadata and Candidate Count */}
                  <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 border-t border-border/60">
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <Users className="h-3.5 w-3.5 text-primary" />
                      {op.candidates_count || 0} candidate{(op.candidates_count || 0) === 1 ? "" : "s"}
                    </span>
                    <span className="text-[11px] font-mono">
                      Created {new Date(op.created_at).toLocaleDateString()}
                    </span>
                  </div>

                  {/* Requisition Action Buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-border/40">
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
                      <span>CSV</span>
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
                      <span>Questions</span>
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
        ) : (
          /* ── TABLE VIEW ─────────────────────────────────────────────────── */
          <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/80 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                    <th className="py-3 px-4 min-w-[200px]">Requisition Title</th>
                    <th className="py-3 px-3 w-28">Status</th>
                    <th className="py-3 px-3 min-w-[220px]">Required Skills</th>
                    <th className="py-3 px-3 w-28 text-center">Candidates</th>
                    <th className="py-3 px-3 w-32">Created</th>
                    <th className="py-3 px-4 text-right min-w-[180px]">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {filteredOpenings.map((op) => (
                    <tr key={op.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/openings/${op.id}`}>
                          <span className="font-semibold text-foreground hover:text-primary transition-colors cursor-pointer block">
                            {op.title}
                          </span>
                        </Link>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                          {op.description}
                        </p>
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant="outline"
                          className={`capitalize text-[10px] font-semibold border ${
                            STATUS_BADGES[op.status]?.class || ""
                          }`}
                        >
                          {STATUS_BADGES[op.status]?.label || op.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-3">
                        <div className="flex flex-wrap gap-1 max-w-[260px]">
                          {op.required_skills.slice(0, 3).map((s) => (
                            <span
                              key={s}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-primary/10 text-primary border border-primary/20"
                            >
                              {s}
                            </span>
                          ))}
                          {op.required_skills.length > 3 && (
                            <span className="text-[10px] text-muted-foreground font-mono self-center">
                              +{op.required_skills.length - 3}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="font-bold text-foreground">
                          {op.candidates_count || 0}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-muted-foreground">
                        {new Date(op.created_at).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/openings/${op.id}`}>
                            <Button size="sm" variant="outline" className="h-7 text-[11px] px-2 gap-1">
                              <Sparkles className="w-3 h-3 text-primary" />
                              <span>Rank</span>
                            </Button>
                          </Link>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingOpening(op)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Edit"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              if (confirm(`Delete requisition "${op.title}"?`)) {
                                deleteMutation.mutate(op.id);
                              }
                            }}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
            <DialogTitle className="text-sm font-bold flex items-center gap-2 text-foreground">
              <Sparkles className="h-4 w-4 text-primary" />
              <span>Ranked Candidate Shortlist</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              AI screened {bulkScoreResult?.total_candidates} candidate(s) for &ldquo;{bulkScoreResult?.opening_title}&rdquo; ranked by match fit score.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-2.5 py-2">
            {bulkScoreResult?.ranked_candidates && bulkScoreResult.ranked_candidates.length > 0 ? (
              bulkScoreResult.ranked_candidates.map((cand, idx) => (
                <div
                  key={cand.candidate_id}
                  className="p-3 rounded-lg border border-border bg-card/60 flex items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <ScoreRing score={cand.score} size="sm" />
                    <div>
                      <p className="font-semibold text-foreground">
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
            <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-primary" />
              <span>Screening Questions: {roleQuestionsOpeningTitle}</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              AI-formulated questions tailored to probe the core requirements of this requisition.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 py-2">
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
