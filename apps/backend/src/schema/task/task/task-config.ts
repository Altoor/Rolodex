import { GraphQLError } from "graphql";
import { assertPulledModel } from "@repo/ai";
import { getToolDefinition, validateSwitchConfig } from "@repo/tools";
import { parseDecisionStateConfig } from "./decision-state-config";
import { assertTasksVisible } from "./task-visibility";

export type TaskOutputType = "normal" | "foreach";
export type TaskType = "decision" | "textPrompt" | "tool" | "userDecision";
export type UserDecisionType = "yesNo" | "list" | "dropdown";
export type UserDecisionOptionKind = "static" | "dynamic";

export interface TaskConfigInput {
  type: string;
  toolKey: string | null;
  toolConfig?: unknown;
  toolOutputType: string;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  joinTaskId?: number | null;
  model: string | null;
  decisionModel: string | null;
  decisionStateConfig?: unknown;
  forceUserDecideIfNoMatch?: boolean | null;
  userDecisionType?: string | null;
  userDecisionConfig?: unknown;
  canRunInParallel?: boolean | null;
  prioritize?: boolean | null;
}

/**
 * Model-backed work competes for the same local services, so it defaults to
 * exclusive execution. Deterministic tools and user decisions may run
 * alongside other queued steps.
 */
export function defaultCanRunInParallel(
  type: string,
  toolKey: string | null | undefined,
): boolean {
  if (type === "tool") {
    return !(toolKey ? getToolDefinition(toolKey)?.usesModel : false);
  }

  return type === "userDecision";
}

export interface CreateTaskInput {
  name: string;
  type: string;
  decisionId?: number | null;
  fallbackTaskId?: number | null;
  toolKey?: string | null;
  toolConfig?: unknown;
  toolOutputType?: string | null;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  joinTaskId?: number | null;
  model?: string | null;
  decisionModel?: string | null;
  decisionStateConfig?: unknown;
  forceUserDecideIfNoMatch?: boolean | null;
  userDecisionType?: string | null;
  userDecisionConfig?: unknown;
  canRunInParallel?: boolean | null;
  prioritize?: boolean | null;
}

export interface UpdateTaskInput {
  id: number;
  name?: string | null;
  type?: string | null;
  decisionId?: number | null;
  fallbackTaskId?: number | null;
  toolKey?: string | null;
  toolConfig?: unknown;
  toolOutputType?: string | null;
  onTrueTaskId?: number | null;
  onFalseTaskId?: number | null;
  joinTaskId?: number | null;
  model?: string | null;
  decisionModel?: string | null;
  decisionStateConfig?: unknown;
  forceUserDecideIfNoMatch?: boolean | null;
  userDecisionType?: string | null;
  userDecisionConfig?: unknown;
  canRunInParallel?: boolean | null;
  prioritize?: boolean | null;
}

export async function assertValidTaskConfig(
  input: TaskConfigInput,
  userId: number,
): Promise<void> {
  if (input.type === "tool") {
    await assertTasksVisible(userId, [
      input.onTrueTaskId,
      input.onFalseTaskId,
      input.joinTaskId,
    ]);

    if (!input.toolKey) {
      throw new GraphQLError("toolKey is required for tool tasks", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const definition = getToolDefinition(input.toolKey);
    if (!definition) {
      throw new GraphQLError(`Unknown tool "${input.toolKey}"`, {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    const outputTypes = definition.outputTypes ?? ["normal"];
    if (!outputTypes.includes(input.toolOutputType as TaskOutputType)) {
      throw new GraphQLError(
        `Tool "${input.toolKey}" does not support output type "${input.toolOutputType}"`,
        { extensions: { code: "BAD_USER_INPUT" } },
      );
    }

    if (input.toolKey === "switch") {
      let config: ReturnType<typeof validateSwitchConfig>;
      try {
        config = validateSwitchConfig(input.toolConfig ?? {});
      } catch (err) {
        throw new GraphQLError(
          err instanceof Error ? err.message : String(err),
          { extensions: { code: "BAD_USER_INPUT" } },
        );
      }

      const targetIds = new Set<number>();
      for (const entry of config.cases) {
        if (entry.nextTaskId != null) targetIds.add(entry.nextTaskId);
      }
      if (config.defaultTaskId != null) targetIds.add(config.defaultTaskId);

      await assertTasksVisible(userId, [...targetIds]);
    }

    if (input.joinTaskId != null && input.toolOutputType !== "foreach") {
      throw new GraphQLError("joinTaskId is only valid for foreach output", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  } else if (input.joinTaskId != null) {
    throw new GraphQLError("joinTaskId is only valid for tool tasks", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (
    input.toolConfig !== undefined &&
    input.toolConfig !== null &&
    (typeof input.toolConfig !== "object" || Array.isArray(input.toolConfig))
  ) {
    throw new GraphQLError("toolConfig must be a JSON object", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (
    input.userDecisionConfig !== undefined &&
    input.userDecisionConfig !== null &&
    (typeof input.userDecisionConfig !== "object" ||
      Array.isArray(input.userDecisionConfig))
  ) {
    throw new GraphQLError("userDecisionConfig must be a JSON object", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  if (
    input.userDecisionType != null &&
    !["yesNo", "list", "dropdown"].includes(input.userDecisionType)
  ) {
    throw new GraphQLError(
      `Unknown userDecisionType "${input.userDecisionType}"`,
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  if (
    input.decisionStateConfig !== undefined &&
    parseDecisionStateConfig(input.decisionStateConfig) === null
  ) {
    throw new GraphQLError(
      "decisionStateConfig must be an object with mode none, all, or paths and a string paths array",
      { extensions: { code: "BAD_USER_INPUT" } },
    );
  }

  for (const model of [input.model, input.decisionModel]) {
    if (!model) continue;

    try {
      await assertPulledModel(model);
    } catch (err) {
      throw new GraphQLError(err instanceof Error ? err.message : String(err), {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }
}
