import type { ToolInputSchema } from "./tool-schema";
import type { ToolRunContext } from "./tool-context";
import type { ToolExecution } from "./tool-execution";

export type ToolConfig = Record<string, unknown>;

export type ToolInputMode = "text" | "json";

export type ToolOutputType = "normal" | "foreach";

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

export interface Tool {
  definition: ToolDefinition;
  execute(context: ToolRunContext): Promise<ToolExecution>;
}
