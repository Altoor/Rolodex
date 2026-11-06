export type ToolConfig = Record<string, unknown>;

export type ToolInputMode = "text" | "json";

export interface ToolInputProperty {
  type: "string" | "number" | "boolean" | "object";
  description: string;
  enum?: string[];
  default?: unknown;
}

export interface ToolInputSchema {
  type: "object";
  properties: Record<string, ToolInputProperty>;
  required?: string[];
}

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
  /** The task's `toolConfig` JSON, or null. */
  config: ToolConfig | null;
  /**
   * Model inherited from the queued step or task, if any. This may be null.
   * The prompt tool must not fall back to the user's default model.
   */
  model: string | null;
}

export interface ToolExecution {
  /** Arbitrary JSON stored as `queuedTasks.result.output`. */
  output: unknown;
  /** Short human-readable description shown in the queue UI. */
  summary: string;
  /** Text appended to the next queue step's state. */
  stateAppend?: string;
  /**
   * Whether to append `stateAppend`/`summary` to the next step's state.
   * When omitted, the queue falls back to `toolConfig.appendState`.
   */
  appendState?: boolean;
  /** Optional explicit next task; otherwise the queue uses fallbackTaskId. */
  nextTaskId?: number | null;
  /** If set, the next queued step inherits this model. */
  nextModel?: string | null;
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
