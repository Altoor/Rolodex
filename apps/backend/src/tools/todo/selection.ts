import type { SystemOneChoiceQuestion } from "ollama";
import { ollama } from "../../ai/Ollama";
import { ToolInputError } from "../types";

interface SelectableTodo {
  id: number;
  name: string;
  description: string;
  done: boolean;
}

const NONE_OPTION = "none";
const TODO_OPTION_PREFIX = "todo:";

/**
 * Selects a todo with the same System One decision model used by decision
 * tasks. The todo ids are the choice keys, so the model returns a todo id
 * instead of free-form JSON.
 */
export async function selectTodoWithDecision<T extends SelectableTodo>(
  userTodos: T[],
  request: string,
  model: string | null | undefined,
): Promise<T> {
  if (userTodos.length === 0) {
    throw new ToolInputError("no todos found");
  }

  if (!model || !model.trim()) {
    throw new ToolInputError("todo selection requires a model");
  }

  const premise = "todo";
  const criteria: Record<string, string | null> = {};

  for (const todo of userTodos) {
    criteria[`${TODO_OPTION_PREFIX}${todo.id}`] = [
      todo.name,
      todo.done ? "Done" : "Not done",
      todo.description,
    ].join("\n");
  }

  criteria[NONE_OPTION] = "No todo matches the request.";

  const question: SystemOneChoiceQuestion = {
    type: "choice",
    instructions: [
      "Select the todo that best matches the user's request.",
      `Choose "${NONE_OPTION}" when no todo matches.`,
      `User request:\n${request}`,
    ].join("\n\n"),
    criteria,
  };

  const response = await ollama.systemone({
    model,
    state: request,
    questions: { [premise]: question },
  });

  const answer = response.answers[premise];
  if (!answer || answer.type !== "choice") {
    throw new ToolInputError("todo selection did not return a choice");
  }

  if (answer.choice === NONE_OPTION) {
    throw new ToolInputError("no matching todo found");
  }

  const id = Number(
    answer.choice.startsWith(TODO_OPTION_PREFIX)
      ? answer.choice.slice(TODO_OPTION_PREFIX.length)
      : answer.choice,
  );
  const selected = userTodos.find((todo) => todo.id === id);

  if (!selected) {
    throw new ToolInputError("could not determine which todo to use");
  }

  return selected;
}
