import "dotenv/config";
import path from "node:path";
import fs from "node:fs/promises";
import {
  FILES_ROOT,
  assertRealPathInsideRoot,
  ensureFilesRoot,
  normalizeRelativePath,
  resolveFilesPath,
} from "@repo/tools/tools/file/services/paths";
import {
  deleteEntry,
  ensureDirectory,
  readTextFile,
  statEntry,
  writeTextFile,
} from "@repo/tools/tools/file/services/storage";
import { hashFile } from "@repo/tools/tools/file/services/hash";
import { detectFileTypeFromName } from "@repo/tools/tools/file/services/type";
import {
  getFileEntryByPath,
  hardDeleteFileEntryRow,
  insertFileEntry,
  saveFileEntryWithEmbedding,
} from "@repo/tools/tools/file/services/entry";

const CONTENT = "hello filesystem\n";

async function assertRejects(label: string, fn: () => unknown): Promise<void> {
  try {
    await fn();
  } catch {
    console.info(`PASS: ${label}`);
    return;
  }
  throw new Error(`expected rejection: ${label}`);
}

async function main(): Promise<void> {
  await ensureFilesRoot();
  console.info(`FILES_ROOT = ${FILES_ROOT}`);

  // Path safety: traversal and absolute paths must be rejected.
  await assertRejects("rejects ../ traversal", () =>
    normalizeRelativePath("../escape.txt"),
  );
  await assertRejects("rejects absolute paths", () =>
    normalizeRelativePath("/etc/passwd"),
  );

  const stamp = Date.now();
  const folderPath = `smoke-${stamp}`;
  const fileName = "hello.txt";
  const filePath = `${folderPath}/${fileName}`;

  await ensureDirectory(folderPath);

  // Symlink escape: a link inside the root pointing outside must be detected.
  const symlinkPath = path.join(resolveFilesPath(folderPath), "escape");
  const outside = path.resolve(FILES_ROOT, "..");
  await fs.symlink(outside, symlinkPath);
  await assertRejects("rejects symlink escape", () =>
    assertRealPathInsideRoot(symlinkPath),
  );

  await writeTextFile(filePath, CONTENT, { overwrite: false });

  const stat = await statEntry(filePath);
  if (!stat) throw new Error("written file is missing");

  const contentHash = await hashFile(filePath);
  const detected = detectFileTypeFromName(fileName);
  const lastEditedAt = new Date(Math.max(Date.now(), stat.mtimeMs));

  const folderRow = await insertFileEntry({
    kind: "folder",
    name: folderPath,
    relativePath: folderPath,
    description: "",
    lastEditedAt,
  });

  const fileRow = await insertFileEntry({
    kind: "file",
    parentId: folderRow.id,
    name: fileName,
    relativePath: filePath,
    description: "smoke test file",
    fileType: detected.fileType,
    mimeType: detected.mimeType,
    size: stat.size,
    contentHash,
    filesystemModifiedAt: stat.mtime,
    lastEditedAt,
  });

  await saveFileEntryWithEmbedding({
    id: folderRow.id,
    name: folderRow.name,
    relativePath: folderRow.relativePath,
    description: folderRow.description,
  });
  await saveFileEntryWithEmbedding(fileRow);

  const readBack = await getFileEntryByPath(filePath);
  if (!readBack) throw new Error("file entry was not persisted");

  console.info(
    `Embedding: ${readBack.embedding ? "set" : "missing (Ollama unavailable; backfill can repair)"}`,
  );

  const text = await readTextFile(filePath);
  if (text !== CONTENT) throw new Error("file content did not round-trip");
  if (readBack.contentHash !== contentHash) {
    throw new Error("stored contentHash does not match the file");
  }
  if (readBack.size !== stat.size) throw new Error("stored size is wrong");
  if (readBack.fileType !== "plaintext") {
    throw new Error(`unexpected fileType ${readBack.fileType}`);
  }

  console.info(
    `PASS: indexed ${readBack.relativePath} (id=${readBack.id}, type=${readBack.fileType}, size=${readBack.size}, hash=${readBack.contentHash?.slice(0, 12)}...)`,
  );

  // Cleanup: remove DB rows and the physical subtree.
  await hardDeleteFileEntryRow(fileRow.id);
  await hardDeleteFileEntryRow(folderRow.id);
  await deleteEntry(folderPath, { recursive: true });

  const after = await getFileEntryByPath(filePath, { includeDeleted: true });
  if (after) throw new Error("cleanup left a DB row behind");

  console.info("Smoke test complete.");
}

void main().catch((err) => {
  console.error("File entry smoke test failed:", err);
  process.exitCode = 1;
});
