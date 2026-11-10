import type { ToolConfig, ToolOutputType } from "./tool";
import type { ToolStateEntry } from "./tool-state";

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
}
