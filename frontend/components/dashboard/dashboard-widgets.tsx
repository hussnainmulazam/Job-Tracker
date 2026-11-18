"use client";

import React from "react";
import Link from "next/link";
import { formatDayTime } from "@/lib/format-date";
import {
  Calendar,
  Video,
  Clock,
  ArrowRight,
  MessageSquare,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  User,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardStats } from "@/lib/api";

export function UpcomingInterviewsWidget({
  stats,
  isLoading,
}: {
  stats?: DashboardStats;
  isLoading?: boolean;
}) {
  const interviews = stats?.upcoming_interviews || [];

  return (
    <Card className="border border-border bg-card shadow-2xs hover:shadow-xs transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
            <span>Upcoming Interviews</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Synchronized with Google Calendar & Meet
          </CardDescription>
        </div>
        <Link href="/interviews">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
            <span>Calendar</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : interviews.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center border border-dashed rounded-xl bg-muted/10 p-4 text-center">
            <Calendar className="h-7 w-7 text-muted-foreground/50 mb-1.5" />
            <p className="text-xs font-semibold text-foreground">No upcoming interviews this week</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5">
              Generate tokenized scheduling links from candidate profiles to book slots.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {interviews.map((item) => {
              const formattedTime = formatDayTime(item.start_time);

              return (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-0.5 min-w-0 pr-2">
                    <p className="text-xs font-bold text-foreground truncate">{item.candidate_name}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {item.opening_title || "General Screening"} • {formattedTime}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {item.meet_link ? (
                      <a
                        href={item.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 hover:bg-purple-500/20 text-xs font-semibold transition-colors"
                      >
                        <Video className="h-3 w-3" />
                        <span>Meet</span>
                      </a>
                    ) : (
                      <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-md bg-muted">
                        Confirmed
                      </span>
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

export function AwaitingReplyWidget({
  stats,
  isLoading,
}: {
  stats?: DashboardStats;
  isLoading?: boolean;
}) {
  const threads = stats?.awaiting_reply_threads || [];

  return (
    <Card className="border border-border bg-card shadow-2xs hover:shadow-xs transition-shadow">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div className="space-y-0.5">
          <CardTitle className="text-sm font-bold tracking-tight flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <span>Messages Awaiting Reply</span>
          </CardTitle>
          <CardDescription className="text-xs text-muted-foreground">
            Inbound WhatsApp candidate inquiries requiring response
          </CardDescription>
        </div>
        <Link href="/inbox">
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground hover:text-foreground">
            <span>Unified Inbox</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </Link>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="h-36 flex flex-col items-center justify-center border border-dashed rounded-xl bg-muted/10 p-4 text-center">
            <CheckCircle2 className="h-7 w-7 text-emerald-500/60 mb-1.5" />
            <p className="text-xs font-semibold text-foreground">All messages answered</p>
            <p className="text-[11px] text-muted-foreground max-w-xs mt-0.5">
              Zero candidate threads are currently awaiting recruiter response.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {threads.map((thread) => (
              <div
                key={thread.candidate_id}
                className="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-muted/20 hover:bg-muted/40 transition-colors"
              >
                <div className="space-y-0.5 min-w-0 pr-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-foreground truncate">
                      {thread.candidate_name}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      • {thread.hours_ago < 1 ? "Just now" : `${thread.hours_ago}h ago`}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
                    "{thread.last_message}"
                  </p>
                </div>
                <Link href={`/inbox?candidate_id=${thread.candidate_id}`}>
                  <Button size="sm" variant="outline" className="h-7 text-xs px-2.5 font-semibold gap-1">
                    <span>Reply</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
