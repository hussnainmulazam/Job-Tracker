"use client";

import React, { use, useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  CheckCircle2,
  AlertCircle,
  Globe,
  User,
  Mail,
  Briefcase,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  XCircle,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  schedulingApi,
  PublicSchedulePageInfo,
  TimeSlot,
  PublicSlotsResponse,
  InterviewRead,
} from "@/lib/api";

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export default function CandidateSchedulingPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const resolvedParams = use(params);
  const token = resolvedParams.token;

  const [selectedTz, setSelectedTz] = useState<string>("Asia/Karachi");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [notes, setNotes] = useState("");
  const [bookedInterview, setBookedInterview] = useState<InterviewRead | null>(null);
  const [isRescheduling, setIsRescheduling] = useState(false);
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 1. Fetch public link metadata
  const {
    data: pageInfo,
    isLoading: isInfoLoading,
    isError: isInfoError,
    refetch: refetchInfo,
  } = useQuery({
    queryKey: ["publicScheduleInfo", token],
    queryFn: () => schedulingApi.getPublicPage(token),
  });

  useEffect(() => {
    if (pageInfo?.default_timezone) {
      setSelectedTz(pageInfo.default_timezone);
    }
    if (pageInfo?.existing_interview) {
      setBookedInterview(pageInfo.existing_interview);
    }
  }, [pageInfo]);

  // 2. Fetch computed free slots
  const {
    data: slotsData,
    isLoading: isSlotsLoading,
    refetch: refetchSlots,
  } = useQuery({
    queryKey: ["publicSlots", token, selectedTz],
    queryFn: () => schedulingApi.getPublicSlots(token, { tz: selectedTz }),
    enabled: !!pageInfo && (pageInfo.status === "active" || isRescheduling),
  });

  // Set default selected date when slots load
  useEffect(() => {
    if (slotsData?.slots_by_date) {
      const dates = Object.keys(slotsData.slots_by_date);
      if (dates.length > 0 && (!selectedDate || !dates.includes(selectedDate))) {
        setSelectedDate(dates[0]);
      }
    }
  }, [slotsData, selectedDate]);

  // 3. Book Slot Mutation
  const bookMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlot) throw new Error("Please select a slot.");
      return schedulingApi.bookSlot(token, {
        start_time: selectedSlot.start_time,
        timezone: selectedTz,
        notes: notes.trim() || undefined,
      });
    },
    onSuccess: (interview) => {
      setBookedInterview(interview);
      setIsRescheduling(false);
      setErrorMessage(null);
      refetchInfo();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || "Failed to book interview slot.";
      setErrorMessage(msg);
      refetchSlots();
    },
  });

  // 4. Candidate Reschedule Mutation
  const rescheduleMutation = useMutation({
    mutationFn: () => {
      if (!selectedSlot) throw new Error("Please select a new slot.");
      return schedulingApi.candidateReschedule(token, {
        new_start_time: selectedSlot.start_time,
        timezone: selectedTz,
        reason: rescheduleReason || "Candidate rescheduled",
      });
    },
    onSuccess: (interview) => {
      setBookedInterview(interview);
      setIsRescheduling(false);
      setSelectedSlot(null);
      setErrorMessage(null);
      refetchInfo();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || "Failed to reschedule.";
      setErrorMessage(msg);
      refetchSlots();
    },
  });

  // 5. Candidate Cancel Mutation
  const cancelMutation = useMutation({
    mutationFn: () =>
      schedulingApi.candidateCancel(token, {
        reason: cancelReason || "Cancelled by candidate",
      }),
    onSuccess: (interview) => {
      setBookedInterview(interview);
      setShowCancelModal(false);
      refetchInfo();
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail || err?.message || "Failed to cancel.";
      setErrorMessage(msg);
    },
  });

  if (isInfoLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-6 h-6 text-primary animate-spin" />
          <p className="text-xs text-muted-foreground">Loading interview details...</p>
        </div>
      </div>
    );
  }

  if (isInfoError || !pageInfo) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-border/70 dark:border-white/[0.08] rounded-2xl p-8 text-center shadow-card">
          <AlertCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-1">Invalid or Expired Link</h2>
          <p className="text-xs text-muted-foreground mb-6">
            This scheduling invitation link is invalid or has expired. Please contact the hiring team
            for an updated link.
          </p>
        </div>
      </div>
    );
  }

  // Handle Expired State
  if (pageInfo.status === "expired" && !bookedInterview) {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-amber-500/30 rounded-2xl p-8 text-center shadow-card">
          <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-1">Scheduling Link Expired</h2>
          <p className="text-xs text-muted-foreground mb-6">
            This invitation to interview for{" "}
            <span className="text-foreground font-medium">{pageInfo.opening_title}</span> expired on{" "}
            {new Date(pageInfo.expires_at).toLocaleDateString()}.
          </p>
          <a
            href={`mailto:${pageInfo.interviewer_email}?subject=Interview Scheduling Link Expired - ${pageInfo.candidate_name}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-medium text-xs shadow-xs transition"
          >
            <Mail className="w-3.5 h-3.5" />
            Contact Recruiter
          </a>
        </div>
      </div>
    );
  }

  // Helper to build Google Calendar template URL
  const getGoogleCalendarUrl = (interview: InterviewRead) => {
    const startIso = new Date(interview.start_time).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const endIso = new Date(interview.end_time).toISOString().replace(/-|:|\.\d\d\d/g, "");
    const title = encodeURIComponent(interview.title);
    const details = encodeURIComponent(
      `AI Screening Copilot Interview\nGoogle Meet: ${interview.meet_link || "Link sent via email"}\nInterviewer: ${interview.interviewer_email}`
    );
    const location = encodeURIComponent(interview.meet_link || "Google Meet");
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${startIso}/${endIso}&details=${details}&location=${location}`;
  };

  // ── Render Booked / Confirmed State ─────────────────────────────────────────
  if (bookedInterview && bookedInterview.status !== "cancelled" && !isRescheduling) {
    const startDate = new Date(bookedInterview.start_time);
    const endDate = new Date(bookedInterview.end_time);
    const timeFormatted = startDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: bookedInterview.timezone,
    });
    const endTimeFormatted = endDate.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: bookedInterview.timezone,
    });
    const dateFormatted = startDate.toLocaleDateString(undefined, {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: bookedInterview.timezone,
    });

    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full bg-card border border-border/70 dark:border-white/[0.08] rounded-2xl p-8 shadow-card"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-3 ring-4 ring-emerald-500/10">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <Badge variant="success" className="text-xs mb-3">
              Interview Confirmed
            </Badge>
            <h1 className="text-xl font-bold tracking-tight text-foreground mb-1">You&apos;re Scheduled!</h1>
            <p className="text-xs text-muted-foreground mb-6">
              Hi <strong className="text-foreground">{bookedInterview.candidate_name}</strong>, your interview for{" "}
              <strong className="text-foreground">{bookedInterview.opening_title}</strong> is locked in.
            </p>

            {/* Time card */}
            <div className="w-full bg-muted/30 border border-border/70 rounded-xl p-5 text-left mb-6 space-y-3.5">
              <div className="flex items-start gap-3">
                <CalendarIcon className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Date</div>
                  <div className="text-sm font-semibold text-foreground">{dateFormatted}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div>
                  <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Time</div>
                  <div className="text-sm font-semibold text-foreground">
                    {timeFormatted} – {endTimeFormatted}{" "}
                    <span className="text-xs text-muted-foreground font-normal">({bookedInterview.timezone})</span>
                  </div>
                </div>
              </div>

              {bookedInterview.meet_link && (
                <div className="flex items-start gap-3 pt-3 border-t border-border/70">
                  <Video className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-[11px] uppercase tracking-wider font-semibold text-muted-foreground">Google Meet</div>
                    <a
                      href={bookedInterview.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-primary hover:underline font-medium inline-flex items-center gap-1.5 break-all mt-0.5"
                    >
                      {bookedInterview.meet_link}
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-2.5 mb-6">
              {bookedInterview.meet_link && (
                <a
                  href={bookedInterview.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-xs"
                >
                  <Video className="w-4 h-4" />
                  <span>Join Google Meet</span>
                </a>
              )}

              <a
                href={getGoogleCalendarUrl(bookedInterview)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-muted/60 hover:bg-muted text-foreground font-medium text-xs transition border border-border/70 shadow-xs"
              >
                <CalendarIcon className="w-4 h-4 text-primary" />
                <span>Add to Google Calendar</span>
              </a>
            </div>

            {/* Notification alert */}
            <div className="text-xs text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/70 w-full mb-6">
              A calendar invite has been sent to{" "}
              <span className="text-foreground font-medium">{bookedInterview.candidate_email}</span>.
            </div>

            {/* Reschedule / Cancel actions */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <button
                onClick={() => {
                  setIsRescheduling(true);
                  refetchSlots();
                }}
                className="text-muted-foreground hover:text-foreground underline underline-offset-4 transition"
              >
                Reschedule interview
              </button>
              <span className="text-muted-foreground/40">•</span>
              <button
                id="btn-trigger-cancel-interview"
                onClick={() => setShowCancelModal(true)}
                className="text-destructive hover:underline underline-offset-4 transition"
              >
                Cancel interview
              </button>
            </div>
          </div>
        </motion.div>

        {/* Cancellation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-6 shadow-card">
              <h3 className="text-sm font-semibold text-foreground mb-1">Cancel Interview</h3>
              <p className="text-xs text-muted-foreground mb-4">
                Are you sure you want to cancel this interview? The calendar event will be deleted
                and the recruiter will be notified.
              </p>
              <textarea
                placeholder="Reason for cancellation (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full bg-background border border-input rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground mb-4 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setShowCancelModal(false)}>
                  Keep Interview
                </Button>
                <Button
                  id="btn-confirm-cancel-interview"
                  variant="destructive"
                  size="sm"
                  onClick={() => cancelMutation.mutate()}
                  disabled={cancelMutation.isPending}
                >
                  {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Render Cancelled State ──────────────────────────────────────────────────
  if (bookedInterview?.status === "cancelled") {
    return (
      <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-card border border-destructive/20 rounded-2xl p-8 text-center shadow-card">
          <XCircle className="w-10 h-10 text-destructive mx-auto mb-3" />
          <h2 className="text-lg font-bold text-foreground mb-1">Interview Cancelled</h2>
          <p className="text-xs text-muted-foreground mb-4">
            This interview session for <span className="text-foreground">{pageInfo.opening_title}</span> has been cancelled.
          </p>
          {bookedInterview.cancellation_reason && (
            <p className="text-xs bg-muted/40 p-3 rounded-lg text-muted-foreground italic mb-6">
              &quot;{bookedInterview.cancellation_reason}&quot;
            </p>
          )}
          <Button
            onClick={() => {
              setBookedInterview(null);
              setIsRescheduling(false);
              refetchSlots();
            }}
            variant="outline"
            className="w-full"
          >
            Schedule a New Slot
          </Button>
        </div>
      </div>
    );
  }

  // ── Render Active Slot Picker / Reschedule View ──────────────────────────────
  const slotsByDate = slotsData?.slots_by_date || {};
  const availableDates = Object.keys(slotsByDate);
  const currentSlots = selectedDate ? slotsByDate[selectedDate] || [] : [];

  return (
    <div className="min-h-screen bg-background text-foreground py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Card */}
        <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-2xl p-6 sm:p-8 mb-6 shadow-card relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge variant="primary" className="text-xs">
                  {pageInfo.opening_title}
                </Badge>
                <Badge variant="secondary" className="text-xs capitalize font-medium">
                  {pageInfo.round_type ? `${pageInfo.round_type.charAt(0).toUpperCase() + pageInfo.round_type.slice(1)} Round` : "Interview"}
                </Badge>
                <Badge variant="outline" className="text-xs gap-1">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                  <span>{pageInfo.slot_duration_minutes} mins</span>
                </Badge>
                <Badge variant="success" className="text-xs gap-1">
                  <Video className="w-3 h-3" />
                  <span>Google Meet</span>
                </Badge>
              </div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">
                {isRescheduling ? "Reschedule Interview" : `Hi ${pageInfo.candidate_name}, Select a Time`}
              </h1>
              <p className="text-xs text-muted-foreground mt-1">
                Choose a time that works best for your upcoming screening interview with{" "}
                <span className="text-foreground font-medium">{pageInfo.interviewer_email}</span>.
              </p>
            </div>

            {/* Timezone picker */}
            <div className="shrink-0 flex flex-col items-start md:items-end">
              <label className="text-[11px] font-medium text-muted-foreground flex items-center gap-1.5 mb-1.5">
                <Globe className="w-3.5 h-3.5 text-primary" />
                <span>Your Timezone</span>
              </label>
              <select
                value={selectedTz}
                onChange={(e) => {
                  setSelectedTz(e.target.value);
                  setSelectedSlot(null);
                }}
                className="bg-background text-foreground text-xs border border-input rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-ring font-medium"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Error banner */}
        {errorMessage && (
          <div className="mb-6 p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <p className="flex-1">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="text-xs underline">
              Dismiss
            </button>
          </div>
        )}

        {/* Main Slot Picker Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left: Day List */}
          <div className="lg:col-span-5 bg-card border border-border/70 dark:border-white/[0.08] rounded-2xl p-5 shadow-card h-fit">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-primary" />
              <span>Available Dates</span>
            </h2>

            {isSlotsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-muted-foreground text-xs gap-2">
                <RefreshCw className="w-5 h-5 animate-spin text-primary" />
                <span>Checking recruiter calendar...</span>
              </div>
            ) : availableDates.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-xs">
                No slots available in this date range. Please contact HR.
              </div>
            ) : (
              <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
                {availableDates.map((dateStr) => {
                  const [y, m, d] = dateStr.split("-").map(Number);
                  const dateObj = new Date(y, m - 1, d);
                  const dayName = dateObj.toLocaleDateString("en-US", { weekday: "short" });
                  const monthDay = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
                  const slotCount = (slotsByDate[dateStr] || []).length;
                  const isSelected = selectedDate === dateStr;

                  return (
                    <button
                      key={dateStr}
                      onClick={() => {
                        setSelectedDate(dateStr);
                        setSelectedSlot(null);
                      }}
                      className={`w-full flex items-center justify-between p-3 rounded-xl transition border text-left cursor-pointer ${
                        isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                          : "bg-muted/40 hover:bg-muted text-foreground border-border/70"
                      }`}
                    >
                      <div>
                        <div className="text-[10px] uppercase tracking-wider opacity-80">{dayName}</div>
                        <div className="text-xs font-semibold">{monthDay}</div>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full ${
                          isSelected ? "bg-white/20 text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {slotCount} slots
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right: Slots for selected date & confirmation */}
          <div className="lg:col-span-7 bg-card border border-border/70 dark:border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-card flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-border/70">
                <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <span>Select a Time Slot</span>
                </h2>
                {selectedDate && (
                  <span className="text-xs text-muted-foreground font-medium">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>

              {currentSlots.length === 0 ? (
                <div className="py-16 text-center text-muted-foreground text-xs">
                  Please pick a date on the left to see available times.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-[320px] overflow-y-auto pr-1">
                  {currentSlots.map((slot) => {
                    const isSelected = selectedSlot?.start_time === slot.start_time;
                    return (
                      <button
                        key={slot.start_time}
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-2.5 px-2 rounded-lg text-xs font-medium border transition text-center cursor-pointer ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-xs font-semibold"
                            : "bg-muted/40 hover:bg-muted text-foreground border-border/70"
                        }`}
                      >
                        {slot.start_time_local}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Optional Candidate Notes */}
              {selectedSlot && (
                <div className="mt-5 pt-4 border-t border-border/70">
                  <label className="text-xs font-medium text-foreground block mb-1.5">
                    {isRescheduling ? "Reason for Rescheduling" : "Notes or Topics to Discuss (Optional)"}
                  </label>
                  <textarea
                    rows={2}
                    value={isRescheduling ? rescheduleReason : notes}
                    onChange={(e) =>
                      isRescheduling ? setRescheduleReason(e.target.value) : setNotes(e.target.value)
                    }
                    placeholder={
                      isRescheduling
                        ? "Brief reason for new time..."
                        : "Any questions or portfolio links you'd like to share ahead of time..."
                    }
                    className="w-full bg-background border border-input rounded-lg p-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                </div>
              )}
            </div>

            {/* Confirm & Book Button */}
            <div className="mt-6 pt-4 border-t border-border/70">
              <Button
                id="btn-confirm-booking"
                onClick={() => (isRescheduling ? rescheduleMutation.mutate() : bookMutation.mutate())}
                disabled={!selectedSlot || bookMutation.isPending || rescheduleMutation.isPending}
                className="w-full h-10 rounded-lg font-medium text-xs shadow-xs transition flex items-center justify-center gap-2"
              >
                {bookMutation.isPending || rescheduleMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Confirming with Google Calendar...</span>
                  </>
                ) : selectedSlot ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      {isRescheduling
                        ? `Confirm Reschedule to ${selectedSlot.start_time_local}`
                        : `Confirm Interview for ${selectedSlot.start_time_local}`}
                    </span>
                  </>
                ) : (
                  <span>Select a Time Slot to Continue</span>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
