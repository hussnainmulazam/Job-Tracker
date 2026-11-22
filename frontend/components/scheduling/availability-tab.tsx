"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Globe,
  Save,
  RefreshCw,
  Calendar,
  Plus,
  Trash2,
  CheckCircle2,
  ShieldAlert,
  Copy,
  Check,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Video,
  Sparkles,
  Sliders,
  Eye,
  Info,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  schedulingApi,
  AvailabilityScheduleCreateOrUpdate,
  AvailabilityWeekPreviewResponse,
  CalendarBusyEvent,
  CalendarBookedInterview,
  CalendarFreeSlot,
} from "@/lib/api";

const DAYS = [
  { key: "mon", label: "Monday", short: "Mon" },
  { key: "tue", label: "Tuesday", short: "Tue" },
  { key: "wed", label: "Wednesday", short: "Wed" },
  { key: "thu", label: "Thursday", short: "Thu" },
  { key: "fri", label: "Friday", short: "Fri" },
  { key: "sat", label: "Saturday", short: "Sat" },
  { key: "sun", label: "Sunday", short: "Sun" },
];

const TIMEZONES = [
  "Asia/Karachi",
  "Asia/Dubai",
  "Asia/Riyadh",
  "Asia/Kolkata",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "UTC",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
];

function getMondayOfDate(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function toIsoDate(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatRangeLabel(mon: Date, sun: Date): string {
  const mOpt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const yOpt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  if (mon.getFullYear() === sun.getFullYear()) {
    return `${mon.toLocaleDateString("en-US", mOpt)} – ${sun.toLocaleDateString("en-US", yOpt)}`;
  }
  return `${mon.toLocaleDateString("en-US", yOpt)} – ${sun.toLocaleDateString("en-US", yOpt)}`;
}

export function AvailabilityTab() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── 1. Weekly Editor Form State ─────────────────────────────────────────────
  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [weeklyConfig, setWeeklyConfig] = useState<
    Record<string, { enabled: boolean; start: string; end: string }>
  >({
    mon: { enabled: true, start: "09:00", end: "17:00" },
    tue: { enabled: true, start: "09:00", end: "17:00" },
    wed: { enabled: true, start: "09:00", end: "17:00" },
    thu: { enabled: true, start: "09:00", end: "17:00" },
    fri: { enabled: true, start: "09:00", end: "17:00" },
    sat: { enabled: false, start: "10:00", end: "14:00" },
    sun: { enabled: false, start: "10:00", end: "14:00" },
  });

  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [newBlockedDate, setNewBlockedDate] = useState("");

  // Confirmation feedback state: triggers ONLY after 200 OK from server
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showCandidatePreview, setShowCandidatePreview] = useState(false);

  // ── 2. Calendar Week Navigation State ──────────────────────────────────────
  const [currentWeekMonday, setCurrentWeekMonday] = useState<Date>(() => getMondayOfDate(new Date()));

  const weekSunday = useMemo(() => {
    const sun = new Date(currentWeekMonday);
    sun.setDate(sun.getDate() + 6);
    return sun;
  }, [currentWeekMonday]);

  const currentMondayIso = useMemo(() => toIsoDate(currentWeekMonday), [currentWeekMonday]);
  const todayIso = useMemo(() => toIsoDate(new Date()), []);

  // ── 3. Queries ─────────────────────────────────────────────────────────────
  // Fetch recruiter availability rules
  const {
    data: schedule,
    isLoading: isScheduleLoading,
    refetch: refetchSchedule,
  } = useQuery({
    queryKey: ["recruiterAvailability"],
    queryFn: () => schedulingApi.getAvailability(),
  });

  // Fetch unified 7-day calendar week preview
  const {
    data: weekPreview,
    isLoading: isPreviewLoading,
    isFetching: isPreviewFetching,
    refetch: refetchPreview,
  } = useQuery<AvailabilityWeekPreviewResponse>({
    queryKey: ["availabilityWeekPreview", currentMondayIso],
    queryFn: () => schedulingApi.getWeekPreview(currentMondayIso),
  });

  // Sync loaded schedule into local state
  useEffect(() => {
    if (schedule) {
      setTimezone(schedule.timezone || "Asia/Karachi");
      setSlotDuration(schedule.slot_duration_minutes || 30);
      setBufferMinutes(schedule.buffer_minutes ?? 10);
      setBlockedDates(schedule.blocked_dates || []);

      const parsed: Record<string, { enabled: boolean; start: string; end: string }> = {};
      DAYS.forEach((d) => {
        const blocks = schedule.weekly_hours?.[d.key] || [];
        if (blocks.length > 0) {
          parsed[d.key] = {
            enabled: true,
            start: blocks[0].start || "09:00",
            end: blocks[0].end || "17:00",
          };
        } else {
          parsed[d.key] = { enabled: false, start: "09:00", end: "17:00" };
        }
      });
      setWeeklyConfig(parsed);
    }
  }, [schedule]);

  // ── 4. Save Mutation (Success ONLY after API confirms) ─────────────────────
  const updateMutation = useMutation({
    mutationFn: async () => {
      const weeklyHoursPayload: Record<string, { start: string; end: string }[]> = {};
      DAYS.forEach((d) => {
        const dayState = weeklyConfig[d.key];
        if (dayState && dayState.enabled) {
          weeklyHoursPayload[d.key] = [{ start: dayState.start, end: dayState.end }];
        } else {
          weeklyHoursPayload[d.key] = [];
        }
      });

      const payload: AvailabilityScheduleCreateOrUpdate = {
        timezone,
        slot_duration_minutes: slotDuration,
        buffer_minutes: bufferMinutes,
        weekly_hours: weeklyHoursPayload,
        blocked_dates: blockedDates,
        is_active: true,
      };

      return schedulingApi.updateAvailability(payload);
    },
    onSuccess: (updatedData) => {
      queryClient.setQueryData(["recruiterAvailability"], updatedData);
      queryClient.invalidateQueries({ queryKey: ["availabilityWeekPreview"] });
      // Show confirmed success banner/button state for 3.5 seconds
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);

      toast({
        title: "Availability Saved",
        description: "Your weekly working windows, buffers, and blocked dates have been saved to your profile.",
      });
    },
    onError: (err: any) => {
      setSaveSuccess(false);
      const errorMsg =
        err?.response?.data?.detail || err?.message || "Failed to save availability preferences.";
      toast({
        title: "Save Failed",
        description: errorMsg,
        variant: "destructive",
      });
    },
  });

  // ── 5. Blocked Dates Handlers ──────────────────────────────────────────────
  const handleAddBlockedDate = () => {
    if (!newBlockedDate) return;
    if (blockedDates.includes(newBlockedDate)) {
      toast({
        title: "Date Already Blocked",
        description: `${newBlockedDate} is already in your blocked dates list.`,
        variant: "destructive",
      });
      return;
    }
    const updated = [...blockedDates, newBlockedDate].sort();
    setBlockedDates(updated);
    setNewBlockedDate("");
  };

  const handleRemoveBlockedDate = (dateToRemove: string) => {
    setBlockedDates((prev) => prev.filter((d) => d !== dateToRemove));
  };

  // ── 6. Copy Booking Link Handler ───────────────────────────────────────────
  const bookingUrl = useMemo(() => {
    if (!weekPreview?.booking_link_url) return "";
    if (typeof window !== "undefined") {
      return `${window.location.origin}${weekPreview.booking_link_url}`;
    }
    return weekPreview.booking_link_url;
  }, [weekPreview]);

  const handleCopyLink = async () => {
    if (!bookingUrl) {
      toast({
        title: "Link Unavailable",
        description: "Active booking link is still loading. Please try again in a moment.",
        variant: "destructive",
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(bookingUrl);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
      toast({
        title: "Booking Link Copied",
        description: "Candidate scheduling link has been copied to your clipboard.",
      });
    } catch {
      toast({
        title: "Copy Failed",
        description: "Please copy the link directly from the candidate preview modal.",
        variant: "destructive",
      });
    }
  };

  // ── 7. Week Navigation Handlers ────────────────────────────────────────────
  const handlePrevWeek = () => {
    setCurrentWeekMonday((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() - 7);
      return next;
    });
  };

  const handleNextWeek = () => {
    setCurrentWeekMonday((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const handleToday = () => {
    setCurrentWeekMonday(getMondayOfDate(new Date()));
  };

  // ── 8. Assemble 7 Days of Selected Week ────────────────────────────────────
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(currentWeekMonday);
      d.setDate(d.getDate() + i);
      const iso = toIsoDate(d);
      const dayKey = DAYS[i].key;
      const isToday = iso === todayIso;
      const isBlocked = blockedDates.includes(iso);
      const isConfigEnabled = !!weeklyConfig[dayKey]?.enabled;

      // Filter events matching this date
      const googleEvents = (weekPreview?.google_busy_events || []).filter(
        (e: CalendarBusyEvent) => e.date_str === iso
      );
      const platformInterviews = (weekPreview?.platform_interviews || []).filter(
        (inv: CalendarBookedInterview) => inv.date_str === iso
      );
      const freeSlots = (weekPreview?.free_slots || []).filter(
        (slot: CalendarFreeSlot) => slot.date_str === iso
      );

      return {
        date: d,
        iso,
        dayInfo: DAYS[i],
        isToday,
        isBlocked,
        isConfigEnabled,
        googleEvents,
        platformInterviews,
        freeSlots,
      };
    });
  }, [currentWeekMonday, todayIso, blockedDates, weeklyConfig, weekPreview]);

  return (
    <div className="w-full space-y-6">
      <div className="max-w-7xl mx-auto space-y-6 pb-20">
        {/* Page Header with Main Actions */}
        <PageHeader
          title="Availability & Working Hours"
          description="Configure your weekly working windows, buffers, and blocked holidays. Your week calendar syncs with Google Calendar FreeBusy and platform interviews."
          badge={
            <Badge variant="outline" className="gap-1.5 font-mono text-[11px] px-2.5 py-1">
              <Clock className="h-3 w-3 text-primary" />
              <span>{timezone}</span>
            </Badge>
          }
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {/* Copy My Booking Link */}
              <Button
                id="btn-copy-booking-link"
                variant="outline"
                size="sm"
                onClick={handleCopyLink}
                className="gap-1.5 text-xs font-medium border-border/80 hover:bg-muted/60"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Link Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-muted-foreground" />
                    <span>Copy Booking Link</span>
                  </>
                )}
              </Button>

              {/* Candidate-View Preview Modal Trigger */}
              <Button
                id="btn-preview-candidate-view"
                variant="outline"
                size="sm"
                onClick={() => setShowCandidatePreview(true)}
                className="gap-1.5 text-xs font-medium border-border/80 hover:bg-muted/60"
              >
                <Eye className="w-3.5 h-3.5 text-primary" />
                <span>Candidate View</span>
              </Button>

              {/* Reload / Refresh Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  refetchSchedule();
                  refetchPreview();
                }}
                disabled={isScheduleLoading || isPreviewFetching}
                className="h-8 w-8 p-0"
                title="Reload Availability & Calendar"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 text-muted-foreground ${
                    isScheduleLoading || isPreviewFetching ? "animate-spin" : ""
                  }`}
                />
              </Button>

              {/* Save Availability Button (Shows success only after API confirms) */}
              <Button
                id="btn-save-availability-header"
                size="sm"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || isScheduleLoading}
                className={`gap-1.5 text-xs font-medium transition-all shadow-xs ${
                  saveSuccess
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                }`}
              >
                {updateMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Saved Successfully!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Availability</span>
                  </>
                )}
              </Button>
            </div>
          }
        />

        {/* 2-Column Responsive Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* ── LEFT COLUMN: Weekly Hours & Rules Editor (Col Span 5) ───────── */}
          <div className="lg:col-span-5 space-y-5">
            {/* 1. Timezone & General Parameters */}
            <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Sliders className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold tracking-tight text-foreground">
                      Session Preferences
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Timezone, slot length, and buffer margins
                    </p>
                  </div>
                </div>
              </div>

              {/* Timezone Selector */}
              <div>
                <label
                  htmlFor="avail-timezone-select"
                  className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5"
                >
                  <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                  Recruiter Timezone
                </label>
                <select
                  id="avail-timezone-select"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              {/* Slot Duration & Buffer Margin */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="avail-slot-duration-select"
                    className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Slot Length
                  </label>
                  <select
                    id="avail-slot-duration-select"
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 min (Standard)</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                    <option value={90}>90 minutes</option>
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="avail-buffer-select"
                    className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5"
                  >
                    <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                    Buffer Margin
                  </label>
                  <select
                    id="avail-buffer-select"
                    value={bufferMinutes}
                    onChange={(e) => setBufferMinutes(Number(e.target.value))}
                    className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value={0}>0 min (Back-to-back)</option>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 min (Recommended)</option>
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                </div>
              </div>
            </div>

            {/* 2. Weekly Working Hours Editor */}
            <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold tracking-tight text-foreground">
                      Weekly Working Hours
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Configure active appointment hours for each day
                    </p>
                  </div>
                </div>

                {/* Quick Preset Action */}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setWeeklyConfig({
                      mon: { enabled: true, start: "09:00", end: "17:00" },
                      tue: { enabled: true, start: "09:00", end: "17:00" },
                      wed: { enabled: true, start: "09:00", end: "17:00" },
                      thu: { enabled: true, start: "09:00", end: "17:00" },
                      fri: { enabled: true, start: "09:00", end: "17:00" },
                      sat: { enabled: false, start: "10:00", end: "14:00" },
                      sun: { enabled: false, start: "10:00", end: "14:00" },
                    });
                  }}
                  className="text-[11px] h-7 px-2 text-muted-foreground hover:text-foreground"
                >
                  Reset Mon-Fri
                </Button>
              </div>

              {/* Day Rows */}
              <div className="space-y-2">
                {DAYS.map((d) => {
                  const dayState = weeklyConfig[d.key] || {
                    enabled: false,
                    start: "09:00",
                    end: "17:00",
                  };
                  return (
                    <div
                      key={d.key}
                      className={`flex items-center justify-between p-2.5 rounded-lg border transition-all text-xs ${
                        dayState.enabled
                          ? "bg-background border-border/80 shadow-xs"
                          : "bg-muted/15 border-border/30 opacity-60"
                      }`}
                    >
                      {/* Checkbox & Day Label */}
                      <div className="flex items-center gap-2.5 w-32">
                        <input
                          id={`day-toggle-${d.key}`}
                          type="checkbox"
                          checked={dayState.enabled}
                          onChange={(e) =>
                            setWeeklyConfig((prev) => ({
                              ...prev,
                              [d.key]: { ...prev[d.key], enabled: e.target.checked },
                            }))
                          }
                          className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer accent-primary"
                        />
                        <label
                          htmlFor={`day-toggle-${d.key}`}
                          className="text-xs font-semibold text-foreground cursor-pointer select-none"
                        >
                          {d.label}
                        </label>
                      </div>

                      {/* Time Pickers or Off State */}
                      {dayState.enabled ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            id={`day-start-${d.key}`}
                            type="time"
                            value={dayState.start}
                            onChange={(e) =>
                              setWeeklyConfig((prev) => ({
                                ...prev,
                                [d.key]: { ...prev[d.key], start: e.target.value },
                              }))
                            }
                            className="bg-muted/40 border border-input rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                          <span className="text-muted-foreground text-[11px]">to</span>
                          <input
                            id={`day-end-${d.key}`}
                            type="time"
                            value={dayState.end}
                            onChange={(e) =>
                              setWeeklyConfig((prev) => ({
                                ...prev,
                                [d.key]: { ...prev[d.key], end: e.target.value },
                              }))
                            }
                            className="bg-muted/40 border border-input rounded px-2 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                          />
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground italic px-2">
                          Day Off
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 3. Blocked Dates & Holidays Manager */}
            <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-border/50">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-500">
                    <ShieldAlert className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-xs font-semibold tracking-tight text-foreground">
                      Blocked Dates & Holidays
                    </h2>
                    <p className="text-[11px] text-muted-foreground">
                      Prevent bookings on specific calendar dates
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono px-2 py-0.5">
                  {blockedDates.length} Blocked
                </Badge>
              </div>

              {/* Add Date Input */}
              <div className="flex items-center gap-2">
                <input
                  id="input-new-blocked-date"
                  type="date"
                  min={todayIso}
                  value={newBlockedDate}
                  onChange={(e) => setNewBlockedDate(e.target.value)}
                  className="flex-1 bg-background border border-input rounded-lg px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
                <Button
                  id="btn-add-blocked-date"
                  variant="outline"
                  size="sm"
                  onClick={handleAddBlockedDate}
                  disabled={!newBlockedDate}
                  className="gap-1 text-xs h-8 px-2.5"
                >
                  <Plus className="w-3.5 h-3.5 text-primary" />
                  <span>Add Date</span>
                </Button>
              </div>

              {/* Blocked Dates Chips */}
              {blockedDates.length === 0 ? (
                <div className="p-4 rounded-lg border border-dashed border-border/60 text-center">
                  <p className="text-[11px] text-muted-foreground">
                    No dates blocked. Add national holidays or out-of-office days above.
                  </p>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {blockedDates.map((dStr) => (
                    <div
                      key={dStr}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-700 dark:text-amber-300"
                    >
                      <Calendar className="w-3 h-3 text-amber-500" />
                      <span>{dStr}</span>
                      <button
                        onClick={() => handleRemoveBlockedDate(dStr)}
                        className="text-amber-600 dark:text-amber-400 hover:text-destructive transition ml-1 p-0.5"
                        title={`Unblock ${dStr}`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Bottom Save Callout */}
            <div className="bg-muted/30 border border-border/70 rounded-xl p-4 flex items-center justify-between gap-3">
              <div className="text-[11px] text-muted-foreground leading-relaxed">
                Changes persist automatically to your recruiter profile and update all live booking links.
              </div>
              <Button
                id="btn-save-availability-bottom"
                size="sm"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || isScheduleLoading}
                className={`gap-1.5 text-xs font-semibold px-4 transition-all shadow-xs shrink-0 ${
                  saveSuccess
                    ? "bg-emerald-600 hover:bg-emerald-700 text-white"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground"
                }`}
              >
                {updateMutation.isPending ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : saveSuccess ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Saved!</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Changes</span>
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* ── RIGHT COLUMN: Interactive Week Calendar Visualization (Col Span 7) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-xl p-5 shadow-xs space-y-5">
              {/* Calendar Header with Range Controls */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/60">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-primary" />
                      Week Schedule & Slots
                    </h2>
                    <span className="text-[11px] text-muted-foreground font-mono">
                      {formatRangeLabel(currentWeekMonday, weekSunday)}
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Google Calendar busy events overlaid with booked interviews and free candidate slots
                  </p>
                </div>

                {/* Week Navigation Controls */}
                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handlePrevWeek}
                    className="h-7 w-7 p-0"
                    title="Previous Week"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleToday}
                    className="h-7 px-2.5 text-[11px] font-medium"
                  >
                    Today
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleNextWeek}
                    className="h-7 w-7 p-0"
                    title="Next Week"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {/* Color-Coded Schedule Legend */}
              <div className="flex flex-wrap items-center gap-4 text-[11px] px-3 py-2 rounded-lg bg-muted/30 border border-border/50">
                <span className="font-semibold text-muted-foreground text-[10px] uppercase tracking-wider">
                  Legend:
                </span>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-purple-500" />
                  <span className="text-purple-700 dark:text-purple-300 font-medium">Google Busy</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
                  <span className="text-emerald-700 dark:text-emerald-300 font-medium">Booked Interview</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-sm bg-sky-500" />
                  <span className="text-sky-700 dark:text-sky-300 font-medium">Free Slot Highlighted</span>
                </div>
              </div>

              {/* 7-Day Week Columns Grid */}
              {isPreviewLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2 py-8">
                  {Array.from({ length: 7 }).map((_, idx) => (
                    <div
                      key={idx}
                      className="h-64 rounded-lg bg-muted/30 animate-pulse border border-border/40 p-2"
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-7 gap-2">
                  {weekDays.map((day) => {
                    const dayFormatted = day.date.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                    });

                    return (
                      <div
                        key={day.iso}
                        className={`rounded-lg border p-2 flex flex-col justify-between transition-all min-h-[300px] ${
                          day.isToday
                            ? "bg-primary/[0.03] border-primary/40 shadow-xs"
                            : "bg-muted/10 border-border/60"
                        }`}
                      >
                        {/* Day Column Header */}
                        <div>
                          <div className="flex items-center justify-between pb-1.5 border-b border-border/40">
                            <div>
                              <span className="text-xs font-semibold text-foreground block">
                                {day.dayInfo.short}
                              </span>
                              <span className="text-[10px] text-muted-foreground font-mono">
                                {dayFormatted}
                              </span>
                            </div>
                            {day.isToday && (
                              <Badge
                                variant="default"
                                className="text-[9px] px-1.5 py-0 h-4 uppercase font-bold"
                              >
                                Today
                              </Badge>
                            )}
                          </div>

                          {/* Day Content */}
                          <div className="mt-2 space-y-1.5">
                            {/* Blocked Date State */}
                            {day.isBlocked ? (
                              <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-center">
                                <ShieldAlert className="w-3.5 h-3.5 text-amber-500 mx-auto mb-1" />
                                <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 block">
                                  Blocked Holiday
                                </span>
                              </div>
                            ) : !day.isConfigEnabled ? (
                              /* Day Off State */
                              <div className="p-2 rounded bg-muted/20 border border-dashed border-border/40 text-center">
                                <span className="text-[10px] text-muted-foreground italic">
                                  Day Off
                                </span>
                              </div>
                            ) : (
                              <>
                                {/* 1. Google Busy Events (Purple) */}
                                {day.googleEvents.map((evt: CalendarBusyEvent) => (
                                  <div
                                    key={evt.id}
                                    className="p-1.5 rounded-md bg-purple-500/15 border border-purple-500/30 text-[10px] leading-tight text-purple-800 dark:text-purple-200 shadow-2xs"
                                  >
                                    <div className="font-semibold truncate">Google Busy</div>
                                    <div className="text-[9px] font-mono text-purple-600 dark:text-purple-300 mt-0.5">
                                      {evt.start_local} – {evt.end_local}
                                    </div>
                                  </div>
                                ))}

                                {/* 2. Platform Booked Interviews (Green) */}
                                {day.platformInterviews.map((inv: CalendarBookedInterview) => (
                                  <div
                                    key={inv.id}
                                    className="p-1.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-[10px] leading-tight text-emerald-800 dark:text-emerald-200 shadow-2xs"
                                  >
                                    <div className="font-semibold truncate">{inv.candidate_name}</div>
                                    <div className="text-[9px] font-mono text-emerald-600 dark:text-emerald-300 mt-0.5">
                                      {inv.start_local} – {inv.end_local}
                                    </div>
                                    {inv.meet_link && (
                                      <a
                                        href={inv.meet_link}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[9px] text-emerald-700 dark:text-emerald-300 hover:underline mt-1 font-medium"
                                      >
                                        <Video className="w-2.5 h-2.5" />
                                        <span>Meet</span>
                                      </a>
                                    )}
                                  </div>
                                ))}

                                {/* 3. Free Slots Highlighted (Blue) */}
                                {day.freeSlots.map((slot: CalendarFreeSlot, sIdx: number) => (
                                  <div
                                    key={`${slot.date_str}_${sIdx}`}
                                    className={`p-1.5 rounded-md border text-[10px] transition-all flex items-center justify-between ${
                                      slot.is_past
                                        ? "bg-muted/20 border-border/40 text-muted-foreground opacity-60"
                                        : "bg-sky-500/10 border-sky-500/30 text-sky-800 dark:text-sky-200 hover:bg-sky-500/20 shadow-2xs"
                                    }`}
                                  >
                                    <span className="font-mono text-[9px] font-medium">
                                      {slot.start_local}
                                    </span>
                                    <span className="text-[8px] px-1 py-0.2 rounded bg-sky-500/20 font-mono">
                                      {slotDuration}m
                                    </span>
                                  </div>
                                ))}

                                {/* If active day has no events or slots */}
                                {day.googleEvents.length === 0 &&
                                  day.platformInterviews.length === 0 &&
                                  day.freeSlots.length === 0 && (
                                    <div className="py-4 text-center">
                                      <span className="text-[10px] text-muted-foreground italic">
                                        No free slots
                                      </span>
                                    </div>
                                  )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Column Footer Summary */}
                        <div className="pt-2 border-t border-border/40 text-[9px] text-muted-foreground font-mono flex items-center justify-between">
                          <span>{day.freeSlots.length} free</span>
                          <span>
                            {day.googleEvents.length + day.platformInterviews.length} busy
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Candidate-View Preview Modal (Dialog) ────────────────────────── */}
        <Dialog open={showCandidatePreview} onOpenChange={setShowCandidatePreview}>
          <DialogContent className="max-w-2xl p-0 overflow-hidden border-border/80">
            <div className="bg-muted/40 p-5 border-b border-border/60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Eye className="w-4 h-4" />
                  </div>
                  <div>
                    <DialogTitle className="text-sm font-semibold tracking-tight text-foreground">
                      Candidate Booking Experience Preview
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                      This is the exact interactive view candidates see when opening your booking link.
                    </DialogDescription>
                  </div>
                </div>
                <Badge variant="outline" className="text-[10px] font-mono">
                  {timezone}
                </Badge>
              </div>
            </div>

            <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Simulated Candidate Scheduling Interface */}
              <div className="bg-card border border-border/80 rounded-xl p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-3 pb-3 border-b border-border/50">
                  <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-sm">
                    HL
                  </div>
                  <div>
                    <h3 className="text-xs font-semibold text-foreground">Hiring Loop Team</h3>
                    <p className="text-[11px] text-muted-foreground">
                      Screening Interview ({slotDuration} minutes)
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Left: Candidate Info & Meeting Details */}
                  <div className="space-y-3 text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="w-3.5 h-3.5 text-primary" />
                      <span>{slotDuration} mins • Google Meet</span>
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Globe className="w-3.5 h-3.5 text-primary" />
                      <span>Candidate Timezone: {timezone}</span>
                    </div>
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/50 text-[11px] text-muted-foreground leading-relaxed">
                      Candidates select an available time window, provide their contact details, and automatically receive a Google Meet calendar invitation.
                    </div>
                  </div>

                  {/* Right: Available Slots Preview */}
                  <div className="space-y-2">
                    <span className="text-[11px] font-semibold text-foreground block">
                      Sample Available Slots (Next 48h)
                    </span>
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {(weekPreview?.free_slots || []).slice(0, 6).map((s: CalendarFreeSlot, idx: number) => (
                        <div
                          key={idx}
                          className="px-3 py-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-200 text-xs font-mono flex items-center justify-between"
                        >
                          <span>{s.date_str}</span>
                          <span className="font-semibold">{s.start_local}</span>
                        </div>
                      ))}
                      {(weekPreview?.free_slots || []).length === 0 && (
                        <p className="text-xs text-muted-foreground italic">
                          No free slots available in the current schedule configuration.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Shareable Link Box */}
              <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/40 border border-border/60">
                <input
                  type="text"
                  readOnly
                  value={bookingUrl || "Loading link..."}
                  className="flex-1 bg-transparent border-0 text-xs font-mono text-muted-foreground focus:outline-none"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyLink}
                  className="gap-1 text-xs h-7"
                >
                  {copiedLink ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                  <span>{copiedLink ? "Copied" : "Copy"}</span>
                </Button>
                {bookingUrl && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => window.open(bookingUrl, "_blank")}
                    className="gap-1 text-xs h-7"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Open</span>
                  </Button>
                )}
              </div>
            </div>

            <div className="p-4 bg-muted/30 border-t border-border/60 flex items-center justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowCandidatePreview(false)}
                className="text-xs"
              >
                Close Preview
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
