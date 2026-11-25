import {
  createTrialWorkspaceManager,
  type TrialWorkspace,
} from "@repo/trial-workspace";
import { FILES_ROOT } from "../../config";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for trial workspaces");
}

const trials = createTrialWorkspaceManager({
  databaseUrl,
  filesRoot: FILES_ROOT,
});

export type { TrialWorkspace };
export { TrialCommitConflictError } from "@repo/trial-workspace";

export function beginTrial(
  runId: string,
  attemptId: number,
): Promise<TrialWorkspace> {
  return trials.begin(runId, attemptId);
}

export function resumeTrial(
  runId: string,
  attemptId: number,
): Promise<TrialWorkspace> {
  return trials.resume(runId, attemptId);
}

export function runInTrial<T>(
  workspace: TrialWorkspace,
  fn: () => Promise<T>,
): Promise<T> {
  return trials.runInTrial(workspace, fn);
}

export function commitTrial(workspace: TrialWorkspace): Promise<void> {
  return trials.commit(workspace);
}

export function discardTrial(workspace: TrialWorkspace): Promise<void> {
  return trials.discard(workspace);
}

export function cleanUpOrphanTrials(
  liveWorkspaceKeys: Set<string>,
): Promise<void> {
  return trials.cleanupOrphans(liveWorkspaceKeys);
}
