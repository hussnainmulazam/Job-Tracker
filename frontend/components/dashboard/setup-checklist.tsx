"use client";

import React from "react";
import {
  CheckCircle2,
  Circle,
  Sparkles,
  Lock,
  ArrowRight,
  Briefcase,
  UserCheck,
  Calendar,
  Mail,
  Play,
  RotateCcw,
} from "lucide-react";
import { OnboardingStatusResponse } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface SetupChecklistProps {
  onboarding?: OnboardingStatusResponse | null;
  isLoading?: boolean;
  onResumeSetup: (step?: number) => void;
  onStartAgent: () => void;
  isStartingAgent?: boolean;
}

export function SetupChecklist({
  onboarding,
  isLoading = false,
  onResumeSetup,
  onStartAgent,
  isStartingAgent = false,
}: SetupChecklistProps) {
  // If loading, show clean skeleton card
  if (isLoading) {
    return (
      <div className="rounded-2xl border border-primary/20 bg-card/60 p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-6 w-32" />
        </div>
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // Once both is_completed and agent_started are True, hide the checklist from Dashboard
  if (!onboarding || (onboarding.is_completed && onboarding.agent_started)) {
    return null;
  }

  const {
    can_start_agent,
    completed_steps_count,
    total_steps,
    progress_percentage,
    step_1,
    step_2,
    step_3,
    step_4,
    current_step,
  } = onboarding;

  const stepsList = [
    {
      stepNumber: 1,
      title: "HR & Company Profile",
      description: step_1.completed
        ? `${step_1.hr_name || "HR"} at ${step_1.company_name || "Company"}`
        : "Name, company, role, email tone, and signature",
      icon: UserCheck,
      completed: step_1.completed,
    },
    {
      stepNumber: 2,
      title: "First Job Opening",
      description: step_2.completed
        ? `${step_2.job_title || "Position Requisition"}`
        : "Requisition title, description, and required skills",
      icon: Briefcase,
      completed: step_2.completed,
    },
    {
      stepNumber: 3,
      title: "Availability & Rounds",
      description: step_3.completed
        ? `${step_3.timezone} • ${step_3.slot_duration_minutes}m slots`
        : "Weekly hours and interview duration per round",
      icon: Calendar,
      completed: step_3.completed,
    },
    {
      stepNumber: 4,
      title: "Email Templates",
      description: step_4.completed
        ? "4 lifecycle templates configured"
        : "Ack, Interview invite, Offer, and Rejection",
      icon: Mail,
      completed: step_4.completed,
    },
  ];

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-primary/25 bg-gradient-to-b from-card via-card/95 to-primary/[0.03] p-5 shadow-sm space-y-4">
      {/* Background Accent Glow */}
      <div className="absolute top-0 right-0 -mt-10 -mr-10 h-44 w-44 rounded-full bg-primary/10 blur-3xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="gap-1.5 text-[11px] font-bold bg-primary/10 text-primary border-primary/20 px-2 py-0.5"
            >
              <Sparkles className="h-3 w-3" />
              <span>Setup Wizard Checklist</span>
            </Badge>
            <span className="text-[11px] font-semibold text-muted-foreground">
              {completed_steps_count} of {total_steps} Steps Done ({progress_percentage}%)
            </span>
          </div>
          <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">
            Complete your setup to launch the Recruiter AI Copilot
          </h2>
          <p className="text-xs text-muted-foreground max-w-2xl leading-relaxed">
            Configure your recruiter profile, active requisition, interview calendar, and email templates.
            All steps are saved to the database so you can resume anytime.
          </p>
        </div>

        {/* Top Action Shortcut */}
        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <Button
            size="sm"
            onClick={() => onResumeSetup(current_step)}
            className="h-8 text-xs font-semibold gap-1.5 shadow-xs"
          >
            <span>{completed_steps_count === 0 ? "Start Setup" : "Resume Setup"}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full bg-muted/60 h-2 rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
          style={{ width: `${progress_percentage}%` }}
        />
      </div>

      {/* 4 Interactive Step Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
        {stepsList.map((step) => {
          const StepIcon = step.icon;
          return (
            <div
              key={step.stepNumber}
              onClick={() => onResumeSetup(step.stepNumber)}
              className={`group relative flex flex-col justify-between p-3.5 rounded-xl border transition-all cursor-pointer ${
                step.completed
                  ? "border-emerald-500/30 bg-emerald-500/[0.04] hover:border-emerald-500/50"
                  : "border-border/80 bg-card hover:border-primary/40 hover:shadow-xs"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div
                    className={`h-7 w-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                      step.completed
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors"
                    }`}
                  >
                    <StepIcon className="h-3.5 w-3.5" />
                  </div>
                  {step.completed ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>Complete</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                      <Circle className="h-2.5 w-2.5 fill-amber-500" />
                      <span>Step {step.stepNumber}</span>
                    </span>
                  )}
                </div>

                <h4 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                  {step.stepNumber}. {step.title}
                </h4>
                <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                  {step.description}
                </p>
              </div>

              <div className="pt-3 mt-2 border-t border-border/40 flex items-center justify-between text-[11px]">
                <span className="font-semibold text-primary group-hover:underline">
                  {step.completed ? "Edit Step" : "Configure"}
                </span>
                <ArrowRight className="h-3 w-3 text-primary opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-0.5" />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Gate: "Start Agent" Activation Bar */}
      <div className="pt-3 border-t border-border/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground text-[11px]">
          {can_start_agent ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              All 4 steps completed! You are ready to launch your AI recruiting copilot.
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground font-medium">
              <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              &quot;Start Agent&quot; stays disabled until all four checklist steps are completed.
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={onStartAgent}
            disabled={!can_start_agent || isStartingAgent}
            className={`h-9 px-4 font-bold text-xs gap-1.5 transition-all shadow-sm ${
              can_start_agent
                ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-500/20 ring-2 ring-emerald-400/40 animate-pulse"
                : "opacity-60 cursor-not-allowed"
            }`}
          >
            {can_start_agent ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : (
              <Lock className="h-3.5 w-3.5" />
            )}
            <span>{isStartingAgent ? "Starting Agent..." : "Start Agent"}</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
