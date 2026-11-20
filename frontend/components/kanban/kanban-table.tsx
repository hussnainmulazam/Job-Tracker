"use client";

import React, { useState, useMemo } from "react";
import {
  Mail,
  Briefcase,
  Clock,
  Check,
  AlertTriangle,
  MessageCircle,
  Calendar,
  Eye,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
} from "lucide-react";

import { Candidate, CandidateStage } from "@/lib/api";
import { ScoreRing } from "@/components/ui/score-ring";
import { formatRelativeTime } from "@/lib/utils";
import { PIPELINE_COLUMNS, PipelineStage } from "./types";
import { Button } from "@/components/ui/button";

interface KanbanTableProps {
  candidates: Candidate[];
  selectedCandidateIds: string[];
  onToggleSelect: (candidateId: string, e: React.MouseEvent) => void;
  onSelectAll: (candidateIds: string[]) => void;
  onClearSelection: () => void;
  onCardClick: (candidate: Candidate) => void;
  onStageChange: (candidateId: string, newStage: CandidateStage, candidateName: string) => void;
  onEmail?: (candidate: Candidate) => void;
  onWhatsApp?: (candidate: Candidate) => void;
  onSchedule?: (candidate: Candidate) => void;
}

export function KanbanTable({
  candidates,
  selectedCandidateIds,
  onToggleSelect,
  onSelectAll,
  onClearSelection,
  onCardClick,
  onStageChange,
  onEmail,
  onWhatsApp,
  onSchedule,
}: KanbanTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [sortField, setSortField] = useState<"name" | "score" | "updated_at">("updated_at");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  // Sorting
  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => {
      let comparison = 0;
      if (sortField === "name") {
        comparison = (a.name || "").localeCompare(b.name || "");
      } else if (sortField === "score") {
        const scoreA = a.score ?? -1;
        const scoreB = b.score ?? -1;
        comparison = scoreA - scoreB;
      } else if (sortField === "updated_at") {
        const timeA = new Date(a.updated_at || a.created_at).getTime();
        const timeB = new Date(b.updated_at || b.created_at).getTime();
        comparison = timeA - timeB;
      }
      return sortOrder === "asc" ? comparison : -comparison;
    });
  }, [candidates, sortField, sortOrder]);

  // Pagination calculation
  const totalItems = sortedCandidates.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const startIndex = (safePage - 1) * pageSize;
  const pageCandidates = sortedCandidates.slice(startIndex, startIndex + pageSize);

  const isAllCurrentSelected =
    pageCandidates.length > 0 &&
    pageCandidates.every((c) => selectedCandidateIds.includes(c.id));

  const handleToggleSelectAll = () => {
    if (isAllCurrentSelected) {
      onClearSelection();
    } else {
      const pageIds = pageCandidates.map((c) => c.id);
      onSelectAll(Array.from(new Set([...selectedCandidateIds, ...pageIds])));
    }
  };

  const handleSort = (field: "name" | "score" | "updated_at") => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const getStageConfig = (stage: CandidateStage) => {
    return PIPELINE_COLUMNS.find((col) => col.id === stage) || PIPELINE_COLUMNS[0];
  };

  return (
    <div className="flex flex-col h-full rounded-2xl border border-border/70 dark:border-white/[0.08] bg-card overflow-hidden">
      {/* Table Scroll Area */}
      <div className="flex-1 overflow-x-auto overflow-y-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="border-b border-border/80 bg-muted/40 font-semibold text-muted-foreground uppercase text-[10px] tracking-wider select-none sticky top-0 z-10 backdrop-blur-sm">
              <th className="py-2.5 px-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={isAllCurrentSelected}
                  onChange={handleToggleSelectAll}
                  className="rounded border-border h-3.5 w-3.5 text-primary focus:ring-primary cursor-pointer accent-primary"
                  title="Select all on this page"
                />
              </th>
              <th
                onClick={() => handleSort("name")}
                className="py-2.5 px-3 cursor-pointer hover:text-foreground"
              >
                <div className="flex items-center gap-1">
                  <span>Candidate</span>
                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                </div>
              </th>
              <th className="py-2.5 px-3">Requisition</th>
              <th className="py-2.5 px-3">Stage</th>
              <th
                onClick={() => handleSort("score")}
                className="py-2.5 px-3 cursor-pointer hover:text-foreground"
              >
                <div className="flex items-center gap-1">
                  <span>Match Score</span>
                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                </div>
              </th>
              <th className="py-2.5 px-3">Matched Skills</th>
              <th
                onClick={() => handleSort("updated_at")}
                className="py-2.5 px-3 cursor-pointer hover:text-foreground"
              >
                <div className="flex items-center gap-1">
                  <span>Last Activity</span>
                  <ArrowUpDown className="h-3 w-3 opacity-60" />
                </div>
              </th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {pageCandidates.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-12 text-muted-foreground">
                  No candidates match the current filters.
                </td>
              </tr>
            ) : (
              pageCandidates.map((cand) => {
                const isSelected = selectedCandidateIds.includes(cand.id);
                const stageCfg = getStageConfig(cand.stage);
                const topSkills = cand.matched_skills ? cand.matched_skills.slice(0, 3) : [];
                const remainingSkills = Math.max(0, (cand.matched_skills?.length || 0) - 3);

                return (
                  <tr
                    key={cand.id}
                    onClick={() => onCardClick(cand)}
                    className={`group hover:bg-muted/40 transition-colors cursor-pointer ${
                      isSelected ? "bg-primary/[0.04]" : ""
                    }`}
                  >
                    {/* Checkbox */}
                    <td
                      className="py-2.5 px-3 text-center"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          onToggleSelect(cand.id, e as unknown as React.MouseEvent);
                        }}
                        className="rounded border-border h-3.5 w-3.5 text-primary focus:ring-primary cursor-pointer accent-primary"
                      />
                    </td>

                    {/* Candidate Name & Email */}
                    <td className="py-2.5 px-3 min-w-[200px]">
                      <div className="flex items-center gap-2.5">
                        <div className="h-7 w-7 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center text-[11px] shrink-0">
                          {cand.name ? cand.name.charAt(0).toUpperCase() : "C"}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {cand.name}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {cand.email}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Requisition */}
                    <td className="py-2.5 px-3 min-w-[150px]">
                      {cand.opening_title ? (
                        <div className="flex items-center gap-1.5 text-foreground/80 font-medium">
                          <Briefcase className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">{cand.opening_title}</span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground italic text-[11px]">Unassigned</span>
                      )}
                    </td>

                    {/* Stage Selector */}
                    <td className="py-2.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center">
                        <select
                          value={cand.stage}
                          onChange={(e) => {
                            const newStage = e.target.value as CandidateStage;
                            onStageChange(cand.id, newStage, cand.name);
                          }}
                          className={`text-[11px] font-semibold py-1 px-2 rounded-lg border border-border/80 ${stageCfg.headerBg} ${stageCfg.textColor} cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary`}
                        >
                          {PIPELINE_COLUMNS.map((col) => (
                            <option key={col.id} value={col.id} className="bg-popover text-foreground">
                              {col.title}
                            </option>
                          ))}
                        </select>
                      </div>
                    </td>

                    {/* Match Score */}
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <ScoreRing score={cand.score} size="sm" />
                        <span className="font-medium text-[11px] text-foreground/80">
                          {cand.score !== null && cand.score !== undefined ? `${cand.score}%` : "Pending"}
                        </span>
                      </div>
                    </td>

                    {/* Matched Skills */}
                    <td className="py-2.5 px-3 max-w-[220px]">
                      <div className="flex flex-wrap items-center gap-1">
                        {topSkills.map((skill, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-0.5 rounded-md bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground truncate"
                          >
                            <Check className="h-2.5 w-2.5 text-emerald-500 shrink-0" />
                            <span>{skill}</span>
                          </span>
                        ))}
                        {remainingSkills > 0 && (
                          <span className="text-[10px] text-muted-foreground font-medium">
                            +{remainingSkills}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Last Activity */}
                    <td className="py-2.5 px-3 whitespace-nowrap text-muted-foreground text-[11px]">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground/70" />
                        <span>{formatRelativeTime(cand.updated_at || cand.created_at)}</span>
                      </div>
                    </td>

                    {/* Quick Actions */}
                    <td
                      className="py-2.5 px-3 text-right whitespace-nowrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {onEmail && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onEmail(cand)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                            title="Send Email"
                          >
                            <Mail className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {onWhatsApp && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onWhatsApp(cand)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-emerald-500"
                            title="Message on WhatsApp"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                          </Button>
                        )}

                        {onSchedule && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onSchedule(cand)}
                            className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                            title="Schedule Interview"
                          >
                            <Calendar className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onCardClick(cand)}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          title="Open Candidate Drawer"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="p-3 border-t border-border/80 bg-card flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground select-none">
        <div className="flex items-center gap-3">
          <span>
            Showing <strong className="text-foreground">{totalItems === 0 ? 0 : startIndex + 1}</strong> to{" "}
            <strong className="text-foreground">{Math.min(startIndex + pageSize, totalItems)}</strong> of{" "}
            <strong className="text-foreground">{totalItems}</strong> candidates
          </span>

          <div className="flex items-center gap-1.5 ml-2">
            <span>Rows:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setCurrentPage(1);
              }}
              className="text-xs h-6 px-1.5 rounded border border-border/80 bg-background font-medium focus:outline-none"
            >
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            className="h-7 px-2 text-xs gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Previous</span>
          </Button>

          <span className="px-2 text-xs font-medium">
            Page {safePage} of {totalPages}
          </span>

          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            className="h-7 px-2 text-xs gap-1"
          >
            <span>Next</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
