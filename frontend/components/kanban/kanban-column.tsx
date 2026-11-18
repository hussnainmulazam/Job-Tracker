"use client";

import React from "react";
import { useDroppable } from "@dnd-kit/core";
import { Plus } from "lucide-react";

import { PIPELINE_COLUMNS, PipelineStage } from "./types";
import { KanbanCard } from "./kanban-card";
import { Candidate } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface KanbanColumnProps {
  column: (typeof PIPELINE_COLUMNS)[number];
  candidates: Candidate[];
  onCardClick: (candidate: Candidate) => void;
  onAddClick: (stage: PipelineStage) => void;
  selectedCandidateIds?: string[];
  onToggleSelect?: (candidateId: string, e: React.MouseEvent) => void;
}

export function KanbanColumn({
  column,
  candidates,
  onCardClick,
  onAddClick,
  selectedCandidateIds = [],
  onToggleSelect,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: column.id,
    data: {
      type: "Column",
      stage: column.id,
    },
  });

  return (
    <div
      ref={setNodeRef}
      data-column-id={column.id}
      className={`flex flex-col h-full rounded-2xl border transition-colors duration-150 bg-card/40 ${
        isOver
          ? "border-primary bg-primary/5 ring-2 ring-primary/20"
          : "border-border"
      }`}
    >
      {/* Column Header */}
      <div
        className={`p-3.5 border-b rounded-t-2xl flex items-center justify-between ${column.headerBg} border-border`}
      >
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${column.dotColor}`} />
          <h3 className="font-bold text-xs text-foreground uppercase tracking-wider">
            {column.title}
          </h3>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-background/80 text-foreground border border-border">
            {candidates.length}
          </span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddClick(column.id)}
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground rounded-md"
          title={`Add candidate to ${column.title}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Cards List Container */}
      <div className="p-2.5 flex-1 flex flex-col gap-2.5 min-h-[320px] overflow-y-auto">
        {candidates.length === 0 ? (
          <div
            onClick={() => onAddClick(column.id)}
            className="flex-1 flex flex-col items-center justify-center p-6 border-2 border-dashed border-border/80 rounded-xl text-center text-xs text-muted-foreground hover:border-primary/40 cursor-pointer transition-colors"
          >
            <p className="font-semibold text-foreground/70">
              No candidates
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Drag a card here or click +
            </p>
          </div>
        ) : (
          candidates.map((cand) => (
            <KanbanCard
              key={cand.id}
              candidate={cand}
              onClick={onCardClick}
              isSelected={selectedCandidateIds.includes(cand.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>

      {/* Footer Add Button */}
      <div className="p-2 border-t border-border/60">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onAddClick(column.id)}
          className="w-full text-xs text-muted-foreground hover:text-foreground justify-center h-7"
        >
          <Plus className="h-3 w-3 mr-1" />
          Add candidate
        </Button>
      </div>
    </div>
  );
}
