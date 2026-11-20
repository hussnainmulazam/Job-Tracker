"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
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
  ChevronRight,
  ArrowRight,
  Search,
  X,
  MessageCircle,
  Phone,
  Trash2,
  CornerDownLeft,
  FileText,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import { ScoreRing } from "@/components/ui/score-ring";
import { formatRelativeTime } from "@/lib/utils";
import { formatDateTime } from "@/lib/format-date";
import {
  outreachApi,
  candidatesApi,
  jobOpeningsApi,
  ApprovalQueueItem,
  OutreachAuditItem,
  Candidate,
} from "@/lib/api";

type OutreachStep = 1 | 2 | 3;
type ChannelChoice = "email";

const OUTREACH_TEMPLATES = [
  {
    id: "interview_invitation",
    name: "Interview Invitation & Booking Link",
    description: "Invites candidate for initial conversation with custom Google Calendar link",
    promptInstruction: "Invite candidate warmly for an initial screening interview and prompt them to pick a slot using the provided scheduling link.",
  },
  {
    id: "technical_discussion",
    name: "Technical Assessment Discussion",
    description: "Follows up on technical skills and invites to technical round",
    promptInstruction: "Highlight their strong technical skill match and invite them to schedule a technical discussion with engineering.",
  },
  {
    id: "shortlist_welcome",
    name: "Shortlist Introduction",
    description: "Welcomes candidate to shortlisted stage and outlines hiring timeline",
    promptInstruction: "Welcome them as a shortlisted candidate for the role, express team excitement, and invite them to schedule an introductory chat.",
  },
  {
    id: "custom",
    name: "Custom Recruiter Prompt",
    description: "Drafts tailored outreach based on your custom instructions below",
    promptInstruction: "",
  },
];

export default function OutreachPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Active Flow Step
  const [currentStep, setCurrentStep] = useState<OutreachStep>(1);

  // Step 1: Candidate Selection State
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<string[]>([]);
  const [candidateSearch, setCandidateSearch] = useState("");
  const [selectedOpeningFilter, setSelectedOpeningFilter] = useState("all");
  const [selectedChannel, setSelectedChannel] = useState<ChannelChoice>("email");
  const [selectedTemplateId, setSelectedTemplateId] = useState("interview_invitation");
  const [selectedLanguage, setSelectedLanguage] = useState<"english" | "hinglish">("english");
  const [customInstructions, setCustomInstructions] = useState("");
  const [isBulkDrafting, setIsBulkDrafting] = useState(false);

  // Step 2: Queue & Inline Editing State
  const [editingDrafts, setEditingDrafts] = useState<Record<string, { body: string; subject?: string }>>({});
  const [selectedQueueIds, setSelectedQueueIds] = useState<string[]>([]);

  // 1. Fetch Candidates
  const { data: candidatesData, isLoading: isCandidatesLoading } = useQuery({
    queryKey: ["candidatesList"],
    queryFn: () => candidatesApi.list({ limit: 150 }),
  });
  const candidatesList = candidatesData?.items || [];

  // 2. Fetch Openings for Filter
  const { data: openingsData } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list(),
  });
  const openings = openingsData?.items || [];

  // 3. Fetch Approval Queue
  const {
    data: queueData,
    isLoading: isQueueLoading,
    refetch: refetchQueue,
  } = useQuery({
    queryKey: ["outreachApprovalQueue"],
    queryFn: () => outreachApi.getQueue(),
    refetchInterval: 8000,
  });
  const queueItems = queueData || [];

  // 4. Fetch Outreach Audit Trail / Results Table
  const {
    data: auditData,
    isLoading: isAuditLoading,
    refetch: refetchAudit,
  } = useQuery({
    queryKey: ["outreachAuditTrail"],
    queryFn: () => outreachApi.getAuditTrail({ limit: 100 }),
    refetchInterval: 8000,
  });
  const auditLogs = auditData || [];

  // Step 1: Filter candidates list
  const filteredCandidates = useMemo(() => {
    return candidatesList.filter((c) => {
      if (selectedOpeningFilter !== "all" && c.opening_id !== selectedOpeningFilter) {
        return false;
      }
      if (candidateSearch.trim()) {
        const q = candidateSearch.toLowerCase();
        const matchName = c.name?.toLowerCase().includes(q);
        const matchEmail = c.email?.toLowerCase().includes(q);
        const matchRole = c.opening_title?.toLowerCase().includes(q);
        const matchSkills = c.matched_skills?.some((s) => s.toLowerCase().includes(q));
        if (!matchName && !matchEmail && !matchRole && !matchSkills) return false;
      }
      return true;
    });
  }, [candidatesList, selectedOpeningFilter, candidateSearch]);

  const handleToggleCandidate = (id: string) => {
    setSelectedCandidateIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllCandidates = (checked: boolean) => {
    if (checked) {
      setSelectedCandidateIds(filteredCandidates.map((c) => c.id));
    } else {
      setSelectedCandidateIds([]);
    }
  };

  // Step 1: Bulk Draft Action
  const handleGenerateDrafts = async () => {
    if (selectedCandidateIds.length === 0) {
      toast({
        title: "No candidates selected",
        description: "Please check at least one candidate to draft outreach.",
        variant: "destructive",
      });
      return;
    }

    setIsBulkDrafting(true);
    let successCount = 0;
    let failedCount = 0;

    const tpl = OUTREACH_TEMPLATES.find((t) => t.id === selectedTemplateId);
    const combinedInstructions = [
      tpl?.promptInstruction || "",
      customInstructions.trim(),
    ]
      .filter(Boolean)
      .join(". ");

    for (const cid of selectedCandidateIds) {
      try {
        await outreachApi.draft({
          candidate_id: cid,
          channel: "email",
          language: selectedLanguage,
          instructions: combinedInstructions || undefined,
        });
        successCount++;
      } catch (err) {
        failedCount++;
      }
    }

    setIsBulkDrafting(false);
    queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
    queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
    queryClient.invalidateQueries({ queryKey: ["candidatesList"] });
    setSelectedCandidateIds([]);

    toast({
      title: "Outreach Drafts Generated",
      description: `Generated ${successCount} draft(s) for your review.${
        failedCount > 0 ? ` (${failedCount} failed)` : ""
      }`,
    });

    // Advance to Step 2: Review Drafts
    setCurrentStep(2);
  };

  // Step 2 Mutations: Approve, Edit, Skip
  const approveMutation = useMutation({
    mutationFn: (messageId: string) => outreachApi.approve(messageId),
    onSuccess: (res, messageId) => {
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
          title: "Approved, Transmission Failed",
          description: res.error || "Review failure reason in results table and retry.",
          variant: "destructive",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Approval Error",
        description: err?.response?.data?.detail || err?.message || "Failed to approve draft.",
        variant: "destructive",
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: (messageId: string) => outreachApi.skip(messageId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      toast({
        title: "Draft Skipped",
        description: "Draft removed from approval queue without sending.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Skip Failed",
        description: err?.message || "Could not skip draft.",
        variant: "destructive",
      });
    },
  });

  const updateDraftMutation = useMutation({
    mutationFn: ({ messageId, data }: { messageId: string; data: { body: string; subject?: string } }) =>
      outreachApi.updateDraft(messageId, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      setEditingDrafts((prev) => {
        const next = { ...prev };
        delete next[vars.messageId];
        return next;
      });
      toast({
        title: "Draft Saved",
        description: "Your modifications have been saved.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Update Failed",
        description: err?.message || "Failed to save draft edits.",
        variant: "destructive",
      });
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (messageIds: string[]) => outreachApi.bulkApprove(messageIds),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["candidatesList"] });
      setSelectedQueueIds([]);

      toast({
        title: `Bulk Approval Completed (${res.approved_count} drafts)`,
        description: `${res.sent_count} sent successfully, ${res.failed_count} failed.`,
        variant: res.failed_count > 0 ? "destructive" : "default",
      });

      // Advance to Step 3: View Results
      setCurrentStep(3);
    },
    onError: (err: any) => {
      toast({
        title: "Bulk Approval Failed",
        description: err?.message || "Could not approve selected drafts.",
        variant: "destructive",
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: (messageId: string) => outreachApi.retry(messageId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["outreachAuditTrail"] });
      queryClient.invalidateQueries({ queryKey: ["outreachApprovalQueue"] });
      if (res.status === "sent") {
        toast({
          title: "Retry Succeeded",
          description: "Message dispatched successfully.",
        });
      } else {
        toast({
          title: "Retry Failed",
          description: res.error || "Message delivery failed again.",
          variant: "destructive",
        });
      }
    },
  });

  // Results calculation for Step 3
  const resultsStats = useMemo(() => {
    let sent = 0;
    let failed = 0;
    let replied = 0;

    for (const log of auditLogs) {
      if (log.action === "outreach_sent") sent++;
      if (log.action === "outreach_failed" || log.failure_reason) failed++;
      if (log.action === "candidate_replied" || log.action === "candidate_reply_received") replied++;
    }

    return { sent, failed, replied, total: auditLogs.length };
  }, [auditLogs]);

  return (
    <AppShell title="Outreach Agent">
      <div className="max-w-7xl mx-auto space-y-5 pb-16">
        {/* ── Page Header ─────────────────────────────────────────────── */}
        <PageHeader
          title="Outreach Agent"
          description="Sends personalized messages to shortlisted candidates, with your approval."
          badge={
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="gap-1 font-mono text-[11px] bg-card">
                <ShieldCheck className="h-3 w-3 text-primary" />
                <span>Human-In-The-Loop Approval</span>
              </Badge>
              {queueItems.length > 0 && (
                <Badge variant="secondary" className="gap-1 font-mono text-[11px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                  <Clock className="h-3 w-3" />
                  <span>{queueItems.length} Waiting Approval</span>
                </Badge>
              )}
            </div>
          }
          actions={
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  refetchQueue();
                  refetchAudit();
                }}
                className="h-8 gap-1.5 text-xs font-medium"
              >
                <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
                <span>Refresh</span>
              </Button>
            </div>
          }
        />

        {/* ── 3-Step Flow Stepper Indicator ──────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            {
              step: 1,
              title: "1. Pick Candidates",
              subtitle: "Select applicants & configure channel",
              count: selectedCandidateIds.length > 0 ? `${selectedCandidateIds.length} selected` : null,
            },
            {
              step: 2,
              title: "2. Review Drafted Messages",
              subtitle: "Edit & approve candidate messages",
              count: queueItems.length > 0 ? `${queueItems.length} pending` : null,
            },
            {
              step: 3,
              title: "3. Approve & Send Results",
              subtitle: "Delivery status, errors & replies",
              count: `${resultsStats.sent} sent`,
            },
          ].map((item) => (
            <button
              key={item.step}
              onClick={() => setCurrentStep(item.step as OutreachStep)}
              className={`text-left p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                currentStep === item.step
                  ? "bg-card border-primary ring-2 ring-primary/20 shadow-xs"
                  : "bg-card/50 border-border/70 dark:border-white/[0.08] hover:border-border hover:bg-card"
              }`}
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className={`h-5 w-5 rounded-full text-xs font-bold flex items-center justify-center shrink-0 ${
                      currentStep === item.step
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {item.step}
                  </span>
                  <span className="font-semibold text-xs text-foreground">{item.title}</span>
                </div>
                <p className="text-[11px] text-muted-foreground pl-7">{item.subtitle}</p>
              </div>

              {item.count && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                  {item.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── STEP 1: PICK CANDIDATES & CONFIGURE ─────────────────────── */}
        {currentStep === 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Candidate Picker Table (Left/Center) */}
            <div className="lg:col-span-8 space-y-3.5">
              <div className="rounded-2xl border border-border/70 dark:border-white/[0.08] bg-card overflow-hidden">
                {/* Search & Filter Toolbar */}
                <div className="p-3.5 border-b border-border/60 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                      <Input
                        placeholder="Search candidate name, email, role, or skills..."
                        value={candidateSearch}
                        onChange={(e) => setCandidateSearch(e.target.value)}
                        className="pl-8 text-xs h-8 bg-background/80"
                      />
                      {candidateSearch && (
                        <button
                          onClick={() => setCandidateSearch("")}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <select
                      value={selectedOpeningFilter}
                      onChange={(e) => setSelectedOpeningFilter(e.target.value)}
                      className="text-xs h-8 px-2.5 rounded-lg border border-border/80 bg-background font-medium focus:outline-none cursor-pointer max-w-[170px] truncate"
                    >
                      <option value="all">All Requisitions ({openings.length})</option>
                      {openings.map((op) => (
                        <option key={op.id} value={op.id}>
                          {op.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <span className="text-xs text-muted-foreground font-medium shrink-0">
                    <strong className="text-foreground">{selectedCandidateIds.length}</strong> of{" "}
                    {filteredCandidates.length} selected
                  </span>
                </div>

                {/* Candidate List Table */}
                <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                      <tr>
                        <th className="py-2.5 px-3 w-10 text-center">
                          <input
                            type="checkbox"
                            checked={
                              filteredCandidates.length > 0 &&
                              selectedCandidateIds.length === filteredCandidates.length
                            }
                            onChange={(e) => handleSelectAllCandidates(e.target.checked)}
                            className="rounded border-border h-3.5 w-3.5 text-primary cursor-pointer accent-primary"
                          />
                        </th>
                        <th className="py-2.5 px-3">Candidate</th>
                        <th className="py-2.5 px-3">Requisition</th>
                        <th className="py-2.5 px-3">Match Score</th>
                        <th className="py-2.5 px-3">Stage</th>
                        <th className="py-2.5 px-3">Channel Contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {isCandidatesLoading ? (
                        <tr>
                          <td colSpan={6} className="p-6 text-center">
                            <div className="space-y-2">
                              {[1, 2, 3].map((i) => (
                                <Skeleton key={i} className="h-10 w-full rounded-lg" />
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : filteredCandidates.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-12 text-center text-muted-foreground">
                            No candidates found matching your filters.
                          </td>
                        </tr>
                      ) : (
                        filteredCandidates.map((cand) => {
                          const isSelected = selectedCandidateIds.includes(cand.id);
                          return (
                            <tr
                              key={cand.id}
                              onClick={() => handleToggleCandidate(cand.id)}
                              className={`group hover:bg-muted/40 transition-colors cursor-pointer ${
                                isSelected ? "bg-primary/[0.04]" : ""
                              }`}
                            >
                              <td className="py-2.5 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={() => handleToggleCandidate(cand.id)}
                                  className="rounded border-border h-3.5 w-3.5 text-primary cursor-pointer accent-primary"
                                />
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-2">
                                  <div className="w-7 h-7 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-[11px] shrink-0">
                                    {cand.name ? cand.name.charAt(0).toUpperCase() : "C"}
                                  </div>
                                  <div>
                                    <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                                      {cand.name}
                                    </p>
                                    <p className="text-[11px] text-muted-foreground">{cand.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <span className="font-medium text-foreground/80">
                                  {cand.opening_title || "General Application"}
                                </span>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
                                  <ScoreRing score={cand.score} size="sm" />
                                  <span className="font-medium text-[11px]">
                                    {cand.score !== null && cand.score !== undefined ? `${cand.score}%` : "Pending"}
                                  </span>
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <Badge variant="outline" className="capitalize text-[10px] bg-muted/40">
                                  {cand.stage}
                                </Badge>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5 text-muted-foreground text-[11px]">
                                  {cand.email ? (
                                    <span title={`Email: ${cand.email}`}>
                                      <Mail className="h-3.5 w-3.5 text-blue-500" />
                                    </span>
                                  ) : (
                                    <span className="text-[10px] text-muted-foreground/60">No email</span>
                                  )}
                                  {cand.phone && (
                                    <span title={`Phone: ${cand.phone}`}>
                                      <Phone className="h-3.5 w-3.5 text-muted-foreground/70" />
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Outreach Configuration Panel (Right) */}
            <div className="lg:col-span-4 space-y-4">
              <div className="rounded-2xl border border-border/70 dark:border-white/[0.08] bg-card p-4 space-y-4 shadow-xs">
                <div>
                  <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider">
                    Outreach Setup
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Configure your delivery channel & message template.
                  </p>
                </div>

                {/* Channel Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Delivery Channel</label>
                  <div className="p-3 rounded-xl border border-primary/40 bg-primary/[0.04] flex items-start gap-3">
                    <Mail className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                    <div>
                      <p className="font-semibold text-xs text-foreground">Email (Gmail Sync)</p>
                      <p className="text-[11px] text-muted-foreground">Dispatches candidate email via your connected Gmail account</p>
                    </div>
                  </div>
                </div>

                {/* Template Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Template Preset</label>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    className="w-full text-xs h-8 px-2.5 rounded-lg border border-border/80 bg-background font-medium focus:outline-none cursor-pointer"
                  >
                    {OUTREACH_TEMPLATES.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Language Choice */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">Language Style</label>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedLanguage === "english" ? "default" : "outline"}
                      onClick={() => setSelectedLanguage("english")}
                      className="h-7 text-xs font-medium"
                    >
                      English
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={selectedLanguage === "hinglish" ? "default" : "outline"}
                      onClick={() => setSelectedLanguage("hinglish")}
                      className="h-7 text-xs font-medium"
                    >
                      Hinglish
                    </Button>
                  </div>
                </div>

                {/* Custom Instructions */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-foreground">
                    Custom Recruiter Notes <span className="font-normal text-muted-foreground">(Optional)</span>
                  </label>
                  <Textarea
                    placeholder="e.g. Mention our hybrid work policy or highlight our Series B funding..."
                    value={customInstructions}
                    onChange={(e) => setCustomInstructions(e.target.value)}
                    className="text-xs min-h-[60px] bg-background/80 resize-none font-normal"
                  />
                </div>

                {/* Generate Drafts Action */}
                <Button
                  onClick={handleGenerateDrafts}
                  disabled={selectedCandidateIds.length === 0 || isBulkDrafting}
                  className="w-full h-9 text-xs font-semibold gap-1.5 shadow-xs"
                >
                  <Sparkles className={`h-3.5 w-3.5 ${isBulkDrafting ? "animate-spin" : ""}`} />
                  <span>
                    {isBulkDrafting
                      ? "Generating AI Drafts..."
                      : `Draft Outreach (${selectedCandidateIds.length} Selected)`}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: REVIEW DRAFTED MESSAGES & APPROVE ───────────────── */}
        {currentStep === 2 && (
          <div className="space-y-4">
            {/* Step 2 Toolbar & Bulk Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border border-border/70 dark:border-white/[0.08] bg-card">
              <div className="flex items-center gap-2">
                <span className="font-bold text-xs text-foreground uppercase tracking-wider">
                  Approval Queue
                </span>
                <span className="text-xs text-muted-foreground">
                  ({queueItems.length} draft{queueItems.length === 1 ? "" : "s"} awaiting review)
                </span>
              </div>

              {queueItems.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedQueueIds.length === queueItems.length) {
                        setSelectedQueueIds([]);
                      } else {
                        setSelectedQueueIds(queueItems.map((q) => q.message_id));
                      }
                    }}
                    className="h-8 text-xs font-medium"
                  >
                    {selectedQueueIds.length === queueItems.length ? "Deselect All" : "Select All Drafts"}
                  </Button>

                  <Button
                    size="sm"
                    disabled={selectedQueueIds.length === 0 || bulkApproveMutation.isPending}
                    onClick={() => bulkApproveMutation.mutate(selectedQueueIds)}
                    className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Approve & Send Selected ({selectedQueueIds.length})</span>
                  </Button>
                </div>
              )}
            </div>

            {/* Queue Items List */}
            {isQueueLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36 w-full rounded-2xl" />
                ))}
              </div>
            ) : queueItems.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card/40 space-y-3">
                <div className="h-12 w-12 rounded-2xl bg-muted/60 flex items-center justify-center text-muted-foreground mx-auto">
                  <CheckCheck className="h-6 w-6 text-emerald-500" />
                </div>
                <h3 className="font-bold text-sm text-foreground">All caught up! Zero drafts pending approval</h3>
                <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                  Go to Step 1 to select candidates and generate AI-tailored outreach messages.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setCurrentStep(1)}
                  className="text-xs font-semibold gap-1.5"
                >
                  <span>Pick Candidates in Step 1</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {queueItems.map((item) => {
                  const isEditing = Boolean(editingDrafts[item.message_id]);
                  const currentDraft = editingDrafts[item.message_id] || {
                    body: item.body,
                    subject: item.subject || "",
                  };
                  const isSelected = selectedQueueIds.includes(item.message_id);

                  return (
                    <div
                      key={item.message_id}
                      className={`rounded-2xl border bg-card p-4 shadow-xs transition-all space-y-3 ${
                        isSelected ? "border-primary ring-1.5 ring-primary/20" : "border-border/70 dark:border-white/[0.08]"
                      }`}
                    >
                      {/* Draft Card Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-border/60">
                        <div className="flex items-center gap-2.5">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {
                              setSelectedQueueIds((prev) =>
                                prev.includes(item.message_id)
                                  ? prev.filter((id) => id !== item.message_id)
                                  : [...prev, item.message_id]
                              );
                            }}
                            className="rounded border-border h-4 w-4 text-primary cursor-pointer accent-primary"
                          />
                          <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                            {item.candidate_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-xs text-foreground">{item.candidate_name}</span>
                              <Badge variant="outline" className="text-[10px] capitalize bg-muted/40">
                                {item.candidate_stage}
                              </Badge>
                            </div>
                            <span className="text-[11px] text-muted-foreground">{item.candidate_email}</span>
                          </div>
                        </div>

                        {/* Channel Badge & Timestamp */}
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[10px] uppercase font-mono gap-1">
                            <Mail className="h-2.5 w-2.5 text-blue-500" />
                            <span>Email</span>
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {formatRelativeTime(item.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Draft Content & Editable Preview */}
                      <div className="space-y-2">
                        {item.channel === "email" && (
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase shrink-0">
                              Subject:
                            </span>
                            {isEditing ? (
                              <Input
                                value={currentDraft.subject}
                                onChange={(e) =>
                                  setEditingDrafts((prev) => ({
                                    ...prev,
                                    [item.message_id]: {
                                      ...currentDraft,
                                      subject: e.target.value,
                                    },
                                  }))
                                }
                                className="h-7 text-xs bg-background/90 font-medium"
                              />
                            ) : (
                              <span className="text-xs font-semibold text-foreground">
                                {item.subject || "Interview Invitation"}
                              </span>
                            )}
                          </div>
                        )}

                        {isEditing ? (
                          <Textarea
                            value={currentDraft.body}
                            onChange={(e) =>
                              setEditingDrafts((prev) => ({
                                ...prev,
                                [item.message_id]: {
                                  ...currentDraft,
                                  body: e.target.value,
                                },
                              }))
                            }
                            className="min-h-[120px] text-xs leading-relaxed bg-background/90 font-normal resize-none"
                          />
                        ) : (
                          <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-xs text-foreground/90 whitespace-pre-wrap leading-relaxed select-text font-normal">
                            {item.body}
                          </div>
                        )}

                        {/* Scheduling URL Pill */}
                        {item.scheduling_url && (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
                            <Calendar className="h-3 w-3 text-primary shrink-0" />
                            <span className="font-medium text-foreground/80">Embedded Scheduling Link:</span>
                            <a
                              href={item.scheduling_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline truncate max-w-sm"
                            >
                              {item.scheduling_url}
                            </a>
                          </div>
                        )}
                      </div>

                      {/* Action Buttons: Approve, Edit, Skip */}
                      <div className="pt-2 border-t border-border/60 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                onClick={() =>
                                  updateDraftMutation.mutate({
                                    messageId: item.message_id,
                                    data: currentDraft,
                                  })
                                }
                                disabled={updateDraftMutation.isPending}
                                className="h-7 px-3 text-xs font-semibold gap-1"
                              >
                                <Check className="h-3 w-3" />
                                <span>Save Changes</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => {
                                  setEditingDrafts((prev) => {
                                    const next = { ...prev };
                                    delete next[item.message_id];
                                    return next;
                                  });
                                }}
                                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                              >
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                setEditingDrafts((prev) => ({
                                  ...prev,
                                  [item.message_id]: {
                                    body: item.body,
                                    subject: item.subject || "",
                                  },
                                }))
                              }
                              className="h-7 px-2.5 text-xs font-medium gap-1"
                            >
                              <Edit3 className="h-3 w-3 text-muted-foreground" />
                              <span>Edit Draft</span>
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => skipMutation.mutate(item.message_id)}
                            disabled={skipMutation.isPending}
                            className="h-7 px-2.5 text-xs text-muted-foreground hover:text-rose-600 font-medium gap-1"
                            title="Skip this draft without sending"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Skip</span>
                          </Button>
                        </div>

                        <Button
                          size="sm"
                          disabled={approveMutation.isPending}
                          onClick={() => approveMutation.mutate(item.message_id)}
                          className="h-7 px-3.5 text-xs font-semibold gap-1.5 shadow-xs"
                        >
                          <Send className="h-3 w-3" />
                          <span>Approve & Send</span>
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── STEP 3: RESULTS TABLE (SENT, FAILED, REPLIED) ──────────── */}
        {currentStep === 3 && (
          <div className="space-y-4">
            {/* Quick Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              <div className="p-3.5 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
                <span className="text-xs text-muted-foreground font-medium">Sent Successfully</span>
                <p className="text-2xl font-bold tracking-tight text-emerald-500 mt-0.5">{resultsStats.sent}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
                <span className="text-xs text-muted-foreground font-medium">Delivery Failures</span>
                <p className="text-2xl font-bold tracking-tight text-rose-500 mt-0.5">{resultsStats.failed}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
                <span className="text-xs text-muted-foreground font-medium">Candidate Replies</span>
                <p className="text-2xl font-bold tracking-tight text-blue-500 mt-0.5">{resultsStats.replied}</p>
              </div>
              <div className="p-3.5 rounded-xl bg-card border border-border/70 dark:border-white/[0.08] shadow-xs">
                <span className="text-xs text-muted-foreground font-medium">Total Logged</span>
                <p className="text-2xl font-bold tracking-tight text-foreground mt-0.5">{resultsStats.total}</p>
              </div>
            </div>

            {/* Results Data Table */}
            <div className="rounded-2xl border border-border/70 dark:border-white/[0.08] bg-card overflow-hidden">
              <div className="p-3.5 border-b border-border/60 flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">
                    Transmission & Lifecycle Results
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Real-time delivery status, error logs, and candidate replies.
                  </p>
                </div>

                <Link href="/inbox">
                  <Button variant="outline" size="sm" className="h-7 text-xs font-medium gap-1">
                    <Mail className="h-3 w-3 text-muted-foreground" />
                    <span>Open Recruiting Inbox</span>
                  </Button>
                </Link>
              </div>

              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider sticky top-0 z-10 backdrop-blur-sm">
                    <tr>
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3">Channel</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Message Details / Reason</th>
                      <th className="py-2.5 px-3">Sent At</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {isAuditLoading ? (
                      <tr>
                        <td colSpan={6} className="p-6 text-center">
                          <Skeleton className="h-8 w-full" />
                        </td>
                      </tr>
                    ) : auditLogs.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 text-center text-muted-foreground">
                          No outreach actions logged yet. Approve drafts in Step 2 to dispatch messages.
                        </td>
                      </tr>
                    ) : (
                      auditLogs.map((log) => {
                        const isFailed = log.action === "outreach_failed" || Boolean(log.failure_reason);
                        const isSent = log.action === "outreach_sent";
                        const isReplied =
                          log.action === "candidate_replied" || log.action === "candidate_reply_received";

                        return (
                          <tr key={log.id} className="hover:bg-muted/40 transition-colors">
                            <td className="py-2.5 px-3 font-semibold text-foreground">
                              <div>
                                <p>{log.candidate_name || "Candidate"}</p>
                                <p className="text-[11px] text-muted-foreground font-normal">
                                  {log.opening_title || "General Application"}
                                </p>
                              </div>
                            </td>
                            <td className="py-2.5 px-3">
                              <Badge variant="outline" className="text-[10px] uppercase font-mono">
                                Email
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3">
                              {isSent ? (
                                <Badge variant="secondary" className="text-[10px] bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-semibold gap-1">
                                  <Check className="h-2.5 w-2.5" />
                                  <span>Sent</span>
                                </Badge>
                              ) : isFailed ? (
                                <Badge variant="secondary" className="text-[10px] bg-rose-500/10 text-rose-600 border border-rose-500/20 font-semibold gap-1">
                                  <AlertCircle className="h-2.5 w-2.5" />
                                  <span>Failed</span>
                                </Badge>
                              ) : isReplied ? (
                                <Badge variant="secondary" className="text-[10px] bg-blue-500/10 text-blue-600 border border-blue-500/20 font-semibold gap-1">
                                  <CornerDownLeft className="h-2.5 w-2.5" />
                                  <span>Replied</span>
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {log.action.replace(/_/g, " ")}
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 max-w-[280px]">
                              {isFailed && log.failure_reason ? (
                                <span className="text-rose-600 dark:text-rose-400 font-medium text-[11px] truncate block" title={log.failure_reason}>
                                  {log.failure_reason}
                                </span>
                              ) : (
                                <span className="text-muted-foreground text-[11px] truncate block" title={log.details || ""}>
                                  {log.details || "Outreach message logged."}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-muted-foreground whitespace-nowrap text-[11px]">
                              {formatDateTime(log.created_at)}
                            </td>
                            <td className="py-2.5 px-3 text-right whitespace-nowrap">
                              {isFailed && log.retryable && log.message_id ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  disabled={retryMutation.isPending}
                                  onClick={() => retryMutation.mutate(log.message_id!)}
                                  className="h-6 px-2 text-[10px] font-semibold gap-1 text-primary border-primary/30"
                                >
                                  <RotateCcw className="h-2.5 w-2.5" />
                                  <span>Retry</span>
                                </Button>
                              ) : isReplied && log.candidate_id ? (
                                <Link href={`/inbox?candidate_id=${log.candidate_id}`}>
                                  <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] font-semibold text-primary">
                                    <span>View Reply</span>
                                    <ChevronRight className="h-3 w-3 ml-0.5" />
                                  </Button>
                                </Link>
                              ) : (
                                <span className="text-[10px] text-muted-foreground/60">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── Short Empty State Explaining How to Start ───────────────── */}
        {candidatesList.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-8 text-center space-y-4">
            <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
              <Sparkles className="h-6 w-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h3 className="font-bold text-sm text-foreground">Start your candidate outreach in 3 steps</h3>
              <p className="text-xs text-muted-foreground leading-relaxed">
                1) Select candidates from your pipeline. 2) Review AI-tailored personalized email drafts. 3) Approve and dispatch from your connected Gmail.
              </p>
            </div>
            <Link href="/pipeline">
              <Button size="sm" className="h-8 px-4 text-xs font-semibold gap-1.5 shadow-xs">
                <span>Add Candidates to Pipeline First</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
