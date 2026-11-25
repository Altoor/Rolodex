import { ToolInputError } from "../../../model";

function resolveTimeZone(timeZone: string | undefined): string | undefined {
  const trimmed = timeZone?.trim();
  if (!trimmed) return undefined;

  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: trimmed });
  } catch {
    throw new ToolInputError(
      `"timeZone" is not a valid IANA time zone: ${trimmed}`,
    );
  }

  return trimmed;
}

function formatParts(
  now: Date,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions,
): Record<string, string> {
  const values: Record<string, string> = {};

  for (const part of new Intl.DateTimeFormat("en-GB", {
    ...options,
    timeZone,
  }).formatToParts(now)) {
    if (part.type !== "literal") values[part.type] = part.value;
  }

  return values;
}

function readPart(values: Record<string, string>, type: string): string {
  const value = values[type];
  if (!value) throw new Error(`could not format current time (${type})`);
  return value;
}

/** Converts Intl's `GMT+01:00` offset label into `+01:00`. */
function normalizeOffset(value: string): string {
  if (value === "GMT" || value === "UTC") return "+00:00";

  const match = /^(?:GMT|UTC)([+-])(\d{2}):?(\d{2})$/.exec(value);
  return match ? `${match[1]}${match[2]}:${match[3]}` : "+00:00";
}

/**
 * Builds the system-prompt block that tells a model the current local time.
 * `timeZone` is an IANA name such as `Europe/Copenhagen`; omitted means the
 * server's time zone.
 */
export function formatCurrentTimeContext(now: Date, timeZone?: string): string {
  const zone = resolveTimeZone(timeZone);

  const date = formatParts(now, zone, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  });
  const weekday = formatParts(now, zone, { weekday: "long" }).weekday;

  const iso = [
    `${readPart(date, "year")}-${readPart(date, "month")}-${readPart(date, "day")}`,
    `T${readPart(date, "hour")}:${readPart(date, "minute")}:${readPart(date, "second")}`,
    normalizeOffset(readPart(date, "timeZoneName")),
  ].join("");

  const zoneLabel =
    zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "server time";

  return [
    `Current date and time: ${iso} (${weekday})`,
    `Time zone: ${zoneLabel}`,
    'Use this as the current date and time when resolving relative dates such as "tomorrow" or "before Saturday".',
  ].join("\n");
}

/** Appends the current-time context to an optional system prompt. */
export function withCurrentTime(
  system: string | undefined,
  timeZone?: string,
  now: Date = new Date(),
): string {
  const context = formatCurrentTimeContext(now, timeZone);
  const trimmed = system?.trim();
  return trimmed ? `${trimmed}\n\n${context}` : context;
}
