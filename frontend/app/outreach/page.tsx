"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Send,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Clock,
  RefreshCw,
  Edit3,
  Calendar,
  Mail,
  MessageSquare,
  Globe,
  ExternalLink,
  RotateCcw,
  Check,
  CheckCheck,
  ShieldCheck,
  ListFilter,
  User,
  Briefcase,
  Copy,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import {
  outreachApi,
  candidatesApi,
  ApprovalQueueItem,
  OutreachAuditItem,
  Candidate,
} from "@/lib/api";

export default function OutreachPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeTab, setActiveTab] = useState<"queue" | "audit">("queue");
  const [channelFilter, setChannelFilter] = useState<string>("all");

  // Drafting form state
  const [selectedCandidateId, setSelectedCandidateId] = useState<string>("");
  const [draftChannel, setDraftChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [draftLanguage, setDraftLanguage] = useState<"english" | "hinglish">("english");
  const [customInstructions, setCustomInstructions] = useState<string>("");

  // Bulk selection state
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);

  // Inline editing state: { message_id: { body, subject } }
  const [editingDrafts, setEditingDrafts] = useState<
    Record<string, { body: string; subject?: string }>
  >({});

  // 1. Fetch Candidates for Drafter
  const { data: candidatesData } = useQuery({
    queryKey: ["candidatesList"],
    queryFn: () => candidatesApi.list({ limit: 100 }),
  });
  const candidatesList = candidatesData?.items || [];

  // 2. Fetch Approval Queue
  const {
    data: queueData,
    isLoading: isQueueLoading,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ["outreachApprovalQueue", channelFilter],
    queryFn: () =>
      outreachApi.getQueue({
        channel: channelFilter !== "all" ? channelFilter : undefined,
      }),
    refetchInterval: 10000,
  });
  const queueItems = queueData || [];

  // 3. Fetch Outreach Audit Trail
  const {
    data: auditData,
    isLoading: isAuditLoading,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ["outreachAuditTrail"],
    queryFn: () => outreachApi.getAuditTrail({ limit: 60 }),
    refetchInterval: 10000,
  });
  const auditLogs = auditData || [];

  // 4. Draft Mutation
  const draftMutation = useMutation({
    mutationFn: () => {
      if (!selectedCandidateId) throw new Error("Please select a candidate to draft outreach for.");
      return outreachApi.draft({
        candidate_id: selectedCandidateId,
        channel: draftChannel,
        language: draftLanguage,
        instructions: customInstructions.trim() || undefined,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["candidatesList"] });
      setSelectedCandidateId("");
      setCustomInstructions("");
      setActiveTab("queue");
      toast({
        title: "Outreach Draft Created",
        description: `Personalized ${res.channel.toUpperCase()} draft in ${res.language.toUpperCase()} queued for ${res.candidate_name}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Drafting Failed",
        description: err?.response?.data?.detail || err?.message || "Failed to generate outreach draft.",
        variant: "destructive",
      });
    },
  });

  // 5. Update Draft Mutation
  const updateDraftMutation = useMutation({
    mutationFn: ({ messageId, data }: { messageId: string; data: { body: string; subject?: string } }) =>
      outreachApi.updateDraft(messageId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      toast({
        title: "Draft Updated",
        description: "Your modifications have been saved.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Update Failed",
        description: err?.response?.data?.detail || err?.message,
        variant: "destructive",
      });
    },
  });

  // 6. Single Approve & Send Mutation
  const approveMutation = useMutation({
    mutationFn: (messageId: string) => outreachApi.approve(messageId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["candidatesList"] });

      if (res.status === "sent") {
        toast({
          title: "Approved & Sent Successfully",
          description: "Outreach message with scheduling link dispatched to candidate.",
        });
      } else {
        toast({
          title: "Approved, But Transmission Failed",
          description: res.error || "Message marked as failed. Review in Audit Trail and use Retry.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Approval Error",
        description: err?.response?.data?.detail || err?.message,
        variant: "destructive",
      });
    },
  });

  // 7. Bulk Approve Mutation
  const bulkApproveMutation = useMutation({
    mutationFn: (messageIds: string[]) => outreachApi.bulkApprove(messageIds),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["candidatesList"] });
      setSelectedMessageIds([]);

      toast({
        title: `Bulk Approval Finished (${res.approved_count} items)`,
        description: `${res.sent_count} sent successfully, ${res.failed_count} failed.`,
        variant: res.failed_count > 0 ? "destructive" : "default",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Bulk Approval Failed",
        description: err?.response?.data?.detail || err?.message,
        variant: "destructive",
      });
    },
  });

  // 8. Retry Failed Mutation
  const retryMutation = useMutation({
    mutationFn: (messageId: string) => outreachApi.retry(messageId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });

      if (res.status === "sent") {
        toast({
          title: "Retry Succeeded",
          description: "Outreach message transmitted successfully.",
        });
      } else {
        toast({
          title: "Retry Failed Again",
          description: res.error || "Transmission failed.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Retry Error",
        description: err?.response?.data?.detail || err?.message,
        variant: "destructive",
      });
    },
  });

  // 9. Sync Stages Mutation
  const syncStagesMutation = useMutation({
    mutationFn: () => outreachApi.syncStages(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["candidatesList"] });
      toast({
        title: "Lifecycle Stages Synced",
        description: `Checked ${res.interviews_checked} interviews. ${res.stages_updated_to_interviewed} candidate(s) moved to 'Interviewed'.`,
      });
    },
  });

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedMessageIds(queueItems.map((q) => q.message_id));
    } else {
      setSelectedMessageIds([]);
    }
  };

  const handleToggleSelect = (messageId: string) => {
    setSelectedMessageIds((prev) =>
      prev.includes(messageId) ? prev.filter((id) => id !== messageId) : [...prev, messageId]
    );
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to Clipboard", description: text });
  };

  const getStageBadge = (stage: string) => {
    switch (stage.toLowerCase()) {
      case "shortlisted":
        return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">Shortlisted</span>;
      case "contacted":
        return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">Contacted</span>;
      case "scheduled":
      case "interview":
        return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">Scheduled</span>;
      case "interviewed":
        return <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-teal-500/10 text-teal-300 border border-teal-500/20">Interviewed</span>;
      default:
        return <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">{stage}</span>;
    }
  };

  return (
    <AppShell
      title="Outreach Agent"
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => syncStagesMutation.mutate()}
            disabled={syncStagesMutation.isPending}
            className="text-xs border-slate-700 bg-slate-900/60 text-slate-300 hover:text-white flex items-center gap-1.5"
          >
            <Clock className={`w-3.5 h-3.5 text-blue-400 ${syncStagesMutation.isPending ? "animate-spin" : ""}`} />
            Sync Lifecycle Stages
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              refetchQueue();
              refetchAudit();
            }}
            className="text-slate-400 hover:text-white p-2"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      }
    >
      <div className="max-w-7xl mx-auto space-y-8 pb-16">
        {/* Banner / Header */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 relative overflow-hidden shadow-xl">
          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="w-8 h-8 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-purple-400">
                  Autonomous Shortlist Outreach
                </span>
              </div>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                AI Shortlist Outreach & Approval Queue
              </h1>
              <p className="text-sm text-slate-400 mt-1 max-w-3xl">
                Personalized candidate outreach generated from JD & CV data (WhatsApp or Email,
                Hinglish or English). All drafts require recruiter approval before dispatch.
                Stages update automatically: <strong>Shortlisted</strong> &rarr;{" "}
                <strong>Contacted</strong> (on reply) &rarr; <strong>Scheduled</strong> (on booking) &rarr;{" "}
                <strong>Interviewed</strong> (after interview time).
              </p>
            </div>

            {/* Quick Stats Pill */}
            <div className="flex items-center gap-3">
              <div className="px-4 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-center">
                <div className="text-xl font-bold text-amber-400">{queueItems.length}</div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Awaiting Approval</div>
              </div>
              <div className="px-4 py-2.5 rounded-2xl bg-slate-800/80 border border-slate-700 text-center">
                <div className="text-xl font-bold text-emerald-400">
                  {auditLogs.filter((a) => a.action === "outreach_sent").length}
                </div>
                <div className="text-[11px] text-slate-400 uppercase tracking-wider">Dispatched</div>
              </div>
            </div>
          </div>
        </div>

        {/* AI Drafter Section */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-5">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Send className="w-4 h-4 text-purple-400" />
            Draft New Outreach Message
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Candidate Selector */}
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-blue-400" />
                Select Candidate
              </label>
              <select
                id="select-outreach-candidate"
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="">-- Choose Candidate --</option>
                {candidatesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.email}) — Stage: {c.stage}
                  </option>
                ))}
              </select>
            </div>

            {/* Channel */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                Channel
              </label>
              <select
                id="select-outreach-channel"
                value={draftChannel}
                onChange={(e) => setDraftChannel(e.target.value as "whatsapp" | "email")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="whatsapp">WhatsApp Cloud API</option>
                <option value="email">Email (Gmail API)</option>
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-indigo-400" />
                Language
              </label>
              <select
                id="select-outreach-language"
                value={draftLanguage}
                onChange={(e) => setDraftLanguage(e.target.value as "english" | "hinglish")}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              >
                <option value="english">English (Professional)</option>
                <option value="hinglish">Hinglish (Natural / Conversational)</option>
              </select>
            </div>
          </div>

          {/* Optional instructions & Submit */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <input
              id="input-outreach-instructions"
              type="text"
              placeholder="Optional recruiter notes (e.g. 'Invite for 1st round, highlight GCP expertise')..."
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <Button
              id="btn-generate-outreach"
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending || !selectedCandidateId}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-500 text-white font-medium flex items-center gap-1.5 shrink-0 px-5 shadow-lg shadow-purple-500/20"
            >
              {draftMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              Generate AI Draft
            </Button>
          </div>
        </div>

        {/* Tab Switcher & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2 bg-slate-900 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setActiveTab("queue")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                activeTab === "queue"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              Approval Queue ({queueItems.length})
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                activeTab === "audit"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              Outreach Audit Trail ({auditLogs.length})
            </button>
          </div>

          {activeTab === "queue" && (
            <div className="flex items-center gap-3">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-purple-500"
              >
                <option value="all">All Channels</option>
                <option value="whatsapp">WhatsApp Only</option>
                <option value="email">Email Only</option>
              </select>

              {queueItems.length > 0 && (
                <Button
                  id="btn-bulk-approve"
                  size="sm"
                  onClick={() => bulkApproveMutation.mutate(selectedMessageIds.length > 0 ? selectedMessageIds : queueItems.map(q => q.message_id))}
                  disabled={bulkApproveMutation.isPending}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 shadow-md shadow-emerald-600/20"
                >
                  {bulkApproveMutation.isPending ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <CheckCheck className="w-3.5 h-3.5" />
                  )}
                  {selectedMessageIds.length > 0
                    ? `Bulk Approve (${selectedMessageIds.length})`
                    : `Approve All (${queueItems.length})`}
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ── TAB 1: APPROVAL QUEUE ────────────────────────────────────────── */}
        {activeTab === "queue" && (
          <div className="space-y-4">
            {isQueueLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                <span className="text-xs">Loading approval queue...</span>
              </div>
            ) : queueItems.length === 0 ? (
              <div className="bg-slate-900/60 border border-slate-800/80 rounded-3xl p-12 text-center">
                <ShieldCheck className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                <h3 className="text-base font-bold text-white mb-1">Queue is clear!</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  No outreach messages are currently awaiting recruiter approval. Select a candidate
                  above to generate a new AI draft.
                </p>
              </div>
            ) : (
              <>
                {/* Select All Checkbox bar */}
                <div className="flex items-center justify-between px-2 text-xs text-slate-400">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={
                        selectedMessageIds.length > 0 &&
                        selectedMessageIds.length === queueItems.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700 cursor-pointer"
                    />
                    <span>Select all {queueItems.length} draft(s)</span>
                  </label>
                  <span>Nothing is transmitted without your explicit approval.</span>
                </div>

                {/* Queue Cards */}
                <div className="space-y-4">
                  {queueItems.map((item) => {
                    const isSelected = selectedMessageIds.includes(item.message_id);
                    const isEditing = editingDrafts[item.message_id] !== undefined;
                    const currentBody =
                      editingDrafts[item.message_id]?.body ?? item.body;
                    const currentSubject =
                      editingDrafts[item.message_id]?.subject ?? item.subject;

                    return (
                      <div
                        key={item.message_id}
                        className={`bg-slate-900 border rounded-3xl p-6 transition shadow-lg ${
                          isSelected
                            ? "border-purple-500/80 bg-slate-900/90"
                            : "border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        {/* Header bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800/80">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.message_id)}
                              className="w-4 h-4 rounded text-purple-600 focus:ring-purple-500 bg-slate-800 border-slate-700 cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-base font-bold text-white">
                                  {item.candidate_name}
                                </h3>
                                {getStageBadge(item.candidate_stage)}
                              </div>
                              <div className="text-xs text-slate-400 flex items-center gap-3 mt-0.5">
                                <span>{item.candidate_email}</span>
                                {item.candidate_phone && <span>• {item.candidate_phone}</span>}
                                {item.opening_title && (
                                  <span className="text-slate-300 font-medium">
                                    • {item.opening_title}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Channel & Language badges */}
                          <div className="flex items-center gap-2">
                            <span
                              className={`text-[11px] font-semibold px-2.5 py-1 rounded-xl flex items-center gap-1.5 ${
                                item.channel === "whatsapp"
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {item.channel === "whatsapp" ? (
                                <MessageSquare className="w-3 h-3" />
                              ) : (
                                <Mail className="w-3 h-3" />
                              )}
                              {item.channel.toUpperCase()}
                            </span>
                            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1">
                              <Globe className="w-3 h-3" />
                              {item.language.toUpperCase()}
                            </span>
                          </div>
                        </div>

                        {/* Scheduling link chip */}
                        {item.scheduling_url && (
                          <div className="my-3 p-2.5 rounded-xl bg-slate-950/60 border border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300">
                            <div className="flex items-center gap-2 truncate">
                              <Calendar className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                              <span className="text-slate-500">Scheduling Link:</span>
                              <span className="truncate text-blue-300">{item.scheduling_url}</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(item.scheduling_url!)}
                              className="text-slate-400 hover:text-white p-1 ml-2 transition"
                              title="Copy Scheduling URL"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}

                        {/* Subject if email */}
                        {item.channel === "email" && (
                          <div className="mb-2">
                            {isEditing ? (
                              <input
                                type="text"
                                value={currentSubject || ""}
                                onChange={(e) =>
                                  setEditingDrafts((prev) => ({
                                    ...prev,
                                    [item.message_id]: {
                                      body: currentBody,
                                      subject: e.target.value,
                                    },
                                  }))
                                }
                                placeholder="Email Subject"
                                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                            ) : (
                              <div className="text-xs font-semibold text-slate-200">
                                Subject: <span className="font-normal">{item.subject || "Interview Invitation"}</span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Body content */}
                        <div className="my-3">
                          {isEditing ? (
                            <textarea
                              rows={5}
                              value={currentBody}
                              onChange={(e) =>
                                setEditingDrafts((prev) => ({
                                  ...prev,
                                  [item.message_id]: {
                                    body: e.target.value,
                                    subject: currentSubject,
                                  },
                                }))
                              }
                              className="w-full bg-slate-950 border border-slate-700 rounded-2xl p-3.5 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500 font-sans leading-relaxed"
                            />
                          ) : (
                            <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 text-xs text-slate-200 whitespace-pre-wrap leading-relaxed font-sans">
                              {item.body}
                            </div>
                          )}
                        </div>

                        {/* Card Action Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                          <div>
                            {isEditing ? (
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    const next = { ...editingDrafts };
                                    delete next[item.message_id];
                                    setEditingDrafts(next);
                                  }}
                                  className="text-xs text-slate-400"
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    updateDraftMutation.mutate({
                                      messageId: item.message_id,
                                      data: {
                                        body: currentBody,
                                        subject: currentSubject,
                                      },
                                    });
                                    const next = { ...editingDrafts };
                                    delete next[item.message_id];
                                    setEditingDrafts(next);
                                  }}
                                  className="bg-purple-600 hover:bg-purple-500 text-white text-xs"
                                >
                                  Save Edits
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  setEditingDrafts((prev) => ({
                                    ...prev,
                                    [item.message_id]: {
                                      body: item.body,
                                      subject: item.subject,
                                    },
                                  }))
                                }
                                className="text-xs text-slate-400 hover:text-white flex items-center gap-1.5"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                Edit Draft
                              </Button>
                            )}
                          </div>

                          <Button
                            id={`btn-approve-${item.message_id}`}
                            size="sm"
                            onClick={() => approveMutation.mutate(item.message_id)}
                            disabled={approveMutation.isPending}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs flex items-center gap-1.5 px-4 shadow-md shadow-emerald-600/20"
                          >
                            {approveMutation.isPending ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            Approve & Send
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── TAB 2: AUDIT TRAIL & DELIVERY TRACKING ────────────────────────── */}
        {activeTab === "audit" && (
          <div className="space-y-4">
            {isAuditLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <RefreshCw className="w-6 h-6 text-purple-400 animate-spin" />
                <span className="text-xs">Loading audit trail...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-12 text-center text-slate-400 text-xs">
                No outreach events recorded yet.
              </div>
            ) : (
              <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-xl space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ListFilter className="w-4 h-4 text-purple-400" />
                    Lifecycle & Outreach History
                  </h3>
                  <span className="text-xs text-slate-400">
                    Failed steps display exact error bodies and an interactive Retry button
                  </span>
                </div>

                <div className="divide-y divide-slate-800/80 space-y-3">
                  {auditLogs.map((log) => {
                    const isFailure =
                      log.action.includes("failed") || log.failure_reason !== null;
                    return (
                      <div key={log.id} className="pt-3 flex flex-col sm:flex-row items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-lg font-mono ${
                                isFailure
                                  ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                  : log.action.includes("sent") || log.action.includes("approved")
                                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                  : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
                              }`}
                            >
                              {log.action}
                            </span>

                            {log.candidate_name && (
                              <span className="text-xs font-semibold text-white">
                                {log.candidate_name}
                              </span>
                            )}

                            {log.from_stage && log.to_stage && (
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <span>{log.from_stage}</span>
                                <span>&rarr;</span>
                                <span className="text-purple-400 font-medium">{log.to_stage}</span>
                              </span>
                            )}
                          </div>

                          {/* Failure banner if present */}
                          {isFailure && log.failure_reason && (
                            <div className="mt-1.5 p-2.5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                              <div className="font-mono text-[11px] break-all">
                                {log.failure_reason}
                              </div>
                            </div>
                          )}

                          {/* Normal details */}
                          {!isFailure && log.details && (
                            <p className="text-xs text-slate-400 font-mono text-[11px] break-all">
                              {log.details}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] text-slate-500 font-mono">
                            {new Date(log.created_at).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                              second: "2-digit",
                            })}
                          </span>

                          {/* Retry button for failed messages */}
                          {log.retryable && log.message_id && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => retryMutation.mutate(log.message_id!)}
                              disabled={retryMutation.isPending}
                              className="text-xs border-rose-700/80 bg-rose-950/30 text-rose-300 hover:text-white hover:bg-rose-900/50 flex items-center gap-1.5 py-1 px-3 rounded-xl"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`} />
                              Retry
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}
