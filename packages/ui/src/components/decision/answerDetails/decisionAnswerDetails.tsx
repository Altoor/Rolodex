import { Badge } from "#components/ui/badge";
import { readDecisionAnswer, type SystemOneAnswer } from "../decision-answer";

interface DecisionAnswerDetailsProps {
  answer?: unknown;
  model?: string | null;
  note?: string | null;
}

function MetricRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="truncate text-muted-foreground">{label}</span>
      <span className="shrink-0 font-mono">{value}</span>
    </div>
  );
}

function ProbabilityList({
  answer,
}: {
  answer: Extract<SystemOneAnswer, { type: "choice" | "score" }>;
}) {
  const labels =
    answer.type === "score" ? answer.legend : ({} as Record<string, string>);

  return (
    <div className="mt-2 flex flex-col gap-1">
      {Object.entries(answer.probabilities).map(([option, probability]) => (
        <MetricRow
          key={option}
          label={labels[option] ?? option}
          value={probability.toFixed(2)}
        />
      ))}
    </div>
  );
}

/**
 * Shows the model's raw decision output when a decision task did not satisfy
 * its result thresholds and is asking the user to choose a path manually.
 */
export function DecisionAnswerDetails({
  answer,
  model,
  note,
}: DecisionAnswerDetailsProps) {
  const parsed = readDecisionAnswer(answer);

  if (!parsed && !note) return null;

  return (
    <div className="rounded-md border bg-muted/30 p-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Model answer</span>
        {parsed ? <Badge variant="outline">{parsed.type}</Badge> : null}
        {model ? <span className="text-muted-foreground">{model}</span> : null}
      </div>

      {parsed?.type === "choice" ? (
        <div className="mt-2 flex flex-col gap-1">
          {parsed.choice ? (
            <MetricRow label="Choice" value={parsed.choice} />
          ) : null}
          <MetricRow label="Confidence" value={parsed.confidence.toFixed(2)} />
          <ProbabilityList answer={parsed} />
        </div>
      ) : null}

      {parsed?.type === "score" ? (
        <div className="mt-2 flex flex-col gap-1">
          <MetricRow label="Score" value={parsed.score.toFixed(2)} />
          <MetricRow label="Confidence" value={parsed.confidence.toFixed(2)} />
          <ProbabilityList answer={parsed} />
        </div>
      ) : null}

      {parsed?.type === "noul" ? (
        <div className="mt-2 flex flex-col gap-1">
          <MetricRow label="Noul" value={parsed.noul.toFixed(2)} />
        </div>
      ) : null}

      {note ? (
        <p className="mt-2 text-muted-foreground" role="note">
          {note}
        </p>
      ) : null}
    </div>
  );
}

export default DecisionAnswerDetails;
