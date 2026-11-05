import { eq } from "drizzle-orm";
import { GraphQLError } from "graphql";
import { db } from "../builder";
import { userSettings } from "../../db";

export const ensureUserSettings = async (userId: number) => {
  const existing = await db.query.userSettings.findFirst({
    where: { userId },
  });

  if (existing) return existing;

  const [created] = await db
    .insert(userSettings)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  const settings = await db.query.userSettings.findFirst({
    where: { userId },
  });

  if (!settings) {
    throw new GraphQLError("Could not create user settings", {
      extensions: { code: "INTERNAL_SERVER_ERROR" },
    });
  }

  return settings;
};

export const getUserSettings = async (userId: number) => {
  return ensureUserSettings(userId);
};

type UpdateSettingsInput = {
  defaultTaskId?: number | null;
  defaultModelName?: string | null;
};

export const updateUserSettings = async (
  userId: number,
  input: UpdateSettingsInput,
) => {
  await ensureUserSettings(userId);

  if (input.defaultTaskId !== undefined && input.defaultTaskId !== null) {
    const task = await db.query.tasks.findFirst({
      where: { id: input.defaultTaskId },
    });

    if (!task) {
      throw new GraphQLError("Task not found", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  if (input.defaultModelName !== undefined && input.defaultModelName !== null) {
    const model = await db.query.models.findFirst({
      where: { name: input.defaultModelName },
    });

    if (!model) {
      throw new GraphQLError("Model not found", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }

    if (!model.pulled) {
      throw new GraphQLError("Model is not installed", {
        extensions: { code: "BAD_USER_INPUT" },
      });
    }
  }

  const [updated] = await db
    .update(userSettings)
    .set({
      ...(input.defaultTaskId !== undefined
        ? { defaultTaskId: input.defaultTaskId }
        : {}),
      ...(input.defaultModelName !== undefined
        ? { defaultModelName: input.defaultModelName }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(userSettings.userId, userId))
    .returning();

  return updated;
};
