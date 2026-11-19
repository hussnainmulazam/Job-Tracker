"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Globe,
  Save,
  RefreshCw,
  Calendar,
  Plus,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import {
  schedulingApi,
  AvailabilityScheduleRead,
  AvailabilityScheduleCreateOrUpdate,
} from "@/lib/api";

const DAYS = [
  { key: "mon", label: "Monday" },
  { key: "tue", label: "Tuesday" },
  { key: "wed", label: "Wednesday" },
  { key: "thu", label: "Thursday" },
  { key: "fri", label: "Friday" },
  { key: "sat", label: "Saturday" },
  { key: "sun", label: "Sunday" },
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

export default function AvailabilityPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

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

  const {
    data: schedule,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["recruiterAvailability"],
    queryFn: () => schedulingApi.getAvailability(),
  });

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
      toast({
        title: "Availability Saved",
        description: "Your weekly working hours, buffer, and blocked dates have been updated.",
      });
    },
    onError: (err: any) => {
      const errorMsg =
        err?.response?.data?.detail || err?.message || "Failed to save availability preferences.";
      toast({
        title: "Save Failed",
        description: errorMsg,
        variant: "destructive",
      });
    },
  });

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

  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <AppShell title="Recruiter Availability">
      <div className="max-w-5xl mx-auto space-y-6 pb-16">
        <PageHeader
          title="Recruiter Working Hours & Scheduling Rules"
          description="Configure your weekly availability windows, slot lengths, buffer margins, and holiday blockouts. Booking links evaluate these rules alongside Google Calendar FreeBusy."
          badge={
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <Clock className="h-3 w-3 text-primary" />
              <span>{timezone}</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetch()}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Reload</span>
              </Button>
              <Button
                size="sm"
                onClick={() => updateMutation.mutate()}
                disabled={updateMutation.isPending || isLoading}
                className="gap-1.5 font-medium shadow-xs"
              >
                {updateMutation.isPending ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Availability</span>
              </Button>
            </div>
          }
        />

        {/* Global Parameters */}
        <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-5 sm:p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Globe className="w-4 h-4 text-primary" />
              General Parameters & Timezone
            </h2>
            <span className="text-xs text-muted-foreground">
              Applied globally across all candidate booking links
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label
                htmlFor="avail-timezone-input"
                className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                Recruiter Timezone
              </label>
              <select
                id="avail-timezone-input"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Working hours are evaluated in this timezone (default Asia/Karachi).
              </p>
            </div>

            <div>
              <label
                htmlFor="avail-slot-duration-input"
                className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Slot Duration
              </label>
              <select
                id="avail-slot-duration-input"
                value={slotDuration}
                onChange={(e) => setSlotDuration(Number(e.target.value))}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes (Standard)</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Default interview length offered to candidates.
              </p>
            </div>

            <div>
              <label
                htmlFor="avail-buffer-minutes-input"
                className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                Buffer Between Slots
              </label>
              <select
                id="avail-buffer-minutes-input"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value={0}>0 minutes (Back to back)</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes (Recommended)</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
              <p className="text-[11px] text-muted-foreground mt-1.5">
                Break time enforced before and after each booked interview.
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Hours Grid */}
        <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Weekly Working Hours
            </h2>
            <span className="text-xs text-muted-foreground">
              Slots are only computed during enabled windows
            </span>
          </div>

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
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-lg border transition gap-3 ${
                    dayState.enabled
                      ? "bg-muted/30 border-border/70"
                      : "bg-muted/5 border-border/30 opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3 w-44">
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
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    />
                    <label
                      htmlFor={`day-toggle-${d.key}`}
                      className="text-xs font-semibold text-foreground cursor-pointer select-none"
                    >
                      {d.label}
                    </label>
                  </div>

                  {dayState.enabled ? (
                    <div className="flex items-center gap-2">
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
                        className="bg-background border border-input rounded-md px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                      <span className="text-muted-foreground text-xs font-medium">to</span>
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
                        className="bg-background border border-input rounded-md px-2.5 py-1 text-xs font-mono text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground italic pr-2">Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Blocked Dates Manager */}
        <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Blocked Dates & Holidays
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                On these specific calendar dates, no candidate slots will be generated regardless
                of weekly hours.
              </p>
            </div>
            <Badge variant="warning" className="text-xs w-fit">
              {blockedDates.length} Date{blockedDates.length === 1 ? "" : "s"} Blocked
            </Badge>
          </div>

          {/* Add Date Input */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              id="input-new-blocked-date"
              type="date"
              min={todayStr}
              value={newBlockedDate}
              onChange={(e) => setNewBlockedDate(e.target.value)}
              className="w-full sm:w-64 bg-background border border-input rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              id="btn-add-blocked-date"
              variant="outline"
              size="sm"
              onClick={handleAddBlockedDate}
              disabled={!newBlockedDate}
              className="w-full sm:w-auto gap-1.5"
            >
              <Plus className="w-4 h-4 text-primary" />
              <span>Add Blocked Date</span>
            </Button>
          </div>

          {/* Blocked Dates Chips */}
          {blockedDates.length === 0 ? (
            <div className="p-6 rounded-xl border border-dashed border-border/70 text-center">
              <p className="text-xs text-muted-foreground">
                No dates blocked. Select a date above to block holidays or out-of-office days.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {blockedDates.map((dateStr) => (
                <div
                  key={dateStr}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-muted/50 border border-border/70 text-xs font-mono text-foreground shadow-xs"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-500" />
                  <span>{dateStr}</span>
                  <button
                    onClick={() => handleRemoveBlockedDate(dateStr)}
                    className="text-muted-foreground hover:text-destructive transition ml-1 p-0.5 rounded"
                    title={`Remove ${dateStr}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bottom Save Bar */}
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-muted-foreground">
            Changes take effect immediately for all active candidate scheduling links.
          </p>
          <Button
            id="btn-save-availability"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || isLoading}
            className="font-medium gap-2 px-5 shadow-xs"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>Save Availability</span>
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
