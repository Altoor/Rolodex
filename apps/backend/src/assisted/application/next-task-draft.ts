import { GraphQLError } from "graphql";
import {
  getModelForUser,
  getOllamaClient,
  getOllamaKeepAlive,
} from "@repo/ai";
import { listToolDefinitions } from "@repo/tools";
import { db } from "@repo/db";
import { assertValidTaskConfig } from "../../schema/task/task/task-service";
import {
  NextTaskDraftError,
  parseNextTaskDraft,
  type NextTaskDraft,
} from "../domain/next-task";
import { recordTrace } from "../infrastructure/trace";
import { loadDecisionTargetContext } from "./target-context";

function stripFences(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return match?.[1] ?? trimmed;
}

function normalizeFeedback(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function buildPrompt(
  context: Awaited<ReturnType<typeof loadDecisionTargetContext>>,
  tools: { key: string; name: string; description: string; inputSchema: unknown }[],
  existingTasks: { id: number; name: string; type: string }[],
  feedback: string | null,
  currentDraft: NextTaskDraft | null,
): string {
  const { attempt, label, description } = context;

  return [
    "You are choosing the next task for one branch of a decision in an automated task runner.",
    "Return ONLY a JSON object with this shape:",
    `{
  "name": string,
  "explanation": string,
  "type": "tool",
  "toolKey": string,
  "toolOutputType": "normal" | "foreach",
  "toolConfig": object
}`,
    "Rules:",
    "- Create exactly one tool task that performs the first concrete action for the chosen decision option.",
    "- Use only tools from the catalog below.",
    "- toolConfig must be a valid input for that tool's inputSchema.",
    "- Do not invent task ids, decision ids, or tools.",
    "- Keep the task name short and action-oriented.",
    "- If the branch needs several actions, draft only the first one.",
    "",
    `Decision option: ${label}`,
    description ? `Option description: ${description}` : "",
    `Run state: ${attempt.beforeState}`,
    `Checkpoint state: ${attempt.beforeState}`,
    `Checkpoint toolState: ${JSON.stringify(attempt.beforeToolState)}`,
    `Task snapshot: ${JSON.stringify(attempt.taskSnapshot)}`,
    `Decision result: ${JSON.stringify(attempt.result)}`,
    currentDraft
      ? `Current draft to refine: ${JSON.stringify(currentDraft)}`
      : "",
    feedback ? `User guidance: ${feedback}` : "",
    `Existing tasks: ${JSON.stringify(existingTasks)}`,
    `Tool catalog: ${JSON.stringify(tools)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

async function generateDraft(
  userId: number,
  context: Awaited<ReturnType<typeof loadDecisionTargetContext>>,
  feedback: string | null,
  currentDraft: NextTaskDraft | null,
): Promise<NextTaskDraft> {
  const tasks = await db.query.tasks.findMany();
  const tools = listToolDefinitions().map((tool) => ({
    key: tool.key,
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  const prompt = buildPrompt(
    context,
    tools,
    tasks.map((task) => ({
      id: task.id,
      name: task.name,
      type: task.type,
    })),
    feedback,
    currentDraft,
  );

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

    const draft = parseNextTaskDraft(
      JSON.parse(stripFences(response.response ?? "")),
    );

    await assertValidTaskConfig({
      type: "tool",
      toolKey: draft.toolKey,
      toolConfig: draft.toolConfig,
      toolOutputType: draft.toolOutputType,
      model: null,
      decisionModel: null,
    }, userId);

    return draft;
  } catch (err) {
    if (err instanceof NextTaskDraftError) {
      throw new GraphQLError(`The model drafted an invalid next task: ${err.message}`, {
        extensions: { code: "BAD_MODEL_OUTPUT" },
      });
    }
    if (err instanceof GraphQLError) {
      throw new GraphQLError(
        `The model drafted an invalid next task: ${err.message}`,
        { extensions: { code: "BAD_MODEL_OUTPUT" } },
      );
    }
    throw new GraphQLError(
      `Could not draft the next task: ${
        err instanceof Error ? err.message : String(err)
      }`,
      { extensions: { code: "INTERNAL_SERVER_ERROR" } },
    );
  }
}

/** Drafts the first concrete next task for the decision branch under review. */
export async function draftDecisionTargetTask(
  userId: number,
  attemptId: number,
  feedback?: string,
  rawDraft?: unknown,
): Promise<NextTaskDraft> {
  const context = await loadDecisionTargetContext(userId, attemptId);

  let currentDraft: NextTaskDraft | null = null;
  if (rawDraft != null) {
    try {
      currentDraft = parseNextTaskDraft(rawDraft);
    } catch (err) {
      if (err instanceof NextTaskDraftError) {
        throw new GraphQLError(`The current draft is invalid: ${err.message}`, {
          extensions: { code: "BAD_USER_INPUT" },
        });
      }
      throw err;
    }
  }

  const draft = await generateDraft(
    userId,
    context,
    normalizeFeedback(feedback),
    currentDraft,
  );

  await recordTrace({
    runId: context.run.id,
    attemptId: context.attempt.id,
    kind: "decision.target.drafted",
    payload: {
      resultId: context.resultId,
      option: context.label,
      draft: draft as unknown as Record<string, unknown>,
      refined: currentDraft != null,
    },
  });

  return draft;
}
