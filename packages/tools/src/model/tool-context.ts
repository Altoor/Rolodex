import type { ToolConfig, ToolOutputType } from "./tool";
import type { ToolStateEntry } from "./tool-state";

/** The terminal outcome of one foreach branch, exposed to a join task. */
export interface ToolBranchResult {
  /** Per-item ordinal, used for deterministic ordering. */
  index: number;
  queuedTaskId: number;
  taskId: number;
  taskName: string | null;
  status: "completed" | "failed";
  /** The branch's last step result. */
  result: unknown;
  toolState: ToolStateEntry[];
  state: string;
}

/** Present when a tool executes as a foreach join barrier. */
export interface ToolForkContext {
  groupId: string;
  branches: ToolBranchResult[];
}

export interface ToolRunContext {
  userId: number;
  runId: string;
  taskId: number;
  queuedTaskId: number;
  /** Raw queued task state (the user's free-text input). */
  state: string;
  /** Accumulated structured output from previous steps. */
  toolState: ToolStateEntry[];
  /** Output mode selected on the task. */
  outputType: ToolOutputType;
  /** The task's `toolConfig` JSON, or null. */
  config: ToolConfig | null;
  /**
   * Generation model inherited from the queued step or task, if any. Tools
   * that call `runPrompt` fall back to the user's default generation model
   * when this is null.
   */
  model: string | null;
  /**
   * System One decision model inherited from the queued step or task, if any.
   * Tools that select with `ollama.systemone` fall back to the user's default
   * decision model when this is null.
   */
  decisionModel: string | null;
  /** Set when this step is the join barrier of a foreach fan-out. */
  fork?: ToolForkContext;
}
