import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL, getAuthToken } from "@/lib/api";

export interface AgentEventPayload {
  event:
    | "connected"
    | "cv_received"
    | "ai_scanning"
    | "scored"
    | "email_sent"
    | "interview_scheduled"
    | "status_changed"
    | string;
  payload?: any;
  timestamp?: string;
}

export function useAgentEvents(options?: {
  onEvent?: (event: AgentEventPayload) => void;
  enabled?: boolean;
}) {
  const queryClient = useQueryClient();
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (options?.enabled === false) return;
    if (typeof window === "undefined") return;

    const token = getAuthToken();
    if (!token) return;

    let isUnmounted = false;

    function connect() {
      if (isUnmounted) return;
      const currentToken = getAuthToken();
      if (!currentToken) return;

      const url = `${API_BASE_URL}/api/v1/pipeline-agent/events?token=${encodeURIComponent(currentToken)}`;
      const es = new EventSource(url);
      eventSourceRef.current = es;

      es.onmessage = (e) => {
        try {
          const data: AgentEventPayload = JSON.parse(e.data);
          if (options?.onEvent) {
            options.onEvent(data);
          }

          // Invalidate relevant React Query caches based on event type
          if (
            data.event === "status_changed" ||
            data.event === "scored" ||
            data.event === "cv_received"
          ) {
            queryClient.invalidateQueries({ queryKey: ["cvReviewQueue"] });
            queryClient.invalidateQueries({ queryKey: ["candidates"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
            queryClient.invalidateQueries({ queryKey: ["pipeline-agent-status"] });
          } else if (data.event === "email_sent") {
            queryClient.invalidateQueries({ queryKey: ["email-conversations"] });
            queryClient.invalidateQueries({ queryKey: ["thread"] });
          } else if (
            data.event === "interview_scheduled" ||
            data.event === "interview_rescheduled" ||
            data.event === "interview_cancelled" ||
            data.event === "calendar_updated"
          ) {
            queryClient.invalidateQueries({ queryKey: ["calendar-events"] });
            queryClient.invalidateQueries({ queryKey: ["interviews-all"] });
            queryClient.invalidateQueries({ queryKey: ["interviewsList"] });
            queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
          }
        } catch {
          // ignore heartbeats/comments
        }
      };

      es.onerror = () => {
        es.close();
        if (!isUnmounted) {
          reconnectTimeoutRef.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [queryClient, options?.enabled]);
}
