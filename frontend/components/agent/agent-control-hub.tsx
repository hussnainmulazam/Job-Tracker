"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Sparkles,
  Pause,
  Play,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Mail,
  Send,
  Calendar,
  FileText,
  Activity,
  RefreshCw,
  Bell,
  Shield,
  Layers,
  ArrowRight,
  ExternalLink,
  Save,
  Check,
  AlertCircle,
  HelpCircle,
  BarChart3,
} from "lucide-react";

import {
  agentApi,
  AgentSettingsRead,
  AgentSettingsUpdate,
  AgentTodayActivityResponse,
  AgentActivityFeedItem,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { EmptyState } from "@/components/ui/empty-state";

interface AgentControlHubProps {
  showOverviewHeading?: boolean;
}

export function AgentControlHub({ showOverviewHeading = false }: AgentControlHubProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // ── 1. Fetch Agent Settings ──────────────────────────────────────────────────
  const {
    data: settings,
    isLoading: isSettingsLoading,
    refetch: refetchSettings,
  } = useQuery<AgentSettingsRead>({
    queryKey: ["agent-settings"],
    queryFn: () => agentApi.getSettings(),
  });

  // ── 2. Fetch Live Today's Activity & KPI metrics ─────────────────────────────
  const {
    data: activity,
    isLoading: isActivityLoading,
    isRefetching: isActivityRefetching,
    refetch: refetchActivity,
  } = useQuery<AgentTodayActivityResponse>({
    queryKey: ["agent-today-activity"],
    queryFn: () => agentApi.getTodayActivity(),
    refetchInterval: 30000, // auto-refresh every 30s
  });

  // Form states
  const [dailyLimit, setDailyLimit] = useState<number>(50);
  const [notifyEmail, setNotifyEmail] = useState<string>("");
  const [notifyBooking, setNotifyBooking] = useState<boolean>(true);
  const [notifyReply, setNotifyReply] = useState<boolean>(true);
  const [notifyFailure, setNotifyFailure] = useState<boolean>(true);
  const [dailySummaryEnabled, setDailySummaryEnabled] = useState<boolean>(true);
  const [dailySummaryTime, setDailySummaryTime] = useState<string>("09:00");
  const [feedFilter, setFeedFilter] = useState<string>("all");
  const [pauseReasonInput, setPauseReasonInput] = useState<string>("");
  const [showPauseReasonBox, setShowPauseReasonBox] = useState<boolean>(false);

  // Sync form inputs when settings data arrives
  useEffect(() => {
    if (settings) {
      setDailyLimit(settings.daily_send_limit ?? 50);
      setNotifyEmail(settings.notify_email || "");
      setNotifyBooking(settings.notify_on_booking ?? true);
      setNotifyReply(settings.notify_on_reply ?? true);
      setNotifyFailure(settings.notify_on_failure ?? true);
      setDailySummaryEnabled(settings.daily_summary_enabled ?? true);
      setDailySummaryTime(settings.daily_summary_time || "09:00");
    }
  }, [settings]);

  // ── Mutations ───────────────────────────────────────────────────────────────

  // Pause / Resume toggle mutation
  const togglePauseMutation = useMutation({
    mutationFn: (args: { paused: boolean; reason?: string }) =>
      agentApi.togglePause(args),
    onSuccess: (updated) => {
      queryClient.setQueryData(["agent-settings"], updated);
      queryClient.invalidateQueries({ queryKey: ["agent-today-activity"] });
      setShowPauseReasonBox(false);
      toast({
        title: updated.is_paused ? "Agent Paused" : "Agent Resumed",
        description: updated.is_paused
          ? `Autonomous dispatching paused (${updated.paused_reason || "HR paused"}).`
          : "Autonomous candidate screening & communications active.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to toggle agent state",
        description: err.message || "An error occurred.",
        variant: "destructive",
      });
    },
  });

  // Save Settings mutation
  const updateSettingsMutation = useMutation({
    mutationFn: (data: AgentSettingsUpdate) => agentApi.updateSettings(data),
    onSuccess: (updated) => {
      queryClient.setQueryData(["agent-settings"], updated);
      queryClient.invalidateQueries({ queryKey: ["agent-today-activity"] });
      toast({
        title: "Agent Settings Saved",
        description: "Quota limits and notification preferences updated in database.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save settings",
        description: err.message || "Could not update agent settings.",
        variant: "destructive",
      });
    },
  });

  // Send Daily Summary mutation
  const sendSummaryMutation = useMutation({
    mutationFn: () => agentApi.sendDailySummary({ recipient_email: notifyEmail || undefined }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["agent-today-activity"] });
      queryClient.invalidateQueries({ queryKey: ["agent-settings"] });
      toast({
        title: "Daily Summary Sent",
        description: `Delivered summary to ${res.recipient}. (${res.summary.cvs_received_today} CVs, ${res.summary.candidates_waiting_review} waiting review, ${res.summary.interviews_scheduled_today} interviews today).`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to dispatch daily summary",
        description: err.message || "An error occurred while compiling the daily summary.",
        variant: "destructive",
      });
    },
  });

  // Test Failure Alert mutation
  const testAlertMutation = useMutation({
    mutationFn: () => agentApi.testFailureAlert(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["agent-today-activity"] });
      toast({
        title: "Test Alert Dispatched",
        description: res.message || "Check your HR notification inbox.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Alert Failed",
        description: err.message || "Could not dispatch test alert.",
        variant: "destructive",
      });
    },
  });

  const handleSavePreferences = () => {
    updateSettingsMutation.mutate({
      daily_send_limit: Number(dailyLimit) || 50,
      notify_email: notifyEmail.trim() || undefined,
      notify_on_booking: notifyBooking,
      notify_on_reply: notifyReply,
      notify_on_failure: notifyFailure,
      daily_summary_enabled: dailySummaryEnabled,
      daily_summary_time: dailySummaryTime,
    });
  };

  const isPaused = settings?.is_paused ?? false;
  const sendsToday = activity?.sends_today ?? settings?.sends_today ?? 0;
  const currentDailyLimit = activity?.daily_send_limit ?? settings?.daily_send_limit ?? 50;
  const sendsRemaining = Math.max(0, currentDailyLimit - sendsToday);
  const quotaPercent = Math.min(100, Math.round((sendsToday / Math.max(1, currentDailyLimit)) * 100));

  // Filter feed items
  const feedItems = activity?.feed || [];
  const filteredFeed = feedItems.filter((item) => {
    if (feedFilter === "all") return true;
    if (feedFilter === "cv_review") return item.category === "cv_review";
    if (feedFilter === "interview") return item.category === "interview";
    if (feedFilter === "outreach") return item.category === "outreach";
    if (feedFilter === "error") return item.category === "error";
    return true;
  });

  if (isSettingsLoading && !settings) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── 1. AGENT STATUS & PAUSE HERO BANNER ──────────────────────────────── */}
      <div
        className={`relative overflow-hidden rounded-2xl border p-6 transition-all duration-300 ${
          isPaused
            ? "border-amber-500/40 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent dark:from-amber-950/20"
            : "border-emerald-500/40 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent dark:from-emerald-950/20"
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3.5 w-3.5">
                <span
                  className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                    isPaused ? "bg-amber-400" : "bg-emerald-400"
                  }`}
                />
                <span
                  className={`relative inline-flex rounded-full h-3.5 w-3.5 ${
                    isPaused ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
              </span>
              <h2 className="text-lg font-bold tracking-tight text-foreground flex items-center gap-2">
                {isPaused ? "Autonomous Agent Paused" : "Autonomous Agent Active & Screening"}
              </h2>
              <Badge
                variant={isPaused ? "secondary" : "default"}
                className={`font-semibold text-xs px-2.5 py-0.5 ${
                  isPaused
                    ? "bg-amber-500/20 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                    : "bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                }`}
              >
                {isPaused ? "PAUSED" : "ONLINE"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground max-w-xl">
              {isPaused
                ? `Agent operations are paused. Reason: ${settings?.paused_reason || "Manually paused by HR"}. CV scoring runs on-demand only and outbound messages are blocked.`
                : "The agent is actively monitoring inbound candidate applications, scoring CVs against active job descriptions, and managing interview scheduling links."}
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                refetchSettings();
                refetchActivity();
              }}
              disabled={isActivityRefetching}
              className="gap-1.5 text-xs bg-background/80 hover:bg-background"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isActivityRefetching ? "animate-spin text-primary" : ""}`} />
              <span>Refresh Status</span>
            </Button>

            {isPaused ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => togglePauseMutation.mutate({ paused: false })}
                disabled={togglePauseMutation.isPending}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs shadow-sm"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Resume Agent</span>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowPauseReasonBox(!showPauseReasonBox)}
                disabled={togglePauseMutation.isPending}
                className="gap-2 border-amber-500/60 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 font-semibold text-xs"
              >
                <Pause className="w-3.5 h-3.5 fill-current" />
                <span>Pause Agent</span>
              </Button>
            )}
          </div>
        </div>

        {/* Optional pause reason dropdown input */}
        {showPauseReasonBox && !isPaused && (
          <div className="mt-4 pt-4 border-t border-amber-500/20 flex flex-col sm:flex-row items-center gap-3">
            <Input
              placeholder="Reason for pausing (e.g. Updating hiring criteria, holiday break)..."
              value={pauseReasonInput}
              onChange={(e) => setPauseReasonInput(e.target.value)}
              className="text-xs h-9 bg-background/90"
            />
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <Button
                size="sm"
                variant="destructive"
                className="text-xs whitespace-nowrap"
                onClick={() =>
                  togglePauseMutation.mutate({
                    paused: true,
                    reason: pauseReasonInput.trim() || "Paused by HR recruiter",
                  })
                }
                disabled={togglePauseMutation.isPending}
              >
                Confirm Pause
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-xs"
                onClick={() => setShowPauseReasonBox(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Daily Outbound Quota Progress Bar */}
        <div className="mt-5 pt-4 border-t border-border/50 grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-2 space-y-1.5">
            <div className="flex items-center justify-between text-xs font-medium">
              <span className="flex items-center gap-1.5 text-foreground">
                <Send className="w-3.5 h-3.5 text-primary" />
                Daily Outbound Message Quota
              </span>
              <span className="font-mono text-muted-foreground">
                <strong className="text-foreground font-semibold">{sendsToday}</strong> / {currentDailyLimit} sent today ({sendsRemaining} remaining)
              </span>
            </div>
            <div className="h-2 w-full bg-muted/60 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  quotaPercent >= 90
                    ? "bg-red-500"
                    : quotaPercent >= 70
                    ? "bg-amber-500"
                    : "bg-primary"
                }`}
                style={{ width: `${quotaPercent}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-start md:justify-end gap-2 text-xs text-muted-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-primary/70" />
            <span>Configured limit: <strong>{currentDailyLimit} / day</strong></span>
          </div>
        </div>
      </div>

      {/* ── 2. "WHAT THE AGENT DID TODAY" KPI METRICS ──────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span>What the Agent Did Today</span>
            <Badge variant="outline" className="text-[10px] font-mono px-2 py-0">
              Live UTC
            </Badge>
          </h3>
          <span className="text-xs text-muted-foreground">
            Automatically logged to audit trail
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {/* CVs Ingested */}
          <Card className="border border-border/70 hover:border-border transition-colors">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">CVs Ingested</span>
                <FileText className="w-3.5 h-3.5 text-sky-500" />
              </div>
              <p className="text-2xl font-black tracking-tight text-foreground">
                {activity?.cvs_ingested_today ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Received from Gmail & Uploads</p>
            </CardContent>
          </Card>

          {/* CVs Scored */}
          <Card className="border border-border/70 hover:border-border transition-colors">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">CVs Scored</span>
                <Sparkles className="w-3.5 h-3.5 text-indigo-500" />
              </div>
              <p className="text-2xl font-black tracking-tight text-foreground">
                {activity?.cvs_scored_today ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">Evaluated against JDs</p>
            </CardContent>
          </Card>

          {/* Waiting for HR Review */}
          <Card className="border border-border/70 hover:border-border transition-colors">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Waiting Review</span>
                <Clock className="w-3.5 h-3.5 text-amber-500" />
              </div>
              <p className="text-2xl font-black tracking-tight text-foreground">
                {activity?.waiting_for_review ?? 0}
              </p>
              <Link
                href="/pipeline"
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5 font-medium"
              >
                Review in Pipeline <ArrowRight className="w-2.5 h-2.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Interviews Scheduled Today */}
          <Card className="border border-border/70 hover:border-border transition-colors">
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Interviews Today</span>
                <Calendar className="w-3.5 h-3.5 text-emerald-500" />
              </div>
              <p className="text-2xl font-black tracking-tight text-foreground">
                {activity?.interviews_today ?? 0}
              </p>
              <Link
                href="/interviews"
                className="text-[10px] text-primary hover:underline flex items-center gap-0.5 font-medium"
              >
                View Interviews <ArrowRight className="w-2.5 h-2.5" />
              </Link>
            </CardContent>
          </Card>

          {/* Failures / Exceptions Today */}
          <Card className={`border transition-colors ${
            (activity?.failures_today ?? 0) > 0
              ? "border-red-500/50 bg-red-500/5 dark:bg-red-950/20"
              : "border-border/70"
          }`}>
            <CardContent className="p-4 space-y-1">
              <div className="flex items-center justify-between text-muted-foreground">
                <span className="text-[11px] font-medium">Failures Today</span>
                <AlertTriangle className={`w-3.5 h-3.5 ${
                  (activity?.failures_today ?? 0) > 0 ? "text-red-500" : "text-emerald-500"
                }`} />
              </div>
              <p className={`text-2xl font-black tracking-tight ${
                (activity?.failures_today ?? 0) > 0 ? "text-red-500" : "text-foreground"
              }`}>
                {activity?.failures_today ?? 0}
              </p>
              <p className="text-[10px] text-muted-foreground">
                {(activity?.failures_today ?? 0) === 0 ? "All systems optimal" : "HR notified immediately"}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── 3. CONFIGURATION: DAILY SEND LIMIT & INSTANT NOTIFICATIONS ──────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Recruiter Instant Email Notifications Card */}
        <Card className="border border-border/80 rounded-xl shadow-xs">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                  <Bell className="w-4 h-4 text-primary" />
                  <span>Instant HR Email Notifications</span>
                </CardTitle>
                <CardDescription className="text-xs text-muted-foreground">
                  Get notified right away when critical candidate actions or failures happen.
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => testAlertMutation.mutate()}
                disabled={testAlertMutation.isPending}
                className="text-[11px] h-7 px-2.5 gap-1 border-dashed"
                title="Send a sample failure alert email to verify configuration"
              >
                <AlertCircle className="w-3 h-3 text-amber-500" />
                <span>Test Alert</span>
              </Button>
            </div>
          </CardHeader>

          <CardContent className="p-5 space-y-4">
            {/* Notification recipient email */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center justify-between">
                <span>Alert Recipient Email</span>
                <span className="text-[10px] text-muted-foreground">Leave empty to use recruiter email</span>
              </label>
              <Input
                type="email"
                placeholder="recruiter@company.com"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                className="text-xs h-9"
              />
            </div>

            {/* Notification Toggles */}
            <div className="space-y-3 pt-2 border-t border-border/40">
              {/* 1. Candidate Books Interview */}
              <label className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Candidate Books Interview</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Notify immediately when candidate picks a time slot via your scheduling link.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyBooking}
                  onChange={(e) => setNotifyBooking(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </label>

              {/* 2. Candidate Replies */}
              <label className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-sky-500" />
                    <span>Candidate Replies</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Notify immediately when a candidate replies to outreach or email communications.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyReply}
                  onChange={(e) => setNotifyReply(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </label>

              {/* 3. Something Fails */}
              <label className="flex items-start justify-between gap-3 p-2.5 rounded-lg border border-border/60 bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                    <span>Processing & Transmission Failures</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Notify immediately if email dispatch, AI scoring, or calendar sync encounters an error.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={notifyFailure}
                  onChange={(e) => setNotifyFailure(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                />
              </label>
            </div>
          </CardContent>
        </Card>

        {/* Daily Send Limit & Daily Summary Email Card */}
        <Card className="border border-border/80 rounded-xl shadow-xs flex flex-col justify-between">
          <div>
            <CardHeader className="pb-3 border-b border-border/50">
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                <span>Daily Limits & Executive Summary</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Set outbound message safeguard caps and configure morning briefing emails.
              </CardDescription>
            </CardHeader>

            <CardContent className="p-5 space-y-4">
              {/* Daily Outbound Send Limit */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span>Daily Outbound Message Limit</span>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    Sent today: <strong>{sendsToday}</strong>
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={5}
                    max={1000}
                    value={dailyLimit}
                    onChange={(e) => setDailyLimit(parseInt(e.target.value) || 0)}
                    className="text-xs h-9 w-32 font-mono"
                  />
                  <span className="text-xs text-muted-foreground">
                    messages / day maximum to prevent spam flags.
                  </span>
                </div>
              </div>

              {/* Daily Summary Email Section */}
              <div className="space-y-3 pt-3 border-t border-border/40">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dailySummaryEnabled}
                      onChange={(e) => setDailySummaryEnabled(e.target.checked)}
                      className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    />
                    <span>Daily Summary Email</span>
                  </label>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => sendSummaryMutation.mutate()}
                    disabled={sendSummaryMutation.isPending}
                    className="text-[11px] h-7 px-2.5 gap-1.5 border-dashed"
                    title="Generate and send daily summary email right now"
                  >
                    <Mail className="w-3 h-3 text-primary" />
                    <span>Send Daily Summary Now</span>
                  </Button>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Sends one daily digest compiling: new CVs received, candidates waiting for review, and interviews scheduled for today.
                </p>

                <div className="flex items-center gap-3 pt-1">
                  <span className="text-xs font-medium text-foreground">Delivery Time:</span>
                  <Input
                    type="time"
                    value={dailySummaryTime}
                    onChange={(e) => setDailySummaryTime(e.target.value)}
                    className="text-xs h-8 w-28 font-mono"
                  />
                  <span className="text-[11px] text-muted-foreground">UTC time</span>
                </div>

                {settings?.last_daily_summary_sent_at && (
                  <p className="text-[10px] text-muted-foreground">
                    Last sent: {new Date(settings.last_daily_summary_sent_at).toLocaleString()}
                  </p>
                )}
              </div>
            </CardContent>
          </div>

          <div className="p-5 pt-0 border-t border-border/40 flex justify-end">
            <Button
              onClick={handleSavePreferences}
              disabled={updateSettingsMutation.isPending}
              className="gap-2 text-xs font-semibold h-8"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{updateSettingsMutation.isPending ? "Saving..." : "Save Agent Settings"}</span>
            </Button>
          </div>
        </Card>
      </div>

      {/* ── 4. LIVE AUDIT FEED OF WHAT THE AGENT DID TODAY ──────────────────── */}
      <Card className="border border-border/80 rounded-xl shadow-xs">
        <CardHeader className="pb-3 border-b border-border/50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                <span>Today's Agent Activity Log</span>
              </CardTitle>
              <CardDescription className="text-xs text-muted-foreground">
                Chronological real-time record of all actions executed by the agent today.
              </CardDescription>
            </div>

            {/* Category Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {[
                { id: "all", label: "All Activity" },
                { id: "cv_review", label: "CV Review" },
                { id: "interview", label: "Interviews" },
                { id: "outreach", label: "Outreach" },
                { id: "error", label: "Failures" },
              ].map((pill) => (
                <button
                  key={pill.id}
                  onClick={() => setFeedFilter(pill.id)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                    feedFilter === pill.id
                      ? "bg-primary text-primary-foreground font-semibold"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {filteredFeed.length === 0 ? (
            <div className="p-8 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-muted-foreground/50 mx-auto" />
              <p className="text-xs font-semibold text-foreground">No matching activity yet today</p>
              <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                Candidate applications synced, CV evaluations, interview bookings, and notifications will be logged here automatically.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {filteredFeed.map((item) => {
                const isErr = item.category === "error";
                const isInterview = item.category === "interview";
                const isCV = item.category === "cv_review";
                const isOutreach = item.category === "outreach";

                return (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-muted/10 transition-colors flex items-start justify-between gap-4"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 p-1.5 rounded-md ${
                          isErr
                            ? "bg-red-500/10 text-red-600 dark:text-red-400"
                            : isInterview
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : isCV
                            ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
                            : isOutreach
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {isErr && <AlertTriangle className="w-3.5 h-3.5" />}
                        {isInterview && <Calendar className="w-3.5 h-3.5" />}
                        {isCV && <Sparkles className="w-3.5 h-3.5" />}
                        {isOutreach && <Send className="w-3.5 h-3.5" />}
                        {!isErr && !isInterview && !isCV && !isOutreach && (
                          <Activity className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-foreground">
                            {item.title}
                          </p>
                          <Badge
                            variant="outline"
                            className="text-[10px] uppercase font-mono px-1.5 py-0"
                          >
                            {item.category}
                          </Badge>
                          {item.candidate_name && (
                            <span className="text-[11px] text-muted-foreground font-medium">
                              • {item.candidate_name}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground break-words line-clamp-2">
                          {item.details}
                        </p>
                      </div>
                    </div>

                    <div className="text-right whitespace-nowrap">
                      <span className="text-[11px] font-mono text-muted-foreground">
                        {new Date(item.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
