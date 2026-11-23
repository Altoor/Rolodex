import { eq, inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import {
  db,
  decisions,
  fileEntries,
  taskResults,
  tasks,
  userDecisionOptions,
} from "@repo/db";
import { getModelForUser } from "@repo/ai";
import { listToolDefinitions } from "../../tools/registry";
import {
  assertValidTaskConfig,
  defaultCanRunInParallel,
  type TaskOutputType,
} from "../task/task/task-service";
import { createQueuedTask } from "../task/queuedtask/queued-task-service";
import type { FlowStartKind } from "./flow-proposal-service";
import { generateJsonObject } from "./structured-generation";

export interface FlowPlanDecisionResultDraft {
  option: string | null;
  targetKey: string | null;
  targetTaskId: number | null;
  scoreThreshold: number | null;
  probabilityThreshold: number | null;
  confidenceThreshold: number | null;
}

export interface FlowPlanDecisionDraft {
  name: string;
  type: "choice" | "noul" | "score";
  decisionPremise: string;
  instruction: string;
  options: { name: string; description: string }[];
  results: FlowPlanDecisionResultDraft[];
}

export interface FlowPlanUserDecisionOptionDraft {
  label: string;
  description: string | null;
  value: string;
  targetKey: string | null;
  resultTaskId: number | null;
}

export interface FlowPlanUserDecisionDraft {
  choiceType: "yesNo" | "list" | "dropdown";
  prompt: string;
  acceptLabel: string;
  options: FlowPlanUserDecisionOptionDraft[];
}

export interface FlowPlanNodeDraft {
  key: string;
  kind: FlowStartKind;
  taskId: number | null;
  name: string;
  description: string;
  toolKey: string | null;
  toolConfig: Record<string, unknown> | null;
  toolOutputType: TaskOutputType;
  /** Tool continuation, either a new task key or an existing task id. */
  nextKey: string | null;
  nextTaskId: number | null;
  /** `if` tool branches. */
  onTrueKey: string | null;
  onTrueTaskId: number | null;
  onFalseKey: string | null;
  onFalseTaskId: number | null;
  decision: FlowPlanDecisionDraft | null;
  userDecision: FlowPlanUserDecisionDraft | null;
  /** Where this new branch joins the existing flow. */
  attach: FlowPlanAttachment | null;
}

export type FlowPlanBranch = "next" | "onTrue" | "onFalse";

export interface FlowPlanAttachment {
  mode:
    | "appendOption"
    | "setNext"
    | "setOnTrue"
    | "setOnFalse"
    | "setDecisionResultTarget";
  taskId: number;
  optionName: string | null;
  optionDescription: string | null;
  option: string | null;
  resultId: number | null;
}

export interface FlowPlanSetBranchEdit {
  kind: "setNext" | "setOnTrue" | "setOnFalse";
  taskId: number;
  targetKey: string | null;
  targetTaskId: number | null;
  targetNull: boolean;
}

export interface FlowPlanAppendDecisionOptionEdit {
  kind: "appendDecisionOption";
  taskId: number;
  name: string;
  description: string;
  targetKey: string | null;
  targetTaskId: number | null;
}

export interface FlowPlanAppendUserDecisionOptionEdit {
  kind: "appendUserDecisionOption";
  taskId: number;
  label: string;
  description: string | null;
  value: string;
  targetKey: string | null;
  targetTaskId: number | null;
}

export interface FlowPlanSetDecisionResultTargetEdit {
  kind: "setDecisionResultTarget";
  taskId: number;
  option: string | null;
  resultId: number | null;
  targetKey: string | null;
  targetTaskId: number | null;
}

export type FlowPlanEditDraft =
  | FlowPlanSetBranchEdit
  | FlowPlanAppendDecisionOptionEdit
  | FlowPlanAppendUserDecisionOptionEdit
  | FlowPlanSetDecisionResultTargetEdit;

export interface FlowPlanDraft {
  goal: string;
  startKey: string | null;
  startTaskId: number | null;
  nodes: FlowPlanNodeDraft[];
  edits: FlowPlanEditDraft[];
  warnings: string[];
  model: string;
}

export interface FlowPlanStartResult {
  goal: string;
  startTaskId: number;
  taskIds: number[];
  warnings: string[];
  queuedTask: Awaited<ReturnType<typeof createQueuedTask>> | null;
}

interface PlanRunContext {
  /** A compact summary of the previous attempt, used when revising. */
  previousRun?: string | null;
  /** The user's feedback about the previous attempt. */
  feedback?: string | null;
  /**
   * Attachment description to use instead of loading file/folder ids. Revised
   * runs carry their attachments in the previous run's tool state.
   */
  attachmentsText?: string | null;
}

const PLAN_SYSTEM =
  "You extend complete automation flows for a local task runner. Return only " +
  "JSON matching the schema. You are given the entire existing task graph. " +
  "Reuse the route that already applies to the request instead of duplicating " +
  "it, then add only the missing steps. When the request needs to choose " +
  "between kinds of work (for example folder vs file), create a decision task, " +
  "never a prompt task, so the route is explicit. Extend existing decision " +
  "tasks by appending a new option rather than creating a second decision. " +
  "You may fill in or extend existing wiring and append options, but do not " +
  "rewrite an existing task's tool configuration.";

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

function parseDecision(
  value: unknown,
  fallbackName: string,
): FlowPlanDecisionDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const rawType = asString(record.type) ?? "choice";
  const type: FlowPlanDecisionDraft["type"] =
    rawType === "noul" || rawType === "score" ? rawType : "choice";

  const options = asArray(record.options).flatMap((entry) => {
    const option = asRecord(entry);
    const name = asString(option?.name) ?? asString(option?.option);
    if (!name) return [];
    return [{ name, description: asString(option?.description) ?? "" }];
  });

  const results = asArray(record.results).flatMap((entry) => {
    const result = asRecord(entry);
    if (!result) return [];
    const probabilityThreshold = asNumber(result.probabilityThreshold);
    return [
      {
        option: asString(result.option),
        targetKey: asString(result.targetKey),
        targetTaskId: asInt(result.targetTaskId),
        scoreThreshold: asNumber(result.scoreThreshold),
        probabilityThreshold:
          type === "choice"
            ? (probabilityThreshold ?? 0.8)
            : probabilityThreshold,
        confidenceThreshold: asNumber(result.confidenceThreshold),
      },
    ];
  });

  return {
    name: cleanName(record.name, fallbackName),
    type,
    decisionPremise:
      asString(record.decisionPremise) ?? "Which option fits best?",
    instruction:
      asString(record.instruction) ??
      "Choose the option that best fits the current state.",
    options,
    results,
  };
}

function parseUserDecision(value: unknown): FlowPlanUserDecisionDraft | null {
  const record = asRecord(value);
  if (!record) return null;

  const rawType = asString(record.choiceType) ?? "list";
  const choiceType: FlowPlanUserDecisionDraft["choiceType"] =
    rawType === "yesNo" || rawType === "dropdown" ? rawType : "list";

  const options = asArray(record.options).flatMap((entry) => {
    const option = asRecord(entry);
    const label = asString(option?.label);
    if (!option || !label) return [];
    return [
      {
        label,
        description: asString(option.description),
        value:
          asString(option.value) ?? label.toLowerCase().replace(/\s+/g, "-"),
        targetKey: asString(option.targetKey),
        resultTaskId: asInt(option.resultTaskId),
      },
    ];
  });

  return {
    choiceType,
    prompt: asString(record.prompt) ?? "Choose an option",
    acceptLabel: asString(record.acceptLabel) ?? "Accept",
    options,
  };
}

function parseAttachment(value: unknown): FlowPlanAttachment | null {
  const record = asRecord(value);
  if (!record) return null;

  const mode = asString(record.mode);
  const taskId = asInt(record.taskId);
  if (!mode || taskId == null) return null;

  if (
    mode !== "appendOption" &&
    mode !== "setNext" &&
    mode !== "setOnTrue" &&
    mode !== "setOnFalse" &&
    mode !== "setDecisionResultTarget"
  ) {
    return null;
  }

  return {
    mode,
    taskId,
    optionName: asString(record.optionName),
    optionDescription: asString(record.optionDescription),
    option: asString(record.option),
    resultId: asInt(record.resultId),
  };
}

function parseNode(record: Record<string, unknown>): FlowPlanNodeDraft | null {
  const key = asString(record.key);
  const kind = asString(record.kind) as FlowStartKind | null;
  if (!key || !kind) return null;

  return {
    key,
    kind,
    taskId: asInt(record.taskId),
    name: cleanName(record.name, key),
    description: asString(record.description) ?? "",
    toolKey: asString(record.toolKey),
    toolConfig: asRecord(record.toolConfig),
    toolOutputType:
      asString(record.toolOutputType) === "foreach" ? "foreach" : "normal",
    nextKey: asString(record.nextKey),
    nextTaskId: asInt(record.nextTaskId),
    onTrueKey: asString(record.onTrueKey),
    onTrueTaskId: asInt(record.onTrueTaskId),
    onFalseKey: asString(record.onFalseKey),
    onFalseTaskId: asInt(record.onFalseTaskId),
    decision:
      kind === "newDecisionTask"
        ? parseDecision(record.decision, cleanName(record.name, key))
        : null,
    userDecision:
      kind === "newUserDecisionTask"
        ? parseUserDecision(record.userDecision)
        : null,
    attach: parseAttachment(record.attach),
  };
}

function parseEdits(value: unknown): FlowPlanEditDraft[] {
  const edits: FlowPlanEditDraft[] = [];

  for (const entry of asArray(value)) {
    const record = asRecord(entry);
    const kind = asString(record?.kind);
    const taskId = asInt(record?.taskId);
    if (!record || !kind || taskId == null) continue;

    if (kind === "setNext" || kind === "setOnTrue" || kind === "setOnFalse") {
      edits.push({
        kind,
        taskId,
        targetKey: asString(record.targetKey),
        targetTaskId: asInt(record.targetTaskId),
        targetNull: record.targetNull === true,
      });
      continue;
    }

    if (kind === "appendDecisionOption") {
      const name = asString(record.name) ?? asString(record.option);
      const targetKey = asString(record.targetKey);
      const targetTaskId = asInt(record.targetTaskId);
      if (!name || (targetKey == null && targetTaskId == null)) continue;
      edits.push({
        kind,
        taskId,
        name,
        description: asString(record.description) ?? "",
        targetKey,
        targetTaskId,
      });
      continue;
    }

    if (kind === "appendUserDecisionOption") {
      const label = asString(record.label);
      const targetKey = asString(record.targetKey);
      const targetTaskId = asInt(record.targetTaskId);
      if (!label || (targetKey == null && targetTaskId == null)) continue;
      edits.push({
        kind,
        taskId,
        label,
        description: asString(record.description),
        value:
          asString(record.value) ?? label.toLowerCase().replace(/\s+/g, "-"),
        targetKey,
        targetTaskId,
      });
      continue;
    }

    if (kind === "setDecisionResultTarget") {
      const option = asString(record.option);
      const resultId = asInt(record.resultId);
      const targetKey = asString(record.targetKey);
      const targetTaskId = asInt(record.targetTaskId);
      if (option == null && resultId == null) continue;
      if (targetKey == null && targetTaskId == null) continue;
      edits.push({
        kind,
        taskId,
        option,
        resultId,
        targetKey,
        targetTaskId,
      });
    }
  }

  return edits;
}

function attachmentEdits(nodes: FlowPlanNodeDraft[]): FlowPlanEditDraft[] {
  const edits: FlowPlanEditDraft[] = [];

  for (const node of nodes) {
    if (!node.attach) continue;
    const { mode, taskId } = node.attach;

    if (mode === "appendOption") {
      edits.push({
        kind: "appendDecisionOption",
        taskId,
        name: node.attach.optionName ?? node.name,
        description: node.attach.optionDescription ?? node.description,
        targetKey: node.key,
        targetTaskId: null,
      });
      continue;
    }

    if (mode === "setDecisionResultTarget") {
      edits.push({
        kind: "setDecisionResultTarget",
        taskId,
        option: node.attach.option,
        resultId: node.attach.resultId,
        targetKey: node.key,
        targetTaskId: null,
      });
      continue;
    }

    edits.push({
      kind: mode,
      taskId,
      targetKey: node.key,
      targetTaskId: null,
      targetNull: false,
    });
  }

  return edits;
}

function editKey(edit: FlowPlanEditDraft): string {
  const label =
    edit.kind === "appendDecisionOption"
      ? edit.name
      : edit.kind === "appendUserDecisionOption"
        ? edit.label
        : edit.kind === "setDecisionResultTarget"
          ? `${edit.resultId ?? ""}:${edit.option ?? ""}`
          : "";
  return [
    edit.kind,
    edit.taskId,
    edit.targetKey ?? "",
    edit.targetTaskId ?? "",
    label,
  ].join(":");
}

/**
 * Repairs the most common near-miss: the model tries to branch a decision with
 * setNext/setOnTrue/setOnFalse, or branches an if tool with setNext. Turning
 * those into the operation the runner actually supports keeps the planned flow
 * reachable instead of rejecting a good task list.
 */
function repairPlanEdits(
  plan: FlowPlanDraft,
  existingTasks: ExistingTaskGraph[],
  options: { allowDecisionAppend: boolean },
): void {
  const taskById = new Map(existingTasks.map((task) => [task.id, task]));
  const nodeByKey = new Map(plan.nodes.map((node) => [node.key, node]));
  const repaired: FlowPlanEditDraft[] = [];

  const leafName = (edit: FlowPlanEditDraft): string | null => {
    let key = edit.targetKey;
    let id = edit.targetTaskId;
    let name: string | null = null;
    const seen = new Set<string>();

    while (true) {
      if (key != null) {
        if (seen.has(key)) break;
        seen.add(key);
        const node = nodeByKey.get(key);
        if (!node) break;
        name = node.name;
        const next =
          node.decision?.results.find((row) => row.targetKey)?.targetKey ??
          node.userDecision?.options.find((row) => row.targetKey)?.targetKey ??
          node.nextKey ??
          node.onFalseKey ??
          node.onTrueKey ??
          null;
        const nextId =
          node.decision?.results.find((row) => row.targetTaskId)
            ?.targetTaskId ??
          node.userDecision?.options.find((row) => row.resultTaskId)
            ?.resultTaskId ??
          node.nextTaskId ??
          node.onFalseTaskId ??
          node.onTrueTaskId ??
          null;
        if (next != null) {
          key = next;
          id = null;
          continue;
        }
        if (nextId != null) {
          key = null;
          id = nextId;
          continue;
        }
        break;
      }

      if (id != null) {
        name = taskById.get(id)?.name ?? name;
        break;
      }

      break;
    }

    return name;
  };

  for (const edit of plan.edits) {
    const task = taskById.get(edit.taskId);

    if (
      task?.type === "decision" &&
      (edit.kind === "setNext" ||
        edit.kind === "setOnTrue" ||
        edit.kind === "setOnFalse")
    ) {
      if (!options.allowDecisionAppend) {
        // During a revision the model should rewire the matching result instead
        // of appending a parallel option. Leave the edit for validation, which
        // returns a targeted correction and triggers one retry.
        repaired.push(edit);
        continue;
      }

      const name = leafName(edit) ?? `Continue to ${edit.taskId}`;
      repaired.push({
        kind: "appendDecisionOption",
        taskId: edit.taskId,
        name,
        description: `Route to the ${name} flow.`,
        targetKey: edit.targetKey,
        targetTaskId: edit.targetTaskId,
      });
      plan.warnings.push(
        `Converted the branch edit on decision task ${edit.taskId} into an appended option "${name}".`,
      );
      continue;
    }

    if (task?.toolKey === "if" && edit.kind === "setNext") {
      const branch =
        task.onFalseTaskId == null
          ? "setOnFalse"
          : task.onTrueTaskId == null
            ? "setOnTrue"
            : null;
      if (branch) {
        repaired.push({ ...edit, kind: branch });
        plan.warnings.push(
          `Converted setNext on if task ${edit.taskId} to ${branch}.`,
        );
        continue;
      }
    }

    repaired.push(edit);
  }

  plan.edits = repaired;
}

/** Distances from the start task along the existing route. */
function reachableDepths(
  existingTasks: ExistingTaskGraph[],
  startTaskId: number,
): Map<number, number> {
  const byId = new Map(existingTasks.map((task) => [task.id, task]));
  const depths = new Map<number, number>();
  const queue: { id: number; depth: number }[] = [
    { id: startTaskId, depth: 0 },
  ];

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const previous = depths.get(id);
    if (previous != null && previous <= depth) continue;
    depths.set(id, depth);

    const task = byId.get(id);
    if (!task) continue;
    const nextDepth = depth + 1;

    const targets: (number | null)[] = [];
    if (task.type === "decision") {
      targets.push(task.nextTaskId);
      for (const result of task.decision?.results ?? []) {
        targets.push(result.targetTaskId);
      }
    } else if (task.type === "userDecision") {
      targets.push(task.nextTaskId);
      for (const option of task.userDecision?.options ?? []) {
        targets.push(option.resultTaskId);
      }
    } else if (task.toolKey === "if") {
      targets.push(task.onTrueTaskId, task.onFalseTaskId);
    } else if (task.toolKey === "switch") {
      const config = asRecord(task.toolConfig);
      for (const entry of asArray(config?.cases)) {
        targets.push(asInt(asRecord(entry)?.nextTaskId));
      }
      targets.push(asInt(config?.defaultTaskId), task.nextTaskId);
    } else {
      targets.push(task.nextTaskId, task.onTrueTaskId, task.onFalseTaskId);
    }

    for (const target of targets) {
      if (target != null) queue.push({ id: target, depth: nextDepth });
    }
  }

  return depths;
}

function nodeLeafName(
  startKey: string,
  nodeByKey: Map<string, FlowPlanNodeDraft>,
): string | null {
  let key: string | null = startKey;
  let name: string | null = null;
  const seen = new Set<string>();

  while (key != null) {
    if (seen.has(key)) break;
    seen.add(key);
    const node = nodeByKey.get(key);
    if (!node) break;
    name = node.name;

    const nextKey =
      node.decision?.results.find((row) => row.targetKey)?.targetKey ??
      node.userDecision?.options.find((row) => row.targetKey)?.targetKey ??
      node.nextKey ??
      node.onFalseKey ??
      node.onTrueKey ??
      null;
    key = nextKey;
  }

  return name;
}

/**
 * A small model sometimes returns the right task list but forgets the edit that
 * joins it to the existing route. This attaches the new branch to the deepest
 * open decision option or branch, using the new flow's leaf task as the option
 * label. It only runs when no edit already targets a new task.
 */
function autoAttachPlan(
  plan: FlowPlanDraft,
  existingTasks: ExistingTaskGraph[],
  startTaskId: number | null,
  goal: string,
): void {
  if (startTaskId == null) return;

  const newKeys = new Set(
    plan.nodes
      .filter((node) => node.kind !== "existingTask")
      .map((node) => node.key),
  );
  if (newKeys.size === 0) return;

  const alreadyAttached = plan.edits.some(
    (edit) => edit.targetKey != null && newKeys.has(edit.targetKey),
  );
  if (alreadyAttached) return;

  // Drop meaningless edits so validation can see the real situation.
  plan.edits = plan.edits.filter((edit) => {
    if (
      (edit.kind === "appendDecisionOption" ||
        edit.kind === "appendUserDecisionOption") &&
      edit.targetKey == null &&
      edit.targetTaskId == null
    ) {
      return false;
    }
    if (
      (edit.kind === "setNext" ||
        edit.kind === "setOnTrue" ||
        edit.kind === "setOnFalse") &&
      edit.targetKey == null &&
      edit.targetTaskId == null &&
      !edit.targetNull
    ) {
      return false;
    }
    return true;
  });

  const nodeByKey = new Map(plan.nodes.map((node) => [node.key, node]));
  const targeted = new Set<string>();
  const addTarget = (key: string | null, id: number | null) => {
    if (key != null) targeted.add(key);
    // Existing ids cannot be new nodes.
    void id;
  };

  for (const node of plan.nodes) {
    if (node.kind === "existingTask") continue;
    addTarget(node.nextKey, node.nextTaskId);
    addTarget(node.onTrueKey, node.onTrueTaskId);
    addTarget(node.onFalseKey, node.onFalseTaskId);
    for (const result of node.decision?.results ?? []) {
      addTarget(result.targetKey, result.targetTaskId);
    }
    for (const option of node.userDecision?.options ?? []) {
      addTarget(option.targetKey, option.resultTaskId);
    }
  }

  const roots = plan.nodes.filter(
    (node) => node.kind !== "existingTask" && !targeted.has(node.key),
  );
  const root =
    roots[0] ?? plan.nodes.find((node) => node.kind !== "existingTask");
  if (!root) return;
  const optionName = nodeLeafName(root.key, nodeByKey) ?? root.name;

  const depths = reachableDepths(existingTasks, startTaskId);
  const reachable = [...depths.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => existingTasks.find((task) => task.id === id))
    .filter((task): task is ExistingTaskGraph => task != null);

  // Prefer the deepest decision with an option that currently ends the flow.
  const openDecision = reachable.find(
    (task) =>
      task.decision != null &&
      task.decision.results.some((result) => result.targetTaskId == null),
  );

  if (openDecision) {
    plan.edits.push({
      kind: "appendDecisionOption",
      taskId: openDecision.id,
      name: optionName,
      description: `Route to the ${optionName} flow. ${goal}`.trim(),
      targetKey: root.key,
      targetTaskId: null,
    });
    plan.warnings.push(
      `Attached the new flow to decision task ${openDecision.id} as option "${optionName}" because the plan did not connect it.`,
    );
    return;
  }

  // Otherwise attach to the deepest open branch.
  for (const task of reachable) {
    if (task.toolKey === "if" || task.toolKey === "switch") {
      if (task.onFalseTaskId == null) {
        plan.edits.push({
          kind: "setOnFalse",
          taskId: task.id,
          targetKey: root.key,
          targetTaskId: null,
          targetNull: false,
        });
        plan.warnings.push(
          `Attached the new flow to the false branch of task ${task.id} because the plan did not connect it.`,
        );
        return;
      }
      if (task.onTrueTaskId == null) {
        plan.edits.push({
          kind: "setOnTrue",
          taskId: task.id,
          targetKey: root.key,
          targetTaskId: null,
          targetNull: false,
        });
        plan.warnings.push(
          `Attached the new flow to the true branch of task ${task.id} because the plan did not connect it.`,
        );
        return;
      }
    }

    if (
      task.type !== "decision" &&
      task.type !== "userDecision" &&
      task.toolKey !== "if" &&
      task.toolKey !== "switch" &&
      task.nextTaskId == null
    ) {
      plan.edits.push({
        kind: "setNext",
        taskId: task.id,
        targetKey: root.key,
        targetTaskId: null,
        targetNull: false,
      });
      plan.warnings.push(
        `Attached the new flow after task ${task.id} because the plan did not connect it.`,
      );
      return;
    }
  }
}

/**
 * On a revision, a small model often appends a second option instead of
 * rewiring the option the feedback actually names. Turn that append into a
 * rewire of the mentioned existing result, so revisions correct the existing
 * route instead of growing parallel choices.
 */
function rewireOnRevision(
  plan: FlowPlanDraft,
  existingTasks: ExistingTaskGraph[],
  feedback: string | null,
): void {
  if (!feedback) return;

  const taskById = new Map(existingTasks.map((task) => [task.id, task]));
  const normalize = (value: string) =>
    value
      .toLowerCase()
      .replace(/[“”"'`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const text = normalize(feedback);
  const askedToRewire =
    /\b(rewire|repoint|redirect|replace|correct|change|instead|existing)\b/.test(
      text,
    );

  const rewired: FlowPlanEditDraft[] = [];
  for (const edit of plan.edits) {
    if (edit.kind !== "appendDecisionOption") {
      rewired.push(edit);
      continue;
    }

    const task = taskById.get(edit.taskId);
    if (!task?.decision) {
      rewired.push(edit);
      continue;
    }

    const options = task.decision.results.filter(
      (result): result is ExistingDecisionResult & { option: string } =>
        result.option != null && result.option.trim().length > 0,
    );
    const normalizedName = normalize(edit.name);

    // The option the feedback actually talks about wins, even when the model
    // named its new option after a different existing choice.
    const mentioned = askedToRewire
      ? options
          .filter((result) => text.includes(normalize(result.option)))
          .sort((a, b) => b.option.length - a.option.length)
      : [];

    const target =
      mentioned[0] ??
      options.find((result) => {
        const option = normalize(result.option);
        return option === normalizedName || normalizedName.includes(option);
      });

    if (!target) {
      rewired.push(edit);
      continue;
    }

    rewired.push({
      kind: "setDecisionResultTarget",
      taskId: edit.taskId,
      option: target.option,
      resultId: target.resultId,
      targetKey: edit.targetKey,
      targetTaskId: edit.targetTaskId,
    });
    plan.warnings.push(
      `Rewired decision result ${target.resultId} ("${target.option}") instead of appending a duplicate option.`,
    );
  }

  plan.edits = rewired;
}

function parsePlan(
  generated: Record<string, unknown>,
  existingIds: Set<number>,
  model: string,
  forcedStartTaskId: number | null,
): FlowPlanDraft {
  const nodes = asArray(generated.tasks).flatMap((entry) => {
    const record = asRecord(entry);
    return record
      ? ([parseNode(record)].filter(Boolean) as FlowPlanNodeDraft[])
      : [];
  });

  const keys = new Set<string>();
  for (const node of nodes) {
    if (keys.has(node.key)) {
      throw new GraphQLError(`The plan has duplicate task key "${node.key}"`, {
        extensions: { code: "BAD_GATEWAY" },
      });
    }
    keys.add(node.key);

    if (node.kind === "existingTask") {
      if (node.taskId == null || !existingIds.has(node.taskId)) {
        throw new GraphQLError(
          `The plan references unknown existing task ${node.taskId ?? "null"}`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }
      continue;
    }

    if (
      node.kind !== "newToolTask" &&
      node.kind !== "newDecisionTask" &&
      node.kind !== "newUserDecisionTask"
    ) {
      throw new GraphQLError(
        `The plan uses an unknown task kind "${node.kind}"`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }

    if (node.kind === "newToolTask" && !node.toolKey) {
      throw new GraphQLError(`The plan task "${node.name}" has no tool`, {
        extensions: { code: "BAD_GATEWAY" },
      });
    }

    if (node.kind === "newDecisionTask") {
      if (!node.decision || node.decision.options.length < 2) {
        throw new GraphQLError(
          `The plan decision "${node.name}" needs at least two options`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }
      if (node.decision.results.length === 0) {
        throw new GraphQLError(
          `The plan decision "${node.name}" has no results`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }
    }

    if (
      node.kind === "newUserDecisionTask" &&
      (!node.userDecision || node.userDecision.options.length === 0)
    ) {
      throw new GraphQLError(
        `The plan user decision "${node.name}" has no options`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  }

  const combinedEdits = [
    ...parseEdits(generated.edits),
    ...attachmentEdits(nodes),
  ];
  const seenEdits = new Set<string>();
  const edits = combinedEdits.filter((edit) => {
    const key = editKey(edit);
    if (seenEdits.has(key)) return false;
    seenEdits.add(key);
    return true;
  });

  if (
    nodes.every((node) => node.kind === "existingTask") &&
    edits.length === 0
  ) {
    throw new GraphQLError(
      "The planner did not add a task or edit an existing flow",
      { extensions: { code: "BAD_GATEWAY" } },
    );
  }

  const startKey = asString(generated.startKey);
  const generatedStartTaskId = asInt(generated.startTaskId);
  const normalizeTarget = (
    key: string | null,
    id: number | null,
  ): [string | null, number | null] => {
    if (key != null && /^\d+$/.test(key)) {
      const parsed = Number(key);
      if (existingIds.has(parsed)) return [null, id ?? parsed];
    }
    return [key, id];
  };

  const numericStart =
    startKey != null && /^\d+$/.test(startKey) ? Number(startKey) : null;
  const startTaskId =
    forcedStartTaskId ??
    generatedStartTaskId ??
    (numericStart != null && existingIds.has(numericStart)
      ? numericStart
      : null);

  if (startTaskId != null) {
    if (!existingIds.has(startTaskId)) {
      throw new GraphQLError(
        `The plan starts at unknown existing task ${startTaskId}`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  } else if (!startKey || !keys.has(startKey)) {
    throw new GraphQLError("The plan's startKey does not match any task", {
      extensions: { code: "BAD_GATEWAY" },
    });
  }

  const assertTarget = (
    targetKey: string | null,
    targetTaskId: number | null,
  ) => {
    if (targetKey != null && !keys.has(targetKey)) {
      throw new GraphQLError(
        `The plan references unknown task key "${targetKey}"`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
    if (targetTaskId != null && !existingIds.has(targetTaskId)) {
      throw new GraphQLError(
        `The plan references unknown existing task ${targetTaskId}`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  };

  for (const node of nodes) {
    [node.nextKey, node.nextTaskId] = normalizeTarget(
      node.nextKey,
      node.nextTaskId,
    );
    [node.onTrueKey, node.onTrueTaskId] = normalizeTarget(
      node.onTrueKey,
      node.onTrueTaskId,
    );
    [node.onFalseKey, node.onFalseTaskId] = normalizeTarget(
      node.onFalseKey,
      node.onFalseTaskId,
    );

    for (const result of node.decision?.results ?? []) {
      [result.targetKey, result.targetTaskId] = normalizeTarget(
        result.targetKey,
        result.targetTaskId,
      );
    }

    for (const option of node.userDecision?.options ?? []) {
      [option.targetKey, option.resultTaskId] = normalizeTarget(
        option.targetKey,
        option.resultTaskId,
      );
    }
  }

  for (const edit of edits) {
    if (!existingIds.has(edit.taskId)) {
      throw new GraphQLError(
        `The plan edits unknown existing task ${edit.taskId}`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
    [edit.targetKey, edit.targetTaskId] = normalizeTarget(
      edit.targetKey,
      edit.targetTaskId,
    );
  }

  for (const node of nodes) {
    assertTarget(node.nextKey, node.nextTaskId);
    assertTarget(node.onTrueKey, node.onTrueTaskId);
    assertTarget(node.onFalseKey, node.onFalseTaskId);

    for (const result of node.decision?.results ?? []) {
      assertTarget(result.targetKey, result.targetTaskId);
    }

    for (const option of node.userDecision?.options ?? []) {
      assertTarget(option.targetKey, option.resultTaskId);
    }
  }

  for (const edit of edits) {
    assertTarget(edit.targetKey, edit.targetTaskId);
  }

  return {
    goal: asString(generated.goal) ?? "Achieve the requested result",
    startKey: startTaskId == null ? startKey : null,
    startTaskId,
    nodes,
    edits,
    warnings: [],
    model,
  };
}

function planSchema(): Record<string, unknown> {
  const optionSchema = {
    type: "object",
    properties: {
      name: { type: "string" },
      description: { type: "string" },
    },
    required: ["name", "description"],
  };

  const resultSchema = {
    type: "object",
    properties: {
      option: { type: ["string", "null"] },
      targetKey: { type: ["string", "null"] },
      targetTaskId: { type: ["integer", "null"] },
      scoreThreshold: { type: ["number", "null"] },
      probabilityThreshold: { type: ["number", "null"] },
      confidenceThreshold: { type: ["number", "null"] },
    },
    required: ["option"],
  };

  return {
    type: "object",
    properties: {
      goal: { type: "string" },
      startKey: { type: ["string", "null"] },
      startTaskId: { type: ["integer", "null"] },
      edits: {
        type: "array",
        minItems: 0,
        items: {
          type: "object",
          properties: {
            kind: {
              type: "string",
              enum: [
                "setNext",
                "setOnTrue",
                "setOnFalse",
                "appendDecisionOption",
                "appendUserDecisionOption",
                "setDecisionResultTarget",
              ],
            },
            taskId: { type: "integer" },
            targetKey: { type: ["string", "null"] },
            targetTaskId: { type: ["integer", "null"] },
            targetNull: { type: ["boolean", "null"] },
            name: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            label: { type: ["string", "null"] },
            value: { type: ["string", "null"] },
            option: { type: ["string", "null"] },
            resultId: { type: ["integer", "null"] },
          },
          required: ["kind", "taskId"],
        },
      },
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            kind: {
              type: "string",
              enum: [
                "existingTask",
                "newToolTask",
                "newDecisionTask",
                "newUserDecisionTask",
              ],
            },
            taskId: { type: ["integer", "null"] },
            name: { type: "string" },
            description: { type: "string" },
            toolKey: { type: ["string", "null"] },
            toolConfig: { type: "object" },
            toolOutputType: {
              type: "string",
              enum: ["normal", "foreach"],
            },
            nextKey: { type: ["string", "null"] },
            nextTaskId: { type: ["integer", "null"] },
            onTrueKey: { type: ["string", "null"] },
            onTrueTaskId: { type: ["integer", "null"] },
            onFalseKey: { type: ["string", "null"] },
            onFalseTaskId: { type: ["integer", "null"] },
            attach: {
              type: ["object", "null"],
              properties: {
                mode: {
                  type: "string",
                  enum: [
                    "appendOption",
                    "setNext",
                    "setOnTrue",
                    "setOnFalse",
                    "setDecisionResultTarget",
                  ],
                },
                taskId: { type: "integer" },
                optionName: { type: ["string", "null"] },
                optionDescription: { type: ["string", "null"] },
                option: { type: ["string", "null"] },
                resultId: { type: ["integer", "null"] },
              },
              required: ["mode", "taskId"],
            },
            decision: {
              type: "object",
              properties: {
                name: { type: "string" },
                type: {
                  type: "string",
                  enum: ["choice", "noul", "score"],
                },
                decisionPremise: { type: "string" },
                instruction: { type: "string" },
                options: { type: "array", items: optionSchema },
                results: { type: "array", items: resultSchema },
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
                      description: { type: ["string", "null"] },
                      value: { type: "string" },
                      targetKey: { type: ["string", "null"] },
                      resultTaskId: { type: ["integer", "null"] },
                    },
                    required: ["label", "value"],
                  },
                },
              },
              required: ["choiceType", "prompt", "acceptLabel", "options"],
            },
          },
          required: ["key", "kind", "name", "description"],
        },
      },
    },
    required: ["goal", "edits", "tasks"],
  };
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
    .select({ kind: fileEntries.kind, name: fileEntries.name })
    .from(fileEntries)
    .where(inArray(fileEntries.id, ids));

  return rows.map((row) => `${row.kind}: ${row.name}`).join("\n");
}

interface ExistingDecisionResult {
  resultId: number;
  option: string | null;
  targetTaskId: number | null;
  probabilityThreshold: number | null;
  scoreThreshold: number | null;
  confidenceThreshold: number | null;
}

interface ExistingTaskGraph {
  id: number;
  name: string;
  type: string;
  toolKey: string | null;
  toolConfig: unknown;
  toolOutputType: string | null;
  nextTaskId: number | null;
  onTrueTaskId: number | null;
  onFalseTaskId: number | null;
  decision: {
    id: number;
    name: string;
    type: string;
    decisionPremise: string;
    instruction: string;
    options: string[];
    optionDescriptions: string[];
    results: ExistingDecisionResult[];
  } | null;
  userDecision: {
    choiceType: string;
    prompt: string | null;
    acceptLabel: string | null;
    options: {
      optionId: number;
      label: string | null;
      description: string | null;
      value: string | null;
      resultTaskId: number | null;
    }[];
  } | null;
}

async function loadExistingGraph(): Promise<ExistingTaskGraph[]> {
  const [taskRows, decisionRows, resultRows, optionRows] = await Promise.all([
    db.select().from(tasks),
    db.select().from(decisions),
    db.select().from(taskResults),
    db.select().from(userDecisionOptions),
  ]);

  const decisionsById = new Map(decisionRows.map((row) => [row.id, row]));
  const resultsByTask = new Map<number, typeof resultRows>();
  for (const row of resultRows) {
    const list = resultsByTask.get(row.taskId);
    if (list) list.push(row);
    else resultsByTask.set(row.taskId, [row]);
  }
  const optionsByTask = new Map<number, typeof optionRows>();
  for (const row of optionRows) {
    const list = optionsByTask.get(row.taskId);
    if (list) list.push(row);
    else optionsByTask.set(row.taskId, [row]);
  }

  return taskRows.map((task) => {
    const decision = task.decisionId
      ? decisionsById.get(task.decisionId)
      : undefined;
    const results = resultsByTask.get(task.id) ?? [];
    const options = optionsByTask.get(task.id) ?? [];

    return {
      id: task.id,
      name: task.name,
      type: task.type,
      toolKey: task.toolKey ?? null,
      toolConfig: task.toolConfig ?? null,
      toolOutputType: task.toolOutputType ?? null,
      nextTaskId: task.fallbackTaskId ?? null,
      onTrueTaskId: task.onTrueTaskId ?? null,
      onFalseTaskId: task.onFalseTaskId ?? null,
      decision: decision
        ? {
            id: decision.id,
            name: decision.name,
            type: decision.type,
            decisionPremise: decision.decisionPremise,
            instruction: decision.instruction,
            options: decision.options ?? [],
            optionDescriptions: decision.optionDescriptions ?? [],
            results: results.map((row) => ({
              resultId: row.id,
              option: row.option,
              targetTaskId: row.resultTaskId,
              probabilityThreshold: row.probabilityThreshold,
              scoreThreshold: row.scoreThreshold,
              confidenceThreshold: row.confidenceThreshold,
            })),
          }
        : null,
      userDecision:
        task.type === "userDecision"
          ? {
              choiceType: task.userDecisionType ?? "list",
              prompt:
                (asRecord(task.userDecisionConfig)?.prompt as string) ?? null,
              acceptLabel:
                (asRecord(task.userDecisionConfig)?.acceptLabel as string) ??
                null,
              options: options.map((row) => ({
                optionId: row.id,
                label: row.label,
                description: row.description,
                value: row.value,
                resultTaskId: row.resultTaskId,
              })),
            }
          : null,
    };
  });
}

function toolCatalog(): Record<string, unknown>[] {
  return listToolDefinitions().map((tool) => {
    const schema = asRecord(tool.inputSchema);
    return {
      key: tool.key,
      name: tool.name,
      category: tool.category,
      description: tool.description,
      outputTypes: tool.outputTypes ?? ["normal"],
      exampleConfig: tool.exampleConfig ?? null,
      required: asArray(schema?.required),
      fields: Object.keys(asRecord(schema?.properties) ?? {}),
    };
  });
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function targetLabel(id: number | null, names: Map<number, string>): string {
  return id == null ? "END" : `${id} "${names.get(id) ?? "?"}"`;
}

/** A compact, readable rendering of every task and how it is wired. */
function taskGraphText(existingTasks: ExistingTaskGraph[]): string {
  const names = new Map(existingTasks.map((task) => [task.id, task.name]));

  return existingTasks
    .map((task) => {
      const lines = [
        `${task.id} "${task.name}" [${task.type}${
          task.toolKey ? `:${task.toolKey}` : ""
        }]`,
      ];

      if (task.toolConfig != null) {
        lines.push(
          `  config: ${truncate(JSON.stringify(task.toolConfig), 700)}`,
        );
      }

      if (task.decision) {
        for (const result of task.decision.results) {
          lines.push(
            `  result ${result.resultId} option "${result.option ?? "(threshold)"}" -> ${targetLabel(
              result.targetTaskId,
              names,
            )}`,
          );
        }
        for (const option of task.decision.options) {
          if (!task.decision.results.some((row) => row.option === option)) {
            lines.push(`  option "${option}" -> (no result)`);
          }
        }
      } else if (task.userDecision) {
        for (const option of task.userDecision.options) {
          lines.push(
            `  choice "${option.label ?? option.value ?? option.optionId}" -> ${targetLabel(
              option.resultTaskId,
              names,
            )}`,
          );
        }
      } else {
        lines.push(`  next -> ${targetLabel(task.nextTaskId, names)}`);
      }

      if (task.onTrueTaskId != null || task.onFalseTaskId != null) {
        lines.push(
          `  true -> ${targetLabel(
            task.onTrueTaskId,
            names,
          )}; false -> ${targetLabel(task.onFalseTaskId, names)}`,
        );
      }

      if (task.toolKey === "if") {
        lines.push(
          "  branch meaning: true runs when the condition is true; false runs when it is false",
        );
      } else if (task.toolKey === "switch") {
        lines.push(
          "  branch meaning: each case runs when that case matches; default runs otherwise",
        );
      }

      return lines.join("\n");
    })
    .join("\n");
}

const PLAN_EXAMPLE = `{
  "goal": "Create a new folder on command",
  "startTaskId": 18,
  "tasks": [
    {
      "key": "t1",
      "kind": "newDecisionTask",
      "name": "Choose the file action",
      "description": "Decide whether the prompt asks for a folder or something else.",
      "attach": { "mode": "setOnFalse", "taskId": 36 },
      "decision": {
        "name": "Choose the file action",
        "type": "choice",
        "decisionPremise": "Which file action does the prompt ask for?",
        "instruction": "Choose the option that matches the user's prompt.",
        "options": [
          { "name": "Create a new folder", "description": "The prompt asks to create a folder." },
          { "name": "Not a folder request", "description": "The prompt asks for something else." }
        ],
        "results": [
          { "option": "Create a new folder", "targetKey": "t2" },
          { "option": "Not a folder request", "targetKey": null }
        ]
      }
    },
    {
      "key": "t2",
      "kind": "newToolTask",
      "name": "Make folder name",
      "description": "Refine the folder name from the user's prompt.",
      "toolKey": "prompt",
      "toolConfig": {
        "system": "Create a short folder name and description from the user's request.",
        "fields": {
          "folderName": { "type": "string", "description": "Short folder name. No slashes." },
          "folderDescription": { "type": "string", "description": "One sentence describing the folder." }
        }
      },
      "nextKey": "t3"
    },
    {
      "key": "t3",
      "kind": "newToolTask",
      "name": "Create folder",
      "description": "Create the folder with the refined name.",
      "toolKey": "create_folder",
      "toolConfig": { "name": "{{folderName}}", "description": "{{folderDescription}}" },
      "nextKey": null
    }
  ],
  "edits": [
    { "kind": "setOnFalse", "taskId": 36, "targetKey": "t1" }
  ]
}`;

const APPEND_EXAMPLE = `{
  "goal": "Create a plaintext file on command",
  "startTaskId": 18,
  "tasks": [
    {
      "key": "f1",
      "kind": "newToolTask",
      "name": "Draft file name and content",
      "attach": {
        "mode": "appendOption",
        "taskId": 99,
        "optionName": "Create a plaintext file",
        "optionDescription": "The prompt asks to create a plaintext file and dictate its content."
      },
      "toolKey": "prompt",
      "toolConfig": {
        "system": "Create a plaintext file name and its requested content from the user's prompt.",
        "fields": {
          "fileName": { "type": "string", "description": "File name ending in .txt. No slashes." },
          "content": { "type": "string", "description": "The file content dictated by the user." }
        }
      },
      "nextKey": "f2"
    },
    {
      "key": "f2",
      "kind": "newToolTask",
      "name": "Create file",
      "toolKey": "create_file",
      "toolConfig": { "name": "{{fileName}}", "content": "{{content}}" },
      "nextKey": null
    }
  ],
  "edits": [
    {
      "kind": "appendDecisionOption",
      "taskId": 99,
      "name": "Create a plaintext file",
      "description": "The prompt asks to create a plaintext file and dictate its content.",
      "targetKey": "f1"
    }
  ]
}`;

const REWIRE_EXAMPLE = `{
  "goal": "Create a new folder on command",
  "startTaskId": 18,
  "tasks": [
    {
      "key": "t1",
      "kind": "newToolTask",
      "name": "Refine folder name",
      "attach": {
        "mode": "setDecisionResultTarget",
        "taskId": 99,
        "resultId": 41
      },
      "toolKey": "prompt",
      "toolConfig": {
        "system": "Create a short folder name and description from the user's request.",
        "fields": {
          "folderName": { "type": "string", "description": "Short folder name. No slashes." },
          "folderDescription": { "type": "string", "description": "One sentence describing the folder." }
        }
      },
      "nextTaskId": 101
    }
  ],
  "edits": []
}`;

/** Tasks reachable from the start that can accept a new branch. */
function attachmentPoints(
  existingTasks: ExistingTaskGraph[],
  startTaskId: number | null,
): string {
  if (startTaskId == null) {
    return "No fixed start task. Choose the best existing task or create a new start task.";
  }

  const byId = new Map(existingTasks.map((task) => [task.id, task]));
  const reachable = new Set<number>();
  const queue = [startTaskId];

  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reachable.has(id)) continue;
    reachable.add(id);

    const task = byId.get(id);
    if (!task) continue;
    for (const target of [
      task.nextTaskId,
      task.onTrueTaskId,
      task.onFalseTaskId,
      ...(task.decision?.results.map((row) => row.targetTaskId) ?? []),
      ...(task.userDecision?.options.map((row) => row.resultTaskId) ?? []),
    ]) {
      if (target != null && !reachable.has(target)) queue.push(target);
    }
  }

  const lines: string[] = [];
  for (const id of reachable) {
    const task = byId.get(id);
    if (!task) continue;

    if (task.decision) {
      lines.push(
        `- ${task.id} "${task.name}" is a decision with options ${JSON.stringify(
          task.decision.options,
        )}. Use appendDecisionOption on it to add a new choice.`,
      );
      continue;
    }

    if (task.toolKey === "if" || task.toolKey === "switch") {
      const open: string[] = [];
      if (task.onTrueTaskId == null) open.push("true");
      if (task.onFalseTaskId == null) open.push("false");
      if (open.length > 0) {
        lines.push(
          `- ${task.id} "${task.name}" is an ${task.toolKey} task with ${open.join(
            "/",
          )} ending the flow. Use setOn${open[0] === "true" ? "True" : "False"} to attach after it.`,
        );
      }
      continue;
    }

    if (task.nextTaskId == null) {
      lines.push(
        `- ${task.id} "${task.name}" ends the flow after it. Use setNext on task ${task.id} to attach after it.`,
      );
    }
  }

  return lines.length > 0
    ? lines.join("\n")
    : "No open attachment points were found. Follow the route and attach at its natural end.";
}

function buildPlanPrompt(
  state: string,
  attachments: string,
  existingTasks: ExistingTaskGraph[],
  context: PlanRunContext,
  startTaskId: number | null,
  correction: string | null,
): string {
  const startName = startTaskId
    ? (existingTasks.find((task) => task.id === startTaskId)?.name ?? "?")
    : null;

  const parts = [
    "You are extending an existing task flow. You are not building a brand new flow from scratch.",
    startTaskId != null
      ? `The run starts at existing task ${startTaskId} ("${startName}"). That task already exists. Never create a task for it and never replace it.`
      : "The run starts at the best existing task, or at a new task when the flow must begin with something new.",
    `The user's goal:\n${state}`,
    attachments ? `Attached context:\n${attachments}` : "",
    context.previousRun ? `The previous attempt:\n${context.previousRun}` : "",
    context.feedback
      ? `The user wants these changes:\n${context.feedback}`
      : "",
    correction ? `Your previous plan was rejected:\n${correction}` : "",
    `Reachable attachment points from the start:\n${attachmentPoints(
      existingTasks,
      startTaskId,
    )}`,
    `The existing flow (every task and how it is wired):\n${taskGraphText(
      existingTasks,
    )}`,
    `Available tools (config shape is in exampleConfig):\n${JSON.stringify(
      toolCatalog(),
      null,
      2,
    )}`,
    `Example of attaching a new flow to an existing branch:\n${PLAN_EXAMPLE}`,
    `Example of extending an existing decision task with a new choice:\n${APPEND_EXAMPLE}`,
    context.feedback
      ? `Example of revising an existing decision by rewiring one of its results to a replacement task:\n${REWIRE_EXAMPLE}`
      : "",
    [
      "Rules:",
      "- Plan the whole flow needed to reach the goal, not just the first step.",
      "- Only put NEW tasks in `tasks`. Existing tasks are referenced by id in edits and targets; do not recreate them.",
      "- Follow the existing route from the start task. Attach the new flow where the relevant route ends or needs a branch.",
      '- Read the if tool\'s condition before choosing a branch. A condition such as "files exist" is false for a command that creates something new and does not involve existing files, so attach the new flow to the false branch.',
      "- Prefer attaching the new flow at a branch that currently ends (shown as END). Do not add a redundant option to a decision that already covers the request.",
      "- A new prompt task that refines a name or content from the user's command should use the run state directly. The prompt tool defaults to the run state, so omit `prompt`; do not copy {{file.*}} placeholders unless the flow actually processes files.",
      "- When the goal needs a choice between kinds of work (folder vs plaintext file, and so on), create a newDecisionTask. Decision tasks are always preferred over prompt tasks for classification, branching, and routing.",
      "- If an existing decision task already chooses what to create, append a new option to it with appendDecisionOption. Do not create a second decision for the same choice.",
      "- When revising an existing flow, prefer rewiring over duplicating. If feedback says an existing option does the wrong thing, create the corrected replacement task and use setDecisionResultTarget on that decision (with resultId, or the existing option text) to point the option at the replacement. Do not append a second option with the same meaning.",
      "- setDecisionResultTarget replaces the target of one existing decision result. Use it to correct or extend an existing route; the result id is shown next to each option in the existing flow.",
      "- To route an existing task's branch into the new flow, add setNext, setOnTrue, or setOnFalse. Change only the branch that must change. For an existing if tool, always use setOnTrue or setOnFalse, never setNext. Never use setNext on a decision task.",
      "- Every new task must be reachable from the start: it must be the target of an edit, or of another reachable new task. An unreachable new task is rejected.",
      "- Connect the new flow with an `attach` object or an edit. A plan with new tasks and no connection is invalid.",
      '- The first new node of each branch must have an `attach` object. Use mode "appendOption" with taskId/optionName/optionDescription for a new choice on an existing decision, mode "setDecisionResultTarget" with taskId and resultId (or option) to rewire an existing result, or mode "setOnFalse"/"setOnTrue"/"setNext" with taskId for an existing branch or continuation.',
      startTaskId != null
        ? "- Because the run starts at an existing task, connect the new flow to the existing route with an `attach` object or an edit. Do not recreate the start task."
        : "",
      "- Reuse existing tool tasks when their config fits. For example, a create_folder task that reads {{folderName}} and {{folderDescription}} can be reused by a new prompt task that returns those fields.",
      "- New tasks can point at existing tasks with nextTaskId, onTrueTaskId, onFalseTaskId, targetTaskId, or resultTaskId.",
      "- Every new tool task uses nextKey or nextTaskId for its continuation, except the if tool, which uses onTrue/onFalse. Use null only when the flow ends there.",
      '- Keys are short unique strings such as "t1" and "t2".',
      "- Return only JSON matching the schema.",
    ].join("\n"),
  ];

  return parts.filter(Boolean).join("\n\n");
}

/**
 * Finds an existing decision result by id or option text. Used by both
 * validation and the rewire edit, so a revision targets exactly one result.
 */
function findDecisionResult(
  task: ExistingTaskGraph,
  resultId: number | null,
  option: string | null,
): ExistingDecisionResult | null {
  if (!task.decision) return null;
  if (resultId != null) {
    return (
      task.decision.results.find((row) => row.resultId === resultId) ?? null
    );
  }
  if (option == null) return null;
  return task.decision.results.find((row) => row.option === option) ?? null;
}

/**
 * Rejects plans whose new tasks are unreachable from the start, and plans that
 * recreate an existing decision with an identical option set.
 */
function validatePlan(
  plan: FlowPlanDraft,
  existingTasks: ExistingTaskGraph[],
  startTaskId: number | null,
) {
  for (const edit of plan.edits) {
    if (
      (edit.kind === "appendDecisionOption" ||
        edit.kind === "appendUserDecisionOption") &&
      edit.targetKey == null &&
      edit.targetTaskId == null
    ) {
      const label =
        edit.kind === "appendDecisionOption" ? edit.name : edit.label;
      throw new GraphQLError(
        `The appended option "${label}" needs a target task. Point targetKey at the new flow, or remove the edit.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }

    if (
      (edit.kind === "setNext" ||
        edit.kind === "setOnTrue" ||
        edit.kind === "setOnFalse") &&
      !edit.targetNull &&
      edit.targetKey == null &&
      edit.targetTaskId == null
    ) {
      throw new GraphQLError(
        `The edit for task ${edit.taskId} needs a target or targetNull.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  }

  const taskById = new Map(existingTasks.map((task) => [task.id, task]));
  for (const edit of plan.edits) {
    if (edit.kind !== "setNext") continue;
    const task = taskById.get(edit.taskId);
    if (!task) continue;

    if (task.type === "decision") {
      throw new GraphQLError(
        `Task ${edit.taskId} ("${task.name}") is a decision. Do not use setNext on it. Use setDecisionResultTarget with the resultId (or option) of the result you want to point at the new flow, or appendDecisionOption only if this is a genuinely new choice.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }

    if (task.toolKey === "if") {
      throw new GraphQLError(
        `Task ${edit.taskId} ("${task.name}") is the if tool. Use setOnTrue or setOnFalse, not setNext.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }

    if (task.toolKey === "switch") {
      throw new GraphQLError(
        `Task ${edit.taskId} ("${task.name}") is the switch tool. Edit a case target or add a new case instead of setNext.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  }

  for (const edit of plan.edits) {
    if (edit.kind === "setOnTrue" || edit.kind === "setOnFalse") {
      const task = taskById.get(edit.taskId);
      if (task?.type === "decision") {
        throw new GraphQLError(
          `Task ${edit.taskId} ("${task.name}") is a decision. Use appendDecisionOption to add a new choice; true/false branches do not exist on a decision.`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }
      if (task?.toolKey && task.toolKey !== "if" && task.toolKey !== "switch") {
        throw new GraphQLError(
          `Task ${edit.taskId} ("${task.name}") has no true/false branch. Use setNext instead.`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }
    }
  }

  for (const edit of plan.edits) {
    if (edit.kind !== "setDecisionResultTarget") continue;
    const task = taskById.get(edit.taskId);
    if (!task) continue;

    if (!task.decision) {
      throw new GraphQLError(
        `Task ${edit.taskId} ("${task.name}") is not a decision, so its result target cannot be changed.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }

    const result = findDecisionResult(task, edit.resultId, edit.option);
    if (!result) {
      throw new GraphQLError(
        `Task ${edit.taskId} ("${task.name}") has no decision result matching ${
          edit.resultId != null
            ? `result ${edit.resultId}`
            : `option "${edit.option}"`
        }.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  }

  // New decision tasks must extend, not duplicate, an existing decision.
  for (const node of plan.nodes) {
    if (node.kind !== "newDecisionTask" || !node.decision) continue;
    const optionNames = [...node.decision.options.map((o) => o.name)].sort();
    const duplicate = existingTasks.find((task) => {
      if (!task.decision) return false;
      const existing = [...task.decision.options].sort();
      return (
        existing.length === optionNames.length &&
        existing.every((option, index) => option === optionNames[index])
      );
    });

    if (duplicate) {
      throw new GraphQLError(
        `The plan recreates the existing decision task ${duplicate.id} ("${duplicate.name}"). Use appendDecisionOption on task ${duplicate.id} instead.`,
        { extensions: { code: "BAD_GATEWAY" } },
      );
    }
  }

  type Slots = Map<string, Set<string> | null>;
  const edges = new Map<string, Slots>();
  const nodeForTask = (id: number) => `t:${id}`;
  const nodeForKey = (key: string) => `k:${key}`;

  const slotsFor = (node: string): Slots => {
    const existing = edges.get(node);
    if (existing) return existing;
    const created: Slots = new Map();
    edges.set(node, created);
    return created;
  };

  const setSlot = (node: string, slot: string, target: string | null) => {
    const slots = slotsFor(node);
    if (target == null) slots.delete(slot);
    else slots.set(slot, new Set([target]));
  };

  const addSlot = (node: string, slot: string, target: string) => {
    const slots = slotsFor(node);
    const existing = slots.get(slot);
    if (existing) existing.add(target);
    else slots.set(slot, new Set([target]));
  };

  const resolve = (key: string | null, id: number | null): string | null =>
    key != null ? nodeForKey(key) : id != null ? nodeForTask(id) : null;

  for (const task of existingTasks) {
    const node = nodeForTask(task.id);

    if (task.type === "decision") {
      // Decisions use their result targets; the fallback only runs when no
      // result matches. True/false branches do not exist.
      setSlot(node, "next", resolve(null, task.nextTaskId));
      for (const result of task.decision?.results ?? []) {
        setSlot(
          node,
          `decision:${result.resultId}`,
          resolve(null, result.targetTaskId),
        );
      }
      continue;
    }

    if (task.type === "userDecision") {
      setSlot(node, "next", resolve(null, task.nextTaskId));
      for (const option of task.userDecision?.options ?? []) {
        setSlot(
          node,
          `user:${option.optionId}`,
          resolve(null, option.resultTaskId),
        );
      }
      continue;
    }

    if (task.toolKey === "if") {
      setSlot(node, "true", resolve(null, task.onTrueTaskId));
      setSlot(node, "false", resolve(null, task.onFalseTaskId));
      continue;
    }

    if (task.toolKey === "switch") {
      const config = asRecord(task.toolConfig);
      for (const [index, entry] of asArray(config?.cases).entries()) {
        const record = asRecord(entry);
        setSlot(
          node,
          `case:${index}`,
          resolve(null, asInt(record?.nextTaskId)),
        );
      }
      setSlot(node, "default", resolve(null, asInt(config?.defaultTaskId)));
      setSlot(node, "next", resolve(null, task.nextTaskId));
      continue;
    }

    setSlot(node, "next", resolve(null, task.nextTaskId));
    setSlot(node, "true", resolve(null, task.onTrueTaskId));
    setSlot(node, "false", resolve(null, task.onFalseTaskId));
  }

  for (const node of plan.nodes) {
    if (node.kind === "existingTask") continue;
    const from = nodeForKey(node.key);

    if (node.kind === "newDecisionTask") {
      for (const [index, result] of (node.decision?.results ?? []).entries()) {
        setSlot(
          from,
          `decision:${index}`,
          resolve(result.targetKey, result.targetTaskId),
        );
      }
      continue;
    }

    if (node.kind === "newUserDecisionTask") {
      for (const [index, option] of (
        node.userDecision?.options ?? []
      ).entries()) {
        setSlot(
          from,
          `user:${index}`,
          resolve(option.targetKey, option.resultTaskId),
        );
      }
      continue;
    }

    if (node.toolKey === "if") {
      setSlot(from, "true", resolve(node.onTrueKey, node.onTrueTaskId));
      setSlot(from, "false", resolve(node.onFalseKey, node.onFalseTaskId));
      continue;
    }

    setSlot(from, "next", resolve(node.nextKey, node.nextTaskId));
    setSlot(from, "true", resolve(node.onTrueKey, node.onTrueTaskId));
    setSlot(from, "false", resolve(node.onFalseKey, node.onFalseTaskId));
  }

  for (const edit of plan.edits) {
    const from = nodeForTask(edit.taskId);
    const target = resolve(edit.targetKey, edit.targetTaskId);

    if (edit.kind === "setNext") {
      setSlot(from, "next", edit.targetNull ? null : target);
    } else if (edit.kind === "setOnTrue") {
      setSlot(from, "true", edit.targetNull ? null : target);
    } else if (edit.kind === "setOnFalse") {
      setSlot(from, "false", edit.targetNull ? null : target);
    } else if (edit.kind === "appendDecisionOption") {
      if (target != null) {
        addSlot(from, `decision:appended:${edit.name}`, target);
      }
    } else if (edit.kind === "appendUserDecisionOption") {
      if (target != null) {
        addSlot(from, `user:appended:${edit.label}`, target);
      }
    } else if (edit.kind === "setDecisionResultTarget") {
      const task = existingTasks.find((row) => row.id === edit.taskId);
      const result = task
        ? findDecisionResult(task, edit.resultId, edit.option)
        : null;
      if (result && target != null) {
        setSlot(from, `decision:${result.resultId}`, target);
      }
    }
  }

  const startNode =
    startTaskId != null
      ? nodeForTask(startTaskId)
      : plan.startKey
        ? nodeForKey(plan.startKey)
        : plan.startTaskId != null
          ? nodeForTask(plan.startTaskId)
          : null;

  if (!startNode) return;

  const reachable = new Set<string>();
  const queue = [startNode];
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (reachable.has(node)) continue;
    reachable.add(node);

    for (const targets of edges.get(node)?.values() ?? []) {
      for (const target of targets ?? []) {
        if (!reachable.has(target)) queue.push(target);
      }
    }
  }

  const unreachable = plan.nodes.filter(
    (node) =>
      node.kind !== "existingTask" && !reachable.has(nodeForKey(node.key)),
  );

  if (unreachable.length > 0) {
    const names = unreachable.map((node) => `"${node.name}"`).join(", ");
    throw new GraphQLError(
      `The plan creates tasks but no edit connects them to the existing flow: ${names}. Add an edit. If the route reaches an existing decision task, use appendDecisionOption on that task; otherwise use setOnFalse, setOnTrue, or setNext on the task whose branch should point at the new flow.`,
      { extensions: { code: "BAD_GATEWAY" } },
    );
  }
}

/** Plans a complete flow without creating anything. */
export async function planFlowRun(
  userId: number,
  state: string,
  prompt: string | null,
  fileIds: number[] | null | undefined,
  folderIds: number[] | null | undefined,
  context: PlanRunContext = {},
  startTaskId: number | null = null,
): Promise<FlowPlanDraft> {
  const attachments =
    context.attachmentsText ?? (await attachmentText(fileIds, folderIds));
  const existingTasks = await loadExistingGraph();
  const existingIds = new Set(existingTasks.map((task) => task.id));
  const model = await getModelForUser(userId);
  const stateText = [state, prompt ? `Extra guidance:\n${prompt}` : ""]
    .filter(Boolean)
    .join("\n\n");

  if (startTaskId != null && !existingIds.has(startTaskId)) {
    throw new GraphQLError(`Start task ${startTaskId} does not exist`, {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  let correction: string | null = null;
  let lastError: unknown = null;

  // A small model occasionally returns an unreachable or duplicate flow. A
  // single corrective retry is much cheaper than persisting a broken plan.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const generated = await generateJsonObject({
        model,
        system: PLAN_SYSTEM,
        prompt: buildPlanPrompt(
          stateText,
          attachments,
          existingTasks,
          context,
          startTaskId,
          correction,
        ),
        format: planSchema(),
      });

      const plan = parsePlan(generated, existingIds, model, startTaskId);
      repairPlanEdits(plan, existingTasks, {
        allowDecisionAppend: !context.feedback,
      });
      autoAttachPlan(plan, existingTasks, startTaskId, stateText);
      rewireOnRevision(plan, existingTasks, context.feedback ?? null);
      if (process.env.FLOW_PLAN_DEBUG === "1") {
        console.log(
          `[flow-plan] attempt ${attempt + 1} plan:`,
          JSON.stringify(plan, null, 2),
        );
      }
      validatePlan(plan, existingTasks, startTaskId);
      return plan;
    } catch (error) {
      lastError = error;
      if (process.env.FLOW_PLAN_DEBUG === "1") {
        console.error(
          `[flow-plan] attempt ${attempt + 1} rejected:`,
          error instanceof Error ? error.message : error,
        );
      }
      correction =
        error instanceof Error
          ? error.message
          : "The previous plan was invalid.";
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new GraphQLError("The planner did not return a valid flow", {
        extensions: { code: "BAD_GATEWAY" },
      });
}

interface CreatedPlan {
  startTaskId: number;
  taskIds: number[];
  warnings: string[];
}

/**
 * Creates every new task in a plan, applies wiring edits to the existing
 * flow, then wires the new graph. Everything runs in one transaction so a
 * rejected plan leaves the flow untouched.
 */
async function createFlowPlan(
  userId: number,
  plan: FlowPlanDraft,
): Promise<CreatedPlan> {
  const mapping = new Map<string, number>();
  for (const node of plan.nodes) {
    if (node.kind === "existingTask" && node.taskId != null) {
      mapping.set(node.key, node.taskId);
    }
  }

  const decisionRows = new Map<
    string,
    { id: number; draft: FlowPlanDecisionResultDraft }[]
  >();
  const userDecisionRows = new Map<
    string,
    { id: number; draft: FlowPlanUserDecisionOptionDraft }[]
  >();
  const createdTaskIds: number[] = [];
  const warnings: string[] = [];

  await db.transaction(async (tx) => {
    for (const node of plan.nodes) {
      if (node.kind === "existingTask") continue;

      if (node.kind === "newToolTask") {
        if (!node.toolKey) {
          throw new GraphQLError(`The plan task "${node.name}" has no tool`, {
            extensions: { code: "BAD_GATEWAY" },
          });
        }

        const [task] = await tx
          .insert(tasks)
          .values({
            name: node.name,
            type: "tool",
            toolKey: node.toolKey,
            toolConfig: node.toolConfig ?? {},
            toolOutputType: node.toolOutputType,
            canRunInParallel: defaultCanRunInParallel("tool", node.toolKey),
          })
          .returning();

        if (!task) {
          throw new GraphQLError(`Could not create task "${node.name}"`, {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }
        mapping.set(node.key, task.id);
        createdTaskIds.push(task.id);
        continue;
      }

      if (node.kind === "newDecisionTask" && node.decision) {
        const decision = node.decision;
        const [createdDecision] = await tx
          .insert(decisions)
          .values({
            name: decision.name,
            type: decision.type,
            decisionPremise: decision.decisionPremise,
            instruction: decision.instruction,
            options:
              decision.type === "noul"
                ? null
                : decision.options.map((option) => option.name),
            optionDescriptions:
              decision.type === "choice"
                ? decision.options.map((option) => option.description)
                : null,
            authorId: userId,
          })
          .returning();

        if (!createdDecision) {
          throw new GraphQLError(
            `Could not create decision "${decision.name}"`,
            { extensions: { code: "INTERNAL_SERVER_ERROR" } },
          );
        }

        const [task] = await tx
          .insert(tasks)
          .values({
            name: node.name,
            type: "decision",
            decisionId: createdDecision.id,
            forceUserDecideIfNoMatch: true,
            canRunInParallel: defaultCanRunInParallel("decision", null),
          })
          .returning();

        if (!task) {
          throw new GraphQLError(`Could not create task "${node.name}"`, {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }

        const rows = await tx
          .insert(taskResults)
          .values(
            decision.results.map((result) => ({
              taskId: task.id,
              type: decision.type,
              option: result.option,
              scoreThreshold: result.scoreThreshold,
              probabilityThreshold: result.probabilityThreshold,
              confidenceThreshold: result.confidenceThreshold,
              resultTaskId: null,
              appendState: false,
            })),
          )
          .returning();

        decisionRows.set(
          node.key,
          rows.map((row, index) => ({
            id: row.id,
            draft: decision.results[index]!,
          })),
        );
        mapping.set(node.key, task.id);
        createdTaskIds.push(task.id);
        continue;
      }

      if (node.kind === "newUserDecisionTask" && node.userDecision) {
        const userDecision = node.userDecision;
        const [task] = await tx
          .insert(tasks)
          .values({
            name: node.name,
            type: "userDecision",
            userDecisionType: userDecision.choiceType,
            canRunInParallel: defaultCanRunInParallel("userDecision", null),
            userDecisionConfig: {
              prompt: userDecision.prompt,
              acceptLabel: userDecision.acceptLabel,
              yesLabel: "Yes",
              noLabel: "No",
            },
          })
          .returning();

        if (!task) {
          throw new GraphQLError(`Could not create task "${node.name}"`, {
            extensions: { code: "INTERNAL_SERVER_ERROR" },
          });
        }

        const rows = await tx
          .insert(userDecisionOptions)
          .values(
            userDecision.options.map((option, index) => ({
              taskId: task.id,
              kind: "static" as const,
              label: option.label,
              description: option.description,
              value: option.value,
              resultTaskId: null,
              appendState: false,
              sortOrder: index,
            })),
          )
          .returning();

        userDecisionRows.set(
          node.key,
          rows.map((row, index) => ({
            id: row.id,
            draft: userDecision.options[index]!,
          })),
        );
        mapping.set(node.key, task.id);
        createdTaskIds.push(task.id);
      }
    }

    const resolveKey = (key: string | null): number | null => {
      if (key == null) return null;
      const id = mapping.get(key);
      if (id == null) {
        throw new GraphQLError(
          `The plan references unknown task key "${key}"`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }
      return id;
    };

    const resolveTarget = (
      targetKey: string | null,
      targetTaskId: number | null,
    ): number | null =>
      targetKey != null ? resolveKey(targetKey) : (targetTaskId ?? null);

    for (const node of plan.nodes) {
      if (node.kind === "existingTask") continue;
      const taskId = mapping.get(node.key);
      if (taskId == null) continue;

      if (node.kind === "newToolTask") {
        await tx
          .update(tasks)
          .set({
            fallbackTaskId: resolveTarget(node.nextKey, node.nextTaskId),
            onTrueTaskId: resolveTarget(node.onTrueKey, node.onTrueTaskId),
            onFalseTaskId: resolveTarget(node.onFalseKey, node.onFalseTaskId),
          })
          .where(eq(tasks.id, taskId));

        const created = await tx.query.tasks.findFirst({
          where: { id: taskId },
        });
        if (created) {
          await assertValidTaskConfig({
            type: created.type,
            toolKey: created.toolKey,
            toolConfig: created.toolConfig,
            toolOutputType: created.toolOutputType,
            onTrueTaskId: created.onTrueTaskId,
            onFalseTaskId: created.onFalseTaskId,
            model: created.model,
            decisionModel: created.decisionModel,
            decisionStateConfig: created.decisionStateConfig,
            forceUserDecideIfNoMatch: created.forceUserDecideIfNoMatch,
            userDecisionType: created.userDecisionType,
            userDecisionConfig: created.userDecisionConfig,
          });
        }
      }

      for (const row of decisionRows.get(node.key) ?? []) {
        await tx
          .update(taskResults)
          .set({
            resultTaskId: resolveTarget(
              row.draft.targetKey,
              row.draft.targetTaskId,
            ),
          })
          .where(eq(taskResults.id, row.id));
      }

      for (const row of userDecisionRows.get(node.key) ?? []) {
        await tx
          .update(userDecisionOptions)
          .set({
            resultTaskId: resolveTarget(
              row.draft.targetKey,
              row.draft.resultTaskId,
            ),
          })
          .where(eq(userDecisionOptions.id, row.id));
      }
    }

    for (const edit of plan.edits) {
      const task = await tx.query.tasks.findFirst({
        where: { id: edit.taskId },
      });
      if (!task) {
        throw new GraphQLError(
          `The plan edits unknown existing task ${edit.taskId}`,
          { extensions: { code: "BAD_GATEWAY" } },
        );
      }

      if (
        edit.kind === "setNext" ||
        edit.kind === "setOnTrue" ||
        edit.kind === "setOnFalse"
      ) {
        if (
          !edit.targetNull &&
          edit.targetKey == null &&
          edit.targetTaskId == null
        ) {
          throw new GraphQLError(
            `The plan edit for task ${edit.taskId} has no target`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const target = edit.targetNull
          ? null
          : resolveTarget(edit.targetKey, edit.targetTaskId);

        if (edit.kind === "setNext") {
          await tx
            .update(tasks)
            .set({ fallbackTaskId: target })
            .where(eq(tasks.id, edit.taskId));
        } else if (edit.kind === "setOnTrue") {
          await tx
            .update(tasks)
            .set({ onTrueTaskId: target })
            .where(eq(tasks.id, edit.taskId));
        } else {
          await tx
            .update(tasks)
            .set({ onFalseTaskId: target })
            .where(eq(tasks.id, edit.taskId));
        }
        continue;
      }

      if (edit.kind === "appendDecisionOption") {
        if (task.type !== "decision" || task.decisionId == null) {
          throw new GraphQLError(
            `Task ${edit.taskId} is not a decision, so an option cannot be appended`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const [decision] = await tx
          .select()
          .from(decisions)
          .where(eq(decisions.id, task.decisionId))
          .limit(1);

        if (!decision || decision.type !== "choice") {
          throw new GraphQLError(
            `Only choice decisions support appended options (task ${edit.taskId})`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const target = resolveTarget(edit.targetKey, edit.targetTaskId);
        if (target == null) {
          throw new GraphQLError(
            `The appended option "${edit.name}" needs a target`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const options = [...(decision.options ?? []), edit.name];
        const descriptions = [
          ...(decision.optionDescriptions ?? []),
          edit.description,
        ];

        await tx
          .update(decisions)
          .set({ options, optionDescriptions: descriptions })
          .where(eq(decisions.id, decision.id));

        await tx.insert(taskResults).values({
          taskId: task.id,
          type: "choice",
          option: edit.name,
          probabilityThreshold: 0.8,
          confidenceThreshold: 0.4,
          resultTaskId: target,
          appendState: false,
        });
        continue;
      }

      if (edit.kind === "setDecisionResultTarget") {
        if (task.type !== "decision" || task.decisionId == null) {
          throw new GraphQLError(
            `Task ${edit.taskId} is not a decision, so its result cannot be rewired`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const rows = await tx
          .select()
          .from(taskResults)
          .where(eq(taskResults.taskId, task.id));

        const result =
          edit.resultId != null
            ? rows.find((row) => row.id === edit.resultId)
            : edit.option != null
              ? rows.find((row) => row.option === edit.option)
              : undefined;

        if (!result) {
          throw new GraphQLError(
            `Task ${edit.taskId} has no matching decision result to rewire`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const target = resolveTarget(edit.targetKey, edit.targetTaskId);
        if (target == null) {
          throw new GraphQLError(`The rewired decision result needs a target`, {
            extensions: { code: "BAD_GATEWAY" },
          });
        }

        await tx
          .update(taskResults)
          .set({ resultTaskId: target })
          .where(eq(taskResults.id, result.id));
        continue;
      }

      if (edit.kind === "appendUserDecisionOption") {
        if (task.type !== "userDecision") {
          throw new GraphQLError(
            `Task ${edit.taskId} is not a user decision, so an option cannot be appended`,
            { extensions: { code: "BAD_GATEWAY" } },
          );
        }

        const existing = await tx
          .select({ sortOrder: userDecisionOptions.sortOrder })
          .from(userDecisionOptions)
          .where(eq(userDecisionOptions.taskId, task.id));
        const sortOrder =
          existing.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1;

        await tx.insert(userDecisionOptions).values({
          taskId: task.id,
          kind: "static" as const,
          label: edit.label,
          description: edit.description,
          value: edit.value,
          resultTaskId: resolveTarget(edit.targetKey, edit.targetTaskId),
          appendState: false,
          sortOrder,
        });
      }
    }
  });

  const startTaskId =
    plan.startTaskId ?? (plan.startKey ? mapping.get(plan.startKey) : null);
  if (startTaskId == null) {
    throw new GraphQLError("The plan has no start task", {
      extensions: { code: "BAD_GATEWAY" },
    });
  }

  return {
    startTaskId,
    taskIds: [...new Set(mapping.values())],
    warnings,
  };
}

/**
 * Plans a complete flow, creates and wires every task, then starts the first
 * step as an auto-planned run. Auto-planned runs execute without per-step
 * gates and are reviewed once they finish.
 */
export async function planAndStartFlow(
  userId: number,
  state: string,
  prompt: string | null,
  fileIds: number[] | null | undefined,
  folderIds: number[] | null | undefined,
  startTaskId: number | null = null,
): Promise<FlowPlanStartResult> {
  const plan = await planFlowRun(
    userId,
    state,
    prompt,
    fileIds,
    folderIds,
    {},
    startTaskId,
  );
  const created = await createFlowPlan(userId, plan);
  const queuedTask = await createQueuedTask(userId, {
    taskId: created.startTaskId,
    state,
    fileIds,
    folderIds,
    autoPlanned: true,
    flowGoal: plan.goal,
  });

  return {
    goal: plan.goal,
    startTaskId: created.startTaskId,
    taskIds: created.taskIds,
    warnings: returnWarnings(plan.warnings, created.warnings),
    queuedTask: queuedTask ?? null,
  };
}

function returnWarnings(a: string[], b: string[]): string[] {
  return [...a, ...b];
}

/** Exposed for the run review service, which revises and starts a new plan. */
export { createFlowPlan };
