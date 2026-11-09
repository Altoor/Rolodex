import { ToolInputError } from "../types";

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

/**
 * Validates an ISO 8601 date-time string. Empty strings and "none" mean
 * "no due date". Returns null for an explicitly cleared value and throws for
 * invalid input.
 */
export function parseTodoDateTime(
  value: string | null | undefined,
): Date | null {
  if (value == null) return null;

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") return null;

  if (!ISO_DATE_TIME.test(trimmed)) {
    throw new ToolInputError(
      `"doByDate" must be an ISO 8601 date-time with a time-of-day`,
    );
  }

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    throw new ToolInputError(`"doByDate" is not a valid date-time`);
  }

  return date;
}

/**
 * Local date-time string with an explicit offset, used in prompts, e.g.
 * 2026-11-07T14:22:00+01:00.
 */
export function nowForPrompt(now = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const offsetMinutes = -now.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absoluteOffset = Math.abs(offsetMinutes);

  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate(),
  )}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds(),
  )}${sign}${pad(Math.floor(absoluteOffset / 60))}:${pad(absoluteOffset % 60)}`;
}
