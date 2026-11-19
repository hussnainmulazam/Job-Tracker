"use client";

import React, { useState, useEffect } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
  closestCenter,
} from "@dnd-kit/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  Search,
  RefreshCw,
  Briefcase,
  X,
  Filter,
  Download,
  Users,
  History,
} from "lucide-react";

import {
  Candidate,
  CandidateStage,
  candidatesApi,
  jobOpeningsApi,
  JobOpening,
  API_BASE_URL,
  getAuthToken,
} from "@/lib/api";
import { useToast } from "@/components/ui/use-toast";
import { PIPELINE_COLUMNS, PipelineStage } from "./types";
import { KanbanColumn } from "./kanban-column";
import { KanbanCard } from "./kanban-card";
import { PipelineAuditDrawer } from "./pipeline-audit-drawer";
import { BulkActionsToolbar } from "./bulk-actions-toolbar";
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";

interface KanbanBoardProps {
  defaultSelectedCandidateId?: string;
}

export function KanbanBoard({ defaultSelectedCandidateId }: KanbanBoardProps = {}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("all");
  const [mobileSelectedStage, setMobileSelectedStage] = useState<string>("all");

  // Dialog & Drawer States
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [auditDrawerOpen, setAuditDrawerOpen] = useState(false);

  // Bulk Selection States
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);

  const handleToggleSelect = (candidateId: string, e: React.MouseEvent) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(candidateId) ? prev.filter((id) => id !== candidateId) : [...prev, candidateId]
    );
  };

  const handleClearSelection = () => {
    setSelectedCandidateIds([]);
  };

  // Active dragging item for DragOverlay
  const [activeCandidate, setActiveCandidate] = useState<Candidate | null>(null);

  // Configure Sensors (5px threshold prevents accidental drag on normal clicks)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // 1. Fetch Job Openings for filtering
  const { data: openingsData } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list(),
  });
  const openings = openingsData?.items || [];

  // 2. Fetch Candidates
  const {
    data: candidatesData,
    isLoading,
    isRefetching,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["candidates", selectedOpeningId],
    queryFn: () =>
      candidatesApi.list({
        opening_id: selectedOpeningId !== "all" ? selectedOpeningId : undefined,
        limit: 100,
      }),
  });
  const candidates = candidatesData?.items || [];

  // Open drawer if default candidate passed
  useEffect(() => {
    if (defaultSelectedCandidateId && candidates.length > 0) {
      const match = candidates.find((c) => c.id === defaultSelectedCandidateId);
      if (match) {
        setSelectedCandidate(match);
        setDrawerOpen(true);
      }
    }
  }, [defaultSelectedCandidateId, candidates]);

  // 3. Stage Update Mutation with Optimistic Updates & Toast
  const updateStageMutation = useMutation({
    mutationFn: async ({
      id,
      stage,
      candidateName,
    }: {
      id: string;
      stage: CandidateStage;
      candidateName: string;
    }) => {
      return candidatesApi.updateStage(id, stage);
    },
    onMutate: async ({ id, stage }) => {
      await queryClient.cancelQueries({ queryKey: ["candidates"] });
      const previous = queryClient.getQueryData(["candidates", selectedOpeningId]);

      queryClient.setQueryData(
        ["candidates", selectedOpeningId],
        (old: { items: Candidate[]; total: number } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.map((item) =>
              item.id === id ? { ...item, stage } : item
            ),
          };
        }
      );

      return { previous };
    },
    onError: (err: any, variables, context: any) => {
      if (context?.previous) {
        queryClient.setQueryData(["candidates", selectedOpeningId], context.previous);
      }
      toast({
        title: "Stage update failed",
        description: err.message || "Could not move candidate.",
        variant: "destructive",
      });
    },
    onSuccess: (updated) => {
      toast({
        title: "Candidate Moved",
        description: `${updated.name} transitioned to ${updated.stage}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
  });

  // Drag Handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const found = candidates.find((c) => c.id === active.id);
    if (found) {
      setActiveCandidate(found);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCandidate(null);

    if (!over) return;

    const candidateId = active.id as string;
    const currentCandidate = candidates.find((c) => c.id === candidateId);
    if (!currentCandidate) return;

    let targetStage: PipelineStage | null = null;

    if (PIPELINE_COLUMNS.some((col) => col.id === over.id)) {
      targetStage = over.id as PipelineStage;
    } else {
      const overCandidate = candidates.find((c) => c.id === over.id);
      if (overCandidate) {
        targetStage = overCandidate.stage;
      }
    }

    if (targetStage && targetStage !== currentCandidate.stage) {
      updateStageMutation.mutate({
        id: candidateId,
        stage: targetStage,
        candidateName: currentCandidate.name,
      });
    }
  };

  // Filter candidates by search term
  const filteredCandidates = candidates.filter((cand) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      cand.name.toLowerCase().includes(q) ||
      cand.email.toLowerCase().includes(q) ||
      (cand.opening_title && cand.opening_title.toLowerCase().includes(q)) ||
      (cand.matched_skills && cand.matched_skills.some((s) => s.toLowerCase().includes(q)))
    );
  });

  // Shortlist CSV Export Download with Bearer Authentication
  const handleExportShortlist = async () => {
    const targetOpeningId =
      selectedOpeningId && selectedOpeningId !== "all"
        ? selectedOpeningId
        : openings[0]?.id;

    if (!targetOpeningId) {
      toast({
        title: "No Openings Available",
        description: "Create a job opening before exporting candidate shortlists.",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = getAuthToken();
      const res = await fetch(
        `${API_BASE_URL}/api/v1/job-openings/${targetOpeningId}/shortlist/export`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!res.ok) {
        throw new Error(`Export failed with status ${res.status}`);
      }
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = `shortlist_${targetOpeningId}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
      toast({
        title: "Export Completed",
        description: "Candidate shortlist CSV downloaded successfully.",
      });
    } catch (err: any) {
      toast({
        title: "Export Failed",
        description: err.message || "Failed to download shortlist CSV.",
        variant: "destructive",
      });
    }
  };

  const handleBulkMoveStage = async (stage: CandidateStage) => {
    if (selectedCandidateIds.length === 0) return;
    setIsBulkProcessing(true);
    try {
      const res = await candidatesApi.bulkStage(selectedCandidateIds, stage);
      toast({
        title: "Bulk Stage Update",
        description: res.message,
      });
      setSelectedCandidateIds([]);
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs-recent"] });
    } catch (err: any) {
      toast({
        title: "Bulk update failed",
        description: err.message || "Could not move candidates.",
        variant: "destructive",
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCandidateIds.length === 0) return;
    if (
      !confirm(
        `Are you sure you want to permanently delete ${selectedCandidateIds.length} candidate(s)?`
      )
    )
      return;

    setIsBulkProcessing(true);
    try {
      const res = await candidatesApi.bulkDelete(selectedCandidateIds);
      toast({
        title: "Candidates Deleted",
        description: res.message,
      });
      setSelectedCandidateIds([]);
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["audit-logs-recent"] });
    } catch (err: any) {
      toast({
        title: "Bulk delete failed",
        description: err.message || "Could not delete candidates.",
        variant: "destructive",
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleBulkScore = async () => {
    if (selectedCandidateIds.length === 0) return;
    setIsBulkProcessing(true);
    try {
      let scored = 0;
      for (const cid of selectedCandidateIds) {
        await candidatesApi.score(cid);
        scored++;
      }
      toast({
        title: "Bulk AI Scoring Finished",
        description: `Successfully scored ${scored} candidate(s).`,
      });
      setSelectedCandidateIds([]);
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    } catch (err: any) {
      toast({
        title: "Scoring Error",
        description: err.message || "Failed to complete AI scoring.",
        variant: "destructive",
      });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-7.5rem)] w-full space-y-4">
      {/* ── Page Header & Controls ─────────────────────────────────── */}
      <PageHeader
        title="Candidate Pipeline"
        description="Visual Kanban workflow across Applied, Screening, Interview, Offer, and Rejected stages."
        badge={
          <Badge variant="outline" className="gap-1 font-mono text-[11px]">
            <Users className="h-3 w-3 text-primary" />
            <span>{filteredCandidates.length} Candidates</span>
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              id="btn-open-audit-drawer"
              variant="outline"
              size="sm"
              onClick={() => setAuditDrawerOpen(true)}
              className="gap-1.5"
              title="View Pipeline Audit Trail"
            >
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Audit Trail</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportShortlist}
              className="gap-1.5"
              title="Download Shortlist CSV"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export CSV</span>
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isRefetching}
              className="h-8 w-8 p-0"
              title="Refresh pipeline"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRefetching ? "animate-spin" : ""}`} />
            </Button>

            <Button
              size="sm"
              onClick={() => setAddDialogOpen(true)}
              className="font-medium gap-1.5 shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>Add Candidate</span>
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-2.5 max-w-3xl">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Filter by name, email, or skill..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 text-xs h-8 bg-card"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Opening Switcher */}
          <div className="flex items-center gap-1.5">
            <Briefcase className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <select
              value={selectedOpeningId}
              onChange={(e) => setSelectedOpeningId(e.target.value)}
              className="text-xs h-8 px-2.5 rounded-md border border-border/80 bg-card font-medium focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
            >
              <option value="all">All Requisitions ({openings.length})</option>
              {openings.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.title}
                </option>
              ))}
            </select>
          </div>
        </div>
      </PageHeader>

      {/* ── Mobile Column Tab Switcher ──────────────────────────────── */}
      <div className="flex lg:hidden gap-1 mb-3 overflow-x-auto pb-1 shrink-0">
        <Button
          variant={mobileSelectedStage === "all" ? "default" : "outline"}
          size="sm"
          onClick={() => setMobileSelectedStage("all")}
          className="text-xs h-7 shrink-0"
        >
          All Stages
        </Button>
        {PIPELINE_COLUMNS.map((col) => (
          <Button
            key={col.id}
            variant={mobileSelectedStage === col.id ? "default" : "outline"}
            size="sm"
            onClick={() => setMobileSelectedStage(col.id)}
            className="text-xs h-7 shrink-0 gap-1"
          >
            <span className={`h-1.5 w-1.5 rounded-full ${col.dotColor}`} />
            {col.title}
          </Button>
        ))}
      </div>

      {/* ── Kanban Grid Body ────────────────────────────────────────── */}
      <div className="flex-1 min-h-0">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 h-full">
            {PIPELINE_COLUMNS.map((col) => (
              <div
                key={col.id}
                className="flex flex-col h-full rounded-2xl border border-border/60 bg-card/30 p-3 space-y-3"
              >
                <div className="flex items-center justify-between pb-2 border-b border-border/40">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-6 rounded-full" />
                </div>
                <Skeleton className="h-28 w-full rounded-xl" />
                <Skeleton className="h-28 w-full rounded-xl" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <ErrorState
            title="Failed to load pipeline"
            message={(error as Error)?.message || "Could not fetch candidates."}
            onRetry={() => refetch()}
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Pipeline is empty"
            description="Add candidate profiles or upload resume PDFs with automatic AI text extraction."
            actionText="Add First Candidate"
            onAction={() => setAddDialogOpen(true)}
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3.5 h-full overflow-hidden">
              {PIPELINE_COLUMNS.map((col) => {
                if (mobileSelectedStage !== "all" && mobileSelectedStage !== col.id) {
                  return null;
                }

                const stageCandidates = filteredCandidates.filter(
                  (c) => c.stage === col.id
                );

                return (
                  <KanbanColumn
                    key={col.id}
                    column={col}
                    candidates={stageCandidates}
                    selectedCandidateIds={selectedCandidateIds}
                    onToggleSelect={handleToggleSelect}
                    onCardClick={(cand) => {
                      setSelectedCandidate(cand);
                      setDrawerOpen(true);
                    }}
                    onAddClick={() => setAddDialogOpen(true)}
                  />
                );
              })}
            </div>

            {/* Drag Overlay for smooth preview */}
            <DragOverlay>
              {activeCandidate ? (
                <KanbanCard candidate={activeCandidate} isOverlay />
              ) : null}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* ── Floating Bulk Actions Bar ──────────────────────────────── */}
      <BulkActionsToolbar
        selectedCount={selectedCandidateIds.length}
        onMoveStage={handleBulkMoveStage}
        onBulkScore={handleBulkScore}
        onExportCsv={handleExportShortlist}
        onDelete={handleBulkDelete}
        onClear={handleClearSelection}
        isProcessing={isBulkProcessing}
      />

      {/* ── Pipeline Audit Log Drawer ──────────────────────────────── */}
      <PipelineAuditDrawer
        open={auditDrawerOpen}
        onClose={() => setAuditDrawerOpen(false)}
        openingId={selectedOpeningId}
      />

      {/* ── Add Candidate Modal ─────────────────────────────────────── */}
      <AddCandidateDialog
        open={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        openings={openings}
        defaultOpeningId={selectedOpeningId !== "all" ? selectedOpeningId : undefined}
        onSuccess={() => refetch()}
      />

      {/* ── Candidate Detail Drawer ─────────────────────────────────── */}
      <CandidateDrawer
        candidate={selectedCandidate}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCandidate(null);
        }}
        onCandidateUpdated={(updated) => {
          setSelectedCandidate(updated);
          queryClient.invalidateQueries({ queryKey: ["candidates"] });
        }}
      />
    </div>
  );
}
