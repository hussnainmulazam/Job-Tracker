"use client";

import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  Calendar,
  Copy,
  Check,
  Send,
  ExternalLink,
  Clock,
  X,
  RefreshCw,
  MessageSquare,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  schedulingApi,
  whatsappApi,
  Candidate,
  SchedulingLinkRead,
} from "@/lib/api";

interface ScheduleInviteModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: Candidate;
}

export function ScheduleInviteModal({
  isOpen,
  onClose,
  candidate,
}: ScheduleInviteModalProps) {
  const [slotDuration, setSlotDuration] = useState(30);
  const [validityDays, setValidityDays] = useState(7);
  const [createdLink, setCreatedLink] = useState<SchedulingLinkRead | null>(null);
  const [copied, setCopied] = useState(false);
  const [whatsappSent, setWhatsappSent] = useState(false);

  // Generate Link Mutation
  const createLinkMutation = useMutation({
    mutationFn: () =>
      schedulingApi.createLink({
        candidate_id: candidate.id,
        slot_duration_minutes: slotDuration,
        validity_days: validityDays,
      }),
    onSuccess: (data) => {
      setCreatedLink(data);
    },
  });

  // WhatsApp Send Invitation Mutation
  const sendWhatsAppMutation = useMutation({
    mutationFn: async () => {
      if (!createdLink) return;
      const fullUrl = `${window.location.origin}${createdLink.public_url}`;
      return whatsappApi.sendTemplate({
        candidate_id: candidate.id,
        template_name: "recruitment_interview_invitation",
        variables: {
          candidate_name: candidate.name,
          job_title: candidate.opening_title || "Open Position",
          interview_date: "Pick your slot below",
          meet_link: fullUrl,
        },
      });
    },
    onSuccess: () => {
      setWhatsappSent(true);
    },
  });

  if (!isOpen) return null;

  const fullPublicUrl = createdLink
    ? typeof window !== "undefined"
      ? `${window.location.origin}${createdLink.public_url}`
      : createdLink.public_url
    : "";

  const handleCopy = () => {
    if (fullPublicUrl) {
      navigator.clipboard.writeText(fullPublicUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-7 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-indigo-400 flex items-center justify-center border border-indigo-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">Invite to Schedule</h2>
              <p className="text-xs text-slate-400">
                Candidate: <span className="text-white font-medium">{candidate.name}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="py-5 space-y-4">
          {!createdLink ? (
            <>
              <p className="text-xs text-slate-400">
                Generate a tokenized public booking link allowing the candidate to choose an interview
                slot from your available calendar.
              </p>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    Interview Duration
                  </label>
                  <select
                    value={slotDuration}
                    onChange={(e) => setSlotDuration(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={15}>15 minutes</option>
                    <option value={30}>30 minutes</option>
                    <option value={45}>45 minutes</option>
                    <option value={60}>60 minutes</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300 block mb-1.5">Link Validity</label>
                  <select
                    value={validityDays}
                    onChange={(e) => setValidityDays(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={3}>3 days</option>
                    <option value={5}>5 days</option>
                    <option value={7}>7 days</option>
                    <option value={14}>14 days</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={() => createLinkMutation.mutate()}
                  disabled={createLinkMutation.isPending}
                  className="w-full h-11 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2"
                >
                  {createLinkMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Generating Secure Token...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Scheduling Link
                    </>
                  )}
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
                <Check className="w-4 h-4 shrink-0" />
                <span>Link generated successfully! Valid for {createdLink.slot_duration_minutes}m interview.</span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400 block mb-1.5">Candidate Booking URL</label>
                <div className="flex items-center gap-2">
                  <input
                    readOnly
                    value={fullPublicUrl}
                    className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono truncate"
                  />
                  <Button size="sm" variant="outline" onClick={handleCopy} className="shrink-0 gap-1.5 text-xs">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </div>

              {/* Action buttons */}
              <div className="pt-2 space-y-2">
                <a
                  href={fullPublicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Preview Booking Page
                </a>

                {candidate.whatsapp_opt_in ? (
                  <Button
                    onClick={() => sendWhatsAppMutation.mutate()}
                    disabled={sendWhatsAppMutation.isPending || whatsappSent}
                    className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                  >
                    {sendWhatsAppMutation.isPending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : whatsappSent ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <MessageSquare className="w-3.5 h-3.5" />
                    )}
                    {whatsappSent ? "Sent to WhatsApp!" : "Dispatch WhatsApp Invitation"}
                  </Button>
                ) : (
                  <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-800 text-[11px] text-slate-400 text-center">
                    Candidate has not opted in to WhatsApp. Share link via email or copy directly.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onClose} className="text-xs">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
