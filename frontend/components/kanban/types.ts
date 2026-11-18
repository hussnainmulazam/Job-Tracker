import { Candidate, CandidateStage } from "@/lib/api";

export type PipelineStage = CandidateStage;

export const PIPELINE_COLUMNS: {
  id: PipelineStage;
  title: string;
  accentColor: string;
  headerBg: string;
  dotColor: string;
  textColor: string;
}[] = [
  {
    id: "applied",
    title: "Applied",
    accentColor: "border-blue-500/20",
    headerBg: "bg-blue-500/10",
    dotColor: "bg-blue-500",
    textColor: "text-blue-600 dark:text-blue-400",
  },
  {
    id: "screening",
    title: "AI Screening",
    accentColor: "border-purple-500/20",
    headerBg: "bg-purple-500/10",
    dotColor: "bg-purple-500",
    textColor: "text-purple-600 dark:text-purple-400",
  },
  {
    id: "interview",
    title: "Interview",
    accentColor: "border-amber-500/20",
    headerBg: "bg-amber-500/10",
    dotColor: "bg-amber-500",
    textColor: "text-amber-600 dark:text-amber-400",
  },
  {
    id: "offer",
    title: "Offer",
    accentColor: "border-emerald-500/20",
    headerBg: "bg-emerald-500/10",
    dotColor: "bg-emerald-500",
    textColor: "text-emerald-600 dark:text-emerald-400",
  },
  {
    id: "rejected",
    title: "Rejected",
    accentColor: "border-rose-500/20",
    headerBg: "bg-rose-500/10",
    dotColor: "bg-rose-500",
    textColor: "text-rose-600 dark:text-rose-400",
  },
];
