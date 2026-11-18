"use client";

import React, { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare,
  Mail,
  Send,
  RefreshCw,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Sparkles,
  ShieldCheck,
  Building2,
  Briefcase,
  MapPin,
  Phone,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  whatsappApi,
  Candidate,
  ContactPreviewResponse,
  WhatsAppTemplateDefinition,
} from "@/lib/api";

interface ContactCandidateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  candidate: Candidate | null;
  initialChannel?: "whatsapp" | "email";
}

export function ContactCandidateDialog({
  open,
  onOpenChange,
  candidate,
  initialChannel = "whatsapp",
}: ContactCandidateDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [channel, setChannel] = useState<"whatsapp" | "email">(initialChannel);
  const [optInConsent, setOptInConsent] = useState(true);
  const [selectedTemplate, setSelectedTemplate] = useState("hello_world");
  const [waMessage, setWaMessage] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [dispatchError, setDispatchError] = useState<string | null>(null);

  // Sync initial channel if passed
  useEffect(() => {
    if (initialChannel) setChannel(initialChannel);
  }, [initialChannel]);

  // 1. Fetch Contact Preview with JD Variables
  const {
    data: preview,
    isLoading: isPreviewLoading,
    refetch: refetchPreview,
  } = useQuery<ContactPreviewResponse>({
    queryKey: ["contact-preview", candidate?.id],
    queryFn: () => (candidate ? whatsappApi.getContactPreview(candidate.id) : Promise.reject("No candidate")),
    enabled: !!candidate?.id && open,
  });

  // 2. Fetch Available WhatsApp Templates
  const { data: templates = [] } = useQuery<WhatsAppTemplateDefinition[]>({
    queryKey: ["whatsapp-templates"],
    queryFn: () => whatsappApi.getTemplates(),
    enabled: open,
  });

  // Prefill state from preview when loaded
  useEffect(() => {
    if (preview && open) {
      setOptInConsent(preview.whatsapp_opt_in ?? true);
      setSelectedTemplate(preview.default_template || "hello_world");
      setWaMessage(preview.suggested_whatsapp_message);
      setEmailSubject(preview.suggested_email_subject);
      setEmailBody(preview.suggested_email_body);
      setDispatchError(null);
    }
  }, [preview, open]);

  // Contact Candidate Mutation
  const contactMutation = useMutation({
    mutationFn: () => {
      if (!candidate) throw new Error("No candidate selected");
      return whatsappApi.contactCandidate(candidate.id, {
        channel,
        message: channel === "whatsapp" ? waMessage : emailBody,
        subject: channel === "email" ? emailSubject : undefined,
        template_name: channel === "whatsapp" && !preview?.care_window_open ? selectedTemplate : undefined,
        whatsapp_opt_in: optInConsent,
        variables: preview?.variables,
      });
    },
    onSuccess: (data) => {
      toast({
        title: channel === "whatsapp" ? "WhatsApp Message Dispatched" : "Email Sent Successfully",
        description:
          channel === "whatsapp"
            ? `Message dispatched to ${data.candidate_name}${data.used_template ? ` (via template: ${data.used_template})` : ""}`
            : `Email sent to ${candidate?.email} via connected Gmail account.`,
      });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-thread", candidate?.id] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      onOpenChange(false);
    },
    onError: (err: any) => {
      const msg = err.message || "Failed to contact candidate.";
      setDispatchError(msg);
      toast({
        title: "Dispatch Failed",
        description: msg,
        variant: "destructive",
      });
    },
  });

  if (!candidate) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-border bg-card/60">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-base font-bold flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-primary" />
              <span>Contact Candidate</span>
            </DialogTitle>
            <Badge variant="outline" className="text-xs font-normal">
              {candidate.name}
            </Badge>
          </div>
          <DialogDescription className="text-xs text-muted-foreground pt-1">
            Pick WhatsApp or Email, preview message variables from the Job Description, and approve for sending.
          </DialogDescription>
        </DialogHeader>

        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {/* Channel Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold text-foreground">Select Channel</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setChannel("whatsapp"); setDispatchError(null); }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                  channel === "whatsapp"
                    ? "border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shadow-xs"
                    : "border-border bg-card hover:bg-muted text-muted-foreground"
                }`}
              >
                <Phone className="h-3.5 w-3.5" />
                <span>WhatsApp Cloud API</span>
              </button>
              <button
                type="button"
                onClick={() => { setChannel("email"); setDispatchError(null); }}
                className={`flex items-center justify-center gap-2 p-2.5 rounded-lg border text-xs font-semibold transition-all ${
                  channel === "email"
                    ? "border-primary bg-primary/10 text-primary shadow-xs"
                    : "border-border bg-card hover:bg-muted text-muted-foreground"
                }`}
              >
                <Mail className="h-3.5 w-3.5" />
                <span>Email (Gmail Sync)</span>
              </button>
            </div>
          </div>

          {/* Error Banner if any */}
          {dispatchError && (
            <div className="p-3 rounded-lg border border-destructive/30 bg-destructive/10 text-destructive text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>Meta WhatsApp API Notice</span>
              </div>
              <p className="text-[11.5px] leading-relaxed">{dispatchError}</p>
            </div>
          )}

          {/* WhatsApp Channel Tab Content */}
          {channel === "whatsapp" && (
            <div className="space-y-3.5">
              {/* Phone & E.164 Normalization Info */}
              <div className="p-3 rounded-lg border bg-muted/20 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground font-medium">Candidate Phone:</span>
                  <span className="font-mono font-semibold text-foreground">
                    {preview?.candidate_phone || candidate.phone || "No phone number"}
                  </span>
                </div>
                {preview?.clean_phone && (
                  <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/60">
                    <span className="text-muted-foreground">Normalized E.164 Format:</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                      +{preview.clean_phone}
                    </span>
                  </div>
                )}
                {preview?.phone_error && (
                  <p className="text-[11px] text-destructive pt-1">{preview.phone_error}</p>
                )}
              </div>

              {/* 24-Hour Care Window Status Banner */}
              <div
                className={`p-3 rounded-lg border text-xs space-y-1 ${
                  preview?.care_window_open
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300"
                    : "border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-300"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {preview?.care_window_open ? (
                    <>
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>24-Hour Care Window is Open: Direct Free-form Text Enabled</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <span>24-Hour Care Window is Closed: Template Message Required</span>
                    </>
                  )}
                </div>
                <p className="text-[11px] opacity-90 leading-relaxed">
                  {preview?.care_window_open
                    ? "Candidate has messaged within the last 24 hours. You can send free-form text or an AI-drafted reply."
                    : "Candidate has not sent an inbound message in 24 hours. Meta WhatsApp policy requires initiating with an approved template message."}
                </p>
              </div>

              {/* Opt-in consent checkbox */}
              <div className="flex items-start gap-2.5 p-3 rounded-lg border bg-card">
                <input
                  type="checkbox"
                  id="opt-in-checkbox"
                  checked={optInConsent}
                  onChange={(e) => setOptInConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-border text-primary focus:ring-primary cursor-pointer"
                />
                <label htmlFor="opt-in-checkbox" className="text-xs space-y-0.5 cursor-pointer">
                  <span className="font-semibold text-foreground block">
                    Candidate Opt-in Consent
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Candidate has consented to receive recruiting communications via WhatsApp. (Required)
                  </span>
                </label>
              </div>

              {/* Template Picker if care window is closed */}
              {!preview?.care_window_open && (
                <div className="space-y-1.5">
                  <Label htmlFor="template-select" className="text-xs font-semibold text-foreground">
                    Approved WhatsApp Template
                  </Label>
                  <select
                    id="template-select"
                    value={selectedTemplate}
                    onChange={(e) => setSelectedTemplate(e.target.value)}
                    className="w-full text-xs h-8 px-2.5 rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer"
                  >
                    <option value="hello_world">hello_world (Meta Pre-approved Starter)</option>
                    {templates
                      .filter((t) => t.name !== "hello_world")
                      .map((t) => (
                        <option key={t.name} value={t.name}>
                          {t.display_name} ({t.name})
                        </option>
                      ))}
                  </select>
                </div>
              )}

              {/* Message Body / Preview */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <Label htmlFor="wa-message-body" className="font-semibold text-foreground">
                    {preview?.care_window_open ? "Message Content" : "Template Preview"}
                  </Label>
                  <span className="text-[11px] text-muted-foreground">Variables populated from JD</span>
                </div>
                <Textarea
                  id="wa-message-body"
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  disabled={!preview?.care_window_open}
                  rows={4}
                  className="text-xs resize-none bg-background font-sans"
                />
              </div>
            </div>
          )}

          {/* Email Channel Tab Content */}
          {channel === "email" && (
            <div className="space-y-3.5">
              <div className="p-3 rounded-lg border bg-muted/20 space-y-1 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Recipient:</span>
                  <span className="font-semibold text-foreground">{candidate.email}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-border/60">
                  <span className="text-muted-foreground">Sender:</span>
                  <span className="font-semibold text-foreground">Your Connected Gmail Account</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-subject" className="text-xs font-semibold text-foreground">
                  Email Subject
                </Label>
                <Input
                  id="email-subject"
                  value={emailSubject}
                  onChange={(e) => setEmailSubject(e.target.value)}
                  className="text-xs h-8 bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="email-body" className="text-xs font-semibold text-foreground">
                  Email Body
                </Label>
                <Textarea
                  id="email-body"
                  value={emailBody}
                  onChange={(e) => setEmailBody(e.target.value)}
                  rows={6}
                  className="text-xs resize-none bg-background font-sans leading-relaxed"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="p-4 border-t border-border bg-card/60 flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-xs">
            Cancel
          </Button>
          <Button
            id="btn-confirm-contact-candidate"
            size="sm"
            onClick={() => contactMutation.mutate()}
            disabled={
              contactMutation.isPending ||
              isPreviewLoading ||
              (channel === "whatsapp" && (!optInConsent || !preview?.phone_valid))
            }
            className="text-xs font-semibold gap-1.5"
          >
            {contactMutation.isPending ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            <span>
              {contactMutation.isPending
                ? "Sending..."
                : channel === "whatsapp"
                ? "Approve & Send via WhatsApp"
                : "Approve & Send via Gmail"}
            </span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
