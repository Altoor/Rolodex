import type { ToolStateEntry } from "@repo/tools";
import {
  readPath,
  selectToolState,
  validateWhereExpression,
} from "@repo/tools";
import { db, userDecisionOptions as userDecisionOptionsTable } from "@repo/db";
import { awaitStep, finishStep } from "../step-store";
import type { QueuedRow, TaskRow } from "../types";
import type {
  PendingChoice,
  PendingChoiceOption,
  PendingChoiceType,
} from "../user-choice";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function itemLabel(
  item: unknown,
  labelPath: string | undefined,
  fallback: string,
): string {
  const paths = labelPath
    ? [labelPath]
    : ["name", "label", "title", "id", "value"];

  for (const path of paths) {
    const value = readPath(item, path);
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value);
    }
  }

  return fallback;
}

function itemDescription(
  item: unknown,
  descriptionPath: string | undefined,
): string | undefined {
  if (!descriptionPath) return undefined;
  const value = readPath(item, descriptionPath);
  return value === undefined || value === null || String(value).trim() === ""
    ? undefined
    : String(value);
}

function dynamicKey(
  item: unknown,
  valuePath: string | undefined,
  index: number,
): string {
  const value = readPath(item, valuePath ?? "id");
  if (value !== undefined && value !== null) return `value:${String(value)}`;
  return `index:${index}`;
}

type UserDecisionOptionRow = typeof userDecisionOptionsTable.$inferSelect;

interface DynamicSelector {
  mode: "whitelist" | "blacklist";
  path?: string;
  where?: ReturnType<typeof validateWhereExpression>;
}

function readSelector(value: unknown): DynamicSelector {
  const selector = asRecord(value);
  if (!selector) return { mode: "whitelist" };

  const mode =
    selector.mode === "blacklist" || selector.mode === "whitelist"
      ? selector.mode
      : "whitelist";

  return {
    mode,
    path: asString(selector.path),
    where:
      selector.where === undefined
        ? undefined
        : validateWhereExpression(selector.where),
  };
}

function buildStaticOptions(
  options: UserDecisionOptionRow[],
): PendingChoiceOption[] {
  return options
    .filter((option) => option.kind === "static")
    .map((option, index) => ({
      id: `static:${option.id}`,
      label: option.label ?? option.value ?? `Option ${index + 1}`,
      ...(option.description ? { description: option.description } : {}),
      value: option.value ?? option.label ?? `Option ${index + 1}`,
      resultTaskId: option.resultTaskId,
      appendState: option.appendState,
      source: "static" as const,
    }));
}

/**
 * Yes/no uses exactly two generated options whose wording comes from the
 * task config. Targets and append flags come from matching static option rows
 * so the flow graph can still route each answer.
 */
function buildYesNoOptions(
  options: UserDecisionOptionRow[],
  config: Record<string, unknown>,
): PendingChoiceOption[] {
  const byValue = new Map(
    options
      .filter((option) => option.kind === "static")
      .map((option) => [option.value?.trim().toLowerCase(), option]),
  );
  const yes = byValue.get("yes");
  const no = byValue.get("no");

  return [
    {
      id: "yes",
      label: asString(config.yesLabel) ?? yes?.label ?? "Yes",
      ...(yes?.description ? { description: yes.description } : {}),
      value: "yes",
      resultTaskId: yes?.resultTaskId ?? null,
      appendState: yes?.appendState ?? false,
      source: "static",
    },
    {
      id: "no",
      label: asString(config.noLabel) ?? no?.label ?? "No",
      ...(no?.description ? { description: no.description } : {}),
      value: "no",
      resultTaskId: no?.resultTaskId ?? null,
      appendState: no?.appendState ?? false,
      source: "static",
    },
  ];
}

function buildDynamicOptions(
  options: UserDecisionOptionRow[],
  toolState: ToolStateEntry[],
): PendingChoiceOption[] {
  const result: PendingChoiceOption[] = [];

  for (const option of options) {
    if (option.kind !== "dynamic") continue;

    const selector = readSelector(option.selector);
    const selection = selectToolState(toolState, {
      path: selector.path,
      where: selector.where,
      mode: selector.mode,
    });

    // With a `path`, each option is an item inside an existing entry, so the
    // chosen item must be appended to reach the next task. Without a `path`,
    // the chosen value is an entry that already exists in toolState and
    // appending it would duplicate that entry.
    const appendState = selector.path ? true : option.appendState;

    const seen = new Set<string>();

    selection.items.forEach((item, index) => {
      const key = dynamicKey(item, option.valuePath ?? undefined, index);
      if (seen.has(key)) return;
      seen.add(key);

      const description = itemDescription(
        item,
        option.descriptionPath ?? undefined,
      );

      result.push({
        id: `dynamic:${option.id}:${index}`,
        label: itemLabel(
          item,
          option.labelPath ?? undefined,
          `Option ${result.length + 1}`,
        ),
        ...(description ? { description } : {}),
        value: item,
        resultTaskId: option.resultTaskId,
        appendState,
        source: "dynamic",
      });
    });
  }

  return result;
}

/** Creates a persisted user choice and parks the step until it is answered. */
export async function processUserDecisionStep(
  row: QueuedRow,
  task: TaskRow,
): Promise<void> {
  const options = await db.query.userDecisionOptions.findMany({
    where: { taskId: task.id },
  });
  options.sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  const config = asRecord(task.userDecisionConfig) ?? {};
  const choiceType = task.userDecisionType as PendingChoiceType;

  const pendingOptions =
    choiceType === "yesNo"
      ? buildYesNoOptions(options, config)
      : [
          ...buildStaticOptions(options),
          ...buildDynamicOptions(options, row.toolState),
        ];

  if (pendingOptions.length === 0) {
    await finishStep(row.id, "failed", {
      note: "user decision has no options for this run",
    });
    return;
  }

  const pendingChoice: PendingChoice = {
    kind: "userDecision",
    taskId: task.id,
    prompt: asString(config.prompt) ?? `Choose an option for ${task.name}`,
    choiceType,
    acceptLabel: asString(config.acceptLabel) ?? "Accept",
    options: pendingOptions,
    createdAt: new Date().toISOString(),
  };

  const result = {
    branch: "awaiting_user",
    pendingChoiceKind: pendingChoice.kind,
    summary: `Waiting for user to choose among ${pendingOptions.length} option${
      pendingOptions.length === 1 ? "" : "s"
    }`,
  };

  await awaitStep(row.id, pendingChoice, result, result.summary);
}
