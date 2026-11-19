"use client";

import React from "react";
import Link from "next/link";
import {
  Clock,
  Sparkles,
  User,
  Mail,
  Calendar,
  CheckCircle2,
  AlertCircle,
  Inbox,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

interface RecentActivityFeedProps {
  stats?: DashboardStats;
  isLoading?: boolean;
  onSelectCandidate?: (candidateId: string) => void;
  onAddNew?: () => void;
}

export function RecentActivityFeed({
  stats,
  isLoading,
  onSelectCandidate,
  onAddNew,
}: RecentActivityFeedProps) {
  const activities = stats?.recent_activity || [];

  const formatRelativeTime = (dateStr: string) => {
    try {
      const now = new Date();
      const date = new Date(dateStr);
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffMins < 1) return "Just now";
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  const getActivityBadge = (action: string) => {
    const act = action.toLowerCase();
    if (act.includes("interview")) {
      return <Badge variant="primary" className="text-[10px] py-0 px-1.5 font-normal">Interview</Badge>;
    }
    if (act.includes("score") || act.includes("screen")) {
      return <Badge variant="info" className="text-[10px] py-0 px-1.5 font-normal">AI Score</Badge>;
    }
    if (act.includes("stage") || act.includes("status")) {
      return <Badge variant="secondary" className="text-[10px] py-0 px-1.5 font-normal">Stage Move</Badge>;
    }
    if (act.includes("email") || act.includes("reply")) {
      return <Badge variant="success" className="text-[10px] py-0 px-1.5 font-normal">Email</Badge>;
    }
    return <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">{action}</Badge>;
  };

  return (
    <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-card rounded-xl flex flex-col justify-between">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>Recent Activity Feed</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Audit trail of candidate transitions and system events
          </CardDescription>
        </div>
        <Link href="/pipeline">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
            <span>Pipeline</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 border-border/40">
                <div className="space-y-1">
                  <Skeleton className="h-3.5 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
          </div>
        ) : activities.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl bg-muted/10 p-4 text-center">
            <Inbox className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs font-semibold text-foreground">No recent activity logged</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5 mb-3">
              Candidate status updates, AI scoring, and email replies will appear here in real-time.
            </p>
            {onAddNew && (
              <Button size="sm" variant="outline" onClick={onAddNew} className="text-xs h-7 gap-1">
                <span>Add Candidate</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {activities.map((item) => (
              <div
                key={item.id}
                className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {getActivityBadge(item.action)}
                    {item.candidate_name && (
                      <button
                        onClick={() => item.candidate_id && onSelectCandidate?.(item.candidate_id)}
                        className="font-medium text-foreground hover:text-primary transition truncate text-left"
                      >
                        {item.candidate_name}
                      </button>
                    )}
                    {item.from_stage && item.to_stage && (
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <span>{item.from_stage}</span>
                        <span>&rarr;</span>
                        <span className="text-foreground font-medium">{item.to_stage}</span>
                      </span>
                    )}
                  </div>
                  {item.details && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 font-mono">
                      {item.details}
                    </p>
                  )}
                  {item.opening_title && (
                    <p className="text-[10px] text-muted-foreground/80">
                      Requisition: {item.opening_title}
                    </p>
                  )}
                </div>

                <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                  {formatRelativeTime(item.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
