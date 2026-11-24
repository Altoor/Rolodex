import { GitCompare } from "lucide-react";
import { Badge } from "#components/ui/badge";
import { FieldDescription } from "#components/ui/field";
import { diffDecision } from "../domain/decision-diff";
import type { SnapshotDecision } from "../types";

interface DecisionChangesProps {
  previous: SnapshotDecision | null | undefined;
  current: SnapshotDecision | null | undefined;
  revision: Record<string, unknown> | null;
}

function revisionLabel(revision: Record<string, unknown> | null): string | null {
  const kind = revision?.kind;
  if (kind === "optimizeDecision") return "Wording optimized";
  if (kind === "addDecisionOption") {
    const option = revision?.option;
    return typeof option === "string" && option.trim()
      ? `New option: ${option}`
      : "New option added";
  }
  if (kind === "updateToolConfig") return "Tool configuration updated";
  if (kind === "replaceTask") return "Task replaced";
  if (kind === "runNext") return "Skipped to the next task";
  if (kind === "insertBefore") return "Inserted a task before";
  if (kind === "insertAfter") return "Inserted a task after";
  if (kind === "insertBeforeAndAfter") return "Inserted tasks around this step";
  return typeof kind === "string" ? kind : null;
}

function RevisionValue({
  label,
  value,
  tone = "before",
}: {
  label: string;
  value: string | undefined;
  tone?: "before" | "after";
}) {
  return (
    <div className="min-w-0">
      <div
        className={
          tone === "before"
            ? "text-xs font-medium text-diff-remove"
            : "text-xs font-medium text-diff-add"
        }
      >
        {label}
      </div>
      <p className="mt-0.5 text-xs break-words whitespace-pre-wrap">
        {value?.trim() ? value : <span className="text-muted-foreground">(empty)</span>}
      </p>
    </div>
  );
}

/**
 * Shows the decision definition delta between the previous attempt and the
 * revised one. Without this, optimization looks like an unexplained model call
 * even though it changed the premise, instruction, or option descriptions.
 */
export function DecisionChanges({
  previous,
  current,
  revision,
}: DecisionChangesProps) {
  const diff = diffDecision(previous, current);
  const label = revisionLabel(revision);
  const feedback =
    typeof revision?.feedback === "string" && revision.feedback.trim()
      ? revision.feedback.trim()
      : null;

  // Tool/task revisions have no decision snapshot to compare.
  if (!diff.hasChanges && label == null) return null;

  return (
    <section className="rounded-md border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <GitCompare className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">What changed</span>
        {label ? <Badge variant="outline">{label}</Badge> : null}
      </div>

      {feedback ? (
        <FieldDescription className="mt-1 text-xs">
          Your note: {feedback}
        </FieldDescription>
      ) : null}

      {diff.hasChanges ? (
        <div className="mt-2 flex flex-col gap-2">
          {diff.fields.map((field) => (
            <div
              key={field.field}
              className="rounded border bg-background p-2"
            >
              <div className="text-xs font-medium">{field.label}</div>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                <RevisionValue label="Before" value={field.before} />
                <RevisionValue label="After" value={field.after} tone="after" />
              </div>
            </div>
          ))}

          {diff.options.map((change) => (
            <div
              key={`${change.kind}:${change.option}`}
              className="rounded border bg-background p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    change.kind === "removed"
                      ? "destructive"
                      : change.kind === "added"
                        ? "default"
                        : "secondary"
                  }
                >
                  {change.kind === "added"
                    ? "Added option"
                    : change.kind === "removed"
                      ? "Removed option"
                      : "Description"}
                </Badge>
                <span className="text-xs font-medium break-words">
                  {change.option}
                </span>
              </div>
              {change.kind === "description" ? (
                <div className="mt-1 grid gap-2 sm:grid-cols-2">
                  <RevisionValue label="Before" value={change.before} />
                  <RevisionValue
                    label="After"
                    value={change.after}
                    tone="after"
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <FieldDescription className="mt-2 text-xs">
          The decision wording is identical to the previous attempt.
        </FieldDescription>
      )}
    </section>
  );
}
