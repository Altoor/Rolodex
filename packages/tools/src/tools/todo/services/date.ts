import { ToolInputError } from "../../../model";

const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/;

export interface LenientTodoDate {
  /** Parsed date, or null when the value means "no due date". */
  date: Date | null;
  /** True when the value was supplied but is not a valid ISO 8601 date-time. */
  invalid: boolean;
}

/**
 * Parses a model-supplied do-by value without throwing.
 *
 * Empty strings and "none" mean "no due date". Any other value that is not an
 * ISO 8601 date-time (with a time-of-day) is reported as `invalid`, so callers
 * can ignore it instead of failing the whole task.
 */
export function parseTodoDateTimeLenient(
  value: string | null | undefined,
): LenientTodoDate {
  if (value == null) return { date: null, invalid: false };

  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "none") {
    return { date: null, invalid: false };
  }

  if (ISO_DATE_TIME.test(trimmed)) {
    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) return { date, invalid: false };
  }

  return { date: null, invalid: true };
}

const WARNING_VALUE_LIMIT = 80;

/** Builds a short warning for an ignored value without echoing huge output. */
export function todoDateWarning(value: string, effect: string): string {
  const trimmed = value.trim();
  const preview =
    trimmed.length > WARNING_VALUE_LIMIT
      ? `${trimmed.slice(0, WARNING_VALUE_LIMIT)}…`
      : trimmed;

  return `Ignored doByDate ${JSON.stringify(preview)}: ${effect}`;
}

/**
 * Validates an ISO 8601 date-time string. Empty strings and "none" mean
 * "no due date". Returns null for an explicitly cleared value and throws for
 * invalid input.
 *
 * Tool inputs should prefer `parseTodoDateTimeLenient`; this strict variant is
 * kept for callers that require an explicit error.
 */
export function parseTodoDateTime(
  value: string | null | undefined,
): Date | null {
  const result = parseTodoDateTimeLenient(value);
  if (result.invalid) {
    throw new ToolInputError(
      `"doByDate" must be an ISO 8601 date-time with a time-of-day`,
    );
  }

  return result.date;
}
