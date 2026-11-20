"use client";

import React, { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Scale,
  Briefcase,
  Users,
  Check,
  X,
  Sparkles,
  ArrowLeftRight,
  UserCheck,
} from "lucide-react";
import {
  jobOpeningsApi,
  candidatesApi,
  JobOpening,
  Candidate,
  CandidateStage,
} from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScoreRing } from "@/components/ui/score-ring";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/use-toast";

const STAGE_LABELS: Record<CandidateStage, string> = {
  applied: "Applied",
  screening: "AI Screening",
  shortlisted: "Shortlisted",
  contacted: "Contacted",
  scheduled: "Scheduled",
  interview: "Interview",
  interviewed: "Interviewed",
  offer: "Offer",
  rejected: "Rejected",
};

interface CompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialOpeningId?: string;
}

export function CompareDialog({
  open,
  onOpenChange,
  initialOpeningId,
}: CompareDialogProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [selectedOpeningId, setSelectedOpeningId] = useState<string>(initialOpeningId || "");
  const [candidateAId, setCandidateAId] = useState<string>("");
  const [candidateBId, setCandidateBId] = useState<string>("");

  // 1. Fetch Job Openings
  const { data: openingsData, isLoading: openingsLoading } = useQuery({
    queryKey: ["job-openings"],
    queryFn: () => jobOpeningsApi.list("active", 100),
    enabled: open,
  });
  const openings = openingsData?.items || [];

  const activeOpeningId = selectedOpeningId || initialOpeningId || openings[0]?.id || "";
  const activeOpening = openings.find((op) => op.id === activeOpeningId);

  // 2. Fetch Candidates for the active opening
  const {
    data: candidatesData,
    isLoading: candidatesLoading,
  } = useQuery({
    queryKey: ["candidates", activeOpeningId],
    queryFn: () => candidatesApi.list({ opening_id: activeOpeningId, limit: 100 }),
    enabled: open && !!activeOpeningId,
  });
  const candidates = candidatesData?.items || [];

  // Select candidates A and B
  const candidateA = useMemo(() => {
    if (candidateAId) {
      return candidates.find((c) => c.id === candidateAId) || null;
    }
    return candidates[0] || null;
  }, [candidates, candidateAId]);

  const candidateB = useMemo(() => {
    if (candidateBId) {
      return candidates.find((c) => c.id === candidateBId) || null;
    }
    return candidates.find((c) => c.id !== candidateA?.id) || candidates[1] || null;
  }, [candidates, candidateBId, candidateA]);

  // Stage mutation
  const stageMutation = useMutation({
    mutationFn: ({ id, stage }: { id: string; stage: CandidateStage }) =>
      candidatesApi.updateStage(id, stage),
    onSuccess: (updated) => {
      toast({
        title: "Candidate Updated",
        description: `${updated.name} has been moved to ${STAGE_LABELS[updated.stage]}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (err: any) => {
      toast({
        title: "Action Failed",
        description: err.message || "Failed to update candidate stage.",
        variant: "destructive",
      });
    },
  });

  // Calculate skill intersections
  const commonMatchedSkills = useMemo(() => {
    if (!candidateA || !candidateB) return [];
    return candidateA.matched_skills.filter((s) =>
      candidateB.matched_skills.includes(s)
    );
  }, [candidateA, candidateB]);

  const candidateAUniqueSkills = useMemo(() => {
    if (!candidateA || !candidateB) return [];
    return candidateA.matched_skills.filter(
      (s) => !candidateB.matched_skills.includes(s)
    );
  }, [candidateA, candidateB]);

  const candidateBUniqueSkills = useMemo(() => {
    if (!candidateA || !candidateB) return [];
    return candidateB.matched_skills.filter(
      (s) => !candidateA.matched_skills.includes(s)
    );
  }, [candidateA, candidateB]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <Scale className="w-4 h-4" />
            </div>
            <div>
              <DialogTitle>Compare Candidates</DialogTitle>
              <DialogDescription>
                Side-by-side evaluation of skills, AI match scores, and qualification fit.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Requisition Selector */}
        <div className="flex items-center justify-between gap-4 p-3 bg-muted/30 rounded-xl border border-border/60">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Requisition:</span>
            <select
              value={activeOpeningId}
              onChange={(e) => {
                setSelectedOpeningId(e.target.value);
                setCandidateAId("");
                setCandidateBId("");
              }}
              className="text-xs bg-background border border-border rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {openings.map((op) => (
                <option key={op.id} value={op.id}>
                  {op.title}
                </option>
              ))}
            </select>
          </div>
          <Badge variant="outline" className="font-mono text-xs">
            {candidates.length} Applicants in Opening
          </Badge>
        </div>

        {candidates.length < 2 ? (
          <EmptyState
            icon={Users}
            title="Need at least 2 candidates"
            description="Add or ingest more candidates for this job requisition to perform a side-by-side comparison."
          />
        ) : (
          <div className="space-y-6 pt-2">
            {/* Candidate Selector Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Candidate A</label>
                <select
                  value={candidateA?.id || ""}
                  onChange={(e) => setCandidateAId(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-lg p-2 font-medium"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.score != null ? `(${c.score}%)` : ""} — {STAGE_LABELS[c.stage]}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted-foreground">Candidate B</label>
                <select
                  value={candidateB?.id || ""}
                  onChange={(e) => setCandidateBId(e.target.value)}
                  className="w-full text-xs bg-background border border-border rounded-lg p-2 font-medium"
                >
                  {candidates.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.score != null ? `(${c.score}%)` : ""} — {STAGE_LABELS[c.stage]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comparison Cards Side-by-Side */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Candidate A Card */}
              {candidateA && (
                <Card className="border border-border/80 shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-bold">{candidateA.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{candidateA.email}</p>
                      </div>
                      <ScoreRing score={candidateA.score} size="md" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Stage</span>
                      <Badge variant="outline">{STAGE_LABELS[candidateA.stage]}</Badge>
                    </div>

                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Matched Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {candidateA.matched_skills.map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Missing Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {candidateA.missing_skills.map((skill, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] text-muted-foreground">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {candidateA.summary && (
                      <div className="p-2.5 rounded-lg bg-muted/40 text-[11px] text-muted-foreground leading-relaxed">
                        {candidateA.summary}
                      </div>
                    )}

                    <div className="pt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs flex-1 gap-1"
                        onClick={() => stageMutation.mutate({ id: candidateA.id, stage: "shortlisted" })}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Shortlist</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1 text-rose-500 hover:bg-rose-500/10"
                        onClick={() => stageMutation.mutate({ id: candidateA.id, stage: "rejected" })}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Candidate B Card */}
              {candidateB && (
                <Card className="border border-border/80 shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-base font-bold">{candidateB.name}</CardTitle>
                        <p className="text-xs text-muted-foreground">{candidateB.email}</p>
                      </div>
                      <ScoreRing score={candidateB.score} size="md" />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 text-xs">
                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Stage</span>
                      <Badge variant="outline">{STAGE_LABELS[candidateB.stage]}</Badge>
                    </div>

                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Matched Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {candidateB.matched_skills.map((skill, idx) => (
                          <Badge key={idx} variant="secondary" className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-semibold text-muted-foreground block mb-1">Missing Skills</span>
                      <div className="flex flex-wrap gap-1">
                        {candidateB.missing_skills.map((skill, idx) => (
                          <Badge key={idx} variant="outline" className="text-[10px] text-muted-foreground">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    {candidateB.summary && (
                      <div className="p-2.5 rounded-lg bg-muted/40 text-[11px] text-muted-foreground leading-relaxed">
                        {candidateB.summary}
                      </div>
                    )}

                    <div className="pt-2 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        className="h-7 text-xs flex-1 gap-1"
                        onClick={() => stageMutation.mutate({ id: candidateB.id, stage: "shortlisted" })}
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        <span>Shortlist</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs flex-1 text-rose-500 hover:bg-rose-500/10"
                        onClick={() => stageMutation.mutate({ id: candidateB.id, stage: "rejected" })}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>Reject</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Differential Skills Summary */}
            <div className="p-4 rounded-xl bg-muted/30 border border-border/60 space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-foreground">
                <ArrowLeftRight className="w-4 h-4 text-primary" />
                <span>Skill Differential Breakdown</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Both Have ({commonMatchedSkills.length}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {commonMatchedSkills.map((s, idx) => (
                      <Badge key={idx} variant="secondary" className="text-[10px]">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Only {candidateA?.name} Has ({candidateAUniqueSkills.length}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {candidateAUniqueSkills.map((s, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <span className="text-[11px] font-semibold text-muted-foreground block mb-1">
                    Only {candidateB?.name} Has ({candidateBUniqueSkills.length}):
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {candidateBUniqueSkills.map((s, idx) => (
                      <Badge key={idx} variant="outline" className="text-[10px] border-sky-500/40 text-sky-600">
                        {s}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
