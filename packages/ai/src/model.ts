import { eq } from "drizzle-orm";
import { db, models, userSettings } from "@repo/db";

/** Default generation model for prompts and other LLM-backed tools. */
export const DEFAULT_MODEL = "gemma4:e4b";

/** System One decision model. Kept separate because generation models are not
 * necessarily valid decision models. */
export const DEFAULT_DECISION_MODEL = "tev1:4b";

export async function getModelForUser(userId: number): Promise<string> {
  const [settings] = await db
    .select({ defaultModelName: userSettings.defaultModelName })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  return settings?.defaultModelName ?? DEFAULT_MODEL;
}

export async function getDecisionModelForUser(userId: number): Promise<string> {
  const [settings] = await db
    .select({
      defaultDecisionModelName: userSettings.defaultDecisionModelName,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);

  // Deliberately do not fall back to defaultModelName: generation models may
  // not be System One decision models.
  return settings?.defaultDecisionModelName ?? DEFAULT_DECISION_MODEL;
}

export async function assertPulledModel(name: string): Promise<void> {
  const [model] = await db
    .select({ name: models.name, pulled: models.pulled })
    .from(models)
    .where(eq(models.name, name))
    .limit(1);

  if (!model) {
    throw new Error(`Unknown model "${name}"`);
  }

  if (!model.pulled) {
    throw new Error(`Model "${name}" is not installed`);
  }
}
