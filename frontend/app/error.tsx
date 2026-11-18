"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to console or error reporting service
    console.error("Application runtime error:", error);

    // Auto-recover from chunk load errors (happens when server recompiles while client tab is open)
    const isChunkError =
      error?.name === "ChunkLoadError" ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("ChunkLoadError");

    if (isChunkError && typeof window !== "undefined") {
      const storageKey = "last_chunk_reload";
      const lastReload = sessionStorage.getItem(storageKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 8000) {
        sessionStorage.setItem(storageKey, String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="h-14 w-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 ring-8 ring-destructive/5">
        <AlertTriangle className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight text-foreground">
        Something went wrong
      </h1>
      <p className="text-xs text-muted-foreground mt-2 max-w-md leading-relaxed">
        {error?.message ||
          "An unexpected error occurred while rendering this page. You can try refreshing or resetting the view."}
      </p>

      {error?.digest && (
        <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
          Error ID: {error.digest}
        </p>
      )}

      <div className="flex items-center gap-3 mt-6">
        <Button
          onClick={() => reset()}
          size="sm"
          className="text-xs gap-1.5 h-8 font-medium"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Try again</span>
        </Button>
        <Link href="/dashboard">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 h-8 font-medium"
          >
            <Home className="h-3.5 w-3.5" />
            <span>Dashboard</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
