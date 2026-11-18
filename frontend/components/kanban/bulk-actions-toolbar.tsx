"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckSquare,
  ArrowRight,
  Sparkles,
  Trash2,
  Download,
  X,
  Layers,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CandidateStage } from "@/lib/api";

interface BulkActionsToolbarProps {
  selectedCount: number;
  onMoveStage: (stage: CandidateStage) => void;
  onBulkScore?: () => void;
  onExportCsv?: () => void;
  onDelete: () => void;
  onClear: () => void;
  isProcessing?: boolean;
}

const STAGES: { stage: CandidateStage; label: string }[] = [
  { stage: "applied", label: "Applied" },
  { stage: "screening", label: "AI Screening" },
  { stage: "interview", label: "Interview" },
  { stage: "offer", label: "Offer" },
  { stage: "rejected", label: "Rejected" },
];

export function BulkActionsToolbar({
  selectedCount,
  onMoveStage,
  onBulkScore,
  onExportCsv,
  onDelete,
  onClear,
  isProcessing = false,
}: BulkActionsToolbarProps) {
  if (selectedCount === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.95 }}
        transition={{ duration: 0.2 }}
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 rounded-2xl border border-border bg-popover/95 px-4 py-2.5 shadow-2xl backdrop-blur-md"
      >
        <div className="flex items-center gap-2 pr-2 border-r border-border">
          <div className="h-6 w-6 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-bold text-xs">
            {selectedCount}
          </div>
          <span className="text-xs font-semibold text-foreground whitespace-nowrap">
            Selected
          </span>
        </div>

        {/* Move Stage Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isProcessing}
              className="h-8 gap-1.5 text-xs font-semibold"
            >
              <Layers className="h-3.5 w-3.5 text-primary" />
              <span>Move Stage</span>
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="w-44">
            <DropdownMenuLabel className="text-[10px] uppercase font-bold text-muted-foreground">
              Transition to
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STAGES.map((s) => (
              <DropdownMenuItem
                key={s.stage}
                onClick={() => onMoveStage(s.stage)}
                className="text-xs cursor-pointer capitalize font-medium"
              >
                <span>{s.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Bulk AI Scoring */}
        {onBulkScore && (
          <Button
            variant="outline"
            size="sm"
            onClick={onBulkScore}
            disabled={isProcessing}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span className="hidden sm:inline">AI Score</span>
          </Button>
        )}

        {/* Export CSV */}
        {onExportCsv && (
          <Button
            variant="outline"
            size="sm"
            onClick={onExportCsv}
            disabled={isProcessing}
            className="h-8 gap-1.5 text-xs font-semibold"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Export CSV</span>
          </Button>
        )}

        {/* Delete */}
        <Button
          variant="outline"
          size="sm"
          onClick={onDelete}
          disabled={isProcessing}
          className="h-8 gap-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/30"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Delete</span>
        </Button>

        {/* Clear selection */}
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground ml-1"
          title="Deselect all"
        >
          <X className="h-4 w-4" />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
