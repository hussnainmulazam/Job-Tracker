"use client";

import Link from "next/link";
import { FileQuestion, ArrowLeft, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4 text-center">
      <div className="h-14 w-14 rounded-2xl bg-muted flex items-center justify-center text-muted-foreground mb-4 ring-8 ring-muted/50">
        <FileQuestion className="h-7 w-7" />
      </div>
      <h1 className="text-xl font-bold tracking-tight">Page Not Found</h1>
      <p className="text-xs text-muted-foreground mt-2 max-w-sm leading-relaxed">
        The page you are looking for does not exist, has been removed, or is temporarily unavailable.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => window.location.reload()}
          className="text-xs gap-1.5 h-8 font-medium"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          <span>Try again</span>
        </Button>
        <Link href="/dashboard">
          <Button size="sm" className="text-xs gap-1.5 h-8 font-medium">
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Return to Dashboard</span>
          </Button>
        </Link>
      </div>
    </div>
  );
}
