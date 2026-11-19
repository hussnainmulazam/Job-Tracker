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
  Zap,
  ArrowUpRight,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

interface StatsHeaderProps {
  stats?: DashboardStats;
  isLoading?: boolean;
}

export function StatsHeader({ stats, isLoading }: StatsHeaderProps) {
  if (isLoading || !stats) {
    return <StatsHeaderSkeleton />;
  }

  const cards = [
    {
      title: "New CVs Today",
      value: stats.new_cvs_today ?? 0,
      subtitle: "Imported via Gmail sync or PDF upload",
      icon: FileText,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-500/10",
      href: "/pipeline",
      badge: stats.new_cvs_today > 0 ? `${stats.new_cvs_today} new` : "Today",
      badgeColor: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
    },
    {
      title: "Pending Reviews",
      value: stats.pending_reviews ?? 0,
      subtitle: "Applied & screening awaiting scorecard",
      icon: Clock,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-500/10",
      href: "/screening",
      badge: stats.pending_reviews > 0 ? "Action required" : "All caught up",
      badgeColor:
        stats.pending_reviews > 0
          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
          : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    },
    {
      title: "Awaiting Reply",
      value: stats.messages_awaiting_reply ?? 0,
      subtitle: "Inbound candidate email messages",
      icon: MessageSquare,
      color: "text-emerald-600 dark:text-emerald-400",
      bgColor: "bg-emerald-500/10",
      href: "/inbox",
      badge:
        stats.messages_awaiting_reply > 0
          ? `${stats.messages_awaiting_reply} unread`
          : "Zero pending",
      badgeColor:
        stats.messages_awaiting_reply > 0
          ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 font-bold"
          : "bg-muted text-muted-foreground",
    },
    {
      title: "Interviews This Week",
      value: stats.interviews_this_week ?? 0,
      subtitle: "Scheduled on Google Calendar",
      icon: Calendar,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-500/10",
      href: "/interviews",
      badge: "Google Meet",
      badgeColor: "bg-purple-500/15 text-purple-700 dark:text-purple-300",
    },
    {
      title: "Time-to-Shortlist",
      value:
        stats.time_to_shortlist_hours !== null && stats.time_to_shortlist_hours !== undefined
          ? `${stats.time_to_shortlist_hours}h`
          : "—",
      subtitle:
        stats.time_to_shortlist_hours !== null
          ? "Average turnaround speed"
          : "Awaiting candidate shortlist",
      icon: Zap,
      color: "text-indigo-600 dark:text-indigo-400",
      bgColor: "bg-indigo-500/10",
      badge: "Pipeline velocity",
      badgeColor: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
    },
    {
      title: "Avg Fit Score",
      value: stats.average_score !== null ? `${Math.round(stats.average_score)}%` : "—",
      subtitle:
        stats.average_score !== null
          ? `${stats.screened_candidates} AI evaluations`
          : "No screened candidates yet",
      icon: Sparkles,
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-500/10",
      href: "/compare",
      badge: stats.average_score !== null ? "Strict JSON" : "OpenRouter",
      badgeColor: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    },
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {cards.map((card) => {
          const Icon = card.icon;
          const content = (
            <Card className="h-full border border-border bg-card/90 shadow-2xs hover:shadow-sm hover:border-primary/40 transition-all">
              <CardHeader className="flex flex-row items-center justify-between p-3.5 pb-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground truncate">
                  {card.title}
                </span>
                <div
                  className={`h-7 w-7 rounded-lg ${card.bgColor} ${card.color} flex items-center justify-center shrink-0`}
                >
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="p-3.5 pt-1 space-y-1.5">
                <div className="flex items-baseline justify-between gap-1">
                  <CardTitle className="text-2xl font-black tracking-tight text-foreground">
                    {card.value}
                  </CardTitle>
                  {card.badge && (
                    <span
                      className={`text-[9.5px] px-1.5 py-0.5 rounded-md font-semibold ${card.badgeColor}`}
                    >
                      {card.badge}
                    </span>
                  )}
                </div>
                <p className="text-[10.5px] text-muted-foreground leading-tight truncate">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          );

          return (
            <motion.div
              key={card.title}
              whileHover={{ y: -2 }}
              transition={{ duration: 0.15 }}
            >
              {card.href ? (
                <Link href={card.href} className="block h-full">
                  {content}
                </Link>
              ) : (
                content
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Requisition & Talent Pulse Summary Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 rounded-xl border border-border/80 bg-muted/30 text-xs">
        <div className="flex items-center gap-4 text-muted-foreground">
          <span>
            <strong className="text-foreground">{stats.active_openings}</strong> active /{" "}
            {stats.total_openings} total job opening{stats.total_openings === 1 ? "" : "s"}
          </span>
          <span className="text-border">•</span>
          <span>
            <strong className="text-foreground">{stats.total_candidates}</strong> total candidate
            {stats.total_candidates === 1 ? "" : "s"} in pipeline
          </span>
          <span className="text-border">•</span>
          <span>
            <strong className="text-foreground">{stats.shortlisted_candidates}</strong> shortlisted
            in interview/offer
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
          <span>Real-time database analytics</span>
        </div>
      </div>
    </div>
  );
}

export function StatsHeaderSkeleton() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i} className="border border-border shadow-2xs">
            <CardHeader className="flex flex-row items-center justify-between p-3.5 pb-1">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-7 rounded-lg" />
            </CardHeader>
            <CardContent className="p-3.5 pt-1 space-y-2">
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-2.5 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Skeleton className="h-8 w-full rounded-xl" />
    </div>
  );
}
