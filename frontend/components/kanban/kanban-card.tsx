"use client";

import React from "react";
import { useDraggable } from "@dnd-kit/core";
import { motion } from "framer-motion";
import {
  Mail,
  Briefcase,
  GripVertical,
  Check,
  AlertTriangle,
  Sparkles,
} from "lucide-react";

import { Candidate } from "@/lib/api";
import { ScoreRing } from "@/components/ui/score-ring";

interface KanbanCardProps {
  candidate: Candidate;
  onClick?: (candidate: Candidate) => void;
  isOverlay?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (candidateId: string, e: React.MouseEvent) => void;
}

export function KanbanCard({
  candidate,
  onClick,
  isOverlay = false,
  isSelected = false,
  onToggleSelect,
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

  const topSkills = candidate.matched_skills.slice(0, 3);
  const remainingSkillsCount = Math.max(0, candidate.matched_skills.length - 3);

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
      className={`group relative select-none rounded-lg border bg-card p-3 shadow-xs transition-all duration-150 hover:shadow-card-hover hover:border-border cursor-grab active:cursor-grabbing ${
        isDragging
          ? "opacity-30 border-dashed border-primary"
          : isOverlay
          ? "shadow-dropdown border-primary scale-105 rotate-1 z-50 ring-1.5 ring-primary/40 bg-card"
          : isSelected
          ? "border-primary bg-primary/5 ring-1 ring-primary/40"
          : "border-border/70 dark:border-white/[0.08]"
      }`}
    >
      {/* Selection checkbox */}
      {onToggleSelect && !isOverlay && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(candidate.id, e);
          }}
          className={`absolute top-2.5 right-2.5 z-10 h-4.5 w-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer ${
            isSelected
              ? "bg-primary border-primary text-primary-foreground"
              : "border-border bg-background/80 opacity-0 group-hover:opacity-100 hover:border-primary"
          }`}
          title={isSelected ? "Deselect" : "Select candidate"}
        >
          {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
        </div>
      )}

      {/* Card Header: Candidate Name, Score Ring & Grip */}
      <div className="flex items-start justify-between gap-2 mb-2 pr-5">
        <div className="flex items-center gap-2.5 min-w-0">
          <ScoreRing score={candidate.score} size="sm" />
          <div className="truncate">
            <h4
              onClick={(e) => {
                e.stopPropagation();
                onClick?.(candidate);
              }}
              className="font-bold text-xs text-foreground truncate group-hover:text-primary transition-colors cursor-pointer"
            >
              {candidate.name}
            </h4>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
              <Mail className="h-3 w-3 shrink-0" />
              {candidate.email}
            </span>
          </div>
        </div>
      </div>

      {/* Opening / Role badge */}
      {candidate.opening_title && (
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-foreground/80 mb-2.5 truncate">
          <Briefcase className="h-3 w-3 text-primary shrink-0" />
          <span className="truncate">{candidate.opening_title}</span>
        </div>
      )}

      {/* Matched Skills Chips */}
      {topSkills.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 mb-2.5">
          {topSkills.map((skill, index) => (
            <span
              key={index}
              className="inline-flex items-center gap-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground"
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
        <div className="flex items-center gap-1.5 rounded-md bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-600 dark:text-rose-400">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span className="truncate font-semibold">
            {candidate.red_flags.length} red flag{candidate.red_flags.length === 1 ? "" : "s"}
          </span>
        </div>
      )}
    </div>
  );
}
