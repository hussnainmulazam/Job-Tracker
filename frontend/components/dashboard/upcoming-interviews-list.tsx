"use client";

import React from "react";
import Link from "next/link";
import { formatDayTime } from "@/lib/format-date";
import {
  Calendar,
  Video,
  Clock,
  ExternalLink,
  ChevronRight,
  ArrowRight,
  User,
  Plus,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

interface UpcomingInterviewsListProps {
  stats?: DashboardStats;
  isLoading?: boolean;
}

export function UpcomingInterviewsList({ stats, isLoading }: UpcomingInterviewsListProps) {
  const interviews = stats?.upcoming_interviews || [];

  return (
    <Card className="border border-border/70 dark:border-white/[0.08] bg-card shadow-card rounded-xl flex flex-col justify-between">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <span>Upcoming Interviews</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Synchronized with Google Calendar & Meet
          </CardDescription>
        </div>
        <Link href="/interviews">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
            <span>All Interviews</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="pt-0 space-y-3">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : interviews.length === 0 ? (
          <div className="py-10 flex flex-col items-center justify-center border border-dashed border-border/70 rounded-xl bg-muted/10 p-4 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/50 mb-2" />
            <p className="text-xs font-semibold text-foreground">No upcoming interviews scheduled</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5 mb-3">
              Offer candidate scheduling links from the Candidate Drawer or Pipeline.
            </p>
            <Link href="/interviews">
              <Button size="sm" variant="outline" className="text-xs h-7 gap-1">
                <Plus className="h-3 w-3 text-primary" />
                <span>Schedule Interview</span>
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-2.5">
            {interviews.map((item) => {
              const formattedTime = formatDayTime(item.start_time);

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 rounded-lg border border-border/70 bg-muted/30 hover:bg-muted/50 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-3">
                    <div className="flex items-center gap-2">
                      <p className="text-xs font-semibold text-foreground truncate">{item.candidate_name}</p>
                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                        {item.status}
                      </Badge>
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {item.opening_title || "General Screening"} • {formattedTime}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {item.meet_link ? (
                      <a
                        href={item.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium shadow-xs transition-colors"
                      >
                        <Video className="h-3.5 w-3.5" />
                        <span>Join Meet</span>
                      </a>
                    ) : (
                      <Link href={`/interviews`}>
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1">
                          <span>Details</span>
                          <ChevronRight className="h-3 w-3" />
                        </Button>
                      </Link>
                    )}
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
