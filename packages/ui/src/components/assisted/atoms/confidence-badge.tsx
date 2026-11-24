"use client";

import { Badge } from "#components/ui/badge";

interface ConfidenceBadgeProps {
  value: unknown;
}

/**
 * Confidence is semantic, not a generic badge variant: values below the 0.8
 * assisted floor must read as a warning everywhere they appear.
 */
export function ConfidenceBadge({ value }: ConfidenceBadgeProps) {
  if (typeof value !== "number") return null;

  const confident = value >= 0.8;
  return (
    <Badge
      variant="outline"
      className={
        confident
          ? "border-confidence-high/40 text-confidence-high"
          : "border-confidence-low/40 bg-confidence-low/10 text-confidence-low"
      }
    >
      confidence {value.toFixed(2)}
    </Badge>
  );
}
