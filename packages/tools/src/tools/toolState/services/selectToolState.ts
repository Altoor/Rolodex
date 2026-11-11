import type { ToolStateEntry } from "../../../model";
import { readPath, replacePath } from "../../../utils";
import {
  evaluateExpression,
  type WhereExpression,
} from "../../../conditions/where";

export type SelectionMode = "whitelist" | "blacklist";

export interface SelectToolStateOptions {
  /** Optional path to an array (or, when allowed, a single value) inside each entry. */
  path?: string;
  /** Optional condition evaluated per entry, or per item when `path` is set. */
  where?: WhereExpression;
  /** Whitelist keeps matches; blacklist removes matches. Defaults to whitelist. */
  mode?: SelectionMode;
  /**
   * Treat a non-array value at `path` as a single selectable item. Used by
   * display_block so it can show one scalar or object; filter_tool_state
   * intentionally keeps its array-only contract.
   */
  allowScalar?: boolean;
}

export interface SelectToolStateResult {
  /** Kept entries. With `path`, each entry has the matched items in place. */
  entries: ToolStateEntry[];
  /** Flat list of kept items (or entries when `path` is omitted). */
  items: unknown[];
  kept: number;
  removed: number;
  scope: "entries" | "items";
}

/**
 * Shared selection used by display_block and filter_tool_state. It never
 * mutates the source toolState.
 */
export function selectToolState(
  toolState: ToolStateEntry[],
  options: SelectToolStateOptions,
): SelectToolStateResult {
  const mode = options.mode ?? "whitelist";
  const { where, path } = options;

  if (path === undefined) {
    const entries = toolState.filter((entry) => {
      const matched = where ? evaluateExpression(entry, where) : true;
      return mode === "whitelist" ? matched : !matched;
    });

    return {
      entries,
      items: entries,
      kept: entries.length,
      removed: toolState.length - entries.length,
      scope: "entries",
    };
  }

  const entries: ToolStateEntry[] = [];
  const items: unknown[] = [];
  let kept = 0;
  let removed = 0;

  for (const entry of toolState) {
    const value = readPath(entry, path);

    if (!Array.isArray(value)) {
      if (!options.allowScalar || value === undefined) continue;

      const matched = where ? evaluateExpression(value, where) : true;
      const keep = mode === "whitelist" ? matched : !matched;

      if (keep) {
        entries.push(entry);
        items.push(value);
        kept += 1;
      } else {
        removed += 1;
      }
      continue;
    }

    const matches = value.filter((item) => {
      const matched = where ? evaluateExpression(item, where) : true;
      return mode === "whitelist" ? matched : !matched;
    });

    kept += matches.length;
    removed += value.length - matches.length;

    if (matches.length === 0) continue;

    entries.push(replacePath(entry, path, matches));
    items.push(...matches);
  }

  return { entries, items, kept, removed, scope: "items" };
}
