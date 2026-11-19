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
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
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
          <Badge variant="success" className="gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Scheduled
          </Badge>
        );
      case "rescheduled":
        return (
          <Badge variant="info" className="gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
            Rescheduled
          </Badge>
        );
      case "cancelled":
        return (
          <Badge variant="destructive" className="gap-1 font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
            Cancelled
          </Badge>
        );
      case "completed":
        return (
          <Badge variant="secondary" className="font-medium">
            Completed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline">
            {status}
          </Badge>
        );
    }
  };

  return (
    <AppShell title="Interviews & Calendar">
      <div className="space-y-6 pb-12">
        <PageHeader
          title="Interviews & Scheduling"
          description="Confirmed candidate interview sessions, Google Meet video room links, and calendar FreeBusy scheduling."
          badge={
            <Badge variant="outline" className="gap-1 font-mono text-[11px]">
              <CalendarIcon className="h-3 w-3 text-primary" />
              <span>{filteredInterviews.length} Scheduled</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAvailabilityOpen(true)}
                className="gap-1.5"
              >
                <Settings className="w-3.5 h-3.5 text-primary" />
                <span>Availability Rules</span>
              </Button>
              <Button
                size="sm"
                onClick={() => refetch()}
                variant="outline"
                className="h-8 w-8 p-0"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </Button>
            </div>
          }
        >
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search candidate name or role..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-xs h-8 bg-card"
              />
            </div>

            {/* Filters & View Switcher */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Opening Filter */}
              <select
                value={selectedOpeningId}
                onChange={(e) => setSelectedOpeningId(e.target.value)}
                className="bg-card border border-border/80 rounded-md px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
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
                className="bg-card border border-border/80 rounded-md px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
              >
                <option value="all">All Statuses</option>
                <option value="scheduled">Scheduled</option>
                <option value="rescheduled">Rescheduled</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              {/* View Switcher */}
              <div className="flex bg-muted/50 p-0.5 rounded-md border border-border/70">
                <button
                  onClick={() => setActiveTab("agenda")}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                    activeTab === "agenda"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListFilter className="w-3.5 h-3.5" />
                  Agenda
                </button>
                <button
                  onClick={() => setActiveTab("calendar")}
                  className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1.5 transition ${
                    activeTab === "calendar"
                      ? "bg-background text-foreground shadow-xs font-semibold"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Calendar
                </button>
              </div>
            </div>
          </div>
        </PageHeader>

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
          <EmptyState
            icon={CalendarIcon}
            title="No Interviews Scheduled Yet"
            description="When candidates choose an interview slot using your self-scheduling link, confirmed sessions with Google Meet links will appear right here."
            actionText="Configure Weekly Availability"
            onAction={() => setAvailabilityOpen(true)}
          />
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
                  className="bg-card border border-border/70 dark:border-white/[0.08] hover:border-border rounded-xl p-4 shadow-xs hover:shadow-card-hover transition-all flex flex-col justify-between space-y-4"
                >
                  {/* Top: Header & Badges */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2.5">
                      {getStatusBadge(inv.status)}
                      <span className="text-[11px] text-muted-foreground flex items-center gap-1 font-mono">
                        <Clock className="w-3 h-3 text-muted-foreground" />
                        {inv.timezone}
                      </span>
                    </div>

                    <h4 className="text-sm font-semibold text-foreground truncate mb-1">
                      {inv.candidate_name}
                    </h4>
                    <p className="text-xs text-primary font-medium truncate flex items-center gap-1.5 mb-3">
                      <Briefcase className="w-3.5 h-3.5 shrink-0" />
                      {inv.opening_title}
                    </p>

                    {/* Date and Time Details */}
                    <div className="p-3 rounded-lg bg-muted/40 border border-border/60 space-y-1.5 mb-3">
                      <div className="text-xs font-medium text-foreground flex items-center gap-2">
                        <CalendarIcon className="w-3.5 h-3.5 text-primary" />
                        {dateFormatted}
                      </div>
                      <div className="text-xs text-muted-foreground font-mono flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5" />
                        {timeRangeFormatted}
                      </div>
                    </div>

                    {/* Candidate Contact */}
                    <div className="space-y-1 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3 h-3 shrink-0" />
                        <span className="truncate">{inv.candidate_email}</span>
                      </div>
                      {inv.candidate_phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3 h-3 shrink-0" />
                          <span>{inv.candidate_phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Cancellation reason if cancelled */}
                    {inv.status === "cancelled" && inv.cancellation_reason && (
                      <div className="mt-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-[11px] text-rose-600 dark:text-rose-400 italic">
                        Reason: {inv.cancellation_reason}
                      </div>
                    )}
                  </div>

                  {/* Bottom Actions */}
                  <div className="pt-3 border-t border-border/60 flex items-center justify-between gap-2">
                    {inv.meet_link && inv.status !== "cancelled" ? (
                      <a
                        href={inv.meet_link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition shadow-xs"
                      >
                        <Video className="w-3.5 h-3.5" />
                        <span>Join Meet</span>
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
                          className="h-8 text-xs text-muted-foreground hover:text-foreground"
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
