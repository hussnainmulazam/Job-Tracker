"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Kanban,
  Briefcase,
  Sparkles,
  RefreshCw,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  Scale,
  Users,
} from "lucide-react";
import { dashboardApi, candidatesApi, jobOpeningsApi, Candidate } from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { StatsHeader } from "@/components/dashboard/stats-header";
import { ApplicationsChart } from "@/components/dashboard/applications-chart";
import { RecentActivity } from "@/components/dashboard/recent-activity";
import {
  UpcomingInterviewsWidget,
  AwaitingReplyWidget,
} from "@/components/dashboard/dashboard-widgets";
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog";
import { CreateOpeningDialog } from "@/components/openings/create-opening-dialog";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function DashboardPage() {
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [createOpeningOpen, setCreateOpeningOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 1. Fetch live dashboard metrics
  const {
    data: stats,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.getStats(),
  });

  // 2. Fetch job openings for quick modals
  const { data: openingsData } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list(),
  });
  const openings = openingsData?.items || [];

  const handleSelectCandidateId = async (id: string) => {
    try {
      const cand = await candidatesApi.get(id);
      setSelectedCandidate(cand);
      setDrawerOpen(true);
    } catch (e) {
      console.error("Failed to load candidate details:", e);
    }
  };

  return (
    <AppShell
      title="Recruiting Command Center"
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCreateOpeningOpen(true)}
            className="h-8 gap-1.5 text-xs"
          >
            <Briefcase className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New Requisition</span>
          </Button>
          <Button
            size="sm"
            onClick={() => setAddCandidateOpen(true)}
            className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Add Candidate</span>
          </Button>
        </div>
      }
    >
      <div className="space-y-6 pb-8">
        {/* Error State with Retry Button */}
        {isError && (
          <ErrorState
            title="Unable to load recruiter metrics"
            message={(error as Error)?.message || "Failed to fetch aggregated KPIs from Supabase."}
            onRetry={() => refetch()}
          />
        )}

        {/* 1. Real Stat Metric Cards */}
        <StatsHeader stats={stats} isLoading={isLoading} />

        {/* 2. Charts and Activity Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <ApplicationsChart stats={stats} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-1">
            <RecentActivity
              stats={stats}
              isLoading={isLoading}
              onSelectCandidate={handleSelectCandidateId}
              onAddNew={() => setAddCandidateOpen(true)}
            />
          </div>
        </div>

        {/* 3. Live Recruiting Pulse: Upcoming Interviews & Inbound Email Queue */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <UpcomingInterviewsWidget stats={stats} isLoading={isLoading} />
          <AwaitingReplyWidget stats={stats} isLoading={isLoading} />
        </div>

        {/* Quick Launch Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <Link href="/pipeline" className="group">
            <div className="rounded-xl border border-border p-4 bg-card hover:border-primary/50 transition-colors shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="h-8 w-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Kanban className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <h3 className="text-xs font-bold text-foreground">Candidate Pipeline</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Drag-and-drop Kanban across Applied, Screening, Interview, Offer, and Rejected.
              </p>
            </div>
          </Link>

          <Link href="/openings" className="group">
            <div className="rounded-xl border border-border p-4 bg-card hover:border-primary/50 transition-colors shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="h-8 w-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Briefcase className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <h3 className="text-xs font-bold text-foreground">Job Openings</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Manage requisitions, trigger bulk AI scoring, and export CSV shortlists.
              </p>
            </div>
          </Link>

          <Link href="/compare" className="group">
            <div className="rounded-xl border border-border p-4 bg-card hover:border-primary/50 transition-colors shadow-2xs">
              <div className="flex items-center justify-between mb-2">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Scale className="h-4 w-4" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:translate-x-0.5 transition-transform" />
              </div>
              <h3 className="text-xs font-bold text-foreground">Candidate Comparison</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Side-by-side evaluation of skills match, score rings, and red flags.
              </p>
            </div>
          </Link>
        </div>
      </div>

      {/* Add Candidate Modal */}
      <AddCandidateDialog
        open={addCandidateOpen}
        onClose={() => setAddCandidateOpen(false)}
        openings={openings}
        onSuccess={() => refetch()}
      />

      {/* Create Opening Modal */}
      <CreateOpeningDialog
        open={createOpeningOpen}
        onClose={() => setCreateOpeningOpen(false)}
      />

      {/* Candidate Detail Drawer */}
      <CandidateDrawer
        candidate={selectedCandidate}
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
          setSelectedCandidate(null);
        }}
      />
    </AppShell>
  );
}
