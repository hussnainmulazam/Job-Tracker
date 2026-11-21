"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Zap, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { calendarApi, CalendarEventItem, InterviewRead } from "@/lib/api";
import { useAgentEvents } from "@/lib/use-agent-events";
import { CalendarSkeleton } from "./calendar-skeleton";
import { EventSidePanel } from "./event-side-panel";

// Dynamically load the FullCalendar component on client only (Requirement 1)
const GoogleCalendarComponent = dynamic(
  () => import("./google-calendar-component"),
  {
    ssr: false,
    loading: () => <CalendarSkeleton />,
  }
);

interface GoogleCalendarViewProps {
  onReschedule?: (interview: InterviewRead) => void;
  onCancel?: (interview: InterviewRead) => void;
  onRecordResult?: (interview: InterviewRead) => void;
  onOpenScorecard?: (candidateId: string) => void;
}

export function GoogleCalendarView({
  onReschedule,
  onCancel,
  onRecordResult,
  onOpenScorecard,
}: GoogleCalendarViewProps) {
  const queryClient = useQueryClient();

  // Selected event for side panel inspection
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventItem | null>(null);

  // Visible date range state
  const [visibleRange, setVisibleRange] = useState<{ start?: string; end?: string }>({});

  // 1. Fetch Calendar Events (Requirement 2 & 3)
  const {
    data,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: ["calendar-events", visibleRange.start, visibleRange.end],
    queryFn: () => calendarApi.getEvents(visibleRange),
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  // 2. Realtime SSE Updates (Requirement 6)
  useAgentEvents({
    onEvent: (evt) => {
      if (
        evt.event === "interview_scheduled" ||
        evt.event === "interview_rescheduled" ||
        evt.event === "interview_cancelled" ||
        evt.event === "calendar_updated"
      ) {
        queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
      }
    },
  });

  const handleDatesChange = (start: string, end: string) => {
    setVisibleRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  };

  return (
    <div className="space-y-4">
      {/* ── Not Connected / Reconnect Warning Banner (Requirement 7) ──── */}
      {data && !data.connected && (
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs sm:text-sm font-bold text-foreground">
                {data.reconnect_required
                  ? "Google Calendar Authorization Expired"
                  : "Google Calendar Not Connected"}
              </p>
              <p className="text-[11px] sm:text-xs text-muted-foreground mt-0.5">
                {data.message ||
                  "Connect your Google Workspace account to sync your live Google Calendar commitments, Google Meet rooms, and HR availability."}
              </p>
            </div>
          </div>

          <Link href="/settings?tab=google">
            <Button
              size="sm"
              className="h-8 gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shrink-0 shadow-xs"
            >
              <Zap className="w-3.5 h-3.5" />
              <span>{data.reconnect_required ? "Reconnect Google" : "Connect Google Workspace"}</span>
            </Button>
          </Link>
        </div>
      )}

      {/* ── Skeleton Loading State ───────────────────────────────────── */}
      {isLoading ? (
        <CalendarSkeleton />
      ) : (
        /* ── Core FullCalendar View ─────────────────────────────────── */
        <GoogleCalendarComponent
          data={
            data || {
              connected: false,
              reconnect_required: false,
              time_zone: "Asia/Karachi",
              business_hours: [],
              events: [],
            }
          }
          onEventClick={(evt) => setSelectedEvent(evt)}
          onDatesChange={handleDatesChange}
          onRefresh={() => refetch()}
          isRefetching={isRefetching}
        />
      )}

      {/* ── Event Side Panel (Requirement 4) ─────────────────────────── */}
      {selectedEvent && (
        <EventSidePanel
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onReschedule={(inv) => {
            setSelectedEvent(null);
            if (onReschedule) onReschedule(inv);
          }}
          onCancel={(inv) => {
            setSelectedEvent(null);
            if (onCancel) onCancel(inv);
          }}
          onRecordResult={(inv) => {
            setSelectedEvent(null);
            if (onRecordResult) onRecordResult(inv);
          }}
          onOpenScorecard={(candidateId) => {
            setSelectedEvent(null);
            if (onOpenScorecard) onOpenScorecard(candidateId);
          }}
        />
      )}
    </div>
  );
}
