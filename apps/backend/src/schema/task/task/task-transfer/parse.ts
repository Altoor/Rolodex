import { GraphQLError } from "graphql";
import { defaultCanRunInParallel } from "../task-service";
import {
  asArray,
  asBoolean,
  asEnum,
  asNumber,
  asRecord,
  asString,
  DECISION_TYPES,
  FORMAT,
  OPTION_KINDS,
  OUTPUT_TYPES,
  TASK_TYPES,
  USER_DECISION_TYPES,
  VERSION,
  type ExportDecision,
  type ExportTask,
  type ExportTaskResult,
  type ExportUserDecisionOption,
  type TaskExportFile,
} from "./types";

function badInput(message: string): GraphQLError {
  return new GraphQLError(message, { extensions: { code: "BAD_USER_INPUT" } });
}

function parseDecision(value: unknown, index: number): ExportDecision {
  const record = asRecord(value);
  if (!record) throw badInput(`decisions.${index} must be an object`);

  const id = asNumber(record.id);
  const name = asString(record.name)?.trim();
  if (id == null || !name) {
    throw badInput(`decisions.${index} needs an id and name`);
  }

  return {
    id,
    name,
    type: asEnum(record.type, DECISION_TYPES, "choice"),
    decisionPremise: asString(record.decisionPremise) ?? "decision",
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
  if (!record) throw badInput(`tasks.${index} must be an object`);

  const id = asNumber(record.id);
  const name = asString(record.name)?.trim();
  if (id == null || !name) {
    throw badInput(`tasks.${index} needs an id and name`);
  }

  const type = asEnum(record.type, TASK_TYPES, "tool");
  const toolKey = asString(record.toolKey);

  return {
    id,
    name,
    type,
    decisionId: asNumber(record.decisionId),
    fallbackTaskId: asNumber(record.fallbackTaskId),
    toolKey,
    toolConfig: record.toolConfig ?? null,
    toolOutputType: asEnum(record.toolOutputType, OUTPUT_TYPES, "normal"),
    onTrueTaskId: asNumber(record.onTrueTaskId),
    onFalseTaskId: asNumber(record.onFalseTaskId),
    joinTaskId: asNumber(record.joinTaskId),
    model: asString(record.model),
    decisionModel: asString(record.decisionModel),
    decisionStateConfig: record.decisionStateConfig ?? null,
    forceUserDecideIfNoMatch: asBoolean(record.forceUserDecideIfNoMatch, true),
    canRunInParallel: asBoolean(
      record.canRunInParallel,
      defaultCanRunInParallel(type, toolKey),
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

export function parseImportFile(value: unknown): TaskExportFile {
  const record = asRecord(value);

  if (!record || record.format !== FORMAT) {
    throw badInput(`Not a Rolodex tasks file (expected format "${FORMAT}")`);
  }

  if (record.version !== VERSION) {
    throw badInput(
      `Unsupported tasks file version ${String(record.version)}; expected ${VERSION}`,
    );
  }

  const taskList = asArray(record.tasks).map(parseTask);
  const decisionList = asArray(record.decisions).map(parseDecision);

  const duplicateTaskIds = taskList
    .map((task) => task.id)
    .filter((id, index, all) => all.indexOf(id) !== index);
  if (duplicateTaskIds.length > 0) {
    throw badInput(
      `The tasks file contains duplicate task ids: ${[
        ...new Set(duplicateTaskIds),
      ].join(", ")}`,
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
export function remapSwitchConfig(
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

  return changed
    ? {
        ...record,
        cases,
        defaultTaskId:
          defaultTaskId == null ? record.defaultTaskId : mappedDefault,
      }
    : config;
}
