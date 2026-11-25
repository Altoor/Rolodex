import { and, inArray } from "drizzle-orm";
import { db, decisions, taskResults, tasks, userDecisionOptions } from "@repo/db";
import {
  assertTasksVisible,
  visibleTaskCondition,
} from "../task-visibility";
import {
  FORMAT,
  VERSION,
  type ExportTaskResult,
  type ExportUserDecisionOption,
  type TaskExportFile,
} from "./types";

/**
 * Exports every task visible to the caller, plus the decisions those tasks
 * reference. Drafts owned by other users are never exported.
 */
export async function exportTasksFile(
  userId: number,
  taskIds?: number[],
): Promise<TaskExportFile> {
  if (taskIds != null && taskIds.length > 0) {
    await assertTasksVisible(userId, taskIds);
  }

  const taskRows =
    taskIds == null
      ? await db
          .select()
          .from(tasks)
          .where(visibleTaskCondition(userId))
          .orderBy(tasks.id)
      : taskIds.length === 0
        ? []
        : await db
            .select()
            .from(tasks)
            .where(
              and(inArray(tasks.id, taskIds), visibleTaskCondition(userId)),
            )
            .orderBy(tasks.id);

  const selectedTaskIds = taskRows.map((task) => task.id);

  const [resultRows, optionRows] = await Promise.all([
    selectedTaskIds.length > 0
      ? db
          .select()
          .from(taskResults)
          .where(inArray(taskResults.taskId, selectedTaskIds))
          .orderBy(taskResults.id)
      : [],
    selectedTaskIds.length > 0
      ? db
          .select()
          .from(userDecisionOptions)
          .where(inArray(userDecisionOptions.taskId, selectedTaskIds))
          .orderBy(userDecisionOptions.sortOrder, userDecisionOptions.id)
      : [],
  ]);

  const decisionIds = [
    ...new Set(
      taskRows
        .map((task) => task.decisionId)
        .filter((id): id is number => id != null),
    ),
  ];
  const decisionRows =
    decisionIds.length > 0
      ? await db
          .select()
          .from(decisions)
          .where(inArray(decisions.id, decisionIds))
          .orderBy(decisions.id)
      : [];

  const resultsByTask = new Map<number, ExportTaskResult[]>();
  for (const result of resultRows) {
    const list = resultsByTask.get(result.taskId) ?? [];
    list.push({
      type: result.type,
      option: result.option,
      scoreThreshold: result.scoreThreshold,
      probabilityThreshold: result.probabilityThreshold,
      confidenceThreshold: result.confidenceThreshold,
      resultTaskId: result.resultTaskId,
      appendState: result.appendState,
    });
    resultsByTask.set(result.taskId, list);
  }

  const optionsByTask = new Map<number, ExportUserDecisionOption[]>();
  for (const option of optionRows) {
    const list = optionsByTask.get(option.taskId) ?? [];
    list.push({
      kind: option.kind,
      label: option.label,
      description: option.description,
      value: option.value,
      selector: option.selector,
      labelPath: option.labelPath,
      descriptionPath: option.descriptionPath,
      valuePath: option.valuePath,
      resultTaskId: option.resultTaskId,
      appendState: option.appendState,
      sortOrder: option.sortOrder,
    });
    optionsByTask.set(option.taskId, list);
  }

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    decisions: decisionRows.map((decision) => ({
      id: decision.id,
      name: decision.name,
      type: decision.type,
      decisionPremise: decision.decisionPremise,
      instruction: decision.instruction,
      options: decision.options,
      optionDescriptions: decision.optionDescriptions,
    })),
    tasks: taskRows.map((task) => ({
      id: task.id,
      name: task.name,
      type: task.type,
      decisionId: task.decisionId,
      fallbackTaskId: task.fallbackTaskId,
      toolKey: task.toolKey,
      toolConfig: task.toolConfig,
      toolOutputType: task.toolOutputType,
      onTrueTaskId: task.onTrueTaskId,
      onFalseTaskId: task.onFalseTaskId,
      joinTaskId: task.joinTaskId,
      model: task.model,
      decisionModel: task.decisionModel,
      decisionStateConfig: task.decisionStateConfig,
      forceUserDecideIfNoMatch: task.forceUserDecideIfNoMatch,
      canRunInParallel: task.canRunInParallel,
      prioritize: task.prioritize,
      userDecisionType: task.userDecisionType,
      userDecisionConfig: task.userDecisionConfig,
      taskResults: resultsByTask.get(task.id) ?? [],
      userDecisionOptions: optionsByTask.get(task.id) ?? [],
    })),
  };
}
