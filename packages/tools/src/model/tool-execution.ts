import type { ToolStateEntry, ToolStateEntryInput } from "./tool-state";

export interface ToolExecution {
  /** Arbitrary JSON stored as `queuedTasks.result.output`. */
  output: unknown;
  /** Short human-readable description shown in the queue UI. */
  summary: string;

  /** Append entries to the next step's toolState. */
  toolStateAppend?: ToolStateEntryInput | ToolStateEntryInput[];

  /** Replace the whole toolState (used by filter_tool_state). */
  toolState?: ToolStateEntry[];

  /** Replacement state. Only append_state/set_state should set this. */
  nextState?: string;

  /** Clear toolState after applying the above. Defaults to false. */
  clearToolState?: boolean;

  /**
   * Append `output` to the next toolState. Defaults to the task's
   * `toolConfig.appendState` flag.
   */
  appendOutput?: boolean;

  /** Used when context.outputType === "foreach". */
  foreach?: {
    items: ToolStateEntryInput[];
    /** Optional per-fan-out next task override. */
    nextTaskId?: number | null;
  };

  /** Optional explicit next task; otherwise the queue uses fallbackTaskId. */
  nextTaskId?: number | null;

  /**
   * Conditional tools (currently `if`) use this instead of `nextTaskId`.
   * The processor maps "true"/"false" to task.onTrueTaskId/onFalseTaskId.
   */
  branch?: "true" | "false";

  /** If set, the next queued step inherits this generation model. */
  nextModel?: string | null;
  /** If set, the next queued step inherits this decision model. */
  nextDecisionModel?: string | null;
}
