import "dotenv/config";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db, fileEntries, todos } from "@repo/db";
import {
  currentFilesRoot,
  resolveFilesPath,
} from "@repo/tools/tools/file/services/paths";
import {
  beginTrial,
  commitTrial,
  discardTrial,
  runInTrial,
} from "../assisted/infrastructure/workspace";

const marker = `assisted-smoke-${Date.now()}`;

async function main() {
  const [author] = await db.select().from(todos).limit(1);
  const authorId = author?.authorId ?? 1;
  const actorId = author?.actorId ?? 1;

  const runId = randomUUID();
  const attemptA = 990001;
  const attemptB = 990002;

  console.log("FILES_ROOT", currentFilesRoot());

  const trial = await beginTrial(runId, attemptA);
  await runInTrial(trial, async () => {
    await db.insert(todos).values({
      name: marker,
      description: "trial todo",
      authorId,
      actorId,
    });

    const relative = `${marker}/trial.txt`;
    const absolute = resolveFilesPath(relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, "trial");
    await db.insert(fileEntries).values({
      kind: "file",
      name: "trial.txt",
      relativePath: relative,
      fileType: "plaintext",
      size: 5,
    });
  });

  const prodTodosBefore = await db
    .select()
    .from(todos)
    .where(eq(todos.name, marker));
  const prodFileBefore = await db
    .select()
    .from(fileEntries)
    .where(eq(fileEntries.relativePath, `${marker}/trial.txt`));
  console.log("before commit", {
    todos: prodTodosBefore.length,
    fileEntries: prodFileBefore.length,
  });

  await commitTrial(trial);

  const prodTodosAfter = await db
    .select()
    .from(todos)
    .where(eq(todos.name, marker));
  const prodFileAfter = await db
    .select()
    .from(fileEntries)
    .where(eq(fileEntries.relativePath, `${marker}/trial.txt`));
  const fileExists = await fs
    .access(resolveFilesPath(`${marker}/trial.txt`))
    .then(() => true)
    .catch(() => false);
  console.log("after commit", {
    todos: prodTodosAfter.length,
    fileEntries: prodFileAfter.length,
    fileExists,
  });

  // Clean up production so a re-run starts clean.
  for (const row of prodFileAfter) {
    await db.delete(fileEntries).where(eq(fileEntries.id, row.id));
  }
  for (const row of prodTodosAfter) {
    await db.delete(todos).where(eq(todos.id, row.id));
  }
  await fs.rm(resolveFilesPath(marker), { recursive: true, force: true });

  // Discard must leave production untouched.
  const discardTrialWorkspace = await beginTrial(runId, attemptB);
  await runInTrial(discardTrialWorkspace, async () => {
    await db.insert(todos).values({
      name: `${marker}-discard`,
      description: "discarded todo",
      authorId,
      actorId,
    });
  });
  await discardTrial(discardTrialWorkspace);

  const discarded = await db
    .select()
    .from(todos)
    .where(eq(todos.name, `${marker}-discard`));
  console.log("after discard", { todos: discarded.length });

  if (
    prodTodosBefore.length !== 0 ||
    prodFileBefore.length !== 0 ||
    prodTodosAfter.length === 0 ||
    prodFileAfter.length === 0 ||
    !fileExists ||
    discarded.length !== 0
  ) {
    throw new Error("trial workspace smoke checks failed");
  }

  console.log("trial workspace smoke passed");
}

await main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
