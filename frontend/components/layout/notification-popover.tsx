"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@/lib/format-date";
import {
  Bell,
  Check,
  Calendar,
  MessageSquare,
  FileText,
  Sparkles,
  Info,
  CheckCheck,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { notificationsApi, NotificationItem } from "@/lib/api";

export function NotificationPopover() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => notificationsApi.list(20),
    refetchInterval: 15000,
  });

  const notifications = data?.items || [];
  const unreadCount = data?.unread_count || 0;

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationsApi.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleNotificationClick = (item: NotificationItem) => {
    if (!item.is_read) {
      markReadMutation.mutate(item.id);
    }
    setOpen(false);
    if (item.link) {
      router.push(item.link);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "interview_booked":
      case "interview_cancelled":
      case "interview_rescheduled":
        return <Calendar className="h-3.5 w-3.5 text-purple-500" />;
      case "inbound_message":
        return <MessageSquare className="h-3.5 w-3.5 text-emerald-500" />;
      case "new_applicant":
      case "cv_parsed":
        return <FileText className="h-3.5 w-3.5 text-blue-500" />;
      case "score_assigned":
        return <Sparkles className="h-3.5 w-3.5 text-amber-500" />;
      default:
        return <Info className="h-3.5 w-3.5 text-muted-foreground" />;
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="relative h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-rose-600 px-1 text-[9px] font-bold text-white shadow-xs">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        className="w-80 sm:w-96 p-0 border border-border bg-popover/98 backdrop-blur-md shadow-xl"
      >
        <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-border">
          <div className="flex items-center gap-1.5">
            <Bell className="h-3.5 w-3.5 text-foreground" />
            <span className="text-xs font-bold text-foreground">Notifications</span>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400">
                {unreadCount} unread
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllMutation.mutate()}
              disabled={markAllMutation.isPending}
              className="h-6 px-2 text-[10.5px] font-medium text-muted-foreground hover:text-foreground gap-1"
            >
              <CheckCheck className="h-3 w-3" />
              <span>Mark all read</span>
            </Button>
          )}
        </div>

        <div className="max-h-[360px] overflow-y-auto divide-y divide-border/60">
          {isLoading ? (
            <div className="p-3 space-y-2.5">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex gap-2.5">
                  <Skeleton className="h-7 w-7 rounded-full shrink-0" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-2.5 w-48" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              <Bell className="h-7 w-7 mx-auto mb-1.5 opacity-30" />
              <p className="text-xs font-semibold text-foreground">All caught up</p>
              <p className="text-[11px] mt-0.5">No notifications at this time.</p>
            </div>
          ) : (
            notifications.map((item) => {
              const timeStr = formatDateTime(item.created_at);

              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`p-3 flex items-start gap-2.5 cursor-pointer transition-colors ${
                    !item.is_read
                      ? "bg-primary/5 hover:bg-primary/10"
                      : "hover:bg-muted/40"
                  }`}
                >
                  <div className="h-7 w-7 rounded-lg bg-muted flex items-center justify-center shrink-0 mt-0.5">
                    {getIcon(item.type)}
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex items-center justify-between">
                      <p
                        className={`text-xs truncate ${
                          !item.is_read
                            ? "font-bold text-foreground"
                            : "font-medium text-foreground"
                        }`}
                      >
                        {item.title}
                      </p>
                      {!item.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0 ml-1.5" />
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                      {item.message}
                    </p>
                    {timeStr && (
                      <p className="text-[9.5px] text-muted-foreground/75 font-mono pt-0.5">
                        {timeStr}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
