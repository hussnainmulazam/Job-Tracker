"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Global application error:", error);

    const isChunkError =
      error?.name === "ChunkLoadError" ||
      error?.message?.includes("Loading chunk") ||
      error?.message?.includes("ChunkLoadError");

    if (isChunkError && typeof window !== "undefined") {
      const storageKey = "last_global_chunk_reload";
      const lastReload = sessionStorage.getItem(storageKey);
      const now = Date.now();
      if (!lastReload || now - parseInt(lastReload, 10) > 8000) {
        sessionStorage.setItem(storageKey, String(now));
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="font-sans antialiased bg-background text-foreground min-h-screen flex items-center justify-center p-6">
        <div className="flex flex-col items-center justify-center text-center max-w-md">
          <div className="h-16 w-16 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 ring-8 ring-destructive/5">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">
            Application Error
          </h1>
          <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
            A critical application error occurred. You can attempt to recover by clicking below.
          </p>
          {error?.digest && (
            <p className="text-xs text-muted-foreground/60 mt-1 font-mono">
              Error Digest: {error.digest}
            </p>
          )}
          <div className="mt-6 flex items-center gap-3">
            <Button
              onClick={() => reset()}
              size="sm"
              className="gap-2 font-medium"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Try again</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => (window.location.href = "/")}
            >
              Go to Home
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
