"use client";

import React from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  X,
  User,
  Briefcase,
  Mail,
  Phone,
  ExternalLink,
  FileText,
  Check,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalendarEventItem, InterviewRead } from "@/lib/api";

interface EventSidePanelProps {
  event: CalendarEventItem | null;
  onClose: () => void;
  onReschedule?: (interview: InterviewRead) => void;
  onCancel?: (interview: InterviewRead) => void;
  onRecordResult?: (interview: InterviewRead) => void;
  onOpenScorecard?: (candidateId: string) => void;
}

export function EventSidePanel({
  event,
  onClose,
  onReschedule,
  onCancel,
  onRecordResult,
  onOpenScorecard,
}: EventSidePanelProps) {
  if (!event) return null;

  const isInterview = event.is_interview && !!event.interview_data;
  const data = event.interview_data;

  // Format date and time
  const startDate = event.start ? new Date(event.start) : null;
  const endDate = event.end ? new Date(event.end) : null;

  const dateStr = startDate
    ? startDate.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const timeStr = startDate
    ? `${startDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} – ${
        endDate
          ? endDate.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
          : ""
      }`
    : "";

  const durationMin =
    startDate && endDate
      ? Math.round((endDate.getTime() - startDate.getTime()) / (1000 * 60))
      : 30;

  const roundName = (data?.round || "Initial").toLowerCase();
  const roundBadgeClass =
    roundName === "initial"
      ? "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30"
      : roundName === "technical"
      ? "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30"
      : roundName === "behavioral"
      ? "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";

  // Construct InterviewRead instance so existing action modals receive exact expected data
  const mockInterviewRead: InterviewRead | null = data
    ? {
        id: data.interview_id,
        user_id: "",
        candidate_id: data.candidate_id,
        opening_id: data.opening_id || "",
        opening_title: data.opening_title || "Requisition",
        title: event.title,
        round_type: data.round,
        start_time: event.start,
        end_time: event.end,
        timezone: "Asia/Karachi",
        google_calendar_event_id: event.id,
        meet_link: event.meet_link || data.meet_link || null,
        candidate_name: data.candidate_name,
        candidate_email: data.candidate_email,
        candidate_phone: data.candidate_phone || null,
        interviewer_email: "",
        status: (data.status as any) || "scheduled",
        result_status: data.result_status || null,
        feedback: data.feedback || null,
        reminder_24h_sent: false,
        reminder_1h_sent: false,
        created_at: event.start,
        updated_at: event.start,
      }
    : null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card border-l border-border/80 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
      {/* ── Top Header ──────────────────────────────────────────────── */}
      <div className="p-4 border-b border-border/60 flex items-start justify-between gap-3 bg-muted/20">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: event.color }}
            />
            <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              {isInterview ? "Agent Interview Session" : "Google Calendar Event"}
            </span>
          </div>
          <h2 className="text-base font-bold text-foreground leading-snug">
            {event.title}
          </h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClose}
          className="h-8 w-8 p-0 rounded-lg text-muted-foreground hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </Button>
      </div>

      {/* ── Body ────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Date and Time block */}
        <div className="rounded-xl border border-border/60 p-3.5 bg-muted/30 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <CalendarIcon className="w-4 h-4 text-primary" />
            <span>{dateStr}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span>
              {timeStr} ({durationMin} mins)
            </span>
          </div>
        </div>

        {/* Interview Specific Details */}
        {isInterview && data && (
          <div className="space-y-4">
            {/* Round Badge and Requisition */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Interview Stage:</span>
              <Badge variant="outline" className={`font-semibold capitalize text-xs ${roundBadgeClass}`}>
                {data.round} Round
              </Badge>
            </div>

            {data.opening_title && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">Requisition:</span>
                <span className="text-xs font-semibold text-foreground text-right truncate max-w-[200px]">
                  {data.opening_title}
                </span>
              </div>
            )}

            {/* Candidate Card */}
            <div className="rounded-xl border border-border/70 p-3.5 space-y-2.5 bg-card">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Candidate Info
                </span>
                {onOpenScorecard && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenScorecard(data.candidate_id)}
                    className="h-6 text-[11px] font-semibold text-primary px-1.5"
                  >
                    <FileText className="w-3 h-3 mr-1" />
                    Scorecard
                  </Button>
                )}
              </div>

              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="font-bold text-foreground">{data.candidate_name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <a
                    href={`mailto:${data.candidate_email}`}
                    className="text-muted-foreground hover:text-primary truncate"
                  >
                    {data.candidate_email}
                  </a>
                </div>
                {data.candidate_phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="text-muted-foreground">{data.candidate_phone}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Google Meet Join CTA */}
            {event.meet_link && (
              <a
                href={event.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.99]"
              >
                <Video className="w-4 h-4" />
                <span>Join Google Meet</span>
                <ExternalLink className="w-3 h-3 opacity-70 ml-1" />
              </a>
            )}

            {/* Record Decision / Result Action */}
            {onRecordResult && mockInterviewRead && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">
                  Session Decision
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onRecordResult(mockInterviewRead)}
                  className="w-full h-8 text-xs font-semibold gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                >
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <span>
                    {data.result_status ? `Result: ${data.result_status.toUpperCase()}` : "Record Interview Result"}
                  </span>
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Regular Google Event Details */}
        {!isInterview && (
          <div className="space-y-4">
            {event.meet_link && (
              <a
                href={event.meet_link}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md transition-all active:scale-[0.99]"
              >
                <Video className="w-4 h-4" />
                <span>Join Google Meet</span>
                <ExternalLink className="w-3 h-3 opacity-70 ml-1" />
              </a>
            )}

            {event.attendees && event.attendees.length > 0 && (
              <div className="space-y-2">
                <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                  Attendees ({event.attendees.length})
                </span>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {event.attendees.map((att, idx) => (
                    <div
                      key={idx}
                      className="text-xs flex items-center justify-between p-2 rounded-lg bg-muted/20 border border-border/50"
                    >
                      <span className="font-medium text-foreground truncate max-w-[240px]">
                        {att.name || att.email}
                      </span>
                      {att.response_status && (
                        <span className="text-[10px] text-muted-foreground capitalize font-mono">
                          {att.response_status}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Bottom Actions (Reschedule / Cancel) ───────────────────────── */}
      {isInterview && mockInterviewRead && (
        <div className="p-4 border-t border-border/60 bg-muted/10 flex items-center justify-between gap-2">
          {onReschedule && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onReschedule(mockInterviewRead)}
              className="flex-1 text-xs font-semibold h-8"
            >
              Reschedule
            </Button>
          )}
          {onCancel && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onCancel(mockInterviewRead)}
              className="flex-1 text-xs font-semibold h-8 text-rose-600 border-rose-500/30 hover:bg-rose-500/10 hover:text-rose-700 dark:text-rose-400"
            >
              Cancel Session
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
