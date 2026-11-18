"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatTime, formatDateTime } from "@/lib/format-date";
import {
  MessageSquare,
  Search,
  Send,
  Sparkles,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  RefreshCw,
  User,
  ShieldCheck,
  ShieldAlert,
  Calendar,
  Briefcase,
  ChevronRight,
  Filter,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import {
  whatsappApi,
  WhatsAppConversationSummary,
  WhatsAppThreadResponse,
  WhatsAppMessageRead,
} from "@/lib/api";
import { ContactCandidateDialog } from "@/components/candidates/contact-candidate-dialog";

function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCandidateId = searchParams.get("candidate_id") || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(initialCandidateId);
  const [filterStatus, setFilterStatus] = useState<"all" | "awaiting_reply" | "window_open">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyText, setReplyText] = useState("");
  const [isDraftingAI, setIsDraftingAI] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch conversations list
  const {
    data: conversationsData,
    isLoading: isLoadingConvs,
    isError: isErrorConvs,
    error: errorConvs,
    refetch: refetchConvs,
  } = useQuery({
    queryKey: ["whatsapp-conversations", filterStatus],
    queryFn: () => whatsappApi.listConversations(filterStatus),
    refetchInterval: 10000,
  });

  const conversations = conversationsData?.conversations || [];
  const awaitingReplyCount = conversationsData?.awaiting_reply_count || 0;

  // Auto-select first conversation if none selected
  useEffect(() => {
    if (!selectedCandidateId && conversations.length > 0) {
      setSelectedCandidateId(conversations[0].candidate_id);
    }
  }, [conversations, selectedCandidateId]);

  // Keep selected candidate updated if URL changes
  useEffect(() => {
    const cid = searchParams.get("candidate_id");
    if (cid && cid !== selectedCandidateId) {
      setSelectedCandidateId(cid);
    }
  }, [searchParams, selectedCandidateId]);

  // 2. Fetch active thread
  const {
    data: threadData,
    isLoading: isLoadingThread,
    refetch: refetchThread,
  } = useQuery({
    queryKey: ["whatsapp-thread", selectedCandidateId],
    queryFn: () => whatsappApi.getThread(selectedCandidateId!),
    enabled: !!selectedCandidateId,
    refetchInterval: 5000,
  });

  const selectedConv = conversations.find((c) => c.candidate_id === selectedCandidateId);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadData?.messages]);

  // Send message mutation
  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      whatsappApi.sendFreeform({
        candidate_id: selectedCandidateId!,
        message: text,
      }),
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["whatsapp-thread", selectedCandidateId] });
      queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Message Sent",
        description: "Your reply was transmitted via WhatsApp Cloud API.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send message",
        description: err.message || "24-hour customer service window may have closed.",
        variant: "destructive",
      });
    },
  });

  // AI draft reply
  const handleAIDraft = async () => {
    if (!selectedCandidateId) return;
    setIsDraftingAI(true);
    try {
      const res = await whatsappApi.aiDraft({
        candidate_id: selectedCandidateId,
        instructions: "Draft a polite, professional recruiting follow-up acknowledging candidate's status.",
      });
      setReplyText(res.drafted_message);
      toast({
        title: "AI Draft Ready",
        description: "Review and edit the proposed reply before clicking Send.",
      });
    } catch (err: any) {
      toast({
        title: "AI Draft failed",
        description: err.message || "Failed to generate suggested response.",
        variant: "destructive",
      });
    } finally {
      setIsDraftingAI(false);
    }
  };

  // Filter conversations by search query
  const filteredConversations = conversations.filter((c) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.candidate_name.toLowerCase().includes(q) ||
      c.candidate_email.toLowerCase().includes(q) ||
      (c.opening_title && c.opening_title.toLowerCase().includes(q)) ||
      (c.last_message_body && c.last_message_body.toLowerCase().includes(q))
    );
  });

  return (
    <div className="flex h-[calc(100vh-6.5rem)] rounded-2xl border border-border bg-card overflow-hidden shadow-xs">
      {/* ── Left Pane: Conversation Threads ───────────────────────── */}
      <div className="w-80 sm:w-96 border-r border-border flex flex-col shrink-0 bg-muted/10">
        {/* Top Header & Search */}
        <div className="p-3.5 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <h2 className="text-sm font-bold text-foreground">Candidate Inbox</h2>
            </div>
            {awaitingReplyCount > 0 && (
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                {awaitingReplyCount} awaiting reply
              </span>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search chats, candidates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 text-xs bg-background"
            />
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 text-[11px]">
            <button
              onClick={() => setFilterStatus("all")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                filterStatus === "all"
                  ? "bg-foreground text-background font-semibold shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterStatus("awaiting_reply")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all flex items-center gap-1 ${
                filterStatus === "awaiting_reply"
                  ? "bg-rose-600 text-white font-semibold shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span>Awaiting Reply</span>
              {awaitingReplyCount > 0 && (
                <span className="text-[9.5px] px-1 rounded-full bg-rose-700 text-white">
                  {awaitingReplyCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setFilterStatus("window_open")}
              className={`px-2.5 py-1 rounded-md font-medium transition-all ${
                filterStatus === "window_open"
                  ? "bg-emerald-600 text-white font-semibold shadow-xs"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              Window Open
            </button>
          </div>
        </div>

        {/* Conversations List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {isLoadingConvs ? (
            <div className="p-3 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3.5 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                </div>
              ))}
            </div>
          ) : isErrorConvs ? (
            <div className="p-4">
              <ErrorState
                title="Could not load conversations"
                message={(errorConvs as Error)?.message || "Failed to load candidate threads."}
                onRetry={() => refetchConvs()}
              />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-xs font-semibold text-foreground">No conversations found</p>
              <p className="text-[11px] text-muted-foreground mt-1">
                {filterStatus === "awaiting_reply"
                  ? "All candidate inquiries have been answered!"
                  : "Inbound messages from WhatsApp will appear here."}
              </p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.candidate_id === selectedCandidateId;
              const timeStr = formatTime(conv.last_message_at);

              return (
                <button
                  key={conv.candidate_id}
                  onClick={() => {
                    setSelectedCandidateId(conv.candidate_id);
                    router.push(`/inbox?candidate_id=${conv.candidate_id}`, { scroll: false });
                  }}
                  className={`w-full text-left p-3 flex items-start gap-3 transition-colors ${
                    isSelected
                      ? "bg-accent/80 border-l-3 border-primary"
                      : "hover:bg-muted/40"
                  }`}
                >
                  {/* Avatar */}
                  <div className="relative shrink-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs">
                      {conv.candidate_name.charAt(0).toUpperCase()}
                    </div>
                    {conv.care_window_open && (
                      <span
                        className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background"
                        title="24h Care Window Active"
                      />
                    )}
                  </div>

                  {/* Snippet */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground truncate">
                        {conv.candidate_name}
                      </span>
                      {timeStr && (
                        <span className="text-[10px] text-muted-foreground font-mono">
                          {timeStr}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {conv.opening_title || "General Candidate"}
                    </p>
                    <p className="text-[11px] text-muted-foreground line-clamp-1 italic">
                      {conv.last_message_body || "No messages yet"}
                    </p>

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 pt-1">
                      {conv.awaiting_reply && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-rose-500/15 text-rose-600 dark:text-rose-400">
                          Awaiting reply
                        </span>
                      )}
                      {conv.care_window_open ? (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                          24h Window
                        </span>
                      ) : (
                        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm bg-muted text-muted-foreground">
                          Closed
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Pane: Active Chat Thread ────────────────────────── */}
      <div className="flex-1 flex flex-col bg-background min-w-0">
        {!selectedCandidateId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="text-sm font-bold text-foreground">Select a Candidate Conversation</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              Choose a thread from the list on the left to read candidate messages, inspect 24h service window status, and respond.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="h-14 px-4 border-b border-border flex items-center justify-between shrink-0 bg-card/60 backdrop-blur-xs">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                  {selectedConv?.candidate_name ? selectedConv.candidate_name.charAt(0).toUpperCase() : "C"}
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs font-bold text-foreground truncate">
                    {selectedConv?.candidate_name || threadData?.candidate_name || "Candidate"}
                  </h3>
                  <p className="text-[10.5px] text-muted-foreground truncate">
                    {selectedConv?.candidate_phone || selectedConv?.candidate_email || "Candidate"} •{" "}
                    {selectedConv?.opening_title || "General Candidate"}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* 24h Care Window Status Pill */}
                {threadData?.care_window_open ? (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>24h Session Active</span>
                    {threadData.seconds_remaining && (
                      <span className="font-mono text-[10px]">
                        ({Math.round(threadData.seconds_remaining / 3600)}h left)
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    <Clock className="h-3 w-3" />
                    <span>24h Window Closed</span>
                  </div>
                )}

                {/* WhatsApp Opt-in Pill */}
                {threadData?.whatsapp_opt_in ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                    Opted-in
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 font-semibold">
                    No Opt-in
                  </span>
                )}
              </div>
            </div>

            {/* Messages Scroll Area */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-muted/5">
              {isLoadingThread ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map((i) => (
                    <Skeleton
                      key={i}
                      className={`h-12 w-2/3 rounded-2xl ${
                        i % 2 === 0 ? "ml-auto" : "mr-auto"
                      }`}
                    />
                  ))}
                </div>
              ) : !threadData?.messages || threadData.messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mb-2 opacity-40" />
                  <p className="text-xs font-semibold text-foreground">No message history yet</p>
                  <p className="text-[11px] max-w-xs mt-0.5">
                    Send an approved template message to initiate communication on WhatsApp.
                  </p>
                </div>
              ) : (
                threadData.messages.map((msg: WhatsAppMessageRead) => {
                  const isInbound = msg.direction === "inbound";
                  const timeDisplay = formatTime(msg.created_at);

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isInbound ? "items-start" : "items-end"}`}
                    >
                      <div
                        className={`max-w-[75%] rounded-2xl p-3 text-xs shadow-2xs ${
                          isInbound
                            ? "bg-card border border-border text-foreground rounded-tl-xs"
                            : "bg-primary text-primary-foreground rounded-tr-xs"
                        }`}
                      >
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                        <div
                          className={`flex items-center justify-end gap-1 mt-1 text-[9.5px] ${
                            isInbound
                              ? "text-muted-foreground"
                              : "text-primary-foreground/75"
                          }`}
                        >
                          <span>{timeDisplay}</span>
                          {!isInbound && (
                            <span>
                              {msg.status === "read" ? (
                                <span title="Read by candidate">
                                  <CheckCheck className="h-3 w-3 text-emerald-300" />
                                </span>
                              ) : msg.status === "delivered" ? (
                                <span title="Delivered to device">
                                  <CheckCheck className="h-3 w-3 text-primary-foreground/80" />
                                </span>
                              ) : msg.status === "sent" ? (
                                <span title="Sent by Meta">
                                  <Check className="h-3 w-3 text-primary-foreground/70" />
                                </span>
                              ) : msg.status === "failed" ? (
                                <span className="inline-flex items-center gap-0.5 text-rose-300 font-semibold" title={msg.error_message || "Delivery failed"}>
                                  <AlertCircle className="h-3 w-3" />
                                  <span>Failed</span>
                                </span>
                              ) : null}
                            </span>
                          )}
                        </div>
                      </div>
                      {msg.status === "failed" && msg.error_message && (
                        <div className="mt-1 max-w-[75%] p-2 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-[10.5px] leading-snug">
                          <span className="font-bold">Error Notice: </span>
                          <span>{msg.error_message}</span>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Input Box */}
            <div className="p-3 border-t border-border bg-card">
              {threadData?.care_window_open ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span>Direct 24-hour reply window is open</span>
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAIDraft}
                      disabled={isDraftingAI}
                      className="h-6 text-[10.5px] gap-1 text-primary hover:text-primary"
                    >
                      <Sparkles className="h-3 w-3" />
                      <span>{isDraftingAI ? "Drafting with AI..." : "Ask AI to Draft Reply"}</span>
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Type your reply here..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      rows={2}
                      className="text-xs resize-none bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          if (replyText.trim()) sendMutation.mutate(replyText.trim());
                        }
                      }}
                    />
                    <Button
                      id="btn-send-whatsapp-reply"
                      onClick={() => replyText.trim() && sendMutation.mutate(replyText.trim())}
                      disabled={!replyText.trim() || sendMutation.isPending}
                      className="h-auto px-4 gap-1.5 text-xs font-semibold shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      <span>Send</span>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
                    <Clock className="h-4 w-4 shrink-0" />
                    <span>
                      24-hour customer care window is closed. Candidate must reply first or you may send an approved WhatsApp Template message.
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      id="btn-open-template-dialog"
                      size="sm"
                      onClick={() => setIsTemplateModalOpen(true)}
                      className="h-7 text-xs font-semibold gap-1.5"
                    >
                      <MessageSquare className="h-3 w-3" />
                      <span>Send Template Message</span>
                    </Button>
                    <Link href={`/pipeline?candidate_id=${selectedCandidateId}`}>
                      <Button size="sm" variant="outline" className="h-7 text-xs font-semibold shrink-0">
                        View in Pipeline
                      </Button>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {selectedConv && (
        <ContactCandidateDialog
          open={isTemplateModalOpen}
          onOpenChange={setIsTemplateModalOpen}
          candidate={
            {
              id: selectedConv.candidate_id,
              name: selectedConv.candidate_name,
              email: selectedConv.candidate_email,
              phone: selectedConv.candidate_phone,
              opening_id: selectedConv.opening_id,
              opening_title: selectedConv.opening_title,
              stage: selectedConv.candidate_stage,
              score: selectedConv.candidate_score,
              whatsapp_opt_in: selectedConv.whatsapp_opt_in,
            } as any
          }
          initialChannel="whatsapp"
        />
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <AppShell title="Unified Inbox">
      <Suspense
        fallback={
          <div className="h-[calc(100vh-6.5rem)] rounded-2xl border border-border p-6 flex gap-4">
            <Skeleton className="w-80 h-full rounded-xl" />
            <Skeleton className="flex-1 h-full rounded-xl" />
          </div>
        }
      >
        <InboxContent />
      </Suspense>
    </AppShell>
  );
}
