"use client";

import React from "react";
import { formatDateTime } from "@/lib/format-date";
import { useQuery } from "@tanstack/react-query";
import {
  History,
  X,
  ArrowRight,
  User,
  Sparkles,
  Calendar,
  Trash2,
  Layers,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { auditLogsApi, AuditLog } from "@/lib/api";

interface PipelineAuditDrawerProps {
  open: boolean;
  onClose: () => void;
  openingId?: string;
}

export function PipelineAuditDrawer({
  open,
  onClose,
  openingId,
}: PipelineAuditDrawerProps) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audit-logs-recent", openingId],
    queryFn: () =>
      auditLogsApi.listRecent({
        opening_id: openingId && openingId !== "all" ? openingId : undefined,
        limit: 50,
      }),
    enabled: open,
  });

  const logs = data?.items || [];

  const getActionBadge = (action: string) => {
    switch (action) {
      case "stage_change":
      case "bulk_stage_update":
        return {
          icon: Layers,
          color: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20",
          label: "Stage Transition",
        };
      case "score_assigned":
        return {
          icon: Sparkles,
          color: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
          label: "AI Screening",
        };
      case "candidate_created":
        return {
          icon: User,
          color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
          label: "New Candidate",
        };
      case "candidate_deleted":
        return {
          icon: Trash2,
          color: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20",
          label: "Deleted",
        };
      case "interview_scheduled":
        return {
          icon: Calendar,
          color: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20",
          label: "Interview",
        };
      default:
        return {
          icon: History,
          color: "bg-muted text-muted-foreground border-border",
          label: action,
        };
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col bg-background">
        <SheetHeader className="p-4 border-b border-border flex flex-row items-center justify-between space-y-0">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <History className="h-4 w-4" />
            </div>
            <div>
              <SheetTitle className="text-sm font-bold text-foreground">Pipeline Audit Trail</SheetTitle>
              <p className="text-[11px] text-muted-foreground">
                Immutable activity log of recruiter actions & stage transitions
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} className="h-7 w-7 p-0">
            <X className="h-4 w-4" />
          </Button>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 divide-y divide-border/50">
          {isLoading ? (
            <div className="space-y-3 pt-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="h-2.5 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-xs font-semibold text-foreground">No audit logs recorded yet</p>
              <p className="text-[11px] max-w-xs mx-auto mt-0.5">
                Moving candidates across Kanban columns or running AI scoring records events here.
              </p>
            </div>
          ) : (
            logs.map((log: AuditLog) => {
              const badge = getActionBadge(log.action);
              const Icon = badge.icon;
              const timeStr = formatDateTime(log.created_at);

              return (
                <div key={log.id} className="pt-3 first:pt-0 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border ${badge.color}`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{badge.label}</span>
                    </span>
                    <span className="text-[10px] text-muted-foreground font-mono flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>{timeStr}</span>
                    </span>
                  </div>

                  <p className="text-xs text-foreground font-medium">
                    {log.details || `Recruiter performed '${log.action}'.`}
                  </p>

                  <div className="flex items-center gap-2 text-[10.5px] text-muted-foreground">
                    {log.candidate_name && (
                      <span className="font-semibold text-foreground">{log.candidate_name}</span>
                    )}
                    {log.opening_title && (
                      <span>• {log.opening_title}</span>
                    )}
                    {log.from_stage && log.to_stage && (
                      <span className="flex items-center gap-1 ml-auto font-mono text-[9.5px]">
                        <span className="capitalize">{log.from_stage}</span>
                        <ArrowRight className="h-2.5 w-2.5" />
                        <span className="capitalize text-primary font-semibold">{log.to_stage}</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
