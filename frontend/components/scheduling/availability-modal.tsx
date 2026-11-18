"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Clock, Globe, Save, RefreshCw, X, Check, Calendar } from "lucide-react";
import { Button } from "@/components/ui/button";
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
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
  "Asia/Singapore",
  "Asia/Tokyo",
];

interface AvailabilityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AvailabilityModal({ isOpen, onClose }: AvailabilityModalProps) {
  const queryClient = useQueryClient();

  const [timezone, setTimezone] = useState("Asia/Karachi");
  const [slotDuration, setSlotDuration] = useState(30);
  const [bufferMinutes, setBufferMinutes] = useState(10);
  const [weeklyConfig, setWeeklyConfig] = useState<Record<string, { enabled: boolean; start: string; end: string }>>({
    mon: { enabled: true, start: "09:00", end: "17:00" },
    tue: { enabled: true, start: "09:00", end: "17:00" },
    wed: { enabled: true, start: "09:00", end: "17:00" },
    thu: { enabled: true, start: "09:00", end: "17:00" },
    fri: { enabled: true, start: "09:00", end: "17:00" },
    sat: { enabled: false, start: "10:00", end: "14:00" },
    sun: { enabled: false, start: "10:00", end: "14:00" },
  });
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  const { data: schedule, isLoading } = useQuery({
    queryKey: ["recruiterAvailability"],
    queryFn: () => schedulingApi.getAvailability(),
    enabled: isOpen,
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
    mutationFn: () => {
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recruiterAvailability"] });
      onClose();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center border border-blue-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Interview Availability Rules</h2>
              <p className="text-xs text-slate-400">
                Configure your weekly working schedule. Public slots will be computed automatically.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-2">
            <RefreshCw className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs">Loading availability preferences...</span>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-6 space-y-6 pr-1">
            {/* General parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-blue-400" />
                  Timezone
                </label>
                <select
                  id="select-availability-timezone"
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-indigo-400" />
                  Slot Duration
                </label>
                <select
                  id="select-availability-slot-duration"
                  value={slotDuration}
                  onChange={(e) => setSlotDuration(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                  <option value={45}>45 minutes</option>
                  <option value={60}>60 minutes</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Buffer Between Slots</label>
                <select
                  id="select-availability-buffer"
                  value={bufferMinutes}
                  onChange={(e) => setBufferMinutes(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value={0}>0 minutes</option>
                  <option value={5}>5 minutes</option>
                  <option value={10}>10 minutes</option>
                  <option value={15}>15 minutes</option>
                  <option value={30}>30 minutes</option>
                </select>
              </div>
            </div>

            {/* Weekly working days list */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-3">
                Weekly Working Hours
              </label>

              <div className="space-y-2.5">
                {DAYS.map((d) => {
                  const dayState = weeklyConfig[d.key] || {
                    enabled: false,
                    start: "09:00",
                    end: "17:00",
                  };
                  return (
                    <div
                      key={d.key}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition ${
                        dayState.enabled
                          ? "bg-slate-800/70 border-slate-700"
                          : "bg-slate-900/50 border-slate-800 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3 w-36">
                        <input
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
                        <span className="text-sm font-semibold text-white">{d.label}</span>
                      </div>

                      {dayState.enabled ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="time"
                            value={dayState.start}
                            onChange={(e) =>
                              setWeeklyConfig((prev) => ({
                                ...prev,
                                [d.key]: { ...prev[d.key], start: e.target.value },
                              }))
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                          <span className="text-slate-500 text-xs">to</span>
                          <input
                            type="time"
                            value={dayState.end}
                            onChange={(e) =>
                              setWeeklyConfig((prev) => ({
                                ...prev,
                                [d.key]: { ...prev[d.key], end: e.target.value },
                              }))
                            }
                            className="bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500 italic pr-4">Unavailable</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => updateMutation.mutate()}
            disabled={updateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-1.5"
          >
            {updateMutation.isPending ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            Save Availability
          </Button>
        </div>
      </div>
    </div>
  );
}
