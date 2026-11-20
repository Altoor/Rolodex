import { inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db, fileEntries, tasks } from "@repo/db";
import { getModelForUser } from "@repo/ai";
import {
  assertValidTaskConfig,
  type TaskOutputType,
} from "../task/task/task-service";
import { listToolDefinitions } from "../../tools/registry";
import { generateJsonObject } from "./structured-generation";
import type { FlowStartKind } from "./flow-proposal-service";

export interface FlowDecisionOptionDraft {
  name: string;
  description: string;
}

export interface FlowDecisionResultDraft {
  option: string | null;
  targetTaskId: number | null;
  scoreThreshold: number | null;
  probabilityThreshold: number | null;
  confidenceThreshold: number | null;
}

export interface FlowDecisionDraft {
  name: string;
  type: "choice" | "noul" | "score";
  decisionPremise: string;
  instruction: string;
  options: FlowDecisionOptionDraft[];
  results: FlowDecisionResultDraft[];
}

export interface FlowUserDecisionOptionDraft {
  label: string;
  description: string | null;
  value: string;
  resultTaskId: number | null;
}

export interface FlowUserDecisionDraft {
  choiceType: "yesNo" | "list" | "dropdown";
  prompt: string;
  acceptLabel: string;
  options: FlowUserDecisionOptionDraft[];
}

export interface FlowTaskDraft {
  kind: FlowStartKind;
  name: string;
  type: "tool" | "decision" | "userDecision";
  toolKey: string | null;
  toolConfig: Record<string, unknown> | null;
  toolOutputType: TaskOutputType;
  /** Task that runs after this tool, or null when the flow ends here. */
  fallbackTaskId: number | null;
  decision: FlowDecisionDraft | null;
  userDecision: FlowUserDecisionDraft | null;
  warnings: string[];
  model: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function asInt(value: unknown): number | null {
  const parsed = asNumber(value);
  return parsed != null && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function cleanName(value: unknown, fallback: string): string {
  return asString(value) ?? fallback;
}

async function targetTaskIdsExist(ids: number[]): Promise<Set<number>> {
  if (ids.length === 0) return new Set();
  const rows = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(inArray(tasks.id, ids));
  return new Set(rows.map((row) => row.id));
}

async function attachmentText(
  fileIds: number[] | null | undefined,
  folderIds: number[] | null | undefined,
): Promise<string> {
  const ids = [...new Set([...(fileIds ?? []), ...(folderIds ?? [])])].filter(
    (id) => Number.isInteger(id) && id > 0,
  );

  if (ids.length === 0) return "";

  const rows = await db
    .select({ name: fileEntries.name, kind: fileEntries.kind })
    .from(fileEntries)
    .where(inArray(fileEntries.id, ids));

  return rows.map((row) => `${row.kind}: ${row.name}`).join("\n");
}

function parseDecisionDraft(
  generated: Record<string, unknown>,
  name: string,
  targetIds: Set<number>,
  warnings: string[],
): FlowDecisionDraft {
  const decision = asRecord(generated.decision) ?? generated;

  const rawType = asString(decision.type) ?? "choice";
  const type: FlowDecisionDraft["type"] =
    rawType === "noul" || rawType === "score" ? rawType : "choice";

  const options = asArray(decision.options).flatMap((entry) => {
    const record = asRecord(entry);
    const optionName = asString(record?.name) ?? asString(record?.option);
    if (!optionName) return [];
    return [
      {
        name: optionName,
        description: asString(record?.description) ?? "",
      },
    ];
  });

  if (type !== "noul" && options.length < 2) {
    throw new GraphQLError("The decision draft needs at least two options", {
      extensions: { code: "BAD_GATEWAY" },
    });
  }

  if (type !== "noul" && options.length > 26) {
    throw new GraphQLError("A decision supports at most 26 options", {
      extensions: { code: "BAD_GATEWAY" },
    });
  }

  const results = asArray(decision.results).flatMap((entry) => {
    const record = asRecord(entry);
    if (!record) return [];
    const targetTaskId = asInt(record.targetTaskId);
    const validTarget =
      targetTaskId != null && targetIds.has(targetTaskId) ? targetTaskId : null;
    const probabilityThreshold = asNumber(record.probabilityThreshold);
    return [
      {
        option: asString(record.option),
        targetTaskId: validTarget,
        scoreThreshold: asNumber(record.scoreThreshold),
        // Generated choice results start at 0.8 unless the model supplied an
        // explicit threshold.
        probabilityThreshold:
          type === "choice"
            ? (probabilityThreshold ?? 0.8)
            : probabilityThreshold,
        confidenceThreshold: asNumber(record.confidenceThreshold),
      },
    ];
  });

  if (results.length === 0) {
    results.push({
      option: type === "noul" ? null : (options[0]?.name ?? null),
      targetTaskId: null,
      scoreThreshold: type === "score" ? 0.5 : null,
      probabilityThreshold: type === "choice" ? 0.8 : null,
      confidenceThreshold: null,
    });
  }

  if (!results.some((result) => result.targetTaskId != null)) {
    warnings.push(
      "This decision has no wired result target. It can be created, but not started.",
    );
  }

  return {
    name: cleanName(decision.name, name),
    type,
    decisionPremise:
      asString(decision.decisionPremise) ?? "Which option fits best?",
    instruction:
      asString(decision.instruction) ??
      "Choose the option that best fits the current state.",
    options,
    results,
  };
}

function parseUserDecisionDraft(
  generated: Record<string, unknown>,
  name: string,
  targetIds: Set<number>,
): FlowUserDecisionDraft {
  const userDecision = asRecord(generated.userDecision) ?? generated;
  const rawType = asString(userDecision.choiceType) ?? "list";
  const choiceType: FlowUserDecisionDraft["choiceType"] =
    rawType === "yesNo" || rawType === "dropdown" ? rawType : "list";

  const options = asArray(userDecision.options).flatMap((entry) => {
    const record = asRecord(entry);
    const label = asString(record?.label);
    if (!record || !label) return [];
    const resultTaskId = asInt(record.resultTaskId);
    return [
      {
        label,
        description: asString(record.description),
        value:
          asString(record.value) ?? label.toLowerCase().replace(/\s+/g, "-"),
        resultTaskId:
          resultTaskId != null && targetIds.has(resultTaskId)
            ? resultTaskId
            : null,
      },
    ];
  });

  if (options.length === 0) {
    throw new GraphQLError(
      "The user-decision draft needs at least one option",
      { extensions: { code: "BAD_GATEWAY" } },
    );
  }

  return {
    choiceType,
    prompt: asString(userDecision.prompt) ?? "Choose an option",
    acceptLabel: asString(userDecision.acceptLabel) ?? "Accept",
    options,
  };
}

/** A compact tool catalog for prompts that do not build a tool config. */
function availableToolCatalog(): Record<string, unknown>[] {
  return listToolDefinitions().map((tool) => ({
    key: tool.key,
    name: tool.name,
    category: tool.category,
    description: tool.description,
    outputDescription: tool.outputDescription,
    outputTypes: tool.outputTypes ?? ["normal"],
  }));
}

function toolSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      name: { type: "string" },
      toolKey: {
        type: "string",
        enum: listToolDefinitions().map((tool) => tool.key),
      },
      toolConfig: { type: "object" },
      toolOutputType: { type: "string", enum: ["normal", "foreach"] },
    },
    required: ["name", "toolKey", "toolConfig"],
  };
}

function decisionSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      name: { type: "string" },
      decision: {
        type: "object",
        properties: {
          name: { type: "string" },
          type: { type: "string", enum: ["choice", "noul", "score"] },
          decisionPremise: { type: "string" },
          instruction: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
              },
              required: ["name", "description"],
            },
          },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                option: { type: "string" },
                targetTaskId: { type: ["integer", "null"] },
                scoreThreshold: { type: ["number", "null"] },
                probabilityThreshold: { type: ["number", "null"] },
                confidenceThreshold: { type: ["number", "null"] },
              },
            },
          },
        },
        required: [
          "name",
          "type",
          "decisionPremise",
          "instruction",
          "options",
          "results",
        ],
      },
    },
    required: ["name", "decision"],
  };
}

function userDecisionSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      name: { type: "string" },
      userDecision: {
        type: "object",
        properties: {
          choiceType: {
            type: "string",
            enum: ["yesNo", "list", "dropdown"],
          },
          prompt: { type: "string" },
          acceptLabel: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                description: { type: "string" },
                value: { type: "string" },
                resultTaskId: { type: ["integer", "null"] },
              },
              required: ["label", "value"],
            },
          },
        },
        required: ["choiceType", "prompt", "acceptLabel", "options"],
      },
    },
    required: ["name", "userDecision"],
  };
}

function promptForKind(
  kind: FlowStartKind,
  state: string,
  prompt: string | null,
  targetList: string,
  existingDraft?: unknown,
): { system: string; prompt: string; format: Record<string, unknown> } {
  const context = [
    state,
    prompt ? `The user asks for this change:\n${prompt}` : "",
    existingDraft
      ? `Current draft to refine:\n${JSON.stringify(existingDraft, null, 2)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  if (kind === "newToolTask") {
    const tools = listToolDefinitions().map((tool) => ({
      key: tool.key,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      outputTypes: tool.outputTypes ?? ["normal"],
      exampleConfig: tool.exampleConfig,
    }));

    return {
      system:
        "You build one runnable automation task. Return only JSON matching the schema. " +
        "Use an existing tool key and a config that satisfies its input schema. " +
        "Keep model prompts short and explicit. When the task should process only the " +
        'files uploaded or attached to the run, use scan_files with scope "uploaded".',
      prompt: [
        context,
        "Available tools:",
        JSON.stringify(tools, null, 2),
      ].join("\n\n"),
      format: toolSchema(),
    };
  }

  if (kind === "newDecisionTask") {
    return {
      system:
        "You build one System One decision task. Return only JSON matching the schema. " +
        "Prefer a choice decision and generate the fewest options that capture genuinely " +
        "distinct outcomes (normally 2-4). Never pad with generic, duplicate, catch-all, " +
        "or 'other' options. Describe each option as a real branch that routes to an " +
        "existing target task or uses an available tool. If no existing task or tool fits " +
        "an outcome, keep it as a new choice with targetTaskId null so the user can wire it. " +
        "Choice decisions need 2-26 named options with descriptions. Score decisions need " +
        "2-26 options ordered lowest to highest. Noul decisions have no options. " +
        "Each result maps an option (or noul/score threshold) to an existing target task id; " +
        "never invent task ids or use a tool key as a target task id.",
      prompt: [
        context,
        "Existing target tasks (use these ids or null):",
        targetList,
        "Available tools (reference their capabilities in option descriptions; never use a key as a target task id):",
        JSON.stringify(availableToolCatalog(), null, 2),
      ].join("\n\n"),
      format: decisionSchema(),
    };
  }

  return {
    system:
      "You build one user decision task. Return only JSON matching the schema. " +
      "Generate the fewest options needed for the question (normally 2-4). Never pad " +
      "with duplicate, generic, catch-all, or 'other' options. Each option must be a " +
      "concrete choice that leads to an existing target task, uses an available tool, or " +
      "is a genuinely new choice the user can wire later. Keep labels short, distinct, " +
      "and easy for a person to choose. Set resultTaskId only to an existing task id, or " +
      "null. Never use a tool key as a result task id.",
    prompt: [
      context,
      "Existing target tasks (use these ids or null for resultTaskId):",
      targetList,
      "Available tools (reference their capabilities in descriptions; never use a key as a result task id):",
      JSON.stringify(availableToolCatalog(), null, 2),
    ].join("\n\n"),
    format: userDecisionSchema(),
  };
}

export async function draftFlowStartTask(
  userId: number,
  kind: FlowStartKind,
  state: string,
  prompt: string | null,
  fileIds?: number[] | null,
  folderIds?: number[] | null,
): Promise<FlowTaskDraft> {
  if (kind === "existingTask") {
    throw new GraphQLError("Existing tasks do not need a draft", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const attachments = await attachmentText(fileIds, folderIds);
  const stateText = [
    state,
    attachments ? `Attached context:\n${attachments}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const taskRows = await db
    .select({ id: tasks.id, name: tasks.name, type: tasks.type })
    .from(tasks);
  const targetList = JSON.stringify(taskRows, null, 2);
  const targetIds = await targetTaskIdsExist(taskRows.map((task) => task.id));

  const model = await getModelForUser(userId);
  const build = promptForKind(kind, stateText, prompt, targetList);
  const generated = await generateJsonObject({ model, ...build });
  const warnings: string[] = [];
  const name = cleanName(generated.name, "New task");

  if (kind === "newToolTask") {
    const toolKey = asString(generated.toolKey);
    const toolConfig = asRecord(generated.toolConfig) ?? {};
    const rawOutputType = asString(generated.toolOutputType);
    const outputType: TaskOutputType =
      rawOutputType === "foreach" ? "foreach" : "normal";

    const draft: FlowTaskDraft = {
      kind,
      name,
      type: "tool",
      toolKey,
      toolConfig,
      toolOutputType: outputType,
      fallbackTaskId: null,
      decision: null,
      userDecision: null,
      warnings,
      model,
    };

    if (!toolKey) {
      warnings.push(
        "The model did not choose a tool. Pick one before creating.",
      );
    } else {
      try {
        await assertValidTaskConfig({
          type: "tool",
          toolKey,
          toolConfig,
          toolOutputType: outputType,
          model: null,
          decisionModel: null,
        });
      } catch (err) {
        warnings.push(err instanceof Error ? err.message : String(err));
      }
    }

    return draft;
  }

  if (kind === "newDecisionTask") {
    return {
      kind,
      name,
      type: "decision",
      toolKey: null,
      toolConfig: null,
      toolOutputType: "normal",
      fallbackTaskId: null,
      decision: parseDecisionDraft(generated, name, targetIds, warnings),
      userDecision: null,
      warnings,
      model,
    };
  }

  return {
    kind,
    name,
    type: "userDecision",
    toolKey: null,
    toolConfig: null,
    toolOutputType: "normal",
    fallbackTaskId: null,
    decision: null,
    userDecision: parseUserDecisionDraft(generated, name, targetIds),
    warnings,
    model,
  };
}

export async function refineFlowTaskDraft(
  userId: number,
  draft: unknown,
  state: string,
  prompt: string,
): Promise<FlowTaskDraft> {
  const record = asRecord(draft);
  const kind = asString(record?.kind) as FlowStartKind | null;

  if (
    !record ||
    !kind ||
    (kind !== "newToolTask" &&
      kind !== "newDecisionTask" &&
      kind !== "newUserDecisionTask")
  ) {
    throw new GraphQLError("The draft has an unknown task kind", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const taskRows = await db
    .select({ id: tasks.id, name: tasks.name, type: tasks.type })
    .from(tasks);
  const targetList = JSON.stringify(taskRows, null, 2);
  const targetIds = await targetTaskIdsExist(taskRows.map((task) => task.id));

  const model = await getModelForUser(userId);
  const build = promptForKind(kind, state, prompt, targetList, record);
  const generated = await generateJsonObject({ model, ...build });
  const warnings: string[] = [];
  const name = cleanName(generated.name, asString(record.name) ?? "New task");

  if (kind === "newToolTask") {
    const toolKey =
      asString(generated.toolKey) ?? asString(record.toolKey) ?? null;
    const toolConfig =
      asRecord(generated.toolConfig) ?? asRecord(record.toolConfig) ?? {};
    const rawOutputType =
      asString(generated.toolOutputType) ?? asString(record.toolOutputType);
    const outputType: TaskOutputType =
      rawOutputType === "foreach" ? "foreach" : "normal";

    return {
      kind,
      name,
      type: "tool",
      toolKey,
      toolConfig,
      toolOutputType: outputType,
      fallbackTaskId: asInt(record.fallbackTaskId),
      decision: null,
      userDecision: null,
      warnings,
      model,
    };
  }

  if (kind === "newDecisionTask") {
    return {
      kind,
      name,
      type: "decision",
      toolKey: null,
      toolConfig: null,
      toolOutputType: "normal",
      fallbackTaskId: null,
      decision: parseDecisionDraft(generated, name, targetIds, warnings),
      userDecision: null,
      warnings,
      model,
    };
  }

  return {
    kind,
    name,
    type: "userDecision",
    toolKey: null,
    toolConfig: null,
    toolOutputType: "normal",
    fallbackTaskId: null,
    decision: null,
    userDecision: parseUserDecisionDraft(generated, name, targetIds),
    warnings,
    model,
  };
}
