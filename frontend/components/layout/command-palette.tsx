"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Kanban,
  Briefcase,
  Sparkles,
  Scale,
  Settings,
  Plus,
  Moon,
  Sun,
  Search,
  User,
  Calendar,
  MessageSquare,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { searchApi, candidatesApi, jobOpeningsApi } from "@/lib/api";
import { useTheme } from "@/components/theme-provider";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpenAddCandidate?: () => void;
  onOpenCreateOpening?: () => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  onOpenAddCandidate,
  onOpenCreateOpening,
}: CommandPaletteProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState("");

  // Global search from backend API
  const { data: searchResults, isLoading } = useQuery({
    queryKey: ["global-search", query],
    queryFn: () => searchApi.search(query),
    enabled: open && query.trim().length > 0,
    staleTime: 5000,
  });

  // Default candidates & openings for empty query
  const { data: candidatesData } = useQuery({
    queryKey: ["command-candidates"],
    queryFn: () => candidatesApi.list({ limit: 15 }),
    enabled: open && !query,
  });
  const recentCandidates = candidatesData?.items || [];

  const { data: openingsData } = useQuery({
    queryKey: ["command-openings"],
    queryFn: () => jobOpeningsApi.list(),
    enabled: open && !query,
  });
  const recentOpenings = openingsData?.items || [];

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };

    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const handleSelect = (callback: () => void) => {
    onOpenChange(false);
    callback();
  };

  const hasSearchQuery = query.trim().length > 0;
  const candidatesList = hasSearchQuery
    ? searchResults?.candidates || []
    : recentCandidates.map((c) => ({
        id: c.id,
        type: "candidate" as const,
        title: c.name,
        subtitle: `${c.opening_title || "Requisition"} • ${c.email}`,
        link: `/pipeline?candidate_id=${c.id}`,
        score: c.score,
        stage_or_status: c.stage,
        matched_skills: c.matched_skills.slice(0, 3),
      }));

  const openingsList = hasSearchQuery
    ? searchResults?.openings || []
    : recentOpenings.slice(0, 6).map((o) => ({
        id: o.id,
        type: "opening" as const,
        title: o.title,
        subtitle: `Status: ${o.status}`,
        link: `/openings/${o.id}`,
        stage_or_status: o.status,
        matched_skills: o.required_skills.slice(0, 3),
      }));

  const quickActions = [
    {
      label: "Recruiting Dashboard",
      icon: LayoutDashboard,
      href: "/dashboard",
    },
    {
      label: "Candidate Pipeline (Kanban)",
      icon: Kanban,
      href: "/pipeline",
    },
    {
      label: "Recruiting Inbox (Email)",
      icon: MessageSquare,
      href: "/inbox",
    },
    {
      label: "Interviews Calendar",
      icon: Calendar,
      href: "/interviews",
    },
    {
      label: "Job Requisitions",
      icon: Briefcase,
      href: "/openings",
    },
    {
      label: "AI Screening & Questions",
      icon: Sparkles,
      href: "/screening",
    },
    {
      label: "Candidate Compare",
      icon: Scale,
      href: "/compare",
    },
    {
      label: "Settings & Integrations",
      icon: Settings,
      href: "/settings",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-xl border border-border bg-background/98 backdrop-blur-md shadow-2xl">
        <Command className="[&_[cmdk-root]]:border-0" shouldFilter={false}>
          <div className="flex items-center border-b border-border px-3.5 py-2.5">
            <Search className="mr-2.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              placeholder="Search talent, requisitions, or jump to page... (⌘K)"
              value={query}
              onValueChange={setQuery}
              className="flex h-8 w-full rounded-md bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            <kbd className="pointer-events-none hidden sm:inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
              ESC
            </kbd>
          </div>

          <Command.List className="max-h-[360px] overflow-y-auto p-2 text-sm divide-y divide-border/40">
            {isLoading && (
              <div className="py-4 text-center text-xs text-muted-foreground animate-pulse">
                Searching candidate database...
              </div>
            )}

            {!isLoading && hasSearchQuery && candidatesList.length === 0 && openingsList.length === 0 && (
              <Command.Empty className="py-8 text-center text-xs text-muted-foreground">
                No matching candidates or job requisitions found.
              </Command.Empty>
            )}

            {/* Quick Actions (when no search or matching) */}
            {!hasSearchQuery && (
              <Command.Group
                heading="Actions"
                className="px-1 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {onOpenAddCandidate && (
                  <Command.Item
                    onSelect={() => handleSelect(() => onOpenAddCandidate())}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <Plus className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold">Add Candidate</span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                      Upload PDF
                    </span>
                  </Command.Item>
                )}

                {onOpenCreateOpening && (
                  <Command.Item
                    onSelect={() => handleSelect(() => onOpenCreateOpening())}
                    className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <Briefcase className="h-3.5 w-3.5 text-primary" />
                    <span className="font-semibold">New Job Opening</span>
                    <span className="ml-auto text-[10px] text-muted-foreground font-mono">
                      Requisition
                    </span>
                  </Command.Item>
                )}
              </Command.Group>
            )}

            {/* Candidates */}
            {candidatesList.length > 0 && (
              <Command.Group
                heading={`Candidates (${candidatesList.length})`}
                className="px-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {candidatesList.map((cand) => (
                  <Command.Item
                    key={cand.id}
                    onSelect={() => handleSelect(() => router.push(cand.link))}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-xs shrink-0">
                        {cand.title.charAt(0).toUpperCase()}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold text-foreground truncate">{cand.title}</p>
                        <p className="text-[10.5px] text-muted-foreground truncate">
                          {cand.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {cand.score !== null && cand.score !== undefined && (
                        <span className="text-[10.5px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          {Math.round(cand.score)}%
                        </span>
                      )}
                      {cand.stage_or_status && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-muted font-medium text-muted-foreground capitalize">
                          {cand.stage_or_status}
                        </span>
                      )}
                    </div>
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Job Openings */}
            {openingsList.length > 0 && (
              <Command.Group
                heading={`Requisitions (${openingsList.length})`}
                className="px-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {openingsList.map((op) => (
                  <Command.Item
                    key={op.id}
                    onSelect={() => handleSelect(() => router.push(op.link))}
                    className="flex items-center justify-between rounded-lg px-2.5 py-2 text-xs cursor-pointer hover:bg-accent aria-selected:bg-accent"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Briefcase className="h-4 w-4 text-purple-600 dark:text-purple-400 shrink-0" />
                      <div className="space-y-0.5 min-w-0">
                        <p className="font-bold text-foreground truncate">{op.title}</p>
                        <p className="text-[10.5px] text-muted-foreground">{op.subtitle}</p>
                      </div>
                    </div>
                    <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  </Command.Item>
                ))}
              </Command.Group>
            )}

            {/* Navigation Quick Links */}
            {!hasSearchQuery && (
              <Command.Group
                heading="Navigation"
                className="px-1 pt-2 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground"
              >
                {quickActions.map((act) => {
                  const Icon = act.icon;
                  return (
                    <Command.Item
                      key={act.href}
                      onSelect={() => handleSelect(() => router.push(act.href))}
                      className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-xs text-foreground cursor-pointer hover:bg-accent aria-selected:bg-accent"
                    >
                      <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{act.label}</span>
                      <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground/60" />
                    </Command.Item>
                  );
                })}
              </Command.Group>
            )}
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
