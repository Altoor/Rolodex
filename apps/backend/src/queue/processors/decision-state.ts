import {
  isPlainObject,
  readPath,
  serializeToolState,
  type ToolStateEntry,
} from "@repo/tools";
import { parseDecisionStateConfig } from "../../schema/task/task/decision-state-config";

/**
 * Builds the `state` string sent to the System One decision model.
 *
 * Tool state is added only to this prompt. The queued row's state/toolState are
 * left untouched, so downstream tasks keep the normal run state.
 */
export function buildDecisionModelState(
  state: string,
  toolState: ToolStateEntry[],
  config: unknown,
): string {
  const parsed = parseDecisionStateConfig(config);

  if (!parsed || parsed.mode === "none" || toolState.length === 0) {
    return state;
  }

  if (parsed.mode === "all") {
    return `${state}\n\nTool state:\n${serializeToolState(toolState)}`;
  }

  const runtime: Record<string, unknown> = {};

  for (const entry of toolState) {
    if (isPlainObject(entry)) Object.assign(runtime, entry);
  }

  const selected: Record<string, unknown> = {};

  for (const path of parsed.paths) {
    const value = readPath(runtime, path);
    if (value !== undefined) selected[path] = value;
  }

  if (Object.keys(selected).length === 0) return state;

  return `${state}\n\nSelected tool state:\n${JSON.stringify(selected, null, 2)}`;
}
