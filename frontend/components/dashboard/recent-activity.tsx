"use client";

import React from "react";
import Link from "next/link";
import { Candidate, CandidateStage, DashboardStats } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Clock, ArrowUpRight, Plus, Inbox, User, Briefcase } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { ScoreRing } from "@/components/ui/score-ring";

interface RecentActivityProps {
  stats?: DashboardStats;
  isLoading?: boolean;
  onSelectCandidate?: (candidateId: string) => void;
  onAddNew?: () => void;
}

const STAGE_CONFIG: Record<CandidateStage, { label: string; badgeClass: string }> = {
  applied: { label: "Applied", badgeClass: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  screening: { label: "Screening", badgeClass: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  interview: { label: "Interview", badgeClass: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  offer: { label: "Offer", badgeClass: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  rejected: { label: "Rejected", badgeClass: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
};

export function RecentActivity({
  stats,
  isLoading,
  onSelectCandidate,
  onAddNew,
}: RecentActivityProps) {
  const recent = stats?.recent_candidates || [];

  const formatRelativeTime = (dateStr: string) => {
    try {
      const now = new Date();
      const date = new Date(dateStr);
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) return "Just now";
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    } catch {
      return dateStr;
    }
  };

  return (
    <Card className="border border-border bg-card shadow-xs hover:shadow-sm transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <span>Recent Candidates</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Latest profiles evaluated or moving through pipeline stages
          </CardDescription>
        </div>
        <Link href="/pipeline">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1"
          >
            <span>Pipeline</span>
            <ArrowUpRight className="h-3 w-3" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-3 py-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between py-2 border-b last:border-0 border-border/40"
              >
                <div className="space-y-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
                <Skeleton className="h-5 w-16" />
              </div>
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="py-8 text-center flex flex-col items-center justify-center border border-dashed rounded-xl bg-muted/10">
            <Inbox className="h-7 w-7 text-muted-foreground/60 mb-2" />
            <p className="text-xs font-semibold text-foreground">No candidates yet</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-1 mb-3">
              Candidate records added or screened will appear here.
            </p>
            {onAddNew && (
              <Button
                onClick={onAddNew}
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1.5"
              >
                <Plus className="h-3 w-3" />
                <span>Add Candidate</span>
              </Button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {recent.map((cand) => (
              <div
                key={cand.id}
                onClick={() => onSelectCandidate && onSelectCandidate(cand.id)}
                className="group flex items-center justify-between py-2.5 px-1 hover:bg-muted/30 rounded-lg transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <ScoreRing score={cand.score} size="sm" />
                  <div className="min-w-0 truncate">
                    <p className="text-xs font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {cand.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                      {cand.opening_title ? (
                        <>
                          <Briefcase className="h-3 w-3 text-muted-foreground/80 shrink-0" />
                          <span className="truncate">{cand.opening_title}</span>
                        </>
                      ) : (
                        <span>{cand.email}</span>
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {formatRelativeTime(cand.created_at)}
                  </span>
                  <Badge
                    variant="outline"
                    className={`capitalize text-[10px] font-semibold border ${
                      STAGE_CONFIG[cand.stage]?.badgeClass || "border-border text-muted-foreground"
                    }`}
                  >
                    {STAGE_CONFIG[cand.stage]?.label || cand.stage}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
