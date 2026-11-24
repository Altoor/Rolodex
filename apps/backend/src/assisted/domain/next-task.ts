export interface NextTaskDraft {
  name: string;
  explanation: string;
  type: "tool";
  toolKey: string;
  toolConfig: Record<string, unknown>;
  toolOutputType: "normal" | "foreach";
}

export class NextTaskDraftError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextTaskDraftError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validates a model-proposed next task before it is shown or created. The next
 * task is deliberately limited to a single tool task: a decision or
 * user-decision task would need options/results of its own, which this flow
 * cannot safely invent from one branch.
 */
export function parseNextTaskDraft(value: unknown): NextTaskDraft {
  if (!isRecord(value)) {
    throw new NextTaskDraftError("The next-task draft must be an object");
  }

  const name = typeof value.name === "string" ? value.name.trim() : "";
  if (!name) {
    throw new NextTaskDraftError("The next task needs a name");
  }

  if (value.type !== "tool") {
    throw new NextTaskDraftError("The next task must be a tool task");
  }

  const toolKey =
    typeof value.toolKey === "string" ? value.toolKey.trim() : "";
  if (!toolKey) {
    throw new NextTaskDraftError("The next task needs a toolKey");
  }

  return {
    name,
    explanation:
      typeof value.explanation === "string" ? value.explanation.trim() : "",
    type: "tool",
    toolKey,
    toolConfig: isRecord(value.toolConfig) ? value.toolConfig : {},
    toolOutputType: value.toolOutputType === "foreach" ? "foreach" : "normal",
  };
}
