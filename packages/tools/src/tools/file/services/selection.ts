import type { SystemOneChoiceQuestion } from "ollama";
import { ollama } from "@repo/ai";
import { ToolInputError } from "../../../model";

interface SelectableFileEntry {
  id: number;
  kind: "file" | "folder";
  name: string;
  description: string;
  relativePath: string;
}

const NONE_OPTION = "none";
const ENTRY_OPTION_PREFIX = "entry:";

/**
 * Selects a file/folder with the same System One decision model used by
 * decision tasks. Entry ids are encoded in the choice keys, so the model
 * returns an id instead of free-form JSON.
 */
export async function selectFileEntryWithDecision<
  T extends SelectableFileEntry,
>(
  entries: T[],
  request: string,
  model: string | null | undefined,
  kindLabel?: "file" | "folder",
): Promise<T> {
  const label = kindLabel ?? "file or folder";

  if (entries.length === 0) {
    throw new ToolInputError(`no ${label} entries found`);
  }

  if (!model || !model.trim()) {
    throw new ToolInputError(`${label} selection requires a model`);
  }

  const premise = "entry";
  const criteria: Record<string, string | null> = {};

  for (const entry of entries) {
    criteria[`${ENTRY_OPTION_PREFIX}${entry.id}`] =
      `${entry.kind} "${entry.name}" at ${entry.relativePath}. ${entry.description}`;
  }

  criteria[NONE_OPTION] = null;

  const question: SystemOneChoiceQuestion = {
    type: "choice",
    instructions: `Select the ${label} that best matches the user's request.`,
    criteria,
  };

  console.log("systemone:", {
    model,
    state: request,
    questions: { [premise]: question },
  });

  const response = await ollama.systemone({
    model,
    state: request,
    questions: { [premise]: question },
  });

  const answer = response.answers[premise];
  if (!answer || answer.type !== "choice") {
    throw new ToolInputError(`${label} selection did not return a choice`);
  }

  console.log("answer:", answer);

  if (answer.choice === NONE_OPTION) {
    throw new ToolInputError(`no matching ${label} found`);
  }

  const id = Number(
    answer.choice.startsWith(ENTRY_OPTION_PREFIX)
      ? answer.choice.slice(ENTRY_OPTION_PREFIX.length)
      : answer.choice,
  );
  const selected = entries.find((entry) => entry.id === id);

  if (!selected) {
    throw new ToolInputError(`could not determine which ${label} to use`);
  }

  return selected;
}
