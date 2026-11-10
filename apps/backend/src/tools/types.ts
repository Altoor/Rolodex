export type ToolConfig = Record<string, unknown>;

export type ToolInputMode = "text" | "json";

export type ToolOutputType = "normal" | "foreach";

export interface ToolInputProperty {
  type:
    | "string"
    | "number"
    | "boolean"
    | "object"
    | "array"
    | "any";
  description: string;
  enum?: string[];
  default?: unknown;
  properties?: Record<string, ToolInputProperty>;
  items?: ToolInputProperty;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolInputProperty>;
  required?: string[];
}

/**
 * One accumulated tool-state value. Entries are stored exactly as the tool
 * returned them; there is no surrounding tool/task metadata.
 */
export type ToolStateEntry = unknown;

/** What a tool appends; the processor stores it as-is. */
export type ToolStateEntryInput = unknown;

export interface ToolDefinition {
  /** Stable identifier stored on tasks, e.g. "prompt" or "find_todo". */
  key: string;
  /** Human-readable name shown on the tools page. */
  name: string;
  description: string;
  category: "ai" | "todo";
  inputMode: ToolInputMode;
  inputSchema: ToolInputSchema;
  outputDescription: string;
  /** Output modes this tool supports. Defaults to ["normal"]. */
  outputTypes?: ToolOutputType[];
  /** Additional description shown when foreach output is selected. */
  foreachOutputDescription?: string;
  /** Example `toolConfig` the tools page can display. */
  exampleConfig?: ToolConfig | null;
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
}

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

  /** @deprecated Use toolStateAppend. Converted by the processor. */
  stateAppend?: string;
  /** @deprecated Now means "append output to toolState". */
  appendState?: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  execute(context: ToolRunContext): Promise<ToolExecution>;
}

export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolInputError";
  }
}
