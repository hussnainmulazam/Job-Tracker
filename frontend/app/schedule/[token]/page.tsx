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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-sm text-slate-400">Loading interview details...</p>
        </div>
      </div>
    );
  }

  if (isInfoError || !pageInfo) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center">
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Invalid or Expired Link</h2>
          <p className="text-sm text-slate-400 mb-6">
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-amber-500/30 rounded-2xl p-8 text-center">
          <Clock className="w-12 h-12 text-amber-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">Scheduling Link Expired</h2>
          <p className="text-sm text-slate-400 mb-6">
            This invitation to interview for{" "}
            <span className="text-white font-medium">{pageInfo.opening_title}</span> expired on{" "}
            {new Date(pageInfo.expires_at).toLocaleDateString()}.
          </p>
          <a
            href={`mailto:${pageInfo.interviewer_email}?subject=Interview Scheduling Link Expired - ${pageInfo.candidate_name}`}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition"
          >
            <Mail className="w-4 h-4" />
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl"
        >
          <div className="flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4 ring-8 ring-emerald-500/10">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 mb-3">
              Interview Confirmed
            </span>
            <h1 className="text-2xl font-bold text-white mb-1">You're Scheduled!</h1>
            <p className="text-sm text-slate-400 mb-6">
              Hi <strong className="text-slate-200">{bookedInterview.candidate_name}</strong>, your interview for{" "}
              <strong className="text-slate-200">{bookedInterview.opening_title}</strong> is locked in.
            </p>

            {/* Time card */}
            <div className="w-full bg-slate-800/60 border border-slate-700/60 rounded-2xl p-6 text-left mb-6 space-y-4">
              <div className="flex items-start gap-3">
                <CalendarIcon className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">Date</div>
                  <div className="text-base font-semibold text-white">{dateFormatted}</div>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-indigo-400 mt-0.5 shrink-0" />
                <div>
                  <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">Time</div>
                  <div className="text-base font-semibold text-white">
                    {timeFormatted} – {endTimeFormatted}{" "}
                    <span className="text-xs text-slate-400">({bookedInterview.timezone})</span>
                  </div>
                </div>
              </div>

              {bookedInterview.meet_link && (
                <div className="flex items-start gap-3 pt-2 border-t border-slate-700/50">
                  <Video className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-xs uppercase tracking-wider font-semibold text-slate-400">Google Meet</div>
                    <a
                      href={bookedInterview.meet_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1.5 break-all mt-0.5"
                    >
                      {bookedInterview.meet_link}
                      <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Action buttons */}
            <div className="w-full space-y-3 mb-6">
              {bookedInterview.meet_link && (
                <a
                  href={bookedInterview.meet_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-sm transition shadow-lg shadow-emerald-600/20"
                >
                  <Video className="w-4 h-4" />
                  Join Google Meet
                </a>
              )}

              <a
                href={getGoogleCalendarUrl(bookedInterview)}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-sm transition border border-slate-700"
              >
                <CalendarIcon className="w-4 h-4 text-blue-400" />
                Add to Google Calendar
              </a>
            </div>

            {/* Notification alert */}
            <div className="text-xs text-slate-400 bg-slate-950/60 p-3 rounded-xl border border-slate-800 w-full mb-6">
              A calendar invite and automated reminders (24 hours and 1 hour before) will be sent to{" "}
              <span className="text-slate-300 font-medium">{bookedInterview.candidate_email}</span> and via WhatsApp.
            </div>

            {/* Reschedule / Cancel actions */}
            <div className="flex items-center justify-center gap-4 text-xs">
              <button
                onClick={() => {
                  setIsRescheduling(true);
                  refetchSlots();
                }}
                className="text-slate-400 hover:text-white underline underline-offset-4 transition"
              >
                Reschedule interview
              </button>
              <span className="text-slate-600">•</span>
              <button
                id="btn-trigger-cancel-interview"
                onClick={() => setShowCancelModal(true)}
                className="text-rose-400 hover:text-rose-300 underline underline-offset-4 transition"
              >
                Cancel interview
              </button>
            </div>
          </div>
        </motion.div>

        {/* Cancellation Modal */}
        {showCancelModal && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-lg font-bold text-white mb-2">Cancel Interview</h3>
              <p className="text-xs text-slate-400 mb-4">
                Are you sure you want to cancel this interview? Your Google Calendar event will be deleted
                and the recruiter will be notified.
              </p>
              <textarea
                placeholder="Reason for cancellation (optional)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                rows={3}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 mb-4 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
              <div className="flex justify-end gap-3">
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
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-rose-500/30 rounded-2xl p-8 text-center">
          <XCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-white mb-2">Interview Cancelled</h2>
          <p className="text-sm text-slate-400 mb-4">
            This interview session for <span className="text-white">{pageInfo.opening_title}</span> has been cancelled.
          </p>
          {bookedInterview.cancellation_reason && (
            <p className="text-xs bg-slate-950 p-3 rounded-lg text-slate-400 italic mb-6">
              "{bookedInterview.cancellation_reason}"
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
    <div className="min-h-screen bg-slate-950 text-slate-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 mb-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  {pageInfo.opening_title}
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 flex items-center gap-1">
                  <Clock className="w-3 h-3 text-slate-400" />
                  {pageInfo.slot_duration_minutes} mins
                </span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center gap-1 border border-emerald-500/20">
                  <Video className="w-3 h-3" />
                  Google Meet
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {isRescheduling ? "Reschedule Interview" : `Hi ${pageInfo.candidate_name}, Select a Time`}
              </h1>
              <p className="text-sm text-slate-400 mt-1">
                Choose a time that works best for your upcoming screening interview with{" "}
                <span className="text-slate-200">{pageInfo.interviewer_email}</span>.
              </p>
            </div>

            {/* Timezone picker */}
            <div className="shrink-0 flex flex-col items-start md:items-end">
              <label className="text-xs font-medium text-slate-400 flex items-center gap-1.5 mb-1.5">
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                Your Timezone
              </label>
              <select
                value={selectedTz}
                onChange={(e) => {
                  setSelectedTz(e.target.value);
                  setSelectedSlot(null);
                }}
                className="bg-slate-800 text-white text-xs border border-slate-700 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
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
          <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <p className="flex-1">{errorMessage}</p>
            <button onClick={() => setErrorMessage(null)} className="text-xs underline text-rose-200">
              Dismiss
            </button>
          </div>
        )}

        {/* Main Slot Picker Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Date Carousel & Day List */}
          <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl h-fit">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4 flex items-center gap-2">
              <CalendarIcon className="w-4 h-4 text-blue-400" />
              Available Dates
            </h2>

            {isSlotsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
                <span>Checking recruiter calendar...</span>
              </div>
            ) : availableDates.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-sm">
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
                      className={`w-full flex items-center justify-between p-3.5 rounded-2xl transition border text-left ${
                        isSelected
                          ? "bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/30 font-semibold"
                          : "bg-slate-800/60 hover:bg-slate-800 text-slate-200 border-slate-700/60 hover:border-slate-600"
                      }`}
                    >
                      <div>
                        <div className="text-xs uppercase tracking-wider opacity-80">{dayName}</div>
                        <div className="text-sm font-bold">{monthDay}</div>
                      </div>
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full ${
                          isSelected ? "bg-white/20 text-white" : "bg-slate-900 text-slate-400"
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
          <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Clock className="w-4 h-4 text-indigo-400" />
                  Select a Time Slot
                </h2>
                {selectedDate && (
                  <span className="text-xs text-slate-400 font-medium">
                    {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
                      weekday: "long",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>

              {currentSlots.length === 0 ? (
                <div className="py-16 text-center text-slate-500 text-sm">
                  Please pick a date on the left to see available times.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-[320px] overflow-y-auto pr-1">
                  {currentSlots.map((slot) => {
                    const isSelected = selectedSlot?.start_time === slot.start_time;
                    return (
                      <button
                        key={slot.start_time}
                        onClick={() => setSelectedSlot(slot)}
                        className={`py-3 px-2 rounded-xl text-xs font-semibold border transition text-center ${
                          isSelected
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-md shadow-indigo-600/30"
                            : "bg-slate-800/80 hover:bg-slate-750 text-slate-200 border-slate-700 hover:border-slate-600"
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
                <div className="mt-6 pt-4 border-t border-slate-800">
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">
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
                    className="w-full bg-slate-800/90 border border-slate-700 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {/* Confirm & Book Button */}
            <div className="mt-8 pt-4 border-t border-slate-800">
              <Button
                id="btn-confirm-booking"
                onClick={() => (isRescheduling ? rescheduleMutation.mutate() : bookMutation.mutate())}
                disabled={!selectedSlot || bookMutation.isPending || rescheduleMutation.isPending}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold text-sm shadow-lg shadow-blue-600/25 transition flex items-center justify-center gap-2"
              >
                {bookMutation.isPending || rescheduleMutation.isPending ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Confirming with Google Calendar...
                  </>
                ) : selectedSlot ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {isRescheduling
                      ? `Confirm Reschedule to ${selectedSlot.start_time_local}`
                      : `Confirm Interview for ${selectedSlot.start_time_local}`}
                  </>
                ) : (
                  "Select a Time Slot to Continue"
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
