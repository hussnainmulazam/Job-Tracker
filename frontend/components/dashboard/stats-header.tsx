"use client";

import React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  FileText,
  Clock,
  MessageSquare,
  Calendar,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Briefcase,
  Users,
  Inbox,
  Video,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

interface StatsHeaderProps {
  stats?: DashboardStats;
  isLoading?: boolean;
  userName?: string;
  onAddCv?: () => void;
  onNewOpening?: () => void;
  onSyncGmail?: () => void;
  isSyncingGmail?: boolean;
}

export function StatsHeader({
  stats,
  isLoading,
  userName,
  onAddCv,
  onNewOpening,
  onSyncGmail,
  isSyncingGmail,
}: StatsHeaderProps) {
  // Determine greeting based on client time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  const displayName = userName ? userName.split("@")[0] : "Recruiter";
  const todayFormatted = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  if (isLoading || !stats) {
    return <StatsHeaderSkeleton />;
  }

  const cvsToReview = stats.pending_reviews ?? 0;
  const repliesWaiting = stats.messages_awaiting_reply ?? 0;
  const interviewsToday = stats.interviews_today ?? 0;

  // KPI cards with real trends
  const kpis = [
    {
      title: "Total Candidates",
      value: stats.total_candidates ?? 0,
      trend: stats.candidates_trend_pct,
      trendText:
        stats.candidates_trend_pct !== undefined && stats.candidates_trend_pct !== null
          ? `${stats.candidates_trend_pct >= 0 ? "+" : ""}${stats.candidates_trend_pct}% vs last week`
          : null,
      subtitle: `${stats.candidates_this_week ?? 0} added in last 7 days`,
      icon: Users,
      href: "/pipeline",
    },
    {
      title: "Active Openings",
      value: stats.active_openings ?? 0,
      trend: stats.openings_trend_pct,
      trendText:
        stats.openings_trend_pct !== undefined && stats.openings_trend_pct !== null
          ? `${stats.openings_trend_pct >= 0 ? "+" : ""}${stats.openings_trend_pct}% vs last week`
          : null,
      subtitle: `Out of ${stats.total_openings ?? 0} total requisitions`,
      icon: Briefcase,
      href: "/openings",
    },
    {
      title: "Interviews Scheduled",
      value: stats.interviews_this_week ?? 0,
      trend: stats.interviews_trend_pct,
      trendText:
        stats.interviews_trend_pct !== undefined && stats.interviews_trend_pct !== null
          ? `${stats.interviews_trend_pct >= 0 ? "+" : ""}${stats.interviews_trend_pct}% vs last week`
          : null,
      subtitle: "Active this week on Calendar",
      icon: Calendar,
      href: "/interviews",
    },
    {
      title: "Shortlisted Fit",
      value: stats.shortlisted_candidates ?? 0,
      trend: stats.average_score,
      trendText: stats.average_score !== null ? `${stats.average_score}% avg fit` : null,
      subtitle: `${stats.screened_candidates ?? 0} AI-screened candidates`,
      icon: Sparkles,
      href: "/screening",
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── 1. Top Greeting & Today's Priorities ──────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {getGreeting()}, {displayName}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Here is your recruitment overview and priorities for today, {todayFormatted}.
            </p>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Live DB Counts</span>
          </div>
        </div>

        {/* Priorities Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Priority 1: CVs to Review */}
          <Link href="/screening" className="group">
            <div
              className={`p-4 rounded-xl border transition-all h-full flex flex-col justify-between ${
                cvsToReview > 0
                  ? "bg-amber-500/5 border-amber-500/30 hover:border-amber-500/60 shadow-xs"
                  : "bg-card border-border/70 dark:border-white/[0.08] hover:border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                      <Clock className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      CVs to Review
                    </span>
                  </div>
                  <Badge
                    variant={cvsToReview > 0 ? "warning" : "secondary"}
                    className="text-[10px] py-0 px-1.5"
                  >
                    {cvsToReview > 0 ? "Needs Review" : "Clear"}
                  </Badge>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
                  {cvsToReview}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {cvsToReview > 0
                    ? "Candidates in Applied or Screening stage awaiting evaluation."
                    : "All candidate CVs have been screened and reviewed."}
                </p>
              </div>

              <div className="pt-3 mt-2 border-t border-border/50 flex items-center justify-between text-xs font-medium text-primary">
                <span>{cvsToReview > 0 ? "Review Candidates" : "Screen Candidates"}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>

          {/* Priority 2: Replies Waiting */}
          <Link href="/inbox" className="group">
            <div
              className={`p-4 rounded-xl border transition-all h-full flex flex-col justify-between ${
                repliesWaiting > 0
                  ? "bg-rose-500/5 border-rose-500/30 hover:border-rose-500/60 shadow-xs"
                  : "bg-card border-border/70 dark:border-white/[0.08] hover:border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
                      <MessageSquare className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Replies Waiting
                    </span>
                  </div>
                  <Badge
                    variant={repliesWaiting > 0 ? "destructive" : "secondary"}
                    className="text-[10px] py-0 px-1.5"
                  >
                    {repliesWaiting > 0 ? `${repliesWaiting} Unread` : "Zero Pending"}
                  </Badge>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
                  {repliesWaiting}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {repliesWaiting > 0
                    ? "Inbound candidate email responses awaiting your reply."
                    : "All candidate communication threads are answered."}
                </p>
              </div>

              <div className="pt-3 mt-2 border-t border-border/50 flex items-center justify-between text-xs font-medium text-primary">
                <span>{repliesWaiting > 0 ? "Open Recruiting Inbox" : "Check Messages"}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>

          {/* Priority 3: Interviews Today */}
          <Link href="/interviews" className="group">
            <div
              className={`p-4 rounded-xl border transition-all h-full flex flex-col justify-between ${
                interviewsToday > 0
                  ? "bg-purple-500/5 border-purple-500/30 hover:border-purple-500/60 shadow-xs"
                  : "bg-card border-border/70 dark:border-white/[0.08] hover:border-border"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Interviews Today
                    </span>
                  </div>
                  <Badge
                    variant={interviewsToday > 0 ? "primary" : "secondary"}
                    className="text-[10px] py-0 px-1.5"
                  >
                    {interviewsToday > 0 ? `${interviewsToday} Scheduled` : "No Sessions"}
                  </Badge>
                </div>
                <div className="text-2xl font-bold tracking-tight text-foreground mt-1">
                  {interviewsToday}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {interviewsToday > 0
                    ? "Candidate Google Meet calls scheduled on your calendar today."
                    : "No interviews scheduled for today. Bookings sync in real-time."}
                </p>
              </div>

              <div className="pt-3 mt-2 border-t border-border/50 flex items-center justify-between text-xs font-medium text-primary">
                <span>{interviewsToday > 0 ? "View Schedule" : "Schedule Interview"}</span>
                <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </div>
          </Link>
        </div>
      </div>

      {/* ── 2. KPI Cards with Trend vs Last Week ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          const isPositive = kpi.trend !== undefined && kpi.trend !== null && kpi.trend > 0;
          const isNegative = kpi.trend !== undefined && kpi.trend !== null && kpi.trend < 0;

          return (
            <Link key={idx} href={kpi.href} className="group">
              <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-xs hover:border-border hover:shadow-card-hover transition-all p-4 rounded-xl flex flex-col justify-between h-full">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-muted-foreground">{kpi.title}</span>
                    <Icon className="w-4 h-4 text-muted-foreground/80 group-hover:text-primary transition-colors" />
                  </div>
                  <div className="text-2xl font-bold tracking-tight text-foreground">
                    {kpi.value}
                  </div>
                </div>

                <div className="pt-3 mt-2 border-t border-border/60 flex items-center justify-between text-[11px]">
                  {kpi.trendText ? (
                    <div className="flex items-center gap-1 font-medium text-emerald-600 dark:text-emerald-400">
                      {isPositive ? (
                        <TrendingUp className="w-3.5 h-3.5" />
                      ) : isNegative ? (
                        <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
                      ) : null}
                      <span>{kpi.trendText}</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{kpi.subtitle}</span>
                  )}
                  <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function StatsHeaderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
