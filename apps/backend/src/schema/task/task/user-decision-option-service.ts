import { GraphQLError } from "graphql";
import { eq } from "drizzle-orm";
import { db, userDecisionOptions } from "@repo/db";
import { validateWhereExpression } from "@repo/tools";

export type UserDecisionOptionKind = "static" | "dynamic";

export interface CreateUserDecisionOptionInput {
  taskId: number;
  kind: string;
  label?: string | null;
  description?: string | null;
  value?: string | null;
  selector?: unknown;
  labelPath?: string | null;
  descriptionPath?: string | null;
  valuePath?: string | null;
  resultTaskId?: number | null;
  appendState?: boolean | null;
  sortOrder?: number | null;
}

export interface UpdateUserDecisionOptionInput {
  id: number;
  kind?: string | null;
  label?: string | null;
  description?: string | null;
  value?: string | null;
  selector?: unknown;
  labelPath?: string | null;
  descriptionPath?: string | null;
  valuePath?: string | null;
  resultTaskId?: number | null;
  appendState?: boolean | null;
  sortOrder?: number | null;
}

function keepOrSet<T>(provided: T | undefined, fallback: T): T {
  return provided !== undefined ? provided : fallback;
}

function assertSelector(selector: unknown): void {
  if (selector === undefined || selector === null) return;

  if (typeof selector !== "object" || Array.isArray(selector)) {
    throw new GraphQLError("selector must be a JSON object", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  const where = (selector as Record<string, unknown>).where;
  if (where === undefined) return;

  try {
    validateWhereExpression(where);
  } catch (err) {
    throw new GraphQLError(err instanceof Error ? err.message : String(err), {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
}

function assertKind(kind: string): UserDecisionOptionKind {
  if (kind !== "static" && kind !== "dynamic") {
    throw new GraphQLError('kind must be "static" or "dynamic"', {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }
  return kind;
}

export async function createUserDecisionOption(
  input: CreateUserDecisionOptionInput,
) {
  const task = await db.query.tasks.findFirst({
    where: { id: input.taskId },
  });
  if (!task) {
    throw new GraphQLError("Task not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  assertSelector(input.selector);

  const [created] = await db
    .insert(userDecisionOptions)
    .values({
      taskId: input.taskId,
      kind: assertKind(input.kind),
      label: input.label ?? null,
      description: input.description ?? null,
      value: input.value ?? null,
      selector: input.selector ?? null,
      labelPath: input.labelPath ?? null,
      descriptionPath: input.descriptionPath ?? null,
      valuePath: input.valuePath ?? null,
      resultTaskId: input.resultTaskId ?? null,
      appendState: input.appendState ?? false,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return created;
}

export async function updateUserDecisionOption(
  input: UpdateUserDecisionOptionInput,
) {
  const option = await db.query.userDecisionOptions.findFirst({
    where: { id: input.id },
  });
  if (!option) {
    throw new GraphQLError("UserDecisionOption not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  assertSelector(input.selector);

  const nextKind = keepOrSet(input.kind, option.kind) as UserDecisionOptionKind;

  const [updated] = await db
    .update(userDecisionOptions)
    .set({
      kind: assertKind(nextKind),
      label: keepOrSet(input.label, option.label),
      description: keepOrSet(input.description, option.description),
      value: keepOrSet(input.value, option.value),
      selector: keepOrSet(input.selector, option.selector),
      labelPath: keepOrSet(input.labelPath, option.labelPath),
      descriptionPath: keepOrSet(input.descriptionPath, option.descriptionPath),
      valuePath: keepOrSet(input.valuePath, option.valuePath),
      resultTaskId: keepOrSet(input.resultTaskId, option.resultTaskId),
      appendState: input.appendState ?? option.appendState,
      sortOrder: input.sortOrder ?? option.sortOrder,
    })
    .where(eq(userDecisionOptions.id, input.id))
    .returning();

  return updated;
}

export async function deleteUserDecisionOption(id: number): Promise<string> {
  const option = await db.query.userDecisionOptions.findFirst({
    where: { id },
  });
  if (!option) {
    throw new GraphQLError("UserDecisionOption not found", {
      extensions: { code: "BAD_USER_INPUT" },
    });
  }

  await db.delete(userDecisionOptions).where(eq(userDecisionOptions.id, id));
  return "successfully deleted user decision option";
}
