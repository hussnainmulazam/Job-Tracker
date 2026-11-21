"use client";

import React, { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { SetupWizardDialog } from "@/components/setup/setup-wizard-dialog";
import { onboardingApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";

function SetupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const stepParam = searchParams.get("step");
  const initialStep = stepParam ? parseInt(stepParam, 10) : undefined;

  const { data: onboarding, isLoading } = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => onboardingApi.getStatus(),
  });

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-10rem)]">
      {isLoading ? (
        <div className="w-full max-w-4xl p-6 rounded-2xl border border-border bg-card space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-96" />
          <div className="grid grid-cols-4 gap-3 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <SetupWizardDialog
          open={true}
          initialStep={initialStep}
          onboardingData={onboarding}
          onClose={() => router.push("/dashboard")}
          onSuccess={() => router.push("/dashboard")}
        />
      )}
    </div>
  );
}

export default function SetupPage() {
  return (
    <AppShell title="Recruiter Setup Wizard">
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-2xl" />}>
        <SetupContent />
      </Suspense>
    </AppShell>
  );
}
