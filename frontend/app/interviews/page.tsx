"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar as CalendarIcon,
  Clock,
  Video,
  Settings,
  Filter,
  Search,
  ExternalLink,
  RefreshCw,
  Plus,
  AlertCircle,
  CheckCircle2,
  CalendarDays,
  ListFilter,
  User,
  Briefcase,
  Mail,
  Phone,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import {
  schedulingApi,
  jobOpeningsApi,
  InterviewRead,
} from "@/lib/api";
import { AvailabilityModal } from "@/components/scheduling/availability-modal";
import { RescheduleCancelModal } from "@/components/scheduling/reschedule-cancel-modal";

export default function InterviewsPage() {
  const [availabilityOpen, setAvailabilityOpen] = useState(false);
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"agenda" | "calendar">("agenda");

  // Modal states for action
  const [actionInterview, setActionInterview] = useState<InterviewRead | null>(null);
  const [actionModalMode, setActionModalMode] = useState<"reschedule" | "cancel">("reschedule");

  // 1. Fetch Job Openings for filter
  const { data: openingsData } = useQuery({
    queryKey: ["jobOpenings"],
    queryFn: () => jobOpeningsApi.list(undefined, 100),
  });

  // 2. Fetch Interviews
  const {
    data: interviews,
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["interviewsList", selectedOpeningId, selectedStatus],
    queryFn: () =>
      schedulingApi.listInterviews({
        opening_id: selectedOpeningId !== "all" ? selectedOpeningId : undefined,
        status: selectedStatus !== "all" ? selectedStatus : undefined,
      }),
  });

  const openingItems = openingsData?.items || [];

  // Filter by search query
  const filteredInterviews = (interviews || []).filter((inv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      inv.candidate_name.toLowerCase().includes(q) ||
      inv.candidate_email.toLowerCase().includes(q) ||
      inv.opening_title.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "scheduled":
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            Scheduled
          </span>
        );
      case "rescheduled":
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            Rescheduled
          </span>
        );
      case "cancelled":
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
            Cancelled
          </span>
        );
      case "completed":
        return (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-500/10 text-slate-300 border border-slate-500/20">
            Completed
          </span>
        );
      default:
        return (
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
            {status}
          </span>
        );
    }
  };

  return (
    <AppShell
      title="Interviews & Calendar"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAvailabilityOpen(true)}
            className="gap-1.5 text-xs border-slate-700 bg-slate-900/60 text-slate-200 hover:text-white"
          >
            <Settings className="w-3.5 h-3.5 text-blue-400" />
            Availability Rules
          </Button>
          <Button
            size="sm"
            onClick={() => refetch()}
            variant="ghost"
            className="text-slate-400 hover:text-white p-2"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Controls Bar */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 shadow-sm">
          {/* Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search candidate or job opening..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-800/80 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Filters & View Switcher */}
          <div className="flex items-center gap-3">
            {/* Opening Filter */}
            <select
              value={selectedOpeningId}
              onChange={(e) => setSelectedOpeningId(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Requisitions</option>
              {openingItems.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.title}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="all">All Statuses</option>
              <option value="scheduled">Scheduled</option>
              <option value="rescheduled">Rescheduled</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* View Switcher */}
            <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
              <button
                onClick={() => setActiveTab("agenda")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeTab === "agenda"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <ListFilter className="w-3.5 h-3.5" />
                Agenda
              </button>
              <button
                onClick={() => setActiveTab("calendar")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ${
                  activeTab === "calendar"
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                <CalendarDays className="w-3.5 h-3.5" />
                Calendar
              </button>
            </div>
          </div>
        </div>

        {/* Content Area */}
        {isLoading ? (
          <div className="py-24 flex flex-col items-center justify-center text-slate-400 gap-3">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
            <p className="text-sm">Loading scheduled interviews...</p>
          </div>
        ) : isError ? (
          <div className="py-24 text-center">
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <p className="text-sm text-slate-400">Failed to load interviews.</p>
            <Button size="sm" variant="ghost" onClick={() => refetch()} className="mt-2 text-xs">
              Retry
            </Button>
          </div>
        ) : filteredInterviews.length === 0 ? (
          <div className="bg-slate-900/60 border border-slate-800 rounded-3xl p-16 text-center">
            <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto mb-4 border border-slate-700">
              <CalendarIcon className="w-7 h-7" />
            </div>
            <h3 className="text-lg font-bold text-white mb-1">No Interviews Scheduled Yet</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto mb-6">
              When candidates choose a slot using your tokenized scheduling link, confirmed interviews with
              automatic Google Meet links will appear right here.
            </p>
            <Button
              size="sm"
              onClick={() => setAvailabilityOpen(true)}
              className="bg-blue-600 hover:bg-blue-500 text-white text-xs gap-1.5"
            >
              <Settings className="w-3.5 h-3.5" />
              Configure Weekly Availability
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInterviews.map((inv) => {
              const start = new Date(inv.start_time);
              const end = new Date(inv.end_time);
              const dateFormatted = start.toLocaleDateString("en-US", {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              const timeRangeFormatted = `${start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} – ${end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`;

              return (
                <div
                  key={inv.id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-5 shadow-sm transition flex flex-col justify-between space-y-4"
                >
                  {/* Top: Header & Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      {getStatusBadge(inv.status)}
                      <span className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-slate-500" />
                        {inv.timezone}
                      </span>
                    </div>

                    <h4 className="text-base font-bold text-white truncate mb-1">
                      {inv.candidate_name}
                    </h4>
                    <p className="text-xs text-blue-400 font-medium truncate flex items-center gap-1.5 mb-3">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      {inv.opening_title}
                    </p>

                    {/* Date and Time Details */}
                    <div className="p-3 rounded-xl bg-slate-800/60 border border-slate-700/50 space-y-1.5 mb-3">
                      <div className="text-xs font-semibold text-white flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-indigo-400" />
                        {dateFormatted}
                      </div>
                      <div className="text-xs text-slate-300 font-mono flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {timeRangeFormatted}
                      </div>
                    </div>

                    {/* Candidate Contact */}
                    <div className="space-y-1 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 text-slate-500 shrink-0" />
                        <span className="truncate">{inv.candidate_email}</span>
                      </div>
                      {inv.candidate_phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                          <span>{inv.candidate_phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Cancellation reason if cancelled */}
                    {inv.status === "cancelled" && inv.cancellation_reason && (
                      <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-300 italic">
                        Reason: {inv.cancellation_reason}
                      </div>
                    )}
                  </div>

                  {/* Bottom Actions */}
                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                    {inv.meet_link && inv.status !== "cancelled" ? (
                      <a
                        href={inv.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition shadow-sm"
                      >
                        <Video className="w-3.5 h-3.5" />
                        Join Meet
                      </a>
                    ) : (
                      <div />
                    )}

                    {inv.status !== "cancelled" && (
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActionInterview(inv);
                            setActionModalMode("reschedule");
                          }}
                          className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800"
                        >
                          Reschedule
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setActionInterview(inv);
                            setActionModalMode("cancel");
                          }}
                          className="h-8 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Availability Configuration Drawer/Modal */}
      <AvailabilityModal
        isOpen={availabilityOpen}
        onClose={() => setAvailabilityOpen(false)}
      />

      {/* Reschedule / Cancel Modal */}
      {actionInterview && (
        <RescheduleCancelModal
          interview={actionInterview}
          mode={actionModalMode}
          isOpen={!!actionInterview}
          onClose={() => setActionInterview(null)}
        />
      )}
    </AppShell>
  );
}
