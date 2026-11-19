"use client";

import { Badge } from "#components/ui/badge";
import { Button } from "#components/ui/button";
import { FieldDescription, FieldLabel } from "#components/ui/field";
import { Spinner } from "#components/ui/spinner";
import { Check, PencilLine, X } from "lucide-react";
import { useState } from "react";
import {
  useDecisionReview,
  type DecisionReviewContext,
} from "./use-decision-review";

interface DecisionReviewPanelProps {
  queuedTaskId: number;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

function describeAnswer(value: unknown): string | null {
  const record = asRecord(value);
  if (!record) return null;

  if (record.type === "choice" && typeof record.choice === "string") {
    const confidence =
      typeof record.confidence === "number"
        ? ` · confidence ${record.confidence.toFixed(2)}`
        : "";
    return `choice: ${record.choice}${confidence}`;
  }

  if (record.type === "score" && typeof record.score === "number") {
    const confidence =
      typeof record.confidence === "number"
        ? ` · confidence ${record.confidence.toFixed(2)}`
        : "";
    return `score: ${record.score.toFixed(2)}${confidence}`;
  }

  if (record.type === "noul" && typeof record.noul === "number") {
    return `noul: ${record.noul.toFixed(2)}`;
  }

  return null;
}

function reviewStatus(context: DecisionReviewContext): string | null {
  const review = asRecord(context.review);
  if (!review) return null;
  return typeof review.status === "string" ? review.status : null;
}

function BiasBadge({ bias }: { bias: number | null }) {
  if (bias == null || bias === 0) return null;
  const text = bias > 0 ? `+${bias.toFixed(3)}` : bias.toFixed(3);
  return (
    <Badge variant={bias > 0 ? "secondary" : "destructive"} className="tabular-nums">
      bias {text}
    </Badge>
  );
}

/** Review a completed decision step and nudge the decision's learned biases. */
export function DecisionReviewPanel({
  queuedTaskId,
}: DecisionReviewPanelProps) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="xs"
        className="ml-6"
        onClick={() => setOpen(true)}
      >
        <PencilLine /> Review decision
      </Button>
    );
  }

  return (
    <DecisionReviewContent
      queuedTaskId={queuedTaskId}
      onClose={() => setOpen(false)}
    />
  );
}

function DecisionReviewContent({
  queuedTaskId,
  onClose,
}: {
  queuedTaskId: number;
  onClose: () => void;
}) {
  const { context, loading, error, saving, saveError, reviewed, submit, refetch } =
    useDecisionReview({ queuedTaskId, enabled: true });
  const [actualResultId, setActualResultId] = useState<number | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="ml-6 mt-2 flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner /> Loading the decision…
      </div>
    );
  }

  if (error || !context) {
    return (
      <div className="ml-6 mt-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
        <p className="font-medium text-destructive">
          Could not load this decision
        </p>
        <p className="text-muted-foreground">
          {error instanceof Error ? error.message : "No review data returned."}
        </p>
        <Button
          type="button"
          variant="outline"
          size="xs"
          className="mt-2"
          onClick={onClose}
        >
          Close
        </Button>
      </div>
    );
  }

  const raw = describeAnswer(context.rawAnswer);
  const effective = describeAnswer(context.effectiveAnswer);
  const existingStatus = status ?? reviewStatus(context);
  const results = context.results ?? [];

  const save = async (correct: boolean) => {
    if (!correct && actualResultId == null) return;
    const review = await submit(correct, correct ? null : actualResultId);
    const record = asRecord(review);
    setStatus(
      correct
        ? "correct"
        : typeof record?.status === "string"
          ? record.status
          : "wrong",
    );
    await refetch();
  };

  return (
    <div className="ml-6 mt-2 flex w-full max-w-xl flex-col gap-3 rounded-lg border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{context.decisionName}</p>
          <FieldDescription>{context.decisionPremise}</FieldDescription>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          onClick={onClose}
          aria-label="Close review"
        >
          <X />
        </Button>
      </div>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {raw ? <p>Model answer: {raw}</p> : null}
        {effective && effective !== raw ? <p>After bias: {effective}</p> : null}
        {context.model ? <p>Decision model: {context.model}</p> : null}
        {existingStatus ? (
          <p>
            Reviewed as{" "}
            <span className="font-medium text-foreground">
              {existingStatus}
            </span>
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>What should have happened?</FieldLabel>
        {results.length === 0 ? (
          <FieldDescription>
            This decision has no results yet. Add one in the task builder, then
            come back.
          </FieldDescription>
        ) : null}
        {results.map((result) => {
          const selected = result.id === actualResultId;
          return (
            <button
              key={result.id}
              type="button"
              disabled={saving}
              onClick={() =>
                setActualResultId(result.id === actualResultId ? null : result.id)
              }
              className={`flex w-full items-start justify-between gap-2 rounded-lg border p-2 text-left text-xs transition-colors ${
                selected
                  ? "border-primary bg-primary/5"
                  : "border-border hover:bg-muted"
              }`}
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-1 font-medium">
                  {result.label}
                  {result.matched ? (
                    <Badge variant="secondary">Selected</Badge>
                  ) : null}
                  <BiasBadge bias={result.bias} />
                </span>
                <span className="text-muted-foreground">
                  {result.targetTaskName
                    ? `→ ${result.targetTaskName}`
                    : "no target (ends the run)"}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {saveError ? (
        <p className="text-xs text-destructive">
          {saveError instanceof Error ? saveError.message : String(saveError)}
        </p>
      ) : null}
      {reviewed ? (
        <FieldDescription>
          Saved. Future runs of this decision will lean toward your correction.
        </FieldDescription>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={saving}
          onClick={() => void save(true)}
        >
          {saving ? <Spinner /> : <Check />}
          This was right
        </Button>
        <Button
          type="button"
          disabled={saving || actualResultId == null}
          onClick={() => void save(false)}
        >
          {saving ? <Spinner /> : <PencilLine />}
          This was wrong
        </Button>
      </div>

      <FieldDescription>
        Wrong choices nudge the option scores a little.{" "}
        <a
          className="underline underline-offset-4"
          href={`/task-queue?taskId=${context.taskId}`}
        >
          Correct result is missing?
        </a>
      </FieldDescription>
    </div>
  );
}
