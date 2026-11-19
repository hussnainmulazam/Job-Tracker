"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Mail,
  Send,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { Candidate, googleApi } from "@/lib/api";

type EmailCategory =
  | "initial_message"
  | "initial_interview"
  | "technical"
  | "offer"
  | "rejection"
  | "follow_up"
  | "custom";

const EMAIL_TEMPLATES: Record<EmailCategory, { subject: string; body: string }> = {
  initial_message: {
    subject: "Opportunities regarding {{job_title}}",
    body: "Hi {{candidate_name}},\n\nWe reviewed your profile and were impressed by your background. We would love to connect and share more details about the {{job_title}} role with our team.\n\nPlease let us know if you are open to an introductory conversation.\n\nBest regards,\nRecruiting & Talent Team",
  },
  initial_interview: {
    subject: "Interview Invitation: {{job_title}}",
    body: "Hi {{candidate_name}},\n\nThank you for applying for the {{job_title}} role. We reviewed your qualifications and would love to invite you for an initial interview.\n\nPlease let us know what days and times work best for your schedule.\n\nBest regards,\nRecruiting Team",
  },
  technical: {
    subject: "Technical Interview Next Steps: {{job_title}}",
    body: "Hi {{candidate_name}},\n\nCongratulations on progressing through the preliminary review! We would like to schedule your technical discussion for the {{job_title}} position.\n\nLooking forward to speaking with you!\n\nBest regards,\nEngineering & Talent Team",
  },
  offer: {
    subject: "Formal Offer of Employment: {{job_title}}",
    body: "Dear {{candidate_name}},\n\nWe are absolutely thrilled to extend an offer of employment for the {{job_title}} position with our team!\n\nPlease review the details and let us know if you have any questions.\n\nWarm regards,\nTalent Acquisition Team",
  },
  rejection: {
    subject: "Update regarding your application for {{job_title}}",
    body: "Dear {{candidate_name}},\n\nThank you for your interest in the {{job_title}} position and for taking the time to connect with us. Although we were impressed by your experience, we have decided to move forward with other applicants whose background more closely matches our immediate criteria.\n\nWe wish you all the best in your career endeavors.\n\nSincerely,\nRecruiting Team",
  },
  follow_up: {
    subject: "Following up on your application for {{job_title}}",
    body: "Hi {{candidate_name}},\n\nJust following up on our previous note regarding the {{job_title}} position. Please let us know if you would like to proceed with the next steps.\n\nBest regards,\nRecruiting Team",
  },
  custom: {
    subject: "Regarding your application for {{job_title}}",
    body: "Hi {{candidate_name}},\n\nThank you for connecting with us regarding the {{job_title}} position.\n\nBest regards,\nRecruiting Team",
  },
};

interface ContactCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: Candidate | null;
  initialChannel?: string;
}

export function ContactCandidateDialog({
  open,
  onOpenChange,
  candidate,
}: ContactCandidateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<EmailCategory>("initial_interview");
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // 1. Check Google Integration Status
  const { data: googleStatus } = useQuery({
    queryKey: ["google-status"],
    queryFn: () => googleApi.getStatus(),
    enabled: open,
  });

  // 2. Prefill template when candidate or category changes
  useEffect(() => {
    if (!candidate || !open) return;

    setDispatchError(null);
    const candidateName = candidate.name || "Candidate";
    const jobTitle = candidate.opening_title || "Open Position";
    const tpl = EMAIL_TEMPLATES[selectedCategory] || EMAIL_TEMPLATES.initial_interview;

    setSubject(
      tpl.subject
        .replace(/\{\{candidate_name\}\}/g, candidateName)
        .replace(/\{\{job_title\}\}/g, jobTitle)
    );
    setBody(
      tpl.body
        .replace(/\{\{candidate_name\}\}/g, candidateName)
        .replace(/\{\{job_title\}\}/g, jobTitle)
    );
  }, [candidate, open, selectedCategory]);

  // Send Email Mutation
  const sendEmailMutation = useMutation({
    mutationFn: async () => {
      if (!candidate?.id) throw new Error("No candidate selected");
      if (!subject.trim()) throw new Error("Email subject cannot be empty");
      if (!body.trim()) throw new Error("Email body cannot be empty");

      return googleApi.sendEmail({
        candidate_id: candidate.id,
        subject: subject.trim(),
        body: body.trim(),
        template_name: selectedCategory,
      });
    },
    onSuccess: () => {
      toast({
        title: "Email Sent Successfully",
        description: `Delivered to ${candidate?.email} from your connected Gmail.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidate", candidate?.id] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["messages"] });
      queryClient.invalidateQueries({ queryKey: ["email-threads"] });
      queryClient.invalidateQueries({ queryKey: ["email-conversations"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      const msg = err.response?.data?.detail || err.message || "Failed to send email via Gmail";
      setDispatchError(msg);
      toast({
        title: "Dispatch Failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-6">
            <DialogTitle className="flex items-center gap-2 text-xl font-semibold">
              <Mail className="h-5 w-5 text-primary" />
              Email Candidate
            </DialogTitle>
            {candidate && (
              <Badge variant="outline" className="font-mono text-xs uppercase bg-muted">
                {candidate.name}
              </Badge>
            )}
          </div>
          <DialogDescription>
            Send a personalized email directly to the applicant from your connected Google Workspace account.
          </DialogDescription>
        </DialogHeader>

        {dispatchError && (
          <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-lg text-sm text-destructive flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Dispatch Error</p>
              <p className="text-xs mt-0.5">{dispatchError}</p>
            </div>
          </div>
        )}

        <div className="space-y-4 py-2">
          {/* Recipient and Sender Info */}
          <div className="grid grid-cols-2 gap-3 p-3 bg-muted/40 rounded-lg border text-sm">
            <div>
              <span className="text-muted-foreground text-xs block">Recipient Email:</span>
              <span className="font-medium text-foreground truncate block">
                {candidate?.email || "No email on file"}
              </span>
            </div>
            <div>
              <span className="text-muted-foreground text-xs block">Sending Via:</span>
              <span className="font-medium text-foreground flex items-center gap-1.5 truncate">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                {googleStatus?.is_connected ? googleStatus.email : "Connected Google Account"}
              </span>
            </div>
          </div>

          {/* Quick Category Templates */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Template Category
            </Label>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["initial_message", "Intro"],
                  ["initial_interview", "Interview"],
                  ["technical", "Technical"],
                  ["offer", "Offer"],
                  ["rejection", "Rejection"],
                  ["follow_up", "Follow-up"],
                  ["custom", "Custom"],
                ] as const
              ).map(([cat, label]) => (
                <Button
                  key={cat}
                  type="button"
                  size="sm"
                  variant={selectedCategory === cat ? "default" : "outline"}
                  className="h-7 text-xs px-2.5 rounded-full"
                  onClick={() => setSelectedCategory(cat as EmailCategory)}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>

          {/* Email Subject */}
          <div className="space-y-1.5">
            <Label htmlFor="email-subject" className="text-sm font-medium">
              Subject Line
            </Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="e.g. Interview invitation for Software Engineer role"
            />
          </div>

          {/* Email Body */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="email-body" className="text-sm font-medium">
                Email Message Body
              </Label>
              <span className="text-xs text-muted-foreground">Markdown & plain text supported</span>
            </div>
            <Textarea
              id="email-body"
              rows={9}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your email message..."
              className="font-sans leading-relaxed"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2 border-t">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={sendEmailMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => sendEmailMutation.mutate()}
            disabled={sendEmailMutation.isPending || !subject.trim() || !body.trim() || !candidate?.email}
            className="gap-2 bg-primary hover:bg-primary/90 text-primary-foreground font-medium"
          >
            {sendEmailMutation.isPending ? (
              <>Sending via Gmail...</>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Approve & Send via Gmail
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
