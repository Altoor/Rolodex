import type { ToolInputSchema } from "./tool-schema";
import type { ToolRunContext } from "./tool-context";
import type { ToolExecution } from "./tool-execution";

export type ToolConfig = Record<string, unknown>;

export type ToolInputMode = "text" | "json";

export type ToolOutputType = "normal" | "foreach";

/** Ollama model slots a tool may call while executing. */
export type ToolModelRole = "generation" | "decision" | "vision" | "embedding";

export interface ToolDefinition {
  /** Stable identifier stored on tasks, e.g. "prompt" or "find_todo". */
  key: string;
  /** Human-readable name shown on the tools page. */
  name: string;
  description: string;
  category: "ai" | "todo" | "file" | "ui";
  inputMode: ToolInputMode;
  inputSchema: ToolInputSchema;
  outputDescription: string;
  /** Output modes this tool supports. Defaults to ["normal"]. */
  outputTypes?: ToolOutputType[];
  /** Additional description shown when foreach output is selected. */
  foreachOutputDescription?: string;
  /**
   * True when executing this tool can call a model service (Ollama, Whisper,
   * vision/OCR, embeddings). Model-backed tools default to exclusive queue
   * execution because they compete for the same backend.
   */
  usesModel?: boolean;
  /**
   * Model slots this tool may call. The queue uses this to preload models
   * before execution. Omit for deterministic tools.
   */
  modelRoles?: ToolModelRole[];
  /** Example `toolConfig` the tools page can display. */
  exampleConfig?: ToolConfig | null;
  /**
   * True when all of the tool's effects are covered by the trial workspace
   * (database rows and the files tree). Set `false` for a tool that calls an
   * external service or mutates something the trial cannot roll back; assisted
   * runs reject it instead of pretending the effect was sandboxed.
   */
  trialSafe?: boolean;
}

export interface Tool {
  definition: ToolDefinition;
  execute(context: ToolRunContext): Promise<ToolExecution>;
}
