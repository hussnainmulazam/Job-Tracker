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
import { Button } from "@/components/ui/button";
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
    <AppShell
      title="Recruiter Availability"
      actions={
        <Button
          onClick={() => updateMutation.mutate()}
          disabled={updateMutation.isPending || isLoading}
          className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 shadow-lg shadow-blue-500/20"
        >
          {updateMutation.isPending ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Save Availability
        </Button>
      }
    >
      <div className="max-w-5xl mx-auto space-y-8 pb-16">
        {/* Header Intro Card */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center justify-center">
                  <Calendar className="w-4 h-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
                  Scheduling Engine
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Recruiter Working Hours & Scheduling Rules
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-2xl">
                Set your weekly working windows, interview slot duration, buffer, and blocked dates.
                Candidate booking links automatically calculate free slots by subtracting Google
                Calendar FreeBusy and existing interviews.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Reload Preferences
            </Button>
          </div>
        </div>

        {/* Global Parameters */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Globe className="w-4 h-4 text-blue-400" />
            General Parameters & Timezone
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label
                htmlFor="avail-timezone-input"
                className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-blue-400" />
                Recruiter Timezone
              </label>
              <select
                id="avail-timezone-input"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1.5">
                Working hours are evaluated in this timezone (default Asia/Karachi).
              </p>
            </div>

            <div>
              <label
                htmlFor="avail-slot-duration-input"
                className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-400" />
                Slot Duration
              </label>
              <select
                id="avail-slot-duration-input"
                value={slotDuration}
                onChange={(e) => setSlotDuration(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes (Standard)</option>
                <option value={45}>45 minutes</option>
                <option value={60}>60 minutes</option>
                <option value={90}>90 minutes</option>
              </select>
              <p className="text-xs text-slate-500 mt-1.5">
                Default interview length offered to candidates.
              </p>
            </div>

            <div>
              <label
                htmlFor="avail-buffer-minutes-input"
                className="text-xs font-semibold text-slate-300 block mb-2 flex items-center gap-1.5"
              >
                <Clock className="w-3.5 h-3.5 text-emerald-400" />
                Buffer Between Slots
              </label>
              <select
                id="avail-buffer-minutes-input"
                value={bufferMinutes}
                onChange={(e) => setBufferMinutes(Number(e.target.value))}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value={0}>0 minutes (Back to back)</option>
                <option value={5}>5 minutes</option>
                <option value={10}>10 minutes (Recommended)</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
              </select>
              <p className="text-xs text-slate-500 mt-1.5">
                Break time enforced before and after each booked interview.
              </p>
            </div>
          </div>
        </div>

        {/* Weekly Hours Grid */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-indigo-400" />
              Weekly Working Hours
            </h2>
            <span className="text-xs text-slate-400">
              Slots are only computed during enabled windows
            </span>
          </div>

          <div className="space-y-3">
            {DAYS.map((d) => {
              const dayState = weeklyConfig[d.key] || {
                enabled: false,
                start: "09:00",
                end: "17:00",
              };
              return (
                <div
                  key={d.key}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border transition gap-3 ${
                    dayState.enabled
                      ? "bg-slate-800/80 border-slate-700/80"
                      : "bg-slate-950/40 border-slate-800/60 opacity-60"
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
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 bg-slate-800 border-slate-700 cursor-pointer"
                    />
                    <label
                      htmlFor={`day-toggle-${d.key}`}
                      className="text-sm font-semibold text-white cursor-pointer select-none"
                    >
                      {d.label}
                    </label>
                  </div>

                  {dayState.enabled ? (
                    <div className="flex items-center gap-2.5">
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
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-slate-400 text-xs font-medium">to</span>
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
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-slate-500 italic pr-2">Unavailable</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Blocked Dates Manager */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-400" />
                Blocked Dates & Holidays
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                On these specific calendar dates, no candidate slots will be generated regardless
                of weekly hours.
              </p>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 w-fit">
              {blockedDates.length} Date{blockedDates.length === 1 ? "" : "s"} Blocked
            </span>
          </div>

          {/* Add Date Input */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              id="input-new-blocked-date"
              type="date"
              min={todayStr}
              value={newBlockedDate}
              onChange={(e) => setNewBlockedDate(e.target.value)}
              className="w-full sm:w-64 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button
              id="btn-add-blocked-date"
              variant="outline"
              size="sm"
              onClick={handleAddBlockedDate}
              disabled={!newBlockedDate}
              className="w-full sm:w-auto border-slate-700 bg-slate-800 hover:bg-slate-700 text-white flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4 text-blue-400" />
              Add Blocked Date
            </Button>
          </div>

          {/* Blocked Dates Chips */}
          {blockedDates.length === 0 ? (
            <div className="p-6 rounded-2xl border border-dashed border-slate-800 text-center">
              <p className="text-xs text-slate-500">
                No dates blocked. Select a date above to block holidays or out-of-office days.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2.5 pt-2">
              {blockedDates.map((dateStr) => (
                <div
                  key={dateStr}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/90 border border-slate-700 text-xs font-mono text-slate-200 shadow-sm"
                >
                  <Calendar className="w-3.5 h-3.5 text-amber-400" />
                  <span>{dateStr}</span>
                  <button
                    onClick={() => handleRemoveBlockedDate(dateStr)}
                    className="text-slate-400 hover:text-red-400 transition ml-1 p-0.5 rounded"
                    title={`Remove ${dateStr}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Floating / Bottom Save Bar */}
        <div className="flex items-center justify-between pt-4">
          <p className="text-xs text-slate-500">
            Changes will take effect immediately for all active candidate scheduling links.
          </p>
          <Button
            id="btn-save-availability"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending || isLoading}
            className="bg-blue-600 hover:bg-blue-500 text-white font-medium flex items-center gap-2 px-6 py-2.5 shadow-lg shadow-blue-500/20"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Availability
          </Button>
        </div>
      </div>
    </AppShell>
  );
}
