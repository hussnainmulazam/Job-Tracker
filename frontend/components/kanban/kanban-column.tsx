"use client";

import React, { useState, useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus, ChevronDown } from "lucide-react";

import { PIPELINE_COLUMNS, PipelineStage } from "./types";
import { KanbanCard } from "./kanban-card";
import { Candidate } from "@/lib/api";
import { Button } from "@/components/ui/button";

const DEFAULT_PAGE_SIZE = 25;

interface KanbanColumnProps {
  column: (typeof PIPELINE_COLUMNS)[number];
  candidates: Candidate[];
  onCardClick: (candidate: Candidate) => void;
  onAddClick: (stage: PipelineStage) => void;
  selectedCandidateIds?: string[];
  onToggleSelect?: (candidateId: string, e: React.MouseEvent) => void;
  onEmail?: (candidate: Candidate) => void;
  onWhatsApp?: (candidate: Candidate) => void;
  onSchedule?: (candidate: Candidate) => void;
}

export function KanbanColumn({
  column,
  candidates,
  onCardClick,
  onAddClick,
  selectedCandidateIds = [],
  onToggleSelect,
  onEmail,
  onWhatsApp,
  onSchedule,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: "Column",
      stage: column.id,
    },
  });

  // Client-side windowing/pagination for high performance when a stage has 100+ candidates
  const [visibleCount, setVisibleCount] = useState(DEFAULT_PAGE_SIZE);

  const displayedCandidates = useMemo(() => {
    return candidates.slice(0, visibleCount);
  }, [candidates, visibleCount]);

  const hasMore = candidates.length > visibleCount;

  return (
    <div
      ref={setNodeRef}
      data-column-id={column.id}
      className={`flex flex-col h-full rounded-2xl border transition-all duration-150 bg-card/40 ${
        isOver
          ? "border-primary bg-primary/[0.04] ring-2 ring-primary/20"
          : "border-border/70 dark:border-white/[0.08]"
      }`}
    >
      {/* Column Header */}
      <div
        className={`px-3 py-2.5 border-b rounded-t-2xl flex items-center justify-between ${column.headerBg} border-border/70 dark:border-white/[0.08]`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className={`h-2 w-2 rounded-full shrink-0 ${column.dotColor}`} />
          <h3 className="font-semibold text-xs text-foreground uppercase tracking-wider truncate">
            {column.title}
          </h3>
          <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-background/90 text-foreground border border-border/60 shrink-0">
            {candidates.length}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddClick(column.id)}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground rounded-md shrink-0"
          title={`Add candidate to ${column.title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Cards List Container */}
      <div className="p-2 flex-1 flex flex-col gap-2 min-h-[320px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div
            onClick={() => onAddClick(column.id)}
            className="flex-1 flex flex-col items-center justify-center p-6 border border-dashed border-border/80 rounded-xl text-center text-xs text-muted-foreground hover:border-primary/40 cursor-pointer transition-colors"
          >
            <p className="font-medium text-foreground/70">
              No candidates
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drag a card here or click +
            </p>
          </div>
        ) : (
          <>
            {displayedCandidates.map((cand) => (
              <KanbanCard
                key={cand.id}
                candidate={cand}
                onClick={onCardClick}
                isSelected={selectedCandidateIds.includes(cand.id)}
                onToggleSelect={onToggleSelect}
                onEmail={onEmail}
                onWhatsApp={onWhatsApp}
                onSchedule={onSchedule}
              />
            ))}

            {hasMore && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setVisibleCount((prev) => prev + DEFAULT_PAGE_SIZE)}
                className="w-full text-xs text-muted-foreground hover:text-foreground h-7 gap-1 mt-1 border border-dashed border-border/70"
              >
                <span>Load {Math.min(DEFAULT_PAGE_SIZE, candidates.length - visibleCount)} more</span>
                <ChevronDown className="h-3 w-3" />
              </Button>
            )}
          </>
        )}
      </div>

      {/* Footer Add Button */}
      <div className="p-2 border-t border-border/60">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddClick(column.id)}
          className="w-full text-xs text-muted-foreground hover:text-foreground justify-center h-7 font-normal"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add candidate
        </Button>
      </div>
    </div>
  );
}
