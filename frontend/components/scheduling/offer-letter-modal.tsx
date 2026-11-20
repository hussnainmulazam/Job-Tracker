"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Send,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  X,
  Mail,
  User,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { schedulingApi, OfferDraftResponse } from "@/lib/api";

interface OfferLetterModalProps {
  candidateId: string | null;
  candidateName?: string;
  roleTitle?: string;
  isOpen: boolean;
  onClose: () => void;
}

export function OfferLetterModal({
  candidateId,
  candidateName,
  roleTitle,
  isOpen,
  onClose,
}: OfferLetterModalProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Fetch offer draft
  const {
    data: draftData,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["offerDraft", candidateId],
    queryFn: () => {
      if (!candidateId) throw new Error("No candidate selected.");
      return schedulingApi.getOfferDraft(candidateId);
    },
    enabled: !!candidateId && isOpen,
  });

  useEffect(() => {
    if (draftData) {
      setSubject(draftData.subject || "");
      setBody(draftData.body || "");
      setErrorMsg(null);
    }
  }, [draftData]);

  // Send Offer Letter Mutation
  const sendMutation = useMutation({
    mutationFn: () => {
      if (!candidateId) throw new Error("No candidate selected.");
      if (!subject.trim() || !body.trim()) {
        throw new Error("Subject and body cannot be empty.");
      }
      return schedulingApi.sendOfferLetter(candidateId, {
        subject: subject.trim(),
        body: body.trim(),
      });
    },
    onSuccess: (updatedDraft: OfferDraftResponse) => {
      queryClient.invalidateQueries({ queryKey: ["offerDraft", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["interviewsList"] });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidateId] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });

      toast({
        title: "Offer Letter Sent!",
        description: `Offer email dispatched to ${updatedDraft.candidate_email}.`,
      });
      onClose();
    },
    onError: (err: any) => {
      setErrorMsg(
        err?.response?.data?.detail || err?.message || "Failed to dispatch Offer Letter."
      );
    },
  });

  if (!isOpen || !candidateId) return null;

  const isAlreadySent = draftData?.status === "sent";

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-card border border-border/80 dark:border-white/[0.08] rounded-2xl w-full max-w-2xl shadow-card overflow-hidden animate-in fade-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-border/70 flex items-center justify-between bg-muted/20 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">Review & Approve Offer Letter</span>
                <Badge
                  variant={isAlreadySent ? "success" : "outline"}
                  className="text-[10px] font-semibold"
                >
                  {isAlreadySent ? "Offer Sent" : "Pending HR Approval"}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {candidateName || draftData?.candidate_name || "Candidate"} •{" "}
                {roleTitle || draftData?.opening_title || "Position"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground rounded-lg p-1 hover:bg-muted transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 space-y-4 overflow-y-auto flex-1">
          {/* Security Gate Notice */}
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 text-xs flex items-start gap-2.5">
            <ShieldCheck className="w-4 h-4 shrink-0 text-amber-500 mt-0.5" />
            <div>
              <span className="font-bold">Strict HR Approval Gate: </span>
              Offer letters are never sent automatically by the system. You have full control to preview,
              customize the terms, and click <strong>&quot;Approve & Send Offer Letter&quot;</strong> below.
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3 py-4">
              <Skeleton className="h-9 w-full rounded-lg" />
              <Skeleton className="h-40 w-full rounded-lg" />
            </div>
          ) : isError ? (
            <div className="p-4 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs">
              <p className="font-semibold">Failed to load offer draft</p>
              <p className="mt-1">{(error as any)?.message || "An error occurred."}</p>
              <Button size="sm" variant="outline" onClick={() => refetch()} className="mt-3">
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Recipient info */}
              <div className="p-3 rounded-xl bg-muted/40 border border-border/70 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-3.5 h-3.5 text-primary" />
                  <span>To: <strong className="text-foreground">{draftData?.candidate_email}</strong></span>
                </div>
                {draftData?.sent_at && (
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Sent on {new Date(draftData.sent_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* Subject */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Email Subject</label>
                <Input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. Offer of Employment: Welcome to the team!"
                  className="text-xs"
                  disabled={sendMutation.isPending}
                />
              </div>

              {/* Body */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Offer Letter Message</label>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Offer letter body content..."
                  rows={10}
                  className="text-xs font-sans leading-relaxed resize-none"
                  disabled={sendMutation.isPending}
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-muted/20 border-t border-border/70 flex items-center justify-between shrink-0">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={sendMutation.isPending}>
            Close
          </Button>

          <Button
            size="sm"
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending || isLoading || isError}
            className="bg-emerald-600 hover:bg-emerald-500 text-white gap-1.5 shadow-xs"
          >
            {sendMutation.isPending ? (
              "Sending Offer..."
            ) : isAlreadySent ? (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Re-send Offer Letter</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Approve & Send Offer Letter</span>
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
