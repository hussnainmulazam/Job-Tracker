"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Plus,
  Kanban,
  Briefcase,
  Sparkles,
  RefreshCw,
  Mail,
  ArrowRight,
  Scale,
  Users,
  Calendar,
  CheckCircle2,
} from "lucide-react";
import {
  dashboardApi,
  candidatesApi,
  jobOpeningsApi,
  googleApi,
  apiFetch,
  Candidate,
} from "@/lib/api";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatsHeader } from "@/components/dashboard/stats-header";
import { HiringFunnelChart } from "@/components/dashboard/hiring-funnel-chart";
import { ApplicationsTimelineChart } from "@/components/dashboard/applications-timeline-chart";
import { UpcomingInterviewsList } from "@/components/dashboard/upcoming-interviews-list";
import { RecentActivityFeed } from "@/components/dashboard/recent-activity-feed";
import { AddCandidateDialog } from "@/components/candidates/add-candidate-dialog";
import { CreateOpeningDialog } from "@/components/openings/create-opening-dialog";
import { CandidateDrawer } from "@/components/candidates/candidate-drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";

interface UserProfile {
  id: string;
  email: string;
}

export default function DashboardPage() {
  const { toast } = useToast();
  const [addCandidateOpen, setAddCandidateOpen] = useState(false);
  const [createOpeningOpen, setCreateOpeningOpen] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 1. Fetch current user identity for greeting
  const { data: user } = useQuery<UserProfile>({
    queryKey: ["current-user"],
    queryFn: () => apiFetch<UserProfile>("/api/v1/auth/me"),
    retry: false,
  });

  // 2. Fetch live dashboard metrics directly from DB
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

  // 3. Fetch active job openings for modals
  const { data: openingsData } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list(),
  });
  const openings = openingsData?.items || [];

  // 4. Gmail Sync Mutation (Quick Action)
  const syncGmailMutation = useMutation({
    mutationFn: () => googleApi.syncGmail(),
    onSuccess: (res) => {
      refetch();
      toast({
        title: "Gmail Sync Completed",
        description: `Found ${res.messages_found} messages. Created ${res.candidates_created} candidate(s), saved ${res.attachments_saved} resumes.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Sync Failed",
        description:
          err?.message ||
          "Could not sync Gmail. Please verify your Google Workspace connection in Settings.",
        variant: "destructive",
      });
    },
  });

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
    <AppShell title="Dashboard">
      <div className="space-y-6 pb-12">
        <PageHeader
          title="Talent Intelligence Dashboard"
          description="Real-time hiring velocity, candidate intake trends, and synchronized interview operations."
          badge={
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Live Database Counts</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={() => syncGmailMutation.mutate()}
                disabled={syncGmailMutation.isPending}
                className="gap-1.5 text-xs h-8"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 text-primary ${
                    syncGmailMutation.isPending ? "animate-spin" : ""
                  }`}
                />
                <span>{syncGmailMutation.isPending ? "Syncing..." : "Sync Gmail"}</span>
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setCreateOpeningOpen(true)}
                className="gap-1.5 text-xs h-8"
              >
                <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">New Opening</span>
              </Button>

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

        {/* Error State with Retry Button */}
        {isError && (
          <ErrorState
            title="Unable to load recruiter metrics"
            message={(error as Error)?.message || "Failed to fetch aggregated KPIs from Supabase."}
            onRetry={() => refetch()}
          />
        )}

        {/* ── 1. Top Greeting, Today's Priorities & KPI Cards with Trend ───────── */}
        <StatsHeader
          stats={stats}
          isLoading={isLoading}
          userName={user?.email}
          onAddCv={() => setAddCandidateOpen(true)}
          onNewOpening={() => setCreateOpeningOpen(true)}
          onSyncGmail={() => syncGmailMutation.mutate()}
          isSyncingGmail={syncGmailMutation.isPending}
        />

        {/* ── 2. Charts Section: Hiring Funnel + Applications Over Time ────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-6">
            <HiringFunnelChart stats={stats} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-6">
            <ApplicationsTimelineChart stats={stats} isLoading={isLoading} />
          </div>
        </div>

        {/* ── 3. Operational Pulse: Upcoming Interviews & Recent Activity ───────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7">
            <UpcomingInterviewsList stats={stats} isLoading={isLoading} />
          </div>
          <div className="lg:col-span-5">
            <RecentActivityFeed
              stats={stats}
              isLoading={isLoading}
              onSelectCandidate={handleSelectCandidateId}
              onAddNew={() => setAddCandidateOpen(true)}
            />
          </div>
        </div>

        {/* ── 4. Quick Launch Cards ────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <Link href="/pipeline" className="group">
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] p-4 bg-card hover:border-border transition-all shadow-xs hover:shadow-card-hover hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <div className="h-7 w-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                  <Kanban className="h-3.5 w-3.5" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Candidate Pipeline</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Drag-and-drop Kanban workflow across Applied, Screening, Interview, Offer, and Rejected.
              </p>
            </div>
          </Link>

          <Link href="/openings" className="group">
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] p-4 bg-card hover:border-border transition-all shadow-xs hover:shadow-card-hover hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <div className="h-7 w-7 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                  <Briefcase className="h-3.5 w-3.5" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Job Openings</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Manage requisitions, evaluation criteria, and candidate capacity.
              </p>
            </div>
          </Link>

          <Link href="/compare" className="group">
            <div className="rounded-xl border border-border/70 dark:border-white/[0.08] p-4 bg-card hover:border-border transition-all shadow-xs hover:shadow-card-hover hover:-translate-y-0.5">
              <div className="flex items-center justify-between mb-2">
                <div className="h-7 w-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <Scale className="h-3.5 w-3.5" />
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-0.5 transition-all" />
              </div>
              <h3 className="text-xs font-semibold text-foreground">Candidate Comparison</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Side-by-side evaluation of skills match, score rings, and CV red flags.
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
