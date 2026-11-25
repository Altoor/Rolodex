import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import {
  db,
  decisions,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { visibleTaskCondition } from "../task-visibility";
import { parseImportFile, remapSwitchConfig } from "./parse";
import type { ImportTasksOptions, ImportTasksResult } from "./types";

/**
 * Imports a tasks file. New tasks/decisions are always created; with
 * `reuseExisting`, references to tasks outside the file are kept instead of
 * cleared, but only when the caller is allowed to see those tasks.
 */
export async function importTasksFile(
  userId: number,
  data: unknown,
  options: ImportTasksOptions = {},
): Promise<ImportTasksResult> {
  const file = parseImportFile(data);
  const reuseExisting = options.reuseExisting === true;
  const warnings: string[] = [];

  return db.transaction(async (tx) => {
    const existingDecisionIds = reuseExisting
      ? new Set(
          (await tx.select({ id: decisions.id }).from(decisions)).map(
            (decision) => decision.id,
          ),
        )
      : new Set<number>();
    const existingTaskIds = reuseExisting
      ? new Set(
          (
            await tx
              .select({ id: tasks.id })
              .from(tasks)
              .where(visibleTaskCondition(userId))
          ).map((task) => task.id),
        )
      : new Set<number>();

    const decisionIdMap = new Map<number, number>();
    let decisionsCreated = 0;

    for (const decision of file.decisions) {
      if (existingDecisionIds.has(decision.id)) {
        decisionIdMap.set(decision.id, decision.id);
        continue;
      }

      const [created] = await tx
        .insert(decisions)
        .values({
          name: decision.name,
          type: decision.type,
          decisionPremise: decision.decisionPremise,
          instruction: decision.instruction,
          options: decision.options,
          optionDescriptions: decision.optionDescriptions,
          authorId: userId,
        })
        .returning({ id: decisions.id });

      if (!created) {
        throw new GraphQLError("Could not import a decision", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      decisionsCreated += 1;
      decisionIdMap.set(decision.id, created.id);
    }

    const taskIdMap = new Map<number, number>();

    for (const task of file.tasks) {
      const decisionId =
        task.decisionId != null
          ? (decisionIdMap.get(task.decisionId) ?? null)
          : null;

      if (task.decisionId != null && decisionId == null) {
        warnings.push(
          `Task "${task.name}" referenced missing decision ${task.decisionId}; imported without it.`,
        );
      }

      const [created] = await tx
        .insert(tasks)
        .values({
          name: task.name,
          type: task.type,
          decisionId,
          fallbackTaskId: null,
          toolKey: task.toolKey,
          toolConfig: task.toolConfig,
          toolOutputType: task.toolOutputType,
          onTrueTaskId: null,
          onFalseTaskId: null,
          joinTaskId: null,
          model: task.model,
          decisionModel: task.decisionModel,
          decisionStateConfig: task.decisionStateConfig,
          forceUserDecideIfNoMatch: task.forceUserDecideIfNoMatch,
          canRunInParallel: task.canRunInParallel,
          prioritize: task.prioritize,
          userDecisionType: task.userDecisionType,
          userDecisionConfig: task.userDecisionConfig,
        })
        .returning({ id: tasks.id });

      if (!created) {
        throw new GraphQLError("Could not import a task", {
          extensions: { code: "INTERNAL_SERVER_ERROR" },
        });
      }

      taskIdMap.set(task.id, created.id);
    }

    const mapTaskRef = (
      oldId: number | null,
      taskName: string,
      field: string,
    ): number | null => {
      if (oldId == null) return null;
      const mapped = taskIdMap.get(oldId);
      if (mapped != null) return mapped;
      if (reuseExisting && existingTaskIds.has(oldId)) return oldId;

      warnings.push(
        `Task "${taskName}" referenced missing ${field} ${oldId}; cleared it.`,
      );
      return null;
    };

    for (const task of file.tasks) {
      const newTaskId = taskIdMap.get(task.id);
      if (newTaskId == null) continue;

      await tx
        .update(tasks)
        .set({
          fallbackTaskId: mapTaskRef(
            task.fallbackTaskId,
            task.name,
            "fallback task",
          ),
          onTrueTaskId: mapTaskRef(task.onTrueTaskId, task.name, "true task"),
          onFalseTaskId: mapTaskRef(
            task.onFalseTaskId,
            task.name,
            "false task",
          ),
          joinTaskId: mapTaskRef(task.joinTaskId, task.name, "join task"),
          ...(task.toolKey === "switch"
            ? {
                toolConfig: remapSwitchConfig(task.toolConfig, (oldId) =>
                  mapTaskRef(oldId, task.name, "switch target"),
                ),
              }
            : {}),
        })
        .where(eq(tasks.id, newTaskId));

      if (task.taskResults.length > 0) {
        await tx.insert(taskResults).values(
          task.taskResults.map((result) => ({
            taskId: newTaskId,
            type: result.type,
            option: result.option,
            scoreThreshold: result.scoreThreshold,
            probabilityThreshold: result.probabilityThreshold,
            confidenceThreshold: result.confidenceThreshold,
            resultTaskId: mapTaskRef(
              result.resultTaskId,
              task.name,
              "result task",
            ),
            appendState: result.appendState,
          })),
        );
      }

      if (task.userDecisionOptions.length > 0) {
        await tx.insert(userDecisionOptions).values(
          task.userDecisionOptions.map((option, index) => ({
            taskId: newTaskId,
            kind: option.kind,
            label: option.label,
            description: option.description,
            value: option.value,
            selector: option.selector,
            labelPath: option.labelPath,
            descriptionPath: option.descriptionPath,
            valuePath: option.valuePath,
            resultTaskId: mapTaskRef(
              option.resultTaskId,
              task.name,
              `option ${index + 1} task`,
            ),
            appendState: option.appendState,
            sortOrder: option.sortOrder,
          })),
        );
      }
    }

    return {
      tasksCreated: taskIdMap.size,
      decisionsCreated,
      taskIds: [...taskIdMap.values()],
      warnings,
    };
  });
}
