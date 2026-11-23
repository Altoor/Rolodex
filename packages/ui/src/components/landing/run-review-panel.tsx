"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { FieldDescription, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Textarea } from "#components/ui/textarea";
import { Check, RotateCcw } from "lucide-react";
import { useState } from "react";
import type { LandingRun } from "./landing-model";

interface RunReviewPanelProps {
  run: LandingRun;
  busy: boolean;
  error: string | null;
  onAccept: () => Promise<void> | void;
  onRevise: (feedback: string) => Promise<void> | void;
}

/**
 * The whole-flow review shown after an auto-planned run finishes. Accepting
 * closes the run; feedback re-plans the flow and starts a new run.
 */
export function RunReviewPanel({
  run,
  busy,
  error,
  onAccept,
  onRevise,
}: RunReviewPanelProps) {
  const [feedback, setFeedback] = useState("");

  if (run.runReview) {
    const revised = run.runReview.status === "revised";
    return (
      <div className="mt-2 flex flex-col gap-1 rounded-lg border bg-muted/20 p-3">
        <div className="flex items-center gap-2">
          <Badge variant={revised ? "secondary" : "default"}>
            {revised ? "Revised" : "Accepted"}
          </Badge>
          <FieldDescription>
            {revised
              ? "A new run was planned from your feedback."
              : "This run was accepted."}
          </FieldDescription>
        </div>
        {revised && run.runReview.feedback ? (
          <FieldDescription className="text-xs">
            “{run.runReview.feedback}”
          </FieldDescription>
        ) : null}
      </div>
    );
  }

  if (!run.canReview) return null;

  const canRevise = feedback.trim().length > 0;

  return (
    <div className="mt-2 flex w-full max-w-xl flex-col gap-3 rounded-lg border bg-card p-3">
      <div>
        <p className="text-sm font-medium">
          {run.failed
            ? "This run failed before reaching the goal."
            : "Did this run get the result you wanted?"}
        </p>
        <FieldDescription>
          {run.goal
            ? `Goal: ${run.goal}`
            : "Review the whole flow, then accept it or describe what should change."}
        </FieldDescription>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void onAccept()}
        >
          {busy ? <Spinner /> : <Check />}
          Looks right
        </Button>
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel htmlFor={`run-review-${run.runId}`}>
          What should change?
        </FieldLabel>
        <Textarea
          id={`run-review-${run.runId}`}
          value={feedback}
          disabled={busy}
          placeholder="For example: use a separate step to refine the name, or branch the existing decision instead of creating a new one."
          onChange={(event) => setFeedback(event.target.value)}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            disabled={busy || !canRevise}
            onClick={() => void onRevise(feedback.trim())}
          >
            {busy ? <Spinner /> : <RotateCcw />}
            Revise and run again
          </Button>
          {error ? (
            <FieldDescription className="text-destructive">
              {error}
            </FieldDescription>
          ) : null}
        </div>
      </div>
    </div>
  );
}
