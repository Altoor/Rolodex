import { inArray } from "drizzle-orm";
import { GraphQLError } from "graphql";
import type { SystemOneChoiceAnswer } from "ollama";
import { db, fileEntries, tasks } from "@repo/db";
import {
  getDecisionModelForUser,
  getOllamaClient,
  getOllamaKeepAlive,
} from "@repo/ai";
import { getToolDefinition, listToolDefinitions } from "@repo/tools";
import { getUserSettings } from "../user/user-settings-service";

export type FlowStartKind =
  "existingTask" | "newToolTask" | "newDecisionTask" | "newUserDecisionTask";

export interface FlowStartCandidate {
  key: string;
  kind: FlowStartKind;
  taskId: number | null;
  label: string;
  description: string;
  confidence: number | null;
}

export interface FlowStartProposal {
  candidates: FlowStartCandidate[];
  recommendedKey: string;
  reason: string;
  model: string | null;
  rawAnswer: unknown;
}

const CREATE_CANDIDATES: FlowStartCandidate[] = [
  {
    key: "new:tool",
    kind: "newToolTask",
    taskId: null,
    label: "New tool task",
    description:
      "Create a task that runs one existing tool, such as prompt, file, todo, if, or switch.",
    confidence: null,
  },
  {
    key: "new:decision",
    kind: "newDecisionTask",
    taskId: null,
    label: "New decision task",
    description:
      "Create a task that asks the local System One decision model to choose among options.",
    confidence: null,
  },
  {
    key: "new:userDecision",
    kind: "newUserDecisionTask",
    taskId: null,
    label: "New user decision task",
    description:
      "Create a task that pauses and asks the user to choose an option.",
    confidence: null,
  },
] as FlowStartCandidate[];

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function taskDescription(
  task: typeof tasks.$inferSelect,
  decisionName: string | null,
): string {
  const typeLabel =
    task.type === "tool"
      ? `tool: ${getToolDefinition(task.toolKey ?? "")?.name ?? task.toolKey}`
      : task.type === "decision"
        ? `decision: ${decisionName ?? "unnamed"}`
        : task.type === "userDecision"
          ? `user decision: ${
              asRecord(task.userDecisionConfig)?.prompt ?? "choose an option"
            }`
          : task.type;

  return `${task.name} (${typeLabel})`;
}

function tokens(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length > 2),
  );
}

function scoreTask(state: string, description: string): number {
  const stateTokens = tokens(state);
  let score = 0;
  for (const token of tokens(description)) {
    if (stateTokens.has(token)) score += 1;
  }
  return score;
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

async function existingTaskCandidates(
  state: string,
  defaultTaskId: number | null,
): Promise<FlowStartCandidate[]> {
  const taskRows = await db.query.tasks.findMany();
  if (taskRows.length === 0) return [];

  const decisionRows = await db.query.decisions.findMany();
  const decisionNames = new Map(
    decisionRows.map((decision) => [decision.id, decision.name]),
  );

  const sorted = [...taskRows].sort((a, b) => {
    if (defaultTaskId === a.id) return -1;
    if (defaultTaskId === b.id) return 1;
    return b.id - a.id;
  });

  const ranked =
    taskRows.length > 23
      ? sorted.slice(0, 23).sort((a, b) => {
          const aScore = scoreTask(
            state,
            taskDescription(a, decisionNames.get(a.decisionId ?? -1) ?? null),
          );
          const bScore = scoreTask(
            state,
            taskDescription(b, decisionNames.get(b.decisionId ?? -1) ?? null),
          );
          return bScore - aScore || b.id - a.id;
        })
      : sorted;

  return ranked.map((task) => ({
    key: `task:${task.id}`,
    kind: "existingTask",
    taskId: task.id,
    label: task.name,
    description: taskDescription(
      task,
      decisionNames.get(task.decisionId ?? -1) ?? null,
    ),
    confidence: null,
  }));
}

export async function proposeFlowStart(
  userId: number,
  state: string,
  prompt: string | null,
  fileIds: number[] | null | undefined,
  folderIds: number[] | null | undefined,
  previousKey?: string | null,
): Promise<FlowStartProposal> {
  const settings = await getUserSettings(userId);
  const existing = await existingTaskCandidates(
    state,
    settings.defaultTaskId ?? null,
  );
  const candidates = [...existing, ...CREATE_CANDIDATES];
  const model = await getDecisionModelForUser(userId);

  const attachments = await attachmentText(fileIds, folderIds);
  const toolCatalog = listToolDefinitions()
    .map((tool) => `- ${tool.key}: ${tool.name} — ${tool.description}`)
    .join("\n");
  const stateText = [
    state,
    attachments ? `Attached context:\n${attachments}` : "",
    toolCatalog ? `Available tools:\n${toolCatalog}` : "",
    prompt ? `The user refined the request with:\n${prompt}` : "",
    previousKey
      ? `The previous proposal was "${previousKey}". Pick the best step for the refined request.`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  let response;
  try {
    const keepAlive = await getOllamaKeepAlive();
    response = await (
      await getOllamaClient()
    ).systemone({
      model,
      state: stateText,
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
      questions: {
        startingStep: {
          type: "choice",
          instructions:
            "Pick the best next starting step for the user's flow. Prefer an existing task when one clearly fits. Choose a new task only when no existing task is a good starting point.",
          criteria: Object.fromEntries(
            candidates.map((candidate) => [
              candidate.key,
              candidate.description,
            ]),
          ),
        },
      },
    });
  } catch (err) {
    throw new GraphQLError(
      `Decision model "${model}" failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { extensions: { code: "BAD_GATEWAY" } },
    );
  }

  const answer = response.answers.startingStep as
    SystemOneChoiceAnswer | undefined;

  if (!answer || answer.type !== "choice") {
    throw new GraphQLError(
      `Decision model "${model}" did not return a choice`,
      { extensions: { code: "BAD_GATEWAY" } },
    );
  }

  const recommendedKey = candidates.some(
    (candidate) => candidate.key === answer.choice,
  )
    ? answer.choice
    : candidates[0]!.key;

  const withConfidence = candidates.map((candidate) => ({
    ...candidate,
    confidence: answer.probabilities[candidate.key] ?? null,
  }));

  const recommended =
    withConfidence.find((candidate) => candidate.key === recommendedKey) ??
    withConfidence[0]!;

  const confidence = answer.probabilities[recommendedKey] ?? answer.confidence;

  return {
    candidates: withConfidence,
    recommendedKey,
    reason: `The model chose "${recommended.label}" with confidence ${confidence.toFixed(2)}.`,
    model,
    rawAnswer: answer,
  };
}
