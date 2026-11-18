import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message = "Failed to load live data from the server. Please check your connection and try again.",
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl border border-destructive/20 bg-destructive/5 backdrop-blur-xs ${className}`}
    >
      <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-destructive/10 text-destructive flex items-center justify-center mb-4 shadow-xs">
        <AlertCircle className="h-6 w-6 sm:h-7 sm:w-7" />
      </div>

      <h3 className="text-base sm:text-lg font-bold text-foreground mb-1.5">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
        {message}
      </p>

      {onRetry && (
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          className="font-semibold gap-2 border-destructive/30 hover:bg-destructive/10"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Retry</span>
        </Button>
      )}
    </div>
  );
}
