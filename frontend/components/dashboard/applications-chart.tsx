"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Layers, ArrowRight, TrendingDown, Users, ChevronRight } from "lucide-react";
import { DashboardStats, CandidateStage } from "@/lib/api";

interface ApplicationsChartProps {
  stats?: DashboardStats;
  isLoading?: boolean;
}

const STAGE_CONFIG: Record<
  string,
  { name: string; color: string; bg: string; text: string }
> = {
  applied: {
    name: "Applied",
    color: "#3b82f6",
    bg: "bg-blue-500/10",
    text: "text-blue-600 dark:text-blue-400",
  },
  screening: {
    name: "AI Screening",
    color: "#a855f7",
    bg: "bg-purple-500/10",
    text: "text-purple-600 dark:text-purple-400",
  },
  interview: {
    name: "Interview",
    color: "#f59e0b",
    bg: "bg-amber-500/10",
    text: "text-amber-600 dark:text-amber-400",
  },
  offer: {
    name: "Offer",
    color: "#10b981",
    bg: "bg-emerald-500/10",
    text: "text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    name: "Rejected",
    color: "#f43f5e",
    bg: "bg-rose-500/10",
    text: "text-rose-600 dark:text-rose-400",
  },
};

export function ApplicationsChart({ stats, isLoading }: ApplicationsChartProps) {
  const [activeTab, setActiveTab] = useState<"funnel" | "chart">("funnel");
  const [mounted, setMounted] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const total = stats?.total_candidates || 0;
  const stageBreakdown = stats?.stage_breakdown || {
    applied: 0,
    screening: 0,
    interview: 0,
    offer: 0,
    rejected: 0,
  };

  const chartData = [
    {
      stage: "applied",
      name: "Applied",
      count: stageBreakdown.applied || 0,
      color: "#3b82f6",
    },
    {
      stage: "screening",
      name: "AI Screened",
      count: stageBreakdown.screening || 0,
      color: "#a855f7",
    },
    {
      stage: "interview",
      name: "Interview",
      count: stageBreakdown.interview || 0,
      color: "#f59e0b",
    },
    {
      stage: "offer",
      name: "Offer",
      count: stageBreakdown.offer || 0,
      color: "#10b981",
    },
    {
      stage: "rejected",
      name: "Rejected",
      count: stageBreakdown.rejected || 0,
      color: "#f43f5e",
    },
  ];

  // Pipeline flow progression for the funnel
  const funnelSteps = [
    { key: "applied", label: "Applied", count: stageBreakdown.applied || 0 },
    { key: "screening", label: "AI Screening", count: stageBreakdown.screening || 0 },
    { key: "interview", label: "Interview", count: stageBreakdown.interview || 0 },
    { key: "offer", label: "Offer Made", count: stageBreakdown.offer || 0 },
  ];

  return (
    <Card className="border border-border bg-card shadow-2xs hover:shadow-xs transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
            <Layers className="h-4 w-4 text-primary" />
            <span>Recruiting Funnel by Stage</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Stage conversion rates computed from live database candidates
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border p-0.5 bg-muted/40 text-[11px]">
            <button
              onClick={() => setActiveTab("funnel")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeTab === "funnel"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Funnel Flow
            </button>
            <button
              onClick={() => setActiveTab("chart")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                activeTab === "chart"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Distribution
            </button>
          </div>
          <Link href="/pipeline">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
              <span>Pipeline</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </Link>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {isLoading ? (
          <div className="h-64 w-full flex items-center justify-center bg-muted/20 animate-pulse rounded-xl">
            <span className="text-xs text-muted-foreground">Loading pipeline analytics...</span>
          </div>
        ) : total === 0 ? (
          <div className="h-64 w-full flex flex-col items-center justify-center border border-dashed rounded-xl bg-muted/10 p-4 text-center">
            <Users className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs font-semibold text-foreground">No candidates in pipeline</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-1">
              Add talent manually or sync resumes from Gmail to visualize stage progression.
            </p>
          </div>
        ) : activeTab === "funnel" ? (
          <div className="space-y-3 py-2">
            {funnelSteps.map((step, idx) => {
              const cfg = STAGE_CONFIG[step.key];
              const pctOfTotal = total > 0 ? Math.round((step.count / total) * 100) : 0;
              const prevStepCount = idx > 0 ? funnelSteps[idx - 1].count : step.count;
              const conversionFromPrev =
                prevStepCount > 0 ? Math.round((step.count / prevStepCount) * 100) : 0;

              return (
                <div key={step.key} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full`} style={{ backgroundColor: cfg.color }} />
                      <span className="font-semibold text-foreground">{step.label}</span>
                      {idx > 0 && prevStepCount > 0 && (
                        <span className="text-[10px] text-muted-foreground">
                          ({conversionFromPrev}% of prior stage)
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-bold text-foreground">{step.count}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {pctOfTotal}%
                      </span>
                    </div>
                  </div>
                  <div className="h-3 w-full rounded-full bg-muted/60 overflow-hidden relative">
                    <div
                      className="h-full rounded-full transition-all duration-500 ease-out"
                      style={{
                        width: `${Math.max(pctOfTotal, 4)}%`,
                        backgroundColor: cfg.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}

            {/* Rejected Stage Indicator */}
            <div className="pt-2 border-t border-border/60 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span>Rejected / Archived:</span>
                <strong className="text-foreground">{stageBreakdown.rejected || 0}</strong>
              </span>
              <span className="text-[11px] font-mono">
                {total > 0 ? Math.round(((stageBreakdown.rejected || 0) / total) * 100) : 0}% of total
              </span>
            </div>
          </div>
        ) : !mounted ? (
          <div className="h-64 w-full flex items-center justify-center bg-muted/10 animate-pulse rounded-xl">
            <span className="text-xs text-muted-foreground">Loading chart...</span>
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 15, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="hsl(var(--border))"
                  opacity={0.5}
                />
                <XAxis
                  dataKey="name"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <YAxis
                  allowDecimals={false}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      const pct = total > 0 ? Math.round((data.count / total) * 100) : 0;
                      return (
                        <div className="rounded-lg border border-border bg-popover/95 p-2.5 text-xs shadow-md backdrop-blur-xs">
                          <p className="font-bold text-foreground">{data.name}</p>
                          <p className="font-semibold text-primary mt-1">
                            {data.count} candidate{data.count === 1 ? "" : "s"} ({pct}%)
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={44}>
                  {chartData.map((entry) => (
                    <Cell key={entry.stage} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
