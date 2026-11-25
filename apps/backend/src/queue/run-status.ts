export type StandardRunOutcome = "completed" | "failed";

function wasRetried(result: unknown): boolean {
  return (
    typeof result === "object" &&
    result !== null &&
    (result as { retried?: unknown }).retried === true
  );
}

/**
 * A standard run is failed when at least one failed step was not replaced by a
 * retry. A successful retry leaves the original failed row in history, but it
 * no longer decides the run outcome.
 */
export function standardRunOutcome(
  failedStepResults: unknown[],
): StandardRunOutcome {
  return failedStepResults.some((result) => !wasRetried(result))
    ? "failed"
    : "completed";
}
