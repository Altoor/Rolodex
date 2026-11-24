import "dotenv/config";
import { cleanUpOrphanTrialWorkspaces } from "../assisted/application/cleanup-trials";

async function main() {
  await cleanUpOrphanTrialWorkspaces();
  console.log("orphan trial cleanup finished");
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
