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
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
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
  const [draftChannel, setDraftChannel] = useState<"email">("email");
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
        return <Badge variant="primary" className="text-[11px]">{stage}</Badge>;
      case "contacted":
        return <Badge variant="info" className="text-[11px]">{stage}</Badge>;
      case "scheduled":
      case "interview":
        return <Badge variant="success" className="text-[11px]">{stage}</Badge>;
      case "interviewed":
        return <Badge variant="secondary" className="text-[11px]">{stage}</Badge>;
      default:
        return <Badge variant="outline" className="text-[11px]">{stage}</Badge>;
    }
  };

  return (
    <AppShell title="Outreach Agent">
      <div className="max-w-7xl mx-auto space-y-6 pb-16">
        <PageHeader
          title="AI Shortlist Outreach & Approval Queue"
          description="Personalized candidate engagement generated from JD & CV data. Recruiter approval is strictly required before dispatch. Pipeline stages advance automatically on reply and booking."
          badge={
            <Badge variant="primary" className="gap-1 font-mono text-[11px]">
              <Sparkles className="h-3 w-3" />
              <span>AI Autonomous</span>
            </Badge>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => syncStagesMutation.mutate()}
                disabled={syncStagesMutation.isPending}
                className="gap-1.5"
              >
                <Clock className={`w-3.5 h-3.5 text-muted-foreground ${syncStagesMutation.isPending ? "animate-spin" : ""}`} />
                <span>Sync Lifecycle Stages</span>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  refetchQueue();
                  refetchAudit();
                }}
                className="gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
            <div className="text-xs text-muted-foreground font-medium">Awaiting Approval</div>
            <div className="text-2xl font-bold tracking-tight text-amber-500 mt-1">{queueItems.length}</div>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
            <div className="text-xs text-muted-foreground font-medium">Outreach Dispatched</div>
            <div className="text-2xl font-bold tracking-tight text-emerald-500 mt-1">
              {auditLogs.filter((a) => a.action === "outreach_sent").length}
            </div>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
            <div className="text-xs text-muted-foreground font-medium">Total Candidates</div>
            <div className="text-2xl font-bold tracking-tight text-foreground mt-1">{candidatesList.length}</div>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
            <div className="text-xs text-muted-foreground font-medium">Transmission Channel</div>
            <div className="text-sm font-semibold tracking-tight text-foreground mt-2 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-primary" />
              <span>Gmail API</span>
            </div>
          </div>
        </div>

        {/* AI Drafter Section */}
        <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <span>Draft New Outreach Message</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Candidate Selector */}
            <div className="md:col-span-2">
              <label className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
                Select Candidate
              </label>
              <select
                id="select-outreach-candidate"
                value={selectedCandidateId}
                onChange={(e) => setSelectedCandidateId(e.target.value)}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              <label className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                Channel
              </label>
              <select
                id="select-outreach-channel"
                value="email"
                disabled
                className="w-full bg-muted/40 border border-input rounded-lg px-3 py-2 text-xs text-muted-foreground cursor-not-allowed"
              >
                <option value="email">Email (Gmail API)</option>
              </select>
            </div>

            {/* Language */}
            <div>
              <label className="text-xs font-medium text-foreground block mb-1.5 flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                Language
              </label>
              <select
                id="select-outreach-language"
                value={draftLanguage}
                onChange={(e) => setDraftLanguage(e.target.value as "english" | "hinglish")}
                className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
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
              className="w-full bg-background border border-input rounded-lg px-3 py-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            <Button
              id="btn-generate-outreach"
              onClick={() => draftMutation.mutate()}
              disabled={draftMutation.isPending || !selectedCandidateId}
              className="w-full sm:w-auto font-medium gap-1.5 shrink-0 px-4 shadow-xs"
            >
              {draftMutation.isPending ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>Generate AI Draft</span>
            </Button>
          </div>
        </div>

        {/* Tab Switcher & Filters */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-border/70 pb-3">
          <div className="flex items-center gap-1.5 bg-muted/40 p-1 rounded-lg border border-border/70">
            <button
              onClick={() => setActiveTab("queue")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                activeTab === "queue"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Approval Queue ({queueItems.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("audit")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium flex items-center gap-1.5 transition ${
                activeTab === "audit"
                  ? "bg-background text-foreground shadow-xs font-semibold"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <ListFilter className="w-3.5 h-3.5" />
              <span>Outreach Audit Trail ({auditLogs.length})</span>
            </button>
          </div>

          {activeTab === "queue" && (
            <div className="flex items-center gap-2">
              <select
                value={channelFilter}
                onChange={(e) => setChannelFilter(e.target.value)}
                className="bg-background border border-input rounded-md px-2.5 py-1 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="all">Email (Gmail)</option>
              </select>

              {queueItems.length > 0 && (
                <Button
                  id="btn-bulk-approve"
                  size="sm"
                  onClick={() => bulkApproveMutation.mutate(selectedMessageIds.length > 0 ? selectedMessageIds : queueItems.map(q => q.message_id))}
                  disabled={bulkApproveMutation.isPending}
                  className="font-medium text-xs gap-1.5 shadow-xs"
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
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <span className="text-xs">Loading approval queue...</span>
              </div>
            ) : queueItems.length === 0 ? (
              <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-12 text-center">
                <ShieldCheck className="w-12 h-12 text-muted-foreground mx-auto mb-3 opacity-60" />
                <h3 className="text-sm font-semibold text-foreground mb-1">Queue is clear!</h3>
                <p className="text-xs text-muted-foreground max-w-md mx-auto">
                  No outreach messages are currently awaiting recruiter approval. Select a candidate
                  above to generate a new AI draft.
                </p>
              </div>
            ) : (
              <>
                {/* Select All Checkbox bar */}
                <div className="flex items-center justify-between px-2 text-xs text-muted-foreground">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={
                        selectedMessageIds.length > 0 &&
                        selectedMessageIds.length === queueItems.length
                      }
                      onChange={(e) => handleSelectAll(e.target.checked)}
                      className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                    />
                    <span className="text-foreground font-medium">Select all {queueItems.length} draft(s)</span>
                  </label>
                  <span>Nothing is transmitted without your explicit approval.</span>
                </div>

                {/* Queue Cards */}
                <div className="space-y-3">
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
                        className={`bg-card border rounded-xl p-5 transition shadow-xs ${
                          isSelected
                            ? "border-primary/80 ring-1 ring-primary/40"
                            : "border-border/70 dark:border-white/[0.08] hover:border-border"
                        }`}
                      >
                        {/* Header bar */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/70">
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelect(item.message_id)}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                            />
                            <div>
                              <div className="flex items-center gap-2">
                                <h3 className="text-sm font-semibold text-foreground">
                                  {item.candidate_name}
                                </h3>
                                {getStageBadge(item.candidate_stage)}
                              </div>
                              <div className="text-xs text-muted-foreground flex items-center gap-2.5 mt-0.5">
                                <span>{item.candidate_email}</span>
                                {item.candidate_phone && <span>• {item.candidate_phone}</span>}
                                {item.opening_title && (
                                  <span className="text-foreground font-medium">
                                    • {item.opening_title}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Channel & Language badges */}
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="gap-1 text-[11px]">
                              <Mail className="w-3 h-3 text-primary" />
                              <span>EMAIL</span>
                            </Badge>
                            <Badge variant="secondary" className="gap-1 text-[11px]">
                              <Globe className="w-3 h-3" />
                              <span>{item.language.toUpperCase()}</span>
                            </Badge>
                          </div>
                        </div>

                        {/* Scheduling link chip */}
                        {item.scheduling_url && (
                          <div className="my-3 p-2.5 rounded-lg bg-muted/40 border border-border/70 flex items-center justify-between text-xs font-mono text-foreground">
                            <div className="flex items-center gap-2 truncate">
                              <Calendar className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="text-muted-foreground">Scheduling Link:</span>
                              <span className="truncate text-primary">{item.scheduling_url}</span>
                            </div>
                            <button
                              onClick={() => copyToClipboard(item.scheduling_url!)}
                              className="text-muted-foreground hover:text-foreground p-1 ml-2 transition"
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
                                className="w-full bg-background border border-input rounded-md px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                              />
                            ) : (
                              <div className="text-xs font-medium text-foreground">
                                Subject: <span className="text-muted-foreground font-normal">{item.subject || "Interview Invitation"}</span>
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
                              className="w-full bg-background border border-input rounded-lg p-3 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-ring font-sans leading-relaxed"
                            />
                          ) : (
                            <div className="bg-muted/30 border border-border/70 rounded-lg p-3.5 text-xs text-foreground whitespace-pre-wrap leading-relaxed font-sans">
                              {item.body}
                            </div>
                          )}
                        </div>

                        {/* Card Action Footer */}
                        <div className="flex items-center justify-between pt-3 border-t border-border/70">
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
                                  className="text-xs text-muted-foreground"
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
                                  className="text-xs shadow-xs"
                                >
                                  Save Edits
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditingDrafts((prev) => ({
                                    ...prev,
                                    [item.message_id]: {
                                      body: item.body,
                                      subject: item.subject,
                                    },
                                  }))
                                }
                                className="text-xs gap-1.5"
                              >
                                <Edit3 className="w-3.5 h-3.5 text-muted-foreground" />
                                <span>Edit Draft</span>
                              </Button>
                            )}
                          </div>

                          <Button
                            id={`btn-approve-${item.message_id}`}
                            size="sm"
                            onClick={() => approveMutation.mutate(item.message_id)}
                            disabled={approveMutation.isPending}
                            className="font-medium text-xs gap-1.5 px-4 shadow-xs"
                          >
                            {approveMutation.isPending ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            <span>Approve & Send</span>
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
              <div className="py-20 flex flex-col items-center justify-center text-muted-foreground gap-3">
                <RefreshCw className="w-6 h-6 text-primary animate-spin" />
                <span className="text-xs">Loading audit trail...</span>
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-12 text-center text-muted-foreground text-xs">
                No outreach events recorded yet.
              </div>
            ) : (
              <div className="bg-card border border-border/70 dark:border-white/[0.08] rounded-xl p-5 sm:p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border/70">
                  <h3 className="text-sm font-semibold tracking-tight text-foreground flex items-center gap-2">
                    <ListFilter className="w-4 h-4 text-primary" />
                    <span>Lifecycle & Outreach History</span>
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Failed steps display exact error details and a 1-click Retry button
                  </span>
                </div>

                <div className="divide-y divide-border/70 space-y-2">
                  {auditLogs.map((log) => {
                    const isFailure =
                      log.action.includes("failed") || log.failure_reason !== null;
                    return (
                      <div key={log.id} className="pt-2.5 flex flex-col sm:flex-row items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge
                              variant={
                                isFailure
                                  ? "destructive"
                                  : log.action.includes("sent") || log.action.includes("approved")
                                  ? "success"
                                  : "primary"
                              }
                              className="font-mono text-[11px]"
                            >
                              {log.action}
                            </Badge>

                            {log.candidate_name && (
                              <span className="text-xs font-semibold text-foreground">
                                {log.candidate_name}
                              </span>
                            )}

                            {log.from_stage && log.to_stage && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <span>{log.from_stage}</span>
                                <span>&rarr;</span>
                                <span className="text-foreground font-medium">{log.to_stage}</span>
                              </span>
                            )}
                          </div>

                          {/* Failure banner if present */}
                          {isFailure && log.failure_reason && (
                            <div className="mt-1.5 p-2.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                              <div className="font-mono text-[11px] break-all">
                                {log.failure_reason}
                              </div>
                            </div>
                          )}

                          {/* Normal details */}
                          {!isFailure && log.details && (
                            <p className="text-xs text-muted-foreground font-mono text-[11px] break-all">
                              {log.details}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-[11px] text-muted-foreground font-mono">
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
                              variant="destructive"
                              onClick={() => retryMutation.mutate(log.message_id!)}
                              disabled={retryMutation.isPending}
                              className="text-xs gap-1.5 py-1 px-3"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${retryMutation.isPending ? "animate-spin" : ""}`} />
                              <span>Retry</span>
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
