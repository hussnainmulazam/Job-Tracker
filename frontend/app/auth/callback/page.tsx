"use client";

import React, { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { setAuthToken } from "@/lib/api";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      router.replace(`/login?error=${encodeURIComponent(error)}`);
      return;
    }

    const token = searchParams.get("token");
    const setupCompleted = searchParams.get("setup_completed") === "true";

    if (token) {
      // 1. Save in cookie via route handler
      fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      }).finally(() => {
        // 2. Persist access token in localStorage for client-side API requests
        setAuthToken(token);

        // 3. Navigate: setup incomplete -> /setup, returning user -> /dashboard
        const destination = setupCompleted ? "/dashboard" : "/setup";
        window.location.href = destination;
      });
    } else {
      router.replace(
        "/login?error=" + encodeURIComponent("Google authentication failed. No token received.")
      );
    }
  }, [router, searchParams]);

  return (
    <div className="flex h-screen w-full items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground font-medium">Completing Google sign-in...</p>
      </div>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <CallbackHandler />
    </Suspense>
  );
}
