"use client";

import React, { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { TrendingUp, Calendar, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

interface ApplicationsTimelineChartProps {
  stats?: DashboardStats;
  isLoading?: boolean;
}

export function ApplicationsTimelineChart({ stats, isLoading }: ApplicationsTimelineChartProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const timelineData = stats?.applications_timeline || [];
  const totalInPeriod = timelineData.reduce((acc, curr) => acc + curr.count, 0);

  return (
    <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-card rounded-xl flex flex-col justify-between h-full">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <span>Applications Over Time</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Daily candidate volume over the last 14 days ({totalInPeriod} total)
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="pt-2">
        {isLoading || !mounted ? (
          <div className="h-56 flex items-center justify-center">
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
        ) : timelineData.length === 0 || totalInPeriod === 0 ? (
          <div className="h-56 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl bg-muted/10 p-4 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs font-semibold text-foreground">No applications in this time range</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-1 mb-3">
              Candidate resumes ingested via Gmail or PDF upload will plot automatically here.
            </p>
            <Link href="/pipeline">
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                <span>View Pipeline</span>
                <ArrowRight className="h-3 w-3" />
              </Button>
            </Link>
          </div>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="applicationsGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border) / 0.5)" />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="rounded-lg border border-border bg-popover p-2 shadow-card text-xs">
                          <p className="font-semibold text-foreground">{label}</p>
                          <p className="text-[11px] text-primary font-mono mt-0.5">
                            {payload[0].value} candidate application{payload[0].value === 1 ? "" : "s"}
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#applicationsGradient)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
