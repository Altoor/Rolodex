import { ToolInputError } from "../../model";

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
