"use client";

import React, { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { KanbanBoard } from "@/components/kanban/kanban-board";
import { Skeleton } from "@/components/ui/skeleton";

function PipelineContent() {
  const searchParams = useSearchParams();
  const selectedCandidateId = searchParams.get("candidate_id") || undefined;

  return <KanbanBoard defaultSelectedCandidateId={selectedCandidateId} />;
}

export default function PipelinePage() {
  return (
    <AppShell title="Candidate Pipeline">
      <Suspense
        fallback={
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-4 h-96">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-full rounded-2xl" />
            ))}
          </div>
        }
      >
        <PipelineContent />
      </Suspense>
    </AppShell>
  );
}
