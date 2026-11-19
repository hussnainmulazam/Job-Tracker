"use client";

import React from "react";
import Link from "next/link";
import { Filter, ArrowRight, Users, ChevronRight, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

interface HiringFunnelChartProps {
  stats?: DashboardStats;
  isLoading?: boolean;
}

const STAGE_CONFIG: Record<
  string,
  { label: string; color: string; barBg: string; textClass: string }
> = {
  applied: {
    label: "1. Applied",
    color: "#3b82f6",
    barBg: "bg-blue-500",
    textClass: "text-blue-600 dark:text-blue-400",
  },
  screening: {
    label: "2. AI Screened",
    color: "#8b5cf6",
    barBg: "bg-purple-500",
    textClass: "text-purple-600 dark:text-purple-400",
  },
  interview: {
    label: "3. Interview",
    color: "#f59e0b",
    barBg: "bg-amber-500",
    textClass: "text-amber-600 dark:text-amber-400",
  },
  offer: {
    label: "4. Offer",
    color: "#10b981",
    barBg: "bg-emerald-500",
    textClass: "text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    label: "Archive / Rejected",
    color: "#f43f5e",
    barBg: "bg-rose-500",
    textClass: "text-rose-600 dark:text-rose-400",
  },
};

export function HiringFunnelChart({ stats, isLoading }: HiringFunnelChartProps) {
  const total = stats?.total_candidates || 0;
  const funnelStages = stats?.funnel_by_stage || [];

  return (
    <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-card rounded-xl flex flex-col justify-between h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Filter className="h-4 w-4 text-primary" />
            <span>Hiring Funnel</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Stage conversion across {total} active candidate{total === 1 ? "" : "s"}
          </CardDescription>
        </div>
        <Link href="/pipeline">
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground hover:text-foreground gap-1">
            <span>Pipeline</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="space-y-4 pt-1">
        {isLoading ? (
          <div className="space-y-3 py-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1.5">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-12" />
                </div>
                <Skeleton className="h-4 w-full rounded-md" />
              </div>
            ))}
          </div>
        ) : total === 0 ? (
          <div className="py-12 text-center flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl bg-muted/10 p-4">
            <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs font-semibold text-foreground">No candidate data in pipeline</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-1 mb-3">
              Add candidates or sync CVs via Gmail to start tracking hiring conversion.
            </p>
            <Link href="/pipeline">
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                <span>Go to Pipeline</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3.5">
            {funnelStages.map((stageItem) => {
              const cfg = STAGE_CONFIG[stageItem.stage] || {
                label: stageItem.label,
                color: "#6b7280",
                barBg: "bg-muted-foreground",
                textClass: "text-muted-foreground",
              };
              const pct = stageItem.percentage;
              const barWidth = total > 0 ? Math.max((stageItem.count / total) * 100, 4) : 0;

              return (
                <div key={stageItem.stage} className="space-y-1.5 group">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 font-medium text-foreground">
                      <span className="w-2 h-2 rounded-full" style={{ backgroundColor: cfg.color }} />
                      <span>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-foreground">{stageItem.count}</span>
                      <span className="text-[11px] text-muted-foreground font-mono">
                        ({pct}%)
                      </span>
                    </div>
                  </div>

                  <div className="h-2.5 w-full bg-muted/50 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full ${cfg.barBg} transition-all duration-500 rounded-full`}
                      style={{ width: `${barWidth}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
