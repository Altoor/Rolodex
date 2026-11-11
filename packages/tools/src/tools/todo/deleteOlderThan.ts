import { and, eq, isNotNull, lt, or, sql, type SQL } from "drizzle-orm";
import { db, todos } from "@repo/db";
import { mergeToolInput, readBoolean, readString } from "../../utils";
import { ToolInputError, type Tool, type ToolDefinition } from "../../model";

interface Duration {
  years?: number;
  months?: number;
  weeks?: number;
  days?: number;
  hours?: number;
}

const DURATION_KEYS = ["years", "months", "weeks", "days", "hours"] as const;

function readDuration(value: unknown): Duration {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError("olderThan must be an object");
  }

  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter(
    (key) => !(DURATION_KEYS as readonly string[]).includes(key),
  );
  if (unknownKeys.length > 0) {
    throw new ToolInputError(
      `unknown olderThan key(s): ${unknownKeys.join(", ")}`,
    );
  }

  const duration: Duration = {};
  let hasValue = false;

  for (const key of DURATION_KEYS) {
    const raw = record[key];
    if (raw === undefined) continue;

    if (
      typeof raw !== "number" ||
      !Number.isFinite(raw) ||
      !Number.isInteger(raw) ||
      raw < 0
    ) {
      throw new ToolInputError(
        `"olderThan.${key}" must be a non-negative integer`,
      );
    }

    duration[key] = raw;
    if (raw > 0) hasValue = true;
  }

  if (!hasValue) {
    throw new ToolInputError(
      "olderThan must contain at least one duration value greater than zero",
    );
  }

  return duration;
}

function subtractMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() - months);
  const daysInMonth = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, daysInMonth));
  return result;
}

function subtractDuration(now: Date, duration: Duration): Date {
  const totalMonths = (duration.years ?? 0) * 12 + (duration.months ?? 0);
  let result = subtractMonths(now, totalMonths);

  const milliseconds =
    (((duration.weeks ?? 0) * 7 + (duration.days ?? 0)) * 24 +
      (duration.hours ?? 0)) *
    60 *
    60 *
    1000;

  result = new Date(result.getTime() - milliseconds);
  return result;
}

const definition: ToolDefinition = {
  key: "delete_todos_older_than",
  name: "Delete todos older than",
  description:
    "Delete todos older than a duration such as { months: 3 }. By default only done or archived todos are eligible.",
  category: "todo",
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      olderThan: {
        type: "object",
        description: 'Duration object, for example { "months": 3 }.',
        properties: {
          years: { type: "number", description: "Years to subtract." },
          months: { type: "number", description: "Months to subtract." },
          weeks: { type: "number", description: "Weeks to subtract." },
          days: { type: "number", description: "Days to subtract." },
          hours: { type: "number", description: "Hours to subtract." },
        },
      },
      basis: {
        type: "string",
        description:
          'Timestamp to compare against the cutoff. Defaults to "createdAt".',
        enum: ["createdAt", "doByDate"],
        default: "createdAt",
      },
      allowNotDone: {
        type: "boolean",
        description:
          "Allow deleting todos that are not done. Defaults to false.",
        default: false,
      },
      allowNotArchived: {
        type: "boolean",
        description:
          "Allow deleting todos that are not archived. Defaults to false.",
        default: false,
      },
      dryRun: {
        type: "boolean",
        description: "Count matching todos without deleting them.",
        default: false,
      },
    },
    required: ["olderThan"],
  },
  outputDescription:
    "The cutoff, basis, matched/deleted counts, and dry-run status.",
  exampleConfig: {
    olderThan: { months: 3 },
    basis: "createdAt",
    allowNotDone: false,
    allowNotArchived: false,
    dryRun: false,
  },
};

export const deleteTodosOlderThanTool: Tool = {
  definition,

  async execute(context) {
    const input = mergeToolInput(context);
    const duration = readDuration(input.olderThan);
    const basis = readString(input, "basis") ?? "createdAt";
    const allowNotDone = readBoolean(input, "allowNotDone") ?? false;
    const allowNotArchived = readBoolean(input, "allowNotArchived") ?? false;
    const dryRun = readBoolean(input, "dryRun") ?? false;

    if (basis !== "createdAt" && basis !== "doByDate") {
      throw new ToolInputError('"basis" must be "createdAt" or "doByDate"');
    }

    const cutoff = subtractDuration(new Date(), duration);
    const ownership = or(
      eq(todos.authorId, context.userId),
      eq(todos.actorId, context.userId),
    );

    const basisCondition: SQL | undefined =
      basis === "doByDate"
        ? and(isNotNull(todos.doByDate), lt(todos.doByDate, cutoff))
        : lt(todos.createdAt, cutoff);

    const safetyCondition: SQL | undefined =
      allowNotDone || allowNotArchived
        ? undefined
        : or(eq(todos.done, true), isNotNull(todos.archivedAt));

    const where = and(ownership, basisCondition, safetyCondition);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(todos)
      .where(where);
    const matched = countRow?.count ?? 0;

    let note: string | undefined;
    if (matched === 0 && safetyCondition !== undefined) {
      const [baseRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(todos)
        .where(and(ownership, basisCondition));
      const baseCount = baseRow?.count ?? 0;
      if (baseCount > 0) {
        note =
          `${baseCount} todo(s) are older than the cutoff but neither done ` +
          `nor archived; set allowNotDone or allowNotArchived to include them.`;
      }
    }

    let deleted = 0;
    if (!dryRun) {
      const rows = await db.delete(todos).where(where).returning({
        id: todos.id,
      });
      deleted = rows.length;
    }

    return {
      output: {
        cutoff: cutoff.toISOString(),
        basis,
        allowNotDone,
        allowNotArchived,
        dryRun,
        matched,
        deleted,
        ...(note ? { note } : {}),
      },
      summary: dryRun
        ? `Dry run: ${matched} todo(s) would be deleted`
        : `Deleted ${deleted} todo(s) older than the cutoff`,
    };
  },
};
