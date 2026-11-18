"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Calendar, Clock, AlertTriangle, X, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { schedulingApi, InterviewRead } from "@/lib/api";

interface RescheduleCancelModalProps {
  interview: InterviewRead;
  mode: "reschedule" | "cancel";
  isOpen: boolean;
  onClose: () => void;
}

export function RescheduleCancelModal({
  interview,
  mode,
  isOpen,
  onClose,
}: RescheduleCancelModalProps) {
  const queryClient = useQueryClient();
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const rescheduleMutation = useMutation({
    mutationFn: () => {
      if (!newDate || !newTime) throw new Error("Please select both a date and time.");
      const isoCombined = `${newDate}T${newTime}:00`;
      return schedulingApi.rescheduleInterview(interview.id, {
        new_start_time: new Date(isoCombined).toISOString(),
        timezone: interview.timezone,
        reason: reason.trim() || "Rescheduled by HR",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviewsList"] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.detail || err?.message || "Failed to reschedule interview.");
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      schedulingApi.cancelInterview(interview.id, {
        reason: reason.trim() || "Cancelled by HR",
        cancelled_by: "hr",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["interviewsList"] });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(err?.response?.data?.detail || err?.message || "Failed to cancel interview.");
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-3.5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                mode === "reschedule"
                  ? "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                  : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
              }`}
            >
              {mode === "reschedule" ? <Calendar className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white">
                {mode === "reschedule" ? "Reschedule Interview" : "Cancel Interview"}
              </h3>
              <p className="text-xs text-slate-400">
                {interview.candidate_name} • {interview.opening_title}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error message */}
        {errorMsg && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300">
            {errorMsg}
          </div>
        )}

        {/* Body */}
        <div className="py-4 space-y-4">
          {mode === "reschedule" ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">New Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1">New Time</label>
                  <input
                    type="time"
                    value={newTime}
                    onChange={(e) => setNewTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Reason for Reschedule</label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Recruiter scheduling conflict..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </>
          ) : (
            <div>
              <p className="text-xs text-slate-400 mb-3">
                Cancelling will remove the Google Calendar event, delete the Google Meet link, and notify the
                candidate.
              </p>
              <label className="text-xs font-semibold text-slate-300 block mb-1">Cancellation Reason</label>
              <textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for cancellation..."
                className="w-full bg-slate-800 border border-slate-700 rounded-xl p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-rose-500"
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end gap-2.5">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          {mode === "reschedule" ? (
            <Button
              size="sm"
              onClick={() => rescheduleMutation.mutate()}
              disabled={rescheduleMutation.isPending || !newDate || !newTime}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs"
            >
              {rescheduleMutation.isPending ? "Updating..." : "Save New Slot"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              onClick={() => cancelMutation.mutate()}
              disabled={cancelMutation.isPending}
              className="text-xs"
            >
              {cancelMutation.isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
