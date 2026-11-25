import { GraphQLError } from "graphql";
import { getModelForUser, getOllamaClient, getOllamaKeepAlive } from "@repo/ai";
import { listToolDefinitions } from "@repo/tools";
import { getAttempt } from "../attempts";
import { getRun } from "../../queue/run-store";
import { db } from "@repo/db";
import {
  validateRevisionProposal,
  RevisionValidationError,
  type RevisionProposal,
} from "../domain/revision";
import { recordTrace } from "../infrastructure/trace";

function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match?.[1] ?? trimmed;
}

/**
 * Asks the generation model for one concrete repair proposal. The output is
 * always validated before the UI sees it; invalid proposals are rejected with
 * an actionable error.
 */
export async function proposeStepRevision(
  userId: number,
  attemptId: number,
  feedback: string,
): Promise<RevisionProposal> {
  if (!feedback.trim()) {
    throw new GraphQLError("Describe what you expected instead", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const attempt = await getAttempt(attemptId);
  if (!attempt) {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const run = await getRun(attempt.runId);
  if (!run || run.userId !== userId) {
    throw new GraphQLError("Attempt not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const tasks = await db.query.tasks.findMany();
  const tools = listToolDefinitions().map((tool) => ({
    key: tool.key,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  const prompt = [
    "You are repairing one rejected step in an automated task runner.",
    "Return ONLY a JSON object with this shape:",
    `{
  "kind": "updateToolConfig" | "replaceTask" | "insertBefore" | "insertAfter" | "insertBeforeAndAfter" | "runNext",
  "explanation": string,
  "confidence": number,
  "taskPatch"?: { "toolConfig": object },
  "replacement"?: { "name": string, "type": "tool"|"decision"|"userDecision", "toolKey"?: string, "toolConfig"?: object },
  "insertions"?: array of the same draft shape (max 2),
  "nextTaskId"?: number,
  "warnings": string[]
}`,
    "Rules:",
    "- Prefer the smallest change that matches the user's expected outcome.",
    "- updateToolConfig keeps the same tool.",
    "- Never weaken validation or safety.",
    "- Use only tools that exist in the catalog.",
    "- If the expected outcome is simply the next task in line, use runNext.",
    "",
    `User feedback: ${feedback}`,
    `Run state: ${run.state}`,
    `Current checkpoint state: ${attempt.beforeState}`,
    `Current checkpoint toolState: ${JSON.stringify(attempt.beforeToolState)}`,
    `Task snapshot: ${JSON.stringify(attempt.taskSnapshot)}`,
    `Previous result: ${JSON.stringify(attempt.result)}`,
    `Existing tasks: ${JSON.stringify(
      tasks.map((task) => ({
        id: task.id,
        name: task.name,
        type: task.type,
        toolKey: task.toolKey,
        fallbackTaskId: task.fallbackTaskId,
      })),
    )}`,
    `Tool catalog: ${JSON.stringify(tools)}`,
  ].join("\n");

  let proposal: RevisionProposal;
  try {
    const model = await getModelForUser(userId);
    const ollama = await getOllamaClient();
    const keepAlive = await getOllamaKeepAlive();
    const response = await ollama.generate({
      model,
      prompt,
      format: "json",
      ...(keepAlive !== undefined ? { keep_alive: keepAlive } : {}),
    });

    proposal = validateRevisionProposal(
      JSON.parse(stripFences(response.response ?? "")),
    );
  } catch (err) {
    if (err instanceof RevisionValidationError) {
      throw new GraphQLError(`The model proposed an invalid repair: ${err.message}`, {
        extensions: { code: "BAD_MODEL_OUTPUT" },
      });
    }
    throw new GraphQLError(
      `Could not propose a repair: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { extensions: { code: "INTERNAL_SERVER_ERROR" } },
    );
  }

  await recordTrace({
    runId: run.id,
    attemptId: attempt.id,
    kind: "revision.proposed",
    payload: proposal as unknown as Record<string, unknown>,
  });

  return proposal;
}
