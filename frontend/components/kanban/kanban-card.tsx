"use client";

import React, { memo } from "react";
import { useDraggable } from "@dnd-kit/core";
import {
  Mail,
  Briefcase,
  Clock,
  Check,
  AlertTriangle,
  MessageCircle,
  Calendar,
} from "lucide-react";

import { Candidate } from "@/lib/api";
import { ScoreRing } from "@/components/ui/score-ring";
import { formatRelativeTime } from "@/lib/utils";

interface KanbanCardProps {
  candidate: Candidate;
  onClick?: (candidate: Candidate) => void;
  isOverlay?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (candidateId: string, e: React.MouseEvent) => void;
  onEmail?: (candidate: Candidate) => void;
  onWhatsApp?: (candidate: Candidate) => void;
  onSchedule?: (candidate: Candidate) => void;
}

export const KanbanCard = memo(function KanbanCard({
  candidate,
  onClick,
  isOverlay = false,
  isSelected = false,
  onToggleSelect,
  onEmail,
  onWhatsApp,
  onSchedule,
}: KanbanCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging,
  } = useDraggable({
    id: candidate.id,
    data: {
      type: "Candidate",
      candidate,
    },
    disabled: isOverlay,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const topSkills = candidate.matched_skills ? candidate.matched_skills.slice(0, 3) : [];
  const remainingSkillsCount = Math.max(0, (candidate.matched_skills?.length || 0) - 3);
  const lastActivityTime = formatRelativeTime(candidate.updated_at || candidate.created_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid="kanban-card"
      data-candidate-name={candidate.name}
      {...attributes}
      {...listeners}
      onClick={() => {
        if (!isDragging && onClick) {
          onClick(candidate);
        }
      }}
      className={`group relative select-none rounded-xl border bg-card p-3 shadow-xs transition-all duration-150 hover:shadow-md cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-30 border-dashed border-primary"
          : isOverlay
          ? "shadow-dropdown border-primary scale-105 rotate-1 z-50 ring-1.5 ring-primary/40 bg-card"
          : isSelected
          ? "border-primary bg-primary/[0.03] ring-1.5 ring-primary/40"
          : "border-border/70 dark:border-white/[0.08] hover:border-border"
      }`}
    >
      {/* Top Action Row: Checkbox */}
      {onToggleSelect && !isOverlay && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(candidate.id, e);
          }}
          className={`absolute top-2.5 right-2.5 z-10 h-4.5 w-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border bg-background/90 opacity-0 group-hover:opacity-100 hover:border-primary"
          }`}
          title={isSelected ? "Deselect" : "Select candidate"}
        >
          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
        </div>
      )}

      {/* Card Header: Candidate Name, Email & Score Ring */}
      <div className="flex items-start justify-between gap-2.5 mb-2 pr-6">
        <div className="flex items-center gap-2.5 min-w-0">
          <ScoreRing score={candidate.score} size="sm" />
          <div className="truncate">
            <h4
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(candidate);
              }}
              className="font-semibold text-xs text-foreground truncate group-hover:text-primary transition-colors cursor-pointer"
            >
              {candidate.name}
            </h4>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate mt-0.5">
              <Mail className="h-3 w-3 shrink-0" />
              {candidate.email}
            </span>
          </div>
        </div>
      </div>

      {/* Opening / Role badge */}
      {candidate.opening_title && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/85 mb-1.5 truncate">
          <Briefcase className="h-3 w-3 text-primary shrink-0" />
          <span className="truncate">{candidate.opening_title}</span>
        </div>
      )}

      {/* Pipeline Agent Status Pill */}
      {candidate.extracted_data && (candidate.extracted_data as any).pipeline_status && (
        <div className="flex items-center gap-1 mb-2">
          {(() => {
            const rawStatus = String((candidate.extracted_data as any).pipeline_status);
            const isAttention = rawStatus === "NEEDS_ATTENTION";
            const isScheduled = rawStatus.includes("SCHEDULED");
            const isScheduling = rawStatus.includes("SCHEDULING");
            const isOffer = rawStatus.includes("OFFER");
            const isReview = rawStatus === "HR_REVIEW" || rawStatus.includes("DECISION");

            const badgeColor = isAttention
              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25"
              : isScheduled
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25"
              : isOffer
              ? "bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/25"
              : isReview
              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25"
              : isScheduling
              ? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25"
              : "bg-primary/10 text-primary border-primary/20";

            return (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9.5px] font-semibold tracking-wide border ${badgeColor}`}
                title={`Pipeline Stage: ${rawStatus}`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current shrink-0 animate-pulse" />
                <span className="truncate">{rawStatus.replace(/_/g, " ")}</span>
              </span>
            );
          })()}
        </div>
      )}

      {/* Matched Skills Chips */}
      {topSkills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {topSkills.map((skill, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-0.5 rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground"
            >
              <Check className="h-2.5 w-2.5 text-emerald-500" />
              <span>{skill}</span>
            </span>
          ))}
          {remainingSkillsCount > 0 && (
            <span className="inline-flex rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              +{remainingSkillsCount}
            </span>
          )}
        </div>
      )}

      {/* Red Flags Alert if present */}
      {candidate.red_flags && candidate.red_flags.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-600 dark:text-rose-400 mb-2">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate font-semibold">
            {candidate.red_flags.length} red flag{candidate.red_flags.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Card Footer: Last Activity & Quick Actions */}
      <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
        <div className="flex items-center gap-1 font-medium text-[10px]">
          <Clock className="h-2.5 w-2.5 text-muted-foreground/80 shrink-0" />
          <span>{lastActivityTime}</span>
        </div>

        {/* Quick Actions (Email, WhatsApp, Schedule) */}
        {!isOverlay && (
          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
            {onEmail && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEmail(candidate);
                }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/80 transition-colors"
                title="Send Email via Gmail"
              >
                <Mail className="h-3 w-3" />
              </button>
            )}

            {onWhatsApp && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onWhatsApp(candidate);
                }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                title="Message on WhatsApp"
              >
                <MessageCircle className="h-3 w-3" />
              </button>
            )}

            {onSchedule && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSchedule(candidate);
                }}
                className="h-6 w-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                title="Schedule Interview"
              >
                <Calendar className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
});
