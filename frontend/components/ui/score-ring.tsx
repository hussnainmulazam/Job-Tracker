"use client";

import React from "react";
import { motion } from "framer-motion";

interface ScoreRingProps {
  score: number | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  showLabel?: boolean;
  strokeWidth?: number;
  className?: string;
}

export function ScoreRing({
  score,
  size = "md",
  showLabel = true,
  strokeWidth,
  className = "",
}: ScoreRingProps) {
  const dimensions = {
    sm: { size: 36, stroke: 3, text: "text-[10px] font-bold" },
    md: { size: 48, stroke: 4, text: "text-xs font-bold" },
    lg: { size: 72, stroke: 6, text: "text-lg font-extrabold" },
    xl: { size: 96, stroke: 8, text: "text-2xl font-black" },
  }[size];

  const actualStroke = strokeWidth ?? dimensions.stroke;
  const radius = (dimensions.size - actualStroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const validScore = score !== null && score !== undefined ? Math.max(0, Math.min(100, score)) : null;
  const progress = validScore !== null ? (validScore / 100) * circumference : 0;
  const strokeDashoffset = circumference - progress;

  // Color selection based on match score
  let strokeColor = "stroke-slate-300 dark:stroke-slate-700";
  let textColor = "text-muted-foreground";
  let badgeBg = "bg-slate-100 dark:bg-slate-800";

  if (validScore !== null) {
    if (validScore >= 80) {
      strokeColor = "stroke-emerald-500";
      textColor = "text-emerald-600 dark:text-emerald-400";
      badgeBg = "bg-emerald-50 dark:bg-emerald-950/40";
    } else if (validScore >= 60) {
      strokeColor = "stroke-amber-500";
      textColor = "text-amber-600 dark:text-amber-400";
      badgeBg = "bg-amber-50 dark:bg-amber-950/40";
    } else {
      strokeColor = "stroke-rose-500";
      textColor = "text-rose-600 dark:text-rose-400";
      badgeBg = "bg-rose-50 dark:bg-rose-950/40";
    }
  }

  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 ${className}`}
      style={{ width: dimensions.size, height: dimensions.size }}
    >
      <svg
        width={dimensions.size}
        height={dimensions.size}
        className="-rotate-90 transform"
      >
        {/* Track background */}
        <circle
          cx={dimensions.size / 2}
          cy={dimensions.size / 2}
          r={radius}
          className="stroke-muted/40"
          strokeWidth={actualStroke}
          fill="none"
        />
        {/* Animated fill */}
        {validScore !== null && (
          <motion.circle
            cx={dimensions.size / 2}
            cy={dimensions.size / 2}
            r={radius}
            className={strokeColor}
            strokeWidth={actualStroke}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
        )}
      </svg>

      {showLabel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`${dimensions.text} ${textColor}`}>
            {validScore !== null ? Math.round(validScore) : "—"}
          </span>
        </div>
      )}
    </div>
  );
}
