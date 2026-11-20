"use client";

import React, { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  X,
  FileCheck,
  Send,
  Sparkles,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import {
  schedulingApi,
  InterviewRead,
  InterviewResultResponse,
} from "@/lib/api";

interface InterviewResultModalProps {
  interview: InterviewRead | null;
  isOpen: boolean;
  onClose: () => void;
  onOpenOfferReview?: (candidateId: string) => void;
}

export function InterviewResultModal({
  interview,
  isOpen,
  onClose,
  onOpenOfferReview,
}: InterviewResultModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedResult, setSelectedResult] = useState<"passed" | "failed" | "no_show">("passed");
  const [feedback, setFeedback] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Set default initial result when modal opens
  React.useEffect(() => {
    if (interview?.result_status) {
      if (interview.result_status === "failed") setSelectedResult("failed");
      else if (interview.result_status === "no_show") setSelectedResult("no_show");
      else setSelectedResult("passed");
      setFeedback(interview.feedback || "");
    } else {
      setSelectedResult("passed");
      setFeedback("");
    }
    setErrorMsg(null);
  }, [interview, isOpen]);

  const mutation = useMutation({
    mutationFn: () => {
      if (!interview) throw new Error("No interview selected.");
      return schedulingApi.recordResult(interview.id, {
        result: selectedResult,
        feedback: feedback.trim() || undefined,
      });
    },
    onSuccess: (data: InterviewResultResponse) => {
      queryClient.invalidateQueries({ queryKey: ["interviewsList"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", data.candidate_id] });

      toast({
        title: `Interview Recorded: ${data.result_status.toUpperCase()}`,
        description: data.next_action,
      });

      onClose();

      // If offer draft is ready, prompt HR to review
      if (data.offer_draft_ready && onOpenOfferReview) {
        onOpenOfferReview(data.candidate_id);
      }
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.detail || err?.message || "Failed to record interview result."
      );
    },
  });

  if (!isOpen || !interview) return null;

  const round = (interview.round_type || "initial").toLowerCase();
  const roundDisplay =
    round === "behavioral"
      ? "Behavioral Round"
      : round === "final"
      ? "Final Round"
      : "Initial Screening";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-2xl w-full max-w-lg shadow-card overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-border/70 flex items-center justify-between bg-muted/20">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-foreground">Record Interview Result</span>
              <Badge variant="outline" className="text-[10.5px] capitalize font-medium">
                {roundDisplay}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Set the candidate evaluation to trigger the next lifecycle step.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1 hover:bg-muted transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Candidate Card Summary */}
          <div className="p-3 rounded-xl bg-muted/40 border border-border/70 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center text-xs shrink-0">
                {interview.candidate_name ? interview.candidate_name.charAt(0).toUpperCase() : "C"}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-foreground truncate">{interview.candidate_name}</p>
                <p className="text-[11px] text-muted-foreground truncate">{interview.opening_title}</p>
              </div>
            </div>
            <div className="text-right shrink-0 text-[11px] text-muted-foreground font-mono">
              {new Date(interview.start_time).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>

          {/* Outcome Choice Radio Tiles */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-foreground">Evaluation Outcome</label>
            <div className="grid grid-cols-3 gap-2.5">
              {/* Passed */}
              <button
                type="button"
                onClick={() => setSelectedResult("passed")}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                  selectedResult === "passed"
                    ? "bg-emerald-500/10 border-emerald-500 text-emerald-600 dark:text-emerald-400 ring-1 ring-emerald-500/30"
                    : "border-border/70 hover:border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  {selectedResult === "passed" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">Passed</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Advance candidate
                  </div>
                </div>
              </button>

              {/* Failed */}
              <button
                type="button"
                onClick={() => setSelectedResult("failed")}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                  selectedResult === "failed"
                    ? "bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400 ring-1 ring-rose-500/30"
                    : "border-border/70 hover:border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <XCircle className="w-4 h-4 text-rose-500" />
                  {selectedResult === "failed" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">Failed</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Send rejection
                  </div>
                </div>
              </button>

              {/* No-show */}
              <button
                type="button"
                onClick={() => setSelectedResult("no_show")}
                className={`p-3 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                  selectedResult === "no_show"
                    ? "bg-amber-500/10 border-amber-500 text-amber-600 dark:text-amber-400 ring-1 ring-amber-500/30"
                    : "border-border/70 hover:border-border hover:bg-muted/30 text-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Clock className="w-4 h-4 text-amber-500" />
                  {selectedResult === "no_show" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                  )}
                </div>
                <div>
                  <div className="text-xs font-bold text-foreground">No-show</div>
                  <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">
                    Can reschedule
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Outcome Consequence Banner */}
          <div className="p-3 rounded-xl text-xs border leading-relaxed">
            {selectedResult === "passed" && round === "initial" && (
              <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20 p-2.5 rounded-lg flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                <div>
                  <span className="font-semibold">Next Action: </span>
                  Automatically generates a <strong>45-minute Behavioral Interview</strong> link and sends the <em>Initial Passed</em> invitation email.
                </div>
              </div>
            )}

            {selectedResult === "passed" && round === "behavioral" && (
              <div className="text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20 p-2.5 rounded-lg flex items-start gap-2">
                <Sparkles className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                <div>
                  <span className="font-semibold">Next Action: </span>
                  Automatically generates a <strong>60-minute Final Interview</strong> link and sends the <em>Behavioral Passed</em> invitation email.
                </div>
              </div>
            )}

            {selectedResult === "passed" && round === "final" && (
              <div className="text-primary bg-primary/10 border-primary/20 p-2.5 rounded-lg flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0 text-primary mt-0.5" />
                <div>
                  <span className="font-semibold">Strict Security Gate: </span>
                  Final Passed creates an <strong>Offer Letter draft</strong> and moves the candidate to the Offer stage. <u>The Offer Letter is NEVER sent automatically</u> and always requires your explicit approval.
                </div>
              </div>
            )}

            {selectedResult === "failed" && (
              <div className="text-rose-700 dark:text-rose-300 bg-rose-500/10 border-rose-500/20 p-2.5 rounded-lg flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                <div>
                  <span className="font-semibold">Next Action: </span>
                  Dispatches a warm, polite <em>Rejection</em> email to the candidate and moves stage to <strong>Rejected</strong>.
                </div>
              </div>
            )}

            {selectedResult === "no_show" && (
              <div className="text-amber-700 dark:text-amber-300 bg-amber-500/10 border-amber-500/20 p-2.5 rounded-lg flex items-start gap-2">
                <Clock className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
                <div>
                  <span className="font-semibold">Candidate Status: </span>
                  Marks this interview session as No-show. Candidate is not rejected, allowing you to send a follow-up or reschedule if needed.
                </div>
              </div>
            )}
          </div>

          {/* Feedback Textarea */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-foreground">
              Interviewer Notes / Feedback <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              placeholder="e.g. Strong system design knowledge, clear communication. Ready for next round."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={3}
              className="text-xs resize-none"
            />
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-muted/20 border-t border-border/70 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>

          <Button
            size="sm"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className={
              selectedResult === "passed"
                ? "bg-emerald-600 hover:bg-emerald-500 text-white"
                : selectedResult === "failed"
                ? "bg-rose-600 hover:bg-rose-500 text-white"
                : "bg-amber-600 hover:bg-amber-500 text-white"
            }
          >
            {mutation.isPending ? (
              "Recording..."
            ) : (
              <>
                <span>Confirm {selectedResult === "passed" ? "Passed" : selectedResult === "failed" ? "Failed" : "No-show"}</span>
                <ArrowRight className="w-3.5 h-3.5 ml-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
