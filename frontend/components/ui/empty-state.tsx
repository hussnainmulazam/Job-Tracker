import React from "react";
import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40 backdrop-blur-xs ${className}`}
    >
      <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-4 shadow-xs">
        <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
      </div>

      <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white mb-1.5">
        {title}
      </h3>

      <p className="text-xs sm:text-sm text-muted-foreground max-w-sm mb-6 leading-relaxed">
        {description}
      </p>

      {(actionText || secondaryActionText) && (
        <div className="flex flex-wrap items-center justify-center gap-3">
          {actionText && onAction && (
            <Button size="sm" onClick={onAction} className="font-semibold shadow-xs">
              {actionText}
            </Button>
          )}

          {secondaryActionText && onSecondaryAction && (
            <Button size="sm" variant="outline" onClick={onSecondaryAction}>
              {secondaryActionText}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

