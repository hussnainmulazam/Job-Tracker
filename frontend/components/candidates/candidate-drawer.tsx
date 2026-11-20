"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Mail,
  Briefcase,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Sparkles,
  MessageSquare,
  Star,
  Copy,
  Check,
  Loader2,
  ChevronRight,
  ExternalLink,
  ShieldAlert,
  Phone,
  MapPin,
  Globe,
  Github,
  Linkedin,
  Database,
  Link as LinkIcon,
  SearchCheck,
  Calendar as CalendarIcon,
  History,
  Trash2,
  RefreshCw,
  Bot,
  ArrowRight,
  ShieldCheck,
  MailCheck,
  Send,
  Award,
  Clock,
  AlertCircle,
} from "lucide-react";
import { ScheduleInviteModal } from "@/components/scheduling/schedule-invite-modal";
import { SendEmailDialog } from "@/components/candidates/send-email-dialog";
import { ContactCandidateDialog } from "@/components/candidates/contact-candidate-dialog";
import {
  Candidate,
  CandidateStage,
  candidatesApi,
  scorecardsApi,
  Scorecard,
  pipelineAgentApi,
  PipelineAgentLog,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScoreRing } from "@/components/ui/score-ring";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

interface CandidateDrawerProps {
  candidate: Candidate | null;
  open: boolean;
  onClose: () => void;
  onCandidateUpdated?: (updated: Candidate) => void;
}

const STAGE_CONFIG: Record<CandidateStage, { label: string; color: string }> = {
  applied: { label: "Applied", color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20" },
  screening: { label: "Screening", color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20" },
  shortlisted: { label: "Shortlisted", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  contacted: { label: "Contacted", color: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20" },
  scheduled: { label: "Scheduled", color: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20" },
  interview: { label: "Interview", color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20" },
  interviewed: { label: "Interviewed", color: "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20" },
  offer: { label: "Offer", color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" },
  rejected: { label: "Rejected", color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20" },
};

export function CandidateDrawer({
  candidate,
  open,
  onClose,
  onCandidateUpdated,
}: CandidateDrawerProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<string>("evaluation");
  const [copiedCv, setCopiedCv] = useState(false);
  const [newRating, setNewRating] = useState<number>(5);
  const [newNotes, setNewNotes] = useState<string>("");
  const [generatedQuestions, setGeneratedQuestions] = useState<string[]>([]);
  const [copiedQuestionIdx, setCopiedQuestionIdx] = useState<number | null>(null);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [isContactModalOpen, setIsContactModalOpen] = useState(false);

  // Fetch candidate's scorecards
  const { data: scorecardsData, refetch: refetchScorecards } = useQuery({
    queryKey: ["scorecards", candidate?.id],
    queryFn: () => (candidate?.id ? scorecardsApi.list(candidate.id) : null),
    enabled: !!candidate?.id && open,
  });

  // Fetch candidate's audit log history
  const { data: auditLogs = [], isLoading: isLoadingAuditLogs } = useQuery({
    queryKey: ["candidate-audit-logs", candidate?.id],
    queryFn: () => (candidate?.id ? candidatesApi.getAuditLogs(candidate.id) : Promise.resolve([])),
    enabled: !!candidate?.id && open,
  });

  // Pipeline Agent State & Query
  const [rejectFeedback, setRejectFeedback] = useState("");
  const [feedbackPromptOpen, setFeedbackPromptOpen] = useState(false);
  const [pendingAgentAction, setPendingAgentAction] = useState<"hr_review_reject" | "interview_reject" | null>(null);

  const { data: pipelineHistoryData, refetch: refetchPipelineHistory } = useQuery({
    queryKey: ["pipeline-agent-history", candidate?.id],
    queryFn: () => (candidate?.id ? pipelineAgentApi.getCandidateHistory(candidate.id) : null),
    enabled: !!candidate?.id && open,
    refetchInterval: 8000,
  });

  const hrReviewMutation = useMutation({
    mutationFn: ({ decision, feedback }: { decision: "approve" | "reject" | "on_hold"; feedback?: string }) =>
      pipelineAgentApi.hrReview({
        candidate_id: candidate!.id,
        decision,
        feedback,
      }),
    onSuccess: (data: any) => {
      toast({
        title: "HR Review Decision Logged",
        description: data?.action_taken || "Candidate pipeline status updated.",
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-agent-history", candidate?.id] });
      setFeedbackPromptOpen(false);
      setRejectFeedback("");
    },
    onError: (err: any) => {
      toast({
        title: "Agent Review Action Failed",
        description: err.message || "Could not process review decision.",
        variant: "destructive",
      });
    },
  });

  const interviewDecisionMutation = useMutation({
    mutationFn: ({ decision, feedback }: { decision: "pass" | "reject"; feedback?: string }) =>
      pipelineAgentApi.interviewDecision({
        candidate_id: candidate!.id,
        decision,
        feedback,
      }),
    onSuccess: (data: any) => {
      toast({
        title: "Interview Decision Logged",
        description: data?.action_taken || "Candidate advanced in pipeline.",
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-agent-history", candidate?.id] });
      setFeedbackPromptOpen(false);
      setRejectFeedback("");
    },
    onError: (err: any) => {
      toast({
        title: "Interview Decision Failed",
        description: err.message || "Could not process interview decision.",
        variant: "destructive",
      });
    },
  });

  const offerActionMutation = useMutation({
    mutationFn: (action_type: string) =>
      pipelineAgentApi.offerAction({
        candidate_id: candidate!.id,
        action_type,
      }),
    onSuccess: (data: any) => {
      toast({
        title: "Offer Stage Action Dispatched",
        description: data?.action_taken || "Offer template sent successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["pipeline-agent-history", candidate?.id] });
    },
    onError: (err: any) => {
      toast({
        title: "Offer Action Failed",
        description: err.message || "Could not dispatch template.",
        variant: "destructive",
      });
    },
  });

  // AI Scoring Mutation
  const scoreMutation = useMutation({
    mutationFn: ({ id, rerun }: { id: string; rerun?: boolean }) =>
      candidatesApi.score(id, rerun),
    onSuccess: (result) => {
      toast({
        title: "Candidate Screened",
        description: `Fit score calculated: ${Math.round(result.score)}%`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (candidate) {
        const updated: Candidate = {
          ...candidate,
          score: result.score,
          matched_skills: result.matched_skills,
          missing_skills: result.missing_skills,
          red_flags: result.red_flags,
          summary: result.summary,
        };
        onCandidateUpdated?.(updated);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Scoring Failed",
        description: err.message || "Failed to score candidate with AI.",
        variant: "destructive",
      });
    },
  });

  // Screening Questions Mutation
  const questionsMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.generateQuestions(id, 5),
    onSuccess: (res) => {
      setGeneratedQuestions(res.questions);
      setActiveTab("questions");
      toast({
        title: "Questions Generated",
        description: `Created 5 targeted interview questions for ${candidate?.name}.`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Generation Failed",
        description: err.message || "Could not generate interview questions.",
        variant: "destructive",
      });
    },
  });

  // Extract Details Mutation
  const extractMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.extractDetails(id, true),
    onSuccess: (extracted) => {
      toast({
        title: "Details Extracted",
        description: "Extracted contact details and verified candidate links.",
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      if (candidate) {
        const updated: Candidate = {
          ...candidate,
          name: extracted.name || candidate.name,
          email: extracted.email || candidate.email,
          phone: extracted.phone ?? candidate.phone,
          address: extracted.address ?? candidate.address,
          github_url: extracted.github_url ?? candidate.github_url,
          linkedin_url: extracted.linkedin_url ?? candidate.linkedin_url,
          portfolio_url: extracted.portfolio_url ?? candidate.portfolio_url,
          kaggle_url: extracted.kaggle_url ?? candidate.kaggle_url,
          extracted_data: extracted.field_metadata as any,
        };
        onCandidateUpdated?.(updated);
      }
    },
    onError: (err: any) => {
      toast({
        title: "Extraction Failed",
        description: err.message || "Failed to extract candidate details.",
        variant: "destructive",
      });
    },
  });

  // Stage change mutation
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) =>
      candidatesApi.updateStage(id, stage),
    onSuccess: (updated) => {
      toast({
        title: "Stage Updated",
        description: `Moved ${updated.name} to ${STAGE_CONFIG[updated.stage].label}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onCandidateUpdated?.(updated);
    },
  });

  // Create Scorecard Mutation
  const scorecardMutation = useMutation({
    mutationFn: () =>
      scorecardsApi.create({
        candidate_id: candidate!.id,
        rating: newRating,
        notes: newNotes.trim() || undefined,
      }),
    onSuccess: () => {
      toast({
        title: "Scorecard Added",
        description: `Logged rating of ${newRating}/5 stars.`,
      });
      setNewNotes("");
      refetchScorecards();
      queryClient.invalidateQueries({ queryKey: ["scorecards"] });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to add scorecard",
        description: err.message || "Could not save rating.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.delete(id),
    onSuccess: () => {
      toast({
        title: "Candidate Deleted",
        description: `${candidate?.name || "Candidate"} has been removed.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
    },
    onError: (err: any) => {
      toast({
        title: "Delete Failed",
        description: err.message || "Failed to delete candidate.",
        variant: "destructive",
      });
    },
  });

  // Resend 'CV Received' Confirmation Auto-Reply
  const resendAutoReplyMutation = useMutation({
    mutationFn: (id: string) => candidatesApi.resendAutoReply(id),
    onSuccess: (updated) => {
      toast({
        title: "CV Confirmation Dispatched",
        description: `Confirmation email was sent to ${updated.email}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-audit-logs", candidate?.id] });
      onCandidateUpdated?.(updated);
    },
    onError: (err: any) => {
      toast({
        title: "Auto-Reply Dispatch Failed",
        description: err.message || "Could not send CV received confirmation email.",
        variant: "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["candidate-audit-logs", candidate?.id] });
    },
  });

  const handleDeleteCandidate = () => {
    if (!candidate) return;
    if (confirm(`Are you sure you want to delete candidate "${candidate.name}"?`)) {
      deleteMutation.mutate(candidate.id);
    }
  };

  const handleCopyCv = () => {
    if (candidate?.cv_text) {
      navigator.clipboard.writeText(candidate.cv_text);
      setCopiedCv(true);
      setTimeout(() => setCopiedCv(false), 2000);
      toast({ title: "Copied", description: "CV text copied to clipboard." });
    }
  };

  const handleCopyQuestion = (q: string, idx: number) => {
    navigator.clipboard.writeText(q);
    setCopiedQuestionIdx(idx);
    setTimeout(() => setCopiedQuestionIdx(null), 2000);
    toast({ title: "Copied question", description: "Question ready to paste into interview notes." });
  };

  if (!candidate) return null;

  return (
    <Sheet open={open} onOpenChange={(val) => !val && onClose()}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl p-0 flex flex-col h-full bg-background border-l border-border shadow-2xl overflow-hidden"
      >
        {/* ── Top Header ────────────────────────────────────────────── */}
        <div className="p-6 border-b border-border bg-card/50 backdrop-blur-md">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-4">
              <ScoreRing score={candidate.score} size="lg" />
              <div>
                <h2 className="text-xl font-bold text-foreground leading-tight">
                  {candidate.name}
                </h2>
                <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Mail className="h-3.5 w-3.5 text-primary/70" />
                    {candidate.email}
                  </span>
                  {candidate.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5 text-primary/70" />
                      {candidate.phone}
                    </span>
                  )}
                  {candidate.address && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-primary/70" />
                      {candidate.address}
                    </span>
                  )}
                  {candidate.opening_title && (
                    <span className="flex items-center gap-1 font-medium text-foreground/80">
                      <Briefcase className="h-3.5 w-3.5 text-primary" />
                      {candidate.opening_title}
                    </span>
                  )}
                </div>

                {/* Extracted Profiles & Portfolios */}
                {(candidate.linkedin_url || candidate.github_url || candidate.kaggle_url || candidate.portfolio_url) && (
                  <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-border/40">
                    {candidate.linkedin_url && (
                      <a
                        href={candidate.linkedin_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                      >
                        <Linkedin className="h-3 w-3" />
                        <span>LinkedIn</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                      </a>
                    )}
                    {candidate.github_url && (
                      <a
                        href={candidate.github_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-neutral-500/10 text-neutral-800 dark:text-neutral-200 border border-neutral-500/20 hover:bg-neutral-500/20 transition-colors"
                      >
                        <Github className="h-3 w-3" />
                        <span>GitHub</span>
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                        <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                      </a>
                    )}
                    {candidate.kaggle_url && (
                      <a
                        href={candidate.kaggle_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20 hover:bg-cyan-500/20 transition-colors"
                      >
                        <Database className="h-3 w-3" />
                        <span>Kaggle</span>
                        <CheckCircle2 className="h-2.5 w-2.5 text-emerald-500" />
                        <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                      </a>
                    )}
                    {candidate.portfolio_url && (
                      <a
                        href={candidate.portfolio_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors"
                      >
                        <Globe className="h-3 w-3" />
                        <span>Portfolio</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-70" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Stage Selector & Actions */}
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Current Stage
                </span>
                <select
                  id="candidate-stage-select"
                  value={candidate.stage}
                  onChange={(e) =>
                    stageMutation.mutate({
                      id: candidate.id,
                      stage: e.target.value as CandidateStage,
                    })
                  }
                  className="text-xs font-semibold px-2.5 py-1 rounded-md border border-border bg-background hover:bg-accent/40 focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer transition-colors"
                >
                  {(Object.keys(STAGE_CONFIG) as CandidateStage[]).map((stage) => (
                    <option key={stage} value={stage}>
                      {STAGE_CONFIG[stage].label}
                    </option>
                  ))}
                </select>
              </div>

              <Button
                size="sm"
                variant="ghost"
                onClick={handleDeleteCandidate}
                disabled={deleteMutation.isPending}
                className="text-xs h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                title="Delete Candidate"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Quick AI Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t border-border/60">
            {candidate.score !== null && candidate.score !== undefined ? (
              <Button
                id="btn-rerun-ai-screening"
                size="sm"
                variant="default"
                onClick={() => scoreMutation.mutate({ id: candidate.id, rerun: true })}
                disabled={scoreMutation.isPending}
                className="gap-2 font-semibold shadow-xs"
              >
                {scoreMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                <span>Re-run</span>
              </Button>
            ) : (
              <Button
                id="btn-run-ai-screening"
                size="sm"
                variant="default"
                onClick={() => scoreMutation.mutate({ id: candidate.id, rerun: false })}
                disabled={scoreMutation.isPending}
                className="gap-2 font-semibold shadow-xs"
              >
                {scoreMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                <span>Run AI Screening</span>
              </Button>
            )}

            <Button
              size="sm"
              variant="outline"
              onClick={() => questionsMutation.mutate(candidate.id)}
              disabled={questionsMutation.isPending}
              className="gap-2 text-xs font-medium"
            >
              {questionsMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <MessageSquare className="h-3.5 w-3.5" />
              )}
              Interview Questions
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => extractMutation.mutate(candidate.id)}
              disabled={extractMutation.isPending}
              className="gap-2 text-xs font-medium"
            >
              {extractMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <SearchCheck className="h-3.5 w-3.5" />
              )}
              Extract Details
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setScheduleModalOpen(true)}
              className="gap-2 text-xs font-medium border-indigo-500/30 text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10"
            >
              <CalendarIcon className="h-3.5 w-3.5" />
              Invite to Schedule
            </Button>

            <Button
              id="btn-contact-candidate"
              size="sm"
              variant="outline"
              onClick={() => setIsContactModalOpen(true)}
              className="gap-2 text-xs font-semibold border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 shadow-2xs"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Contact Candidate</span>
            </Button>

            <Button
              size="sm"
              variant="outline"
              onClick={() => setIsEmailModalOpen(true)}
              className="gap-2 text-xs font-medium border-border hover:bg-accent/40"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Send Email</span>
            </Button>

            <Button
              size="sm"
              variant="ghost"
              onClick={handleCopyCv}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground ml-auto"
            >
              {copiedCv ? (
                <Check className="h-3.5 w-3.5 text-emerald-500" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy CV
            </Button>
          </div>

          {/* ── Auto-Reply "CV Received" Status Banner & Resend ───────── */}
          <div className="mt-3 pt-3 border-t border-border/40 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                CV Acknowledgement:
              </span>
              {candidate.auto_reply_sent ? (
                <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                  <span>
                    Sent {candidate.auto_reply_sent_at ? new Date(candidate.auto_reply_sent_at).toLocaleDateString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
                  </span>
                </div>
              ) : candidate.auto_reply_status === "failed" ? (
                <div className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400 font-medium bg-rose-500/10 px-2 py-0.5 rounded-md border border-rose-500/20">
                  <AlertTriangle className="h-3 w-3 text-rose-500" />
                  <span>Dispatch Failed</span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground italic">Not sent</span>
              )}
            </div>

            <Button
              size="sm"
              variant={candidate.auto_reply_status === "failed" ? "destructive" : "outline"}
              onClick={() => resendAutoReplyMutation.mutate(candidate.id)}
              disabled={resendAutoReplyMutation.isPending || !candidate.email || candidate.email.endsWith("@no-email.com")}
              className="h-7 text-xs gap-1.5 font-medium"
            >
              {resendAutoReplyMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
              <span>{candidate.auto_reply_sent ? "Resend CV Receipt Email" : "Send CV Receipt Email"}</span>
            </Button>
          </div>

          {candidate.auto_reply_status === "failed" && candidate.auto_reply_error && (
            <div className="mt-2 p-2.5 rounded-md bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
              <div className="space-y-0.5">
                <p className="font-semibold text-[11px] uppercase tracking-wider">Delivery Error Detail</p>
                <p className="font-mono text-[11px] break-all">{candidate.auto_reply_error}</p>
              </div>
            </div>
          )}

          {/* ── Hiring Pipeline Agent Active Status & Stage Quick Action ───────── */}
          {(() => {
            const rawStatus = (candidate.extracted_data as any)?.pipeline_status || pipelineHistoryData?.current_status;
            if (!rawStatus) return null;
            return (
              <div className="mt-3 p-3 rounded-xl bg-primary/[0.04] border border-primary/20 flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Bot className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-foreground">Pipeline Agent</span>
                      <Badge variant="outline" className="text-[10px] font-mono capitalize bg-background">
                        {String(rawStatus).replace(/_/g, " ")}
                      </Badge>
                    </div>
                    <p className="text-[10.5px] text-muted-foreground truncate">
                      Autonomous stage progression active • Background worker running
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setActiveTab("pipeline_agent")}
                    className="h-7 px-2.5 text-xs font-semibold text-primary gap-1"
                  >
                    <span>Agent Control & History</span>
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>

        {/* ── Tabs Navigation ───────────────────────────────────────── */}
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="flex-1 flex flex-col min-h-0"
        >
          <div className="px-6 border-b border-border bg-muted/20">
            <TabsList className="bg-transparent p-0 h-10 gap-4">
              <TabsTrigger
                value="evaluation"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-1 font-semibold text-xs h-10"
              >
                AI Fit & Skills
              </TabsTrigger>
              <TabsTrigger
                value="pipeline_agent"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-1 font-semibold text-xs h-10 gap-1.5"
              >
                <Bot className="h-3.5 w-3.5 text-primary" />
                <span>Pipeline Agent</span>
              </TabsTrigger>
              <TabsTrigger
                value="questions"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-1 font-semibold text-xs h-10"
              >
                Screening Questions {generatedQuestions.length > 0 && `(${generatedQuestions.length})`}
              </TabsTrigger>
              <TabsTrigger
                value="scorecards"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-1 font-semibold text-xs h-10"
              >
                Scorecards {scorecardsData?.total ? `(${scorecardsData.total})` : ""}
              </TabsTrigger>
              <TabsTrigger
                value="cv"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-1 font-semibold text-xs h-10"
              >
                Raw CV
              </TabsTrigger>
              <TabsTrigger
                id="tab-candidate-audit-trail"
                value="activity"
                className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none px-1 font-semibold text-xs h-10"
              >
                Audit Trail {auditLogs.length > 0 && `(${auditLogs.length})`}
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* ── 1. AI Fit & Skills Tab ──────────────────────────────── */}
            <TabsContent value="evaluation" className="mt-0 space-y-6">
              {candidate.summary ? (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                  <div className="flex items-center gap-2 mb-2 text-xs font-bold text-primary uppercase tracking-wider">
                    <Sparkles className="h-4 w-4" />
                    AI Executive Summary
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">
                    {candidate.summary}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border border-dashed border-border p-6 text-center">
                  <Sparkles className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium text-foreground">Candidate not yet screened</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
                    Click "Run AI Screening" to evaluate this CV against the opening's required skills.
                  </p>
                </div>
              )}

              {/* Matched Skills Chips */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  Matched Skills ({candidate.matched_skills.length})
                </h4>
                {candidate.matched_skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.matched_skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                      >
                        <Check className="h-3 w-3" />
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No matched skills identified yet.
                  </p>
                )}
              </div>

              {/* Missing Skills Chips */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                  Missing / Gap Skills ({candidate.missing_skills.length})
                </h4>
                {candidate.missing_skills.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5">
                    {candidate.missing_skills.map((skill) => (
                      <span
                        key={skill}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20"
                      >
                        <X className="h-3 w-3" />
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No skill gaps detected.
                  </p>
                )}
              </div>

              {/* Red Flags / Concerns */}
              {candidate.red_flags && candidate.red_flags.length > 0 && (
                <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400 mb-2 flex items-center gap-1.5">
                    <ShieldAlert className="h-4 w-4" />
                    Potential Red Flags ({candidate.red_flags.length})
                  </h4>
                  <ul className="space-y-1.5">
                    {candidate.red_flags.map((flag, idx) => (
                      <li key={idx} className="text-xs text-foreground flex items-start gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                        <span>{flag}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Extracted Contact & Online Profiles */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <SearchCheck className="h-4 w-4 text-primary" />
                    Candidate Profile & Contact Details
                  </h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => extractMutation.mutate(candidate.id)}
                    disabled={extractMutation.isPending}
                    className="text-[11px] h-6 px-2 text-primary"
                  >
                    {extractMutation.isPending ? "Extracting..." : "Re-Extract"}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Phone</span>
                    <span className="font-medium text-foreground">{candidate.phone || "Not provided"}</span>
                    {candidate.extracted_data?.phone && (
                      <span className="text-[9px] text-muted-foreground block font-mono">
                        Source: {candidate.extracted_data.phone.source} ({(candidate.extracted_data.phone.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Address / Location</span>
                    <span className="font-medium text-foreground">{candidate.address || "Not provided"}</span>
                    {candidate.extracted_data?.address && (
                      <span className="text-[9px] text-muted-foreground block font-mono">
                        Source: {candidate.extracted_data.address.source} ({(candidate.extracted_data.address.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">GitHub</span>
                    {candidate.github_url ? (
                      <a href={candidate.github_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.github_url}
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">LinkedIn</span>
                    {candidate.linkedin_url ? (
                      <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.linkedin_url}
                        <ExternalLink className="h-3 w-3 opacity-70 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Kaggle</span>
                    {candidate.kaggle_url ? (
                      <a href={candidate.kaggle_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.kaggle_url}
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Portfolio / Website</span>
                    {candidate.portfolio_url ? (
                      <a href={candidate.portfolio_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.portfolio_url}
                        <ExternalLink className="h-3 w-3 opacity-70 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── 2. Screening Questions Tab ─────────────────────────── */}
            <TabsContent value="questions" className="mt-0 space-y-4">
              {generatedQuestions.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Targeted Interview Questions
                    </h4>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => questionsMutation.mutate(candidate.id)}
                      disabled={questionsMutation.isPending}
                      className="text-xs h-7 text-primary"
                    >
                      Regenerate
                    </Button>
                  </div>
                  {generatedQuestions.map((q, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl border border-border bg-card/60 hover:bg-card transition-colors flex items-start justify-between gap-3 group"
                    >
                      <div className="flex items-start gap-2.5">
                        <span className="h-5 w-5 rounded-full bg-primary/10 text-primary text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                          {idx + 1}
                        </span>
                        <p className="text-xs text-foreground font-medium leading-relaxed">
                          {q}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleCopyQuestion(q, idx)}
                        className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                        title="Copy question"
                      >
                        {copiedQuestionIdx === idx ? (
                          <Check className="h-3.5 w-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center rounded-xl border border-dashed border-border">
                  <MessageSquare className="h-8 w-8 text-muted-foreground mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-semibold text-foreground">No Questions Generated</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto mb-4">
                    Use OpenRouter AI to formulate behavioral and technical questions probing this candidate's specific CV and missing skill gaps.
                  </p>
                  <Button
                    size="sm"
                    onClick={() => questionsMutation.mutate(candidate.id)}
                    disabled={questionsMutation.isPending}
                    className="gap-2"
                  >
                    {questionsMutation.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Generate 5 Questions
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* ── 3. Scorecards Tab ──────────────────────────────────── */}
            <TabsContent value="scorecards" className="mt-0 space-y-6">
              {/* Add New Scorecard */}
              <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Record Interview Evaluation
                </h4>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">Rating:</span>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setNewRating(star)}
                        className="p-1 hover:scale-110 transition-transform focus:outline-none"
                      >
                        <Star
                          className={`h-5 w-5 ${
                            star <= newRating
                              ? "fill-amber-400 text-amber-400"
                              : "text-muted-foreground/40"
                          }`}
                        />
                      </button>
                    ))}
                  </div>
                  <span className="text-xs font-bold text-amber-500 ml-1">
                    {newRating} / 5
                  </span>
                </div>

                <Textarea
                  placeholder="Notes from recruiter screen or technical interview..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={3}
                  className="text-xs resize-none"
                />

                <div className="flex justify-end">
                  <Button
                    size="sm"
                    onClick={() => scorecardMutation.mutate()}
                    disabled={scorecardMutation.isPending}
                    className="font-semibold text-xs"
                  >
                    {scorecardMutation.isPending ? "Saving..." : "Save Scorecard"}
                  </Button>
                </div>
              </div>

              {/* Past Scorecards List */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Logged Scorecards ({scorecardsData?.items?.length || 0})
                </h4>
                {scorecardsData?.items && scorecardsData.items.length > 0 ? (
                  <div className="space-y-2.5">
                    {scorecardsData.items.map((sc) => (
                      <div
                        key={sc.id}
                        className="p-3 rounded-lg border border-border bg-card/60 text-xs space-y-1.5"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1 text-amber-500 font-bold">
                            {[...Array(sc.rating)].map((_, i) => (
                              <Star key={i} className="h-3.5 w-3.5 fill-amber-400" />
                            ))}
                            <span className="ml-1 text-foreground">{sc.rating} / 5</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground">
                            {new Date(sc.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {sc.notes && (
                          <p className="text-muted-foreground leading-relaxed pl-0.5">
                            {sc.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    No scorecards recorded yet.
                  </p>
                )}
              </div>
              {/* Extracted Contact & Online Profiles */}
              <div className="rounded-xl border border-border bg-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                    <SearchCheck className="h-4 w-4 text-primary" />
                    Candidate Profile & Contact Details
                  </h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => extractMutation.mutate(candidate.id)}
                    disabled={extractMutation.isPending}
                    className="text-[11px] h-6 px-2 text-primary"
                  >
                    {extractMutation.isPending ? "Extracting..." : "Re-Extract"}
                  </Button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Phone</span>
                    <span className="font-medium text-foreground">{candidate.phone || "Not provided"}</span>
                    {candidate.extracted_data?.phone && (
                      <span className="text-[9px] text-muted-foreground block font-mono">
                        Source: {candidate.extracted_data.phone.source} ({(candidate.extracted_data.phone.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Address / Location</span>
                    <span className="font-medium text-foreground">{candidate.address || "Not provided"}</span>
                    {candidate.extracted_data?.address && (
                      <span className="text-[9px] text-muted-foreground block font-mono">
                        Source: {candidate.extracted_data.address.source} ({(candidate.extracted_data.address.confidence * 100).toFixed(0)}%)
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">GitHub</span>
                    {candidate.github_url ? (
                      <a href={candidate.github_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.github_url}
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">LinkedIn</span>
                    {candidate.linkedin_url ? (
                      <a href={candidate.linkedin_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.linkedin_url}
                        <ExternalLink className="h-3 w-3 opacity-70 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Kaggle</span>
                    {candidate.kaggle_url ? (
                      <a href={candidate.kaggle_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.kaggle_url}
                        <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg border border-border/60 bg-muted/20 space-y-1">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground block">Portfolio / Website</span>
                    {candidate.portfolio_url ? (
                      <a href={candidate.portfolio_url} target="_blank" rel="noreferrer" className="text-primary hover:underline flex items-center gap-1 font-mono text-[11px] truncate">
                        {candidate.portfolio_url}
                        <ExternalLink className="h-3 w-3 opacity-70 shrink-0" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground">Not found</span>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* ── 4. Raw CV Tab ───────────────────────────────────────── */}
            <TabsContent value="cv" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Extracted Resume Content
                </h4>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopyCv}
                  className="h-7 text-xs gap-1.5"
                >
                  {copiedCv ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  {copiedCv ? "Copied" : "Copy All"}
                </Button>
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4 max-h-[420px] overflow-y-auto">
                <pre className="text-xs text-foreground font-mono whitespace-pre-wrap leading-relaxed select-text">
                  {candidate.cv_text}
                </pre>
              </div>
            </TabsContent>

            {/* ── 5. Audit Trail Tab ─────────────────────────────────── */}
            <TabsContent value="activity" className="mt-0 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Candidate Activity & Stage Transitions
                </h4>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {auditLogs.length} event{auditLogs.length === 1 ? "" : "s"}
                </span>
              </div>

              {isLoadingAuditLogs ? (
                <div className="space-y-2.5">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-3 rounded-xl border border-border bg-card space-y-1.5">
                      <div className="h-3 w-32 bg-muted animate-pulse rounded" />
                      <div className="h-2.5 w-48 bg-muted animate-pulse rounded" />
                    </div>
                  ))}
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-10 text-center text-muted-foreground border border-dashed rounded-xl bg-muted/10">
                  <History className="h-6 w-6 mx-auto mb-1.5 opacity-40" />
                  <p className="text-xs font-semibold text-foreground">No events recorded yet</p>
                  <p className="text-[11px] mt-0.5">Moving candidate stages or scoring will appear here.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-3 rounded-xl border border-border/80 bg-card space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground capitalize">
                          {log.action.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {new Date(log.created_at).toLocaleString([], {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <p className="text-muted-foreground text-[11px] leading-relaxed">
                        {log.details || `Recruiter triggered ${log.action}.`}
                      </p>
                      {log.from_stage && log.to_stage && (
                        <div className="flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground pt-1">
                          <span className="capitalize">{log.from_stage}</span>
                          <span>→</span>
                          <span className="capitalize text-primary font-bold">{log.to_stage}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ── Hiring Pipeline Agent Tab ─────────────────────────── */}
            <TabsContent value="pipeline_agent" className="mt-0 space-y-5">
              {(() => {
                const rawStatus = (candidate.extracted_data as any)?.pipeline_status || pipelineHistoryData?.current_status || "CV_RECEIVED";
                const logs = pipelineHistoryData?.pipeline_logs || (candidate.extracted_data as any)?.pipeline_logs || [];

                const isReviewStage = rawStatus === "HR_REVIEW" || candidate.stage === "screening" || candidate.stage === "applied";
                const isDecisionStage = rawStatus === "INITIAL_DECISION" || rawStatus === "BEHAVIORAL_DECISION" || rawStatus === "TECHNICAL_DECISION";
                const isOfferStage = rawStatus === "OFFER_LETTER_SECTION" || candidate.stage === "offer";

                return (
                  <div className="space-y-5">
                    {/* Status Overview Card */}
                    <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Bot className="h-4 w-4 text-primary" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">Current Agent State</h4>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => refetchPipelineHistory()}
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                          title="Refresh history"
                        >
                          <RefreshCw className="h-3 w-3" />
                        </Button>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">Pipeline State:</span>
                        <Badge variant="outline" className="text-xs font-mono px-2 py-0.5 bg-primary/10 text-primary border-primary/25 font-bold">
                          {String(rawStatus).replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>

                    {/* HR Action Center: Review Stage */}
                    {isReviewStage && (
                      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-amber-700 dark:text-amber-300">
                            Stage 3: HR Review Decision Required
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          AI screening is complete. The agent waits for HR approval before dispatching official emails. Approving will automatically send the candidate an availability request with the full job description.
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={hrReviewMutation.isPending}
                            onClick={() => hrReviewMutation.mutate({ decision: "approve" })}
                            className="h-8 gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs"
                          >
                            {hrReviewMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span>Approve (Send Availability Request)</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={hrReviewMutation.isPending}
                            onClick={() => hrReviewMutation.mutate({ decision: "on_hold" })}
                            className="h-8 text-xs font-medium"
                          >
                            <span>Hold / Talent Pool</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={hrReviewMutation.isPending}
                            onClick={() => {
                              setPendingAgentAction("hr_review_reject");
                              setFeedbackPromptOpen(true);
                            }}
                            className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject with Feedback</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* HR Action Center: Interview Decision Stage */}
                    {isDecisionStage && (
                      <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                            Stage 6: Interview Round Decision Required
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          Review feedback from the interviewers. Passing advances the candidate to the next round (or Offer section if Technical round).
                        </p>

                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <Button
                            size="sm"
                            disabled={interviewDecisionMutation.isPending}
                            onClick={() => interviewDecisionMutation.mutate({ decision: "pass" })}
                            className="h-8 gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs"
                          >
                            {interviewDecisionMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                            <span>Pass Round (Advance Next)</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={interviewDecisionMutation.isPending}
                            onClick={() => {
                              setPendingAgentAction("interview_reject");
                              setFeedbackPromptOpen(true);
                            }}
                            className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
                          >
                            <X className="h-3.5 w-3.5" />
                            <span>Reject Round (with Feedback)</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* HR Action Center: Offer Stage Manual Actions */}
                    {isOfferStage && (
                      <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <Award className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                            Stage 7: Offer Letter Section (HR Manual Send)
                          </h4>
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          The autonomous agent halts here. Final offer decisions and letter dispatches are strictly manual by HR.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={offerActionMutation.isPending}
                            onClick={() => offerActionMutation.mutate("documents_request")}
                            className="h-8 text-xs font-medium justify-start gap-1.5"
                          >
                            <FileText className="h-3.5 w-3.5 text-primary" />
                            <span>1. Request Verification Docs</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={offerActionMutation.isPending}
                            onClick={() => offerActionMutation.mutate("offer_letter_cover")}
                            className="h-8 text-xs font-medium justify-start gap-1.5"
                          >
                            <MailCheck className="h-3.5 w-3.5 text-emerald-600" />
                            <span>2. Send Offer Cover Note</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={offerActionMutation.isPending}
                            onClick={() => offerActionMutation.mutate("offer_accepted")}
                            className="h-8 text-xs font-medium justify-start gap-1.5"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                            <span>3. Confirm Offer Accepted</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={offerActionMutation.isPending}
                            onClick={() => offerActionMutation.mutate("welcome_onboarding")}
                            className="h-8 text-xs font-medium justify-start gap-1.5"
                          >
                            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
                            <span>4. Send Welcome & Onboarding</span>
                          </Button>
                        </div>
                      </div>
                    )}

                    {/* Pipeline Execution Log Table */}
                    <div className="rounded-2xl border border-border/80 bg-card p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <History className="h-3.5 w-3.5 text-muted-foreground" />
                          <h4 className="font-bold text-xs uppercase tracking-wider text-foreground">
                            Agent Execution Log ({logs.length})
                          </h4>
                        </div>
                      </div>

                      {logs.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-3 text-center">
                          No pipeline agent actions logged yet for this candidate.
                        </p>
                      ) : (
                        <div className="divide-y divide-border/60">
                          {logs.map((log: any, idx: number) => (
                            <div key={idx} className="py-2.5 text-xs space-y-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-foreground text-[11px]">
                                  {log.action_taken || "Action Recorded"}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {log.timestamp ? new Date(log.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}
                                </span>
                              </div>

                              <div className="flex flex-wrap items-center gap-1.5 text-[10.5px]">
                                <span className="text-muted-foreground font-mono">{log.previous_status}</span>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-bold font-mono text-primary">{log.new_status}</span>
                                {log.template_sent && (
                                  <Badge variant="outline" className="text-[9.5px] px-1.5 py-0 bg-blue-500/10 text-blue-600 border-blue-500/20 font-mono">
                                    {log.template_sent}
                                  </Badge>
                                )}
                              </div>

                              {log.timer_set && (
                                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-2.5 w-2.5 text-primary" />
                                  <span>Timer: {log.timer_set}</span>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </TabsContent>
          </div>
        </Tabs>
      </SheetContent>
      {/* ── Rejection Feedback Dialog (Mandatory Constructive Feedback) ───────── */}
      {feedbackPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-xl space-y-3.5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-rose-500" />
                <span>Rejection Feedback (Mandatory)</span>
              </h3>
              <button
                onClick={() => {
                  setFeedbackPromptOpen(false);
                  setRejectFeedback("");
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Every rejection email must include constructive feedback. You can provide specific notes below, or leave it blank to let the agent auto-generate polite feedback from the AI evaluation score.
            </p>

            <Textarea
              placeholder="e.g. While your background in frontend engineering is commendable, we are prioritizing candidates with hands-on Kubernetes and distributed systems experience..."
              value={rejectFeedback}
              onChange={(e) => setRejectFeedback(e.target.value)}
              className="text-xs min-h-[90px]"
            />

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setFeedbackPromptOpen(false);
                  setRejectFeedback("");
                }}
                className="text-xs"
              >
                Cancel
              </Button>

              <Button
                size="sm"
                variant="destructive"
                disabled={hrReviewMutation.isPending || interviewDecisionMutation.isPending}
                onClick={() => {
                  if (pendingAgentAction === "hr_review_reject") {
                    hrReviewMutation.mutate({ decision: "reject", feedback: rejectFeedback });
                  } else {
                    interviewDecisionMutation.mutate({ decision: "reject", feedback: rejectFeedback });
                  }
                }}
                className="text-xs font-semibold"
              >
                Confirm Rejection & Send Email
              </Button>
            </div>
          </div>
        </div>
      )}
      {candidate && (
        <>
          <ScheduleInviteModal
            isOpen={scheduleModalOpen}
            onClose={() => setScheduleModalOpen(false)}
            candidate={candidate}
          />
          <SendEmailDialog
            open={isEmailModalOpen}
            onOpenChange={setIsEmailModalOpen}
            candidate={candidate as any}
          />
          <ContactCandidateDialog
            open={isContactModalOpen}
            onOpenChange={setIsContactModalOpen}
            candidate={candidate as any}
          />
        </>
      )}
    </Sheet>
  );
}
