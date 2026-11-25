import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, tasks } from "@repo/db";
import {
  getToolDefinition,
  ToolConfigValidationError,
  validateToolConfig,
} from "@repo/tools";
import type { TaskRow } from "../../queue/types";
import { commitTrial, discardTrial, resumeTrial } from "../infrastructure/workspace";
import type { TaskDraft } from "../domain/revision";
import type { TaskSnapshot } from "../attempts";

export function badInput(message: string): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code: "BAD_USER_INPUT" },
  });
}

export function validateToolDraft(draft: TaskDraft): void {
  if (draft.type !== "tool") return;

  const definition = draft.toolKey
    ? getToolDefinition(draft.toolKey)
    : undefined;
  if (!definition) {
    throw badInput(`Unknown tool "${draft.toolKey ?? ""}"`);
  }

  try {
    validateToolConfig(definition, draft.toolConfig);
  } catch (err) {
    if (err instanceof ToolConfigValidationError) {
      throw badInput(err.message);
    }
    throw err;
  }

  if (
    draft.toolOutputType === "foreach" &&
    !(definition.outputTypes ?? ["normal"]).includes("foreach")
  ) {
    throw badInput(`"${definition.key}" does not support foreach output`);
  }
}

export function validateToolConfigFor(
  toolKey: string | null,
  config: Record<string, unknown> | null | undefined,
): void {
  const definition = toolKey ? getToolDefinition(toolKey) : undefined;
  if (!definition) {
    throw badInput(`Unknown tool "${toolKey ?? ""}"`);
  }
  try {
    validateToolConfig(definition, config);
  } catch (err) {
    if (err instanceof ToolConfigValidationError) {
      throw badInput(err.message);
    }
    throw err;
  }
}

/** Explicit targets a draft would wire, used for cycle/depth checks. */
export function draftTargets(draft: TaskDraft, includeFallback = true): number[] {
  const targets = [
    includeFallback ? draft.fallbackTaskId : null,
    draft.onTrueTaskId,
    draft.onFalseTaskId,
    ...(draft.decision?.results ?? []).map((result) => result.resultTaskId),
    ...(draft.userDecisionOptions ?? []).map((option) => option.resultTaskId),
  ].filter((value): value is number => typeof value === "number");
  return [...new Set(targets)];
}

function numericOption(option: string): number | null {
  const value = Number(option);
  return Number.isFinite(value) ? value : null;
}

export function buildReplacementSnapshot(
  snapshot: TaskSnapshot,
  draft: TaskDraft,
): TaskSnapshot {
  const task: TaskRow = {
    ...snapshot.task,
    name: draft.name,
    type: draft.type,
    decisionId: null,
    toolKey: draft.toolKey ?? null,
    toolConfig: draft.toolConfig ?? null,
    toolOutputType: draft.toolOutputType ?? "normal",
    fallbackTaskId: draft.fallbackTaskId ?? null,
    onTrueTaskId: draft.onTrueTaskId ?? null,
    onFalseTaskId: draft.onFalseTaskId ?? null,
    model: draft.model ?? null,
    decisionModel: draft.decisionModel ?? null,
    userDecisionType: draft.userDecisionType ?? "list",
    userDecisionConfig: draft.userDecisionConfig ?? null,
  };

  if (draft.type === "decision" && draft.decision) {
    const decisionId = -Math.abs(Date.now() + snapshot.task.id);
    task.decisionId = decisionId;
    const decision = draft.decision;
    const results = decision.options.map((option, index) => {
      const explicit = decision.results?.find(
        (result) =>
          (result.option ?? option) === option ||
          result.option === option ||
          result.scoreThreshold === Number(option) ||
          result.probabilityThreshold === Number(option),
      );
      return {
        id: -(index + 1),
        taskId: snapshot.task.id,
        type: decision.type,
        option: decision.type === "choice" ? option : null,
        scoreThreshold:
          decision.type === "score"
            ? (explicit?.scoreThreshold ?? numericOption(option))
            : null,
        probabilityThreshold:
          decision.type === "noul"
            ? (explicit?.probabilityThreshold ?? numericOption(option))
            : null,
        confidenceThreshold: explicit?.confidenceThreshold ?? null,
        resultTaskId: explicit?.resultTaskId ?? draft.fallbackTaskId ?? null,
        appendState: explicit?.appendState ?? true,
      };
    });

    return {
      task,
      decision: {
        id: decisionId,
        name: decision.name ?? draft.name,
        type: decision.type,
        decisionPremise: decision.decisionPremise,
        instruction: decision.instruction,
        options: decision.options,
        optionDescriptions:
          decision.optionDescriptions ?? decision.options.map(() => ""),
        authorId: snapshot.decision?.authorId ?? 0,
      },
      results: results as TaskSnapshot["results"],
      userDecisionOptions: [],
    };
  }

  if (draft.type === "userDecision") {
    const options = (draft.userDecisionOptions ?? []).map((option, index) => ({
      id: -(index + 1),
      taskId: snapshot.task.id,
      kind: option.kind ?? "static",
      label: option.label ?? null,
      description: option.description ?? null,
      value: option.value ?? null,
      selector: option.selector ?? null,
      labelPath: option.labelPath ?? null,
      descriptionPath: option.descriptionPath ?? null,
      valuePath: option.valuePath ?? null,
      resultTaskId: option.resultTaskId ?? null,
      appendState: option.appendState ?? false,
      sortOrder: option.sortOrder ?? index,
    }));

    return {
      task,
      decision: null,
      results: [],
      userDecisionOptions: options as TaskSnapshot["userDecisionOptions"],
    };
  }

  return {
    task,
    decision: null,
    results: [],
    userDecisionOptions: [],
  };
}

export function snapshotOf(attempt: { taskSnapshot: unknown }): TaskSnapshot {
  return attempt.taskSnapshot as TaskSnapshot;
}

export function resultOf(attempt: { result: unknown }): Record<string, unknown> {
  return typeof attempt.result === "object" && attempt.result !== null
    ? (attempt.result as Record<string, unknown>)
    : {};
}

export async function insertDraftTasks(
  userId: number,
  drafts: TaskDraft[],
): Promise<TaskRow[]> {
  const created: TaskRow[] = [];

  for (const draft of drafts) {
    const [task] = await db
      .insert(tasks)
      .values({
        name: draft.name,
        type: draft.type,
        toolKey: draft.toolKey ?? null,
        toolConfig: draft.toolConfig ?? null,
        toolOutputType: draft.toolOutputType ?? "normal",
        fallbackTaskId: draft.fallbackTaskId ?? null,
        onTrueTaskId: draft.onTrueTaskId ?? null,
        onFalseTaskId: draft.onFalseTaskId ?? null,
        joinTaskId: draft.joinTaskId ?? null,
        model: draft.model ?? null,
        decisionModel: draft.decisionModel ?? null,
        userDecisionType: draft.userDecisionType ?? "list",
        userDecisionConfig: draft.userDecisionConfig ?? null,
        canRunInParallel: false,
        prioritize: false,
        isDraft: true,
        draftOwnerId: userId,
      })
      .returning();

    if (!task) throw new Error("failed to create revision task");
    created.push(task);
  }

  return created;
}

export async function setFallback(taskId: number, fallbackTaskId: number | null) {
  await db
    .update(tasks)
    .set({ fallbackTaskId })
    .where(eq(tasks.id, taskId));
}

export async function discardAttemptWorkspace(runId: string, attemptId: number) {
  await discardTrial(await resumeTrial(runId, attemptId)).catch(
    () => undefined,
  );
}

export async function commitAttemptWorkspace(
  runId: string,
  attemptId: number,
  workspaceKey: string | null,
) {
  if (!workspaceKey) return;
  await commitTrial(await resumeTrial(runId, attemptId));
}

export function oldNextTaskId(
  snapshot: TaskSnapshot,
  result: Record<string, unknown>,
): number | null {
  const fromResult =
    typeof result.nextTaskId === "number" ? result.nextTaskId : null;
  return fromResult ?? snapshot.task.fallbackTaskId ?? null;
}
