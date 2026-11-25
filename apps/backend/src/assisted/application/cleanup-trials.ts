import { and, inArray, isNotNull } from "drizzle-orm";
import { db, stepAttempts } from "@repo/db";
import { cleanUpOrphanTrials } from "../infrastructure/workspace";

/**
 * Removes trial schemas and files directories that no open attempt references.
 *
 * Only attempts that can still be reviewed or executed are live; committed,
 * cancelled, and failed attempts have already had their workspace discarded.
 */
export async function cleanUpOrphanTrialWorkspaces(): Promise<void> {
  const live = await db
    .select({ workspaceKey: stepAttempts.workspaceKey })
    .from(stepAttempts)
    .where(
      and(
        isNotNull(stepAttempts.workspaceKey),
        inArray(stepAttempts.status, ["running", "succeeded"]),
      ),
    );

  const keys = new Set(
    live
      .map((row) => row.workspaceKey)
      .filter((key): key is string => typeof key === "string"),
  );

  await cleanUpOrphanTrials(keys);
}
