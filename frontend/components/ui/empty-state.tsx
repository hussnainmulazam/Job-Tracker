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
      className={`flex flex-col items-center justify-center text-center p-8 sm:p-12 rounded-xl border border-dashed border-border/70 bg-card/30 dark:bg-card/15 backdrop-blur-xs ${className}`}
    >
      <div className="h-10 w-10 sm:h-11 sm:w-11 rounded-lg bg-muted/70 text-foreground/80 flex items-center justify-center mb-3.5 border border-border/50 shadow-xs">
        <Icon className="h-5 w-5" />
      </div>

      <h3 className="text-sm sm:text-base font-semibold tracking-tight text-foreground mb-1">
        {title}
      </h3>

      <p className="text-xs text-muted-foreground max-w-sm mb-5 leading-relaxed">
        {description}
      </p>

      {(actionText || secondaryActionText) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {actionText && onAction && (
            <Button size="sm" onClick={onAction} className="font-medium shadow-xs">
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

