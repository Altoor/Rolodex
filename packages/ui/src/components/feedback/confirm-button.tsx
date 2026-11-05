"use client";

import { Button } from "#components/ui/button";
import { cn } from "cn";
import { useState } from "react";

interface ConfirmButtonProps {
  /** Accessible name and tooltip for the icon-only trigger. */
  title: string;
  onConfirm: () => void;
  children: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Two-step confirmation for destructive icon-only actions. The first click
 * reveals explicit Confirm/Cancel buttons instead of deleting immediately.
 */
export function ConfirmButton({
  title,
  onConfirm,
  children,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  className,
  disabled,
}: ConfirmButtonProps) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        title={title}
        aria-label={title}
        disabled={disabled}
        className={cn(
          "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
          className,
        )}
        onClick={() => setConfirming(true)}
      >
        {children}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        variant="destructive"
        size="xs"
        onClick={() => {
          setConfirming(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setConfirming(false)}
      >
        {cancelLabel}
      </Button>
    </div>
  );
}
