import { eq, inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import {
  db,
  decisions,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { defaultCanRunInParallel } from "./task-service";

const FORMAT = "rolodex-tasks";
const VERSION = 1;

const TASK_TYPES = ["decision", "textPrompt", "tool", "userDecision"] as const;
const OUTPUT_TYPES = ["normal", "foreach"] as const;
const DECISION_TYPES = ["choice", "noul", "score"] as const;
const USER_DECISION_TYPES = ["yesNo", "list", "dropdown"] as const;
const OPTION_KINDS = ["static", "dynamic"] as const;

type TaskType = (typeof TASK_TYPES)[number];
type OutputType = (typeof OUTPUT_TYPES)[number];
type DecisionType = (typeof DECISION_TYPES)[number];
type UserDecisionType = (typeof USER_DECISION_TYPES)[number];
type OptionKind = (typeof OPTION_KINDS)[number];

export interface TaskExportFile {
  format: typeof FORMAT;
  version: number;
  exportedAt: string;
  decisions: ExportDecision[];
  tasks: ExportTask[];
}

interface ExportDecision {
  id: number;
  name: string;
  type: DecisionType;
  decisionPremise: string;
  instruction: string;
  options: string[] | null;
  optionDescriptions: string[] | null;
}

interface ExportTaskResult {
  type: DecisionType;
  option: string | null;
  scoreThreshold: number | null;
  probabilityThreshold: number | null;
  confidenceThreshold: number | null;
  resultTaskId: number | null;
  appendState: boolean;
}

interface ExportUserDecisionOption {
  kind: OptionKind;
  label: string | null;
  description: string | null;
  value: string | null;
  selector: unknown;
  labelPath: string | null;
  descriptionPath: string | null;
  valuePath: string | null;
  resultTaskId: number | null;
  appendState: boolean;
  sortOrder: number;
}

interface ExportTask {
  id: number;
  name: string;
  type: TaskType;
  decisionId: number | null;
  fallbackTaskId: number | null;
  toolKey: string | null;
  toolConfig: unknown;
  toolOutputType: OutputType;
  onTrueTaskId: number | null;
  onFalseTaskId: number | null;
  model: string | null;
  decisionModel: string | null;
  decisionStateConfig: unknown;
  forceUserDecideIfNoMatch: boolean;
  canRunInParallel: boolean;
  prioritize: boolean;
  userDecisionType: UserDecisionType;
  userDecisionConfig: unknown;
  taskResults: ExportTaskResult[];
  userDecisionOptions: ExportUserDecisionOption[];
}

export interface ImportTasksResult {
  tasksCreated: number;
  decisionsCreated: number;
  /** New ids for the imported tasks, in the same order as the file. */
  taskIds: number[];
  warnings: string[];
}

interface ImportTasksOptions {
  /**
   * Reuse decisions that already exist and keep references to existing tasks
   * outside the file. Used for copying tasks inside the same workspace.
   */
  reuseExisting?: boolean;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown, fallback = false): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" &&
    (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

/**
 * Exports every task, plus the decisions those tasks reference. When
 * `taskIds` is provided, only those tasks are exported.
 */
export async function exportTasksFile(
  taskIds?: number[],
): Promise<TaskExportFile> {
  const taskRows =
    taskIds == null
      ? await db.select().from(tasks).orderBy(tasks.id)
      : taskIds.length === 0
        ? []
        : await db
            .select()
            .from(tasks)
            .where(inArray(tasks.id, taskIds))
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

function parseDecision(value: unknown, index: number): ExportDecision {
  const record = asRecord(value);
  if (!record) {
    throw new GraphQLError(`decisions.${index} must be an object`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const id = asNumber(record.id);
  const name = asString(record.name)?.trim();

  if (id == null || !name) {
    throw new GraphQLError(`decisions.${index} needs an id and name`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return {
    id,
    name,
    type: asEnum(record.type, DECISION_TYPES, "choice"),
    decisionPremise:
      asString(record.decisionPremise) ?? "Which option fits best?",
    instruction:
      asString(record.instruction) ??
      "Choose the option that best fits the current state.",
    options: Array.isArray(record.options)
      ? record.options.filter(
          (option): option is string => typeof option === "string",
        )
      : null,
    optionDescriptions: Array.isArray(record.optionDescriptions)
      ? record.optionDescriptions.map((entry) =>
          typeof entry === "string" ? entry : "",
        )
      : null,
  };
}

function parseResult(value: unknown): ExportTaskResult | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    type: asEnum(record.type, DECISION_TYPES, "choice"),
    option: asString(record.option),
    scoreThreshold: asNumber(record.scoreThreshold),
    probabilityThreshold: asNumber(record.probabilityThreshold),
    confidenceThreshold: asNumber(record.confidenceThreshold),
    resultTaskId: asNumber(record.resultTaskId),
    appendState: asBoolean(record.appendState),
  };
}

function parseOption(value: unknown): ExportUserDecisionOption | null {
  const record = asRecord(value);
  if (!record) return null;

  return {
    kind: asEnum(record.kind, OPTION_KINDS, "static"),
    label: asString(record.label),
    description: asString(record.description),
    value: asString(record.value),
    selector: record.selector ?? null,
    labelPath: asString(record.labelPath),
    descriptionPath: asString(record.descriptionPath),
    valuePath: asString(record.valuePath),
    resultTaskId: asNumber(record.resultTaskId),
    appendState: asBoolean(record.appendState),
    sortOrder: asNumber(record.sortOrder) ?? 0,
  };
}

function parseTask(value: unknown, index: number): ExportTask {
  const record = asRecord(value);
  if (!record) {
    throw new GraphQLError(`tasks.${index} must be an object`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const id = asNumber(record.id);
  const name = asString(record.name)?.trim();

  if (id == null || !name) {
    throw new GraphQLError(`tasks.${index} needs an id and name`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  return {
    id,
    name,
    type: asEnum(record.type, TASK_TYPES, "tool"),
    decisionId: asNumber(record.decisionId),
    fallbackTaskId: asNumber(record.fallbackTaskId),
    toolKey: asString(record.toolKey),
    toolConfig: record.toolConfig ?? null,
    toolOutputType: asEnum(record.toolOutputType, OUTPUT_TYPES, "normal"),
    onTrueTaskId: asNumber(record.onTrueTaskId),
    onFalseTaskId: asNumber(record.onFalseTaskId),
    model: asString(record.model),
    decisionModel: asString(record.decisionModel),
    decisionStateConfig: record.decisionStateConfig ?? null,
    forceUserDecideIfNoMatch: asBoolean(record.forceUserDecideIfNoMatch, true),
    canRunInParallel: asBoolean(
      record.canRunInParallel,
      defaultCanRunInParallel(
        asEnum(record.type, TASK_TYPES, "tool"),
        asString(record.toolKey),
      ),
    ),
    prioritize: asBoolean(record.prioritize, false),
    userDecisionType: asEnum(
      record.userDecisionType,
      USER_DECISION_TYPES,
      "list",
    ),
    userDecisionConfig: record.userDecisionConfig ?? null,
    taskResults: asArray(record.taskResults).flatMap((entry) => {
      const parsed = parseResult(entry);
      return parsed ? [parsed] : [];
    }),
    userDecisionOptions: asArray(record.userDecisionOptions).flatMap(
      (entry) => {
        const parsed = parseOption(entry);
        return parsed ? [parsed] : [];
      },
    ),
  };
}

function parseImportFile(value: unknown): TaskExportFile {
  const record = asRecord(value);

  if (!record || record.format !== FORMAT) {
    throw new GraphQLError(
      `Not a Rolodex tasks file (expected format "${FORMAT}")`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  if (record.version !== VERSION) {
    throw new GraphQLError(
      `Unsupported tasks file version ${String(record.version)}; expected ${VERSION}`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  const taskList = asArray(record.tasks).map(parseTask);
  const decisionList = asArray(record.decisions).map(parseDecision);

  const duplicateTaskIds = taskList
    .map((task) => task.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateTaskIds.length > 0) {
    throw new GraphQLError(
      `The tasks file contains duplicate task ids: ${[
        ...new Set(duplicateTaskIds),
      ].join(", ")}`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: asString(record.exportedAt) ?? new Date().toISOString(),
    decisions: decisionList,
    tasks: taskList,
  };
}

/**
 * Returns a switch tool config with its task targets remapped. Returns the
 * original value when nothing changed.
 */
function remapSwitchConfig(
  config: unknown,
  mapTaskId: (taskId: number) => number | null,
): unknown {
  const record = asRecord(config);
  if (!record) return config;

  let changed = false;
  const cases = Array.isArray(record.cases)
    ? record.cases.map((entry) => {
        const caseRecord = asRecord(entry);
        const nextTaskId = caseRecord ? asNumber(caseRecord.nextTaskId) : null;
        if (!caseRecord || nextTaskId == null) return entry;

        const mapped = mapTaskId(nextTaskId);
        if (mapped === nextTaskId) return entry;

        changed = true;
        return { ...caseRecord, nextTaskId: mapped };
      })
    : record.cases;

  const defaultTaskId = asNumber(record.defaultTaskId);
  const mappedDefault =
    defaultTaskId == null ? defaultTaskId : mapTaskId(defaultTaskId);
  if (defaultTaskId != null && mappedDefault !== defaultTaskId) {
    changed = true;
  }

  if (!changed) return config;

  return {
    ...record,
    cases,
    ...(defaultTaskId == null ? {} : { defaultTaskId: mappedDefault }),
  };
}

/**
 * Imports a tasks file as new copies. Decisions, tasks, results and
 * user-decision options are recreated, and every task reference is remapped to
 * the new ids. Existing tasks are never modified.
 *
 * With `reuseExisting`, decisions that already exist are reused and references
 * to tasks outside the file are kept instead of cleared. This is what
 * copy/paste within the task flow uses.
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
          (await tx.select({ id: tasks.id }).from(tasks)).map(
            (task) => task.id,
          ),
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
