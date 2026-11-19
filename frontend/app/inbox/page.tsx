"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatTime, formatDateTime } from "@/lib/format-date";
import {
  Mail,
  Search,
  Send,
  Sparkles,
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  RefreshCw,
  User,
  Briefcase,
  ChevronRight,
  Filter,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useToast } from "@/components/ui/use-toast";
import {
  googleApi,
  EmailConversationSummary,
  EmailThreadResponse,
  EmailMessageItem,
} from "@/lib/api";
import { ContactCandidateDialog } from "@/components/candidates/contact-candidate-dialog";

function InboxContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialCandidateId = searchParams.get("candidate_id") || null;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedCandidateId, setSelectedCandidateId] = useState<string | null>(initialCandidateId);
  const [filterStatus, setFilterStatus] = useState<"all" | "awaiting_reply">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [replyText, setReplyText] = useState("");
  const [replySubject, setReplySubject] = useState("");
  const [isDraftingAI, setIsDraftingAI] = useState(false);
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 1. Fetch conversations list
  const {
    data: conversationsData,
    isLoading: isLoadingConvs,
    isError: isErrorConvs,
    error: errorConvs,
    refetch: refetchConvs,
  } = useQuery({
    queryKey: ["email-conversations", filterStatus],
    queryFn: () => googleApi.listConversations(filterStatus),
    refetchInterval: 12000,
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
    queryKey: ["email-thread", selectedCandidateId],
    queryFn: () => (selectedCandidateId ? googleApi.getThread(selectedCandidateId) : Promise.reject("No candidate")),
    enabled: !!selectedCandidateId,
    refetchInterval: 6000,
  });

  const selectedConv = conversations.find((c) => c.candidate_id === selectedCandidateId);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadData?.messages]);

  // Send reply mutation
  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      googleApi.sendReply({
        candidate_id: selectedCandidateId!,
        message: text,
        subject: replySubject.trim() || undefined,
      }),
    onSuccess: () => {
      setReplyText("");
      setReplySubject("");
      queryClient.invalidateQueries({ queryKey: ["email-thread", selectedCandidateId] });
      queryClient.invalidateQueries({ queryKey: ["email-conversations"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      toast({
        title: "Email Sent Successfully",
        description: "Your reply was transmitted via Gmail API.",
      });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to send email",
        description: err.response?.data?.detail || err.message || "Could not dispatch email.",
        variant: "destructive",
      });
    },
  });

  // AI draft reply
  const handleAIDraft = async () => {
    if (!selectedCandidateId) return;
    setIsDraftingAI(true);
    try {
      const res = await googleApi.aiDraftReply({
        candidate_id: selectedCandidateId,
        instructions: "Draft a polite, professional recruiting follow-up acknowledging candidate's status.",
      });
      setReplyText(res.drafted_message);
      if (res.drafted_subject) {
        setReplySubject(res.drafted_subject);
      }
      toast({
        title: "AI Draft Ready",
        description: "Review and edit the proposed email before clicking Send.",
      });
    } catch (err: any) {
      toast({
        title: "AI Draft failed",
        description: err.message || "Failed to generate AI response.",
        variant: "destructive",
      });
    } finally {
      setIsDraftingAI(false);
    }
  };

  const handleSelectConversation = (cid: string) => {
    setSelectedCandidateId(cid);
    router.replace(`/inbox?candidate_id=${cid}`, { scroll: false });
  };

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      c.candidate_name.toLowerCase().includes(q) ||
      (c.candidate_email && c.candidate_email.toLowerCase().includes(q)) ||
      (c.opening_title && c.opening_title.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 h-[calc(100vh-7.5rem)] flex flex-col">
      <PageHeader
        title="Recruiting Inbox"
        description="Unified candidate email conversations synchronized directly with your connected Google Workspace account."
        badge={
          <Badge variant={awaitingReplyCount > 0 ? "warning" : "secondary"}>
            {awaitingReplyCount > 0 ? `${awaitingReplyCount} Awaiting Reply` : "Synced"}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchConvs()}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
              <span>Sync</span>
            </Button>
            <Button
              size="sm"
              onClick={() => setIsEmailModalOpen(true)}
              className="gap-1.5 font-medium shadow-xs"
            >
              <Mail className="h-3.5 w-3.5" />
              <span>Compose Email</span>
            </Button>
          </div>
        }
      />

      <div className="flex-1 flex overflow-hidden rounded-xl border border-border/70 dark:border-white/[0.08] bg-card shadow-xs">
        {/* ── Left Sidebar: Conversations List ──────────────────────────────── */}
        <div className="w-80 md:w-96 flex flex-col border-r border-border/70 bg-card/60 shrink-0">
          {/* Header */}
          <div className="p-3.5 border-b border-border/70 space-y-2.5">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search candidate emails..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs bg-background"
              />
            </div>

            {/* Filter Pills */}
            <div className="flex gap-1.5 text-xs">
              <Button
                size="sm"
                variant={filterStatus === "all" ? "default" : "outline"}
                className="h-6 text-[11px] px-2.5 rounded-full"
                onClick={() => setFilterStatus("all")}
              >
                All
              </Button>
              <Button
                size="sm"
                variant={filterStatus === "awaiting_reply" ? "default" : "outline"}
                className="h-6 text-[11px] px-2.5 rounded-full"
                onClick={() => setFilterStatus("awaiting_reply")}
              >
                Awaiting Reply
                {awaitingReplyCount > 0 && (
                  <span className="ml-1 text-[9.5px] px-1 py-0.2 bg-amber-500 text-white rounded-full font-bold">
                    {awaitingReplyCount}
                  </span>
                )}
              </Button>
            </div>
          </div>

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-border/60">
          {isLoadingConvs ? (
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3 items-center">
                  <Skeleton className="w-10 h-10 rounded-full shrink-0" />
                  <div className="space-y-1.5 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          ) : isErrorConvs ? (
            <div className="p-6">
              <ErrorState
                title="Failed to load conversations"
                message={(errorConvs as any)?.message || "Please check your network and retry."}
                onRetry={() => refetchConvs()}
              />
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={Mail}
                title="No email conversations found"
                description={
                  searchQuery
                    ? "Try adjusting your search query."
                    : "Incoming emails synced from Gmail will appear here."
                }
              />
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = conv.candidate_id === selectedCandidateId;
              return (
                <button
                  key={conv.candidate_id}
                  onClick={() => handleSelectConversation(conv.candidate_id)}
                  className={`w-full text-left p-3.5 transition flex gap-3 items-start hover:bg-muted/40 ${
                    isSelected ? "bg-muted border-l-4 border-primary" : ""
                  }`}
                >
                  {/* Avatar */}
                  <div className="w-9 h-9 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0 text-sm">
                    {conv.candidate_name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1 mb-0.5">
                      <span className="font-semibold text-sm truncate text-foreground">
                        {conv.candidate_name}
                      </span>
                      {conv.last_message_at && (
                        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                          {formatTime(conv.last_message_at)}
                        </span>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground flex items-center gap-1.5 mb-1 truncate">
                      <span className="truncate">{conv.opening_title || "General Application"}</span>
                      <span>•</span>
                      <span className="capitalize">{conv.candidate_stage}</span>
                    </div>

                    <p className="text-xs text-muted-foreground truncate line-clamp-1">
                      {conv.last_message_body || "No messages yet"}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Right Panel: Chat Thread View ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col bg-background overflow-hidden">
        {selectedCandidateId ? (
          <>
            {/* Thread Header */}
            <div className="p-4 border-b border-border bg-card flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-full bg-primary/10 text-primary font-bold flex items-center justify-center shrink-0">
                  {threadData?.candidate_name?.charAt(0).toUpperCase() || "C"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="font-semibold text-base truncate">
                      {threadData?.candidate_name || "Candidate Email Thread"}
                    </h2>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted font-mono capitalize">
                      {threadData?.candidate_stage || "Applied"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <span>{threadData?.candidate_email || "No email"}</span>
                    <span>•</span>
                    <span>{threadData?.opening_title || "Job Requisition"}</span>
                  </div>
                </div>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setIsEmailModalOpen(true)}
                  className="text-xs gap-1.5"
                >
                  <Mail className="w-3.5 h-3.5" />
                  Compose New Email
                </Button>
                <Link href={`/pipeline?candidate_id=${selectedCandidateId}`}>
                  <Button size="sm" variant="outline" className="text-xs gap-1">
                    Pipeline
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </Link>
              </div>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingThread ? (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}
                    >
                      <Skeleton className="w-64 h-16 rounded-2xl" />
                    </div>
                  ))}
                </div>
              ) : !threadData || threadData.messages.length === 0 ? (
                <div className="py-16">
                  <EmptyState
                    icon={Mail}
                    title="No emails yet"
                    description="Incoming candidate replies synced from Gmail or outgoing notifications will appear in this thread."
                    actionText="Send First Email"
                    onAction={() => setIsEmailModalOpen(true)}
                  />
                </div>
              ) : (
                threadData.messages.map((msg: EmailMessageItem) => {
                  const isOutbound = msg.direction === "outbound";
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isOutbound ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
                          isOutbound
                            ? "bg-primary text-primary-foreground rounded-tr-none"
                            : "bg-muted text-foreground rounded-tl-none border border-border"
                        }`}
                      >
                        {msg.subject && (
                          <div className="text-xs font-semibold pb-1.5 mb-1.5 border-b border-current/20 opacity-90">
                            {msg.subject}
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <div
                          className={`mt-1.5 text-[10px] flex items-center justify-end gap-1 opacity-70 ${
                            isOutbound ? "text-primary-foreground" : "text-muted-foreground"
                          }`}
                        >
                          <span>{formatTime(msg.sent_at || msg.created_at)}</span>
                          {isOutbound && <CheckCheck className="w-3 h-3" />}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply Bar */}
            <div className="p-4 border-t border-border bg-card space-y-3">
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleAIDraft}
                  disabled={isDraftingAI}
                  className="text-xs text-primary hover:text-primary gap-1.5 h-7 px-2 font-medium"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {isDraftingAI ? "Drafting with AI..." : "AI Draft Reply"}
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Sending from connected Gmail account
                </span>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1 space-y-1.5">
                  {replySubject && (
                    <Input
                      placeholder="Subject line..."
                      value={replySubject}
                      onChange={(e) => setReplySubject(e.target.value)}
                      className="text-xs h-8"
                    />
                  )}
                  <Textarea
                    placeholder="Type your reply to candidate... (Shift+Enter for new line)"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (replyText.trim()) sendMutation.mutate(replyText);
                      }
                    }}
                    rows={2}
                    className="resize-none text-sm leading-relaxed"
                  />
                </div>
                <Button
                  onClick={() => sendMutation.mutate(replyText)}
                  disabled={sendMutation.isPending || !replyText.trim()}
                  className="h-10 px-4 gap-1.5 shrink-0"
                >
                  {sendMutation.isPending ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  Send
                </Button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center p-8">
            <EmptyState
              icon={Mail}
              title="Select a conversation"
              description="Choose a candidate from the left pane to view email communication history and send replies."
            />
          </div>
        )}
      </div>
    </div>

      {/* Modal: Email Candidate Dialog */}
      {selectedConv && (
        <ContactCandidateDialog
          open={isEmailModalOpen}
          onOpenChange={setIsEmailModalOpen}
          candidate={{
            id: selectedConv.candidate_id,
            name: selectedConv.candidate_name,
            email: selectedConv.candidate_email,
            opening_title: selectedConv.opening_title || undefined,
            stage: selectedConv.candidate_stage as any,
          } as any}
        />
      )}
    </div>
  );
}

export default function InboxPage() {
  return (
    <AppShell>
      <Suspense fallback={<div className="p-8 text-center text-sm text-muted-foreground">Loading inbox...</div>}>
        <InboxContent />
      </Suspense>
    </AppShell>
  );
}
