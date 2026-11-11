import { getModelForUser } from "@repo/ai";
import {
  mergeToolInput,
  nowForPrompt,
  parseJsonObject,
  readString,
} from "../../../utils";
import { ToolInputError, type ToolRunContext } from "../../../model";
import { runPrompt } from "../../prompt/prompt";
import { parseTodoDateTime } from "./date";

const todoFieldsFormat = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    doByDate: {
      type: "string",
      description:
        "Do-by timestamp as an ISO 8601 date-time, or an empty string when no due date/time can be inferred.",
    },
  },
  required: ["name", "description", "doByDate"],
};

const todoDateTimeFormat = {
  type: "object",
  properties: {
    doByDate: {
      type: "string",
      description:
        "Do-by timestamp as an ISO 8601 date-time, or an empty string when no due date/time can be inferred.",
    },
  },
  required: ["doByDate"],
};

function currentTimePrompt(): string {
  const now = new Date();
  const weekday = now.toLocaleDateString(undefined, { weekday: "long" });
  return `Current local date and time is ${nowForPrompt(now)} (${weekday}).`;
}

const dateRules = [
  'Resolve relative dates and times such as "today", "tomorrow at 15:00", "next Friday", "in three days", or "this afternoon" to an absolute ISO 8601 timestamp using the current date and time.',
  "Return an ISO 8601 timestamp with a time-of-day, for example 2026-11-08T17:00:00+01:00.",
  "If a date is mentioned without a time, use 23:59 local time on that date.",
  "Map morning/afternoon/evening to 12:00/17:00/20:00 unless a more specific time is given.",
  "If the input does not imply a due date or time, return an empty string.",
  "Never invent a deadline.",
];

function inferDoByDate(
  value: string | undefined,
  source: "model" | "explicit",
): Date | null | undefined {
  if (value === undefined) return undefined;

  try {
    return parseTodoDateTime(value);
  } catch (err) {
    if (source === "explicit") throw err;
    console.warn("todo date inference failed:", err);
    return null;
  }
}

export async function extractTodoFields(
  userId: number,
  context: ToolRunContext,
): Promise<{ name: string; description: string; doByDate: Date | null }> {
  const input = mergeToolInput(context);
  const suppliedName = readString(input, "name");
  const suppliedDescription = readString(input, "description");
  const suppliedDoByDateRaw = readString(input, "doByDate");
  const suppliedDoByDate = inferDoByDate(suppliedDoByDateRaw, "explicit");

  if (
    suppliedName !== undefined &&
    suppliedName.trim() &&
    suppliedDescription !== undefined &&
    suppliedDescription.trim() &&
    suppliedDoByDateRaw !== undefined
  ) {
    return {
      name: suppliedName,
      description: suppliedDescription,
      doByDate: suppliedDoByDate ?? null,
    };
  }

  const model =
    readString(input, "model") ??
    context.model ??
    (await getModelForUser(userId));

  if (!model.trim()) {
    throw new ToolInputError("todo extraction requires a model");
  }

  const prompt = [
    currentTimePrompt(),
    "Extract a name, description, and do-by timestamp from the user input below.",
    'Resolve relative dates and times such as "today", "tomorrow at 15:00", "next Friday", "in three days", or "this afternoon" to an absolute ISO 8601 timestamp using the current date and time.',
    "Rules:",
    ...dateRules.map((rule) => `- ${rule}`),
    "Return only JSON that matches the supplied schema.",
    `User input:\n${context.state}`,
  ].join("\n\n");

  const result = await runPrompt({
    model,
    prompt,
    format: todoFieldsFormat,
  });

  const parsed = parseJsonObject(result.text);
  if (!parsed) {
    throw new ToolInputError("could not determine todo name/description");
  }

  const parsedName = readString(parsed, "name");
  const parsedDescription = readString(parsed, "description");
  const parsedDoByDate = readString(parsed, "doByDate");

  const name = suppliedName?.trim() || parsedName?.trim();

  if (!name) {
    throw new ToolInputError("could not determine todo name");
  }

  const description =
    suppliedDescription?.trim() || parsedDescription?.trim() || "";

  const doByDate =
    suppliedDoByDateRaw !== undefined
      ? (suppliedDoByDate ?? null)
      : (inferDoByDate(parsedDoByDate, "model") ?? null);

  return { name, description, doByDate };
}

/**
 * Infers only the do-by timestamp for update operations. Returns undefined
 * when the request does not change the timestamp, so callers can leave the
 * existing value untouched.
 */
export async function extractTodoDateTime(
  userId: number,
  context: ToolRunContext,
): Promise<Date | null | undefined> {
  const input = mergeToolInput(context);
  const supplied = readString(input, "doByDate");
  if (supplied !== undefined) {
    return parseTodoDateTime(supplied);
  }

  const model =
    readString(input, "model") ??
    context.model ??
    (await getModelForUser(userId));

  if (!model.trim()) {
    throw new ToolInputError("todo date extraction requires a model");
  }

  const prompt = [
    currentTimePrompt(),
    "Extract the do-by timestamp implied by the user input below.",
    "Rules:",
    ...dateRules.map((rule) => `- ${rule}`),
    "- If the input does not ask to change the due date or time, return an empty string.",
    "Return only JSON that matches the supplied schema.",
    `User input:\n${context.state}`,
  ].join("\n\n");

  const result = await runPrompt({
    model,
    prompt,
    format: todoDateTimeFormat,
  });

  const parsed = parseJsonObject(result.text);
  if (!parsed) return undefined;

  const value = readString(parsed, "doByDate");
  if (value === undefined || !value.trim()) return undefined;

  return inferDoByDate(value, "model");
}
