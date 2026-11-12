import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import {
  FilesystemError,
  assertRealPathInsideRoot,
  resolveFilesPath,
} from "./paths";

/** Streams a file through SHA-256 without loading it into memory. */
export async function hashFile(relativePath: string): Promise<string> {
  const absolutePath = resolveFilesPath(relativePath);

  const stat = await fs.lstat(absolutePath).catch((err) => {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  });

  if (!stat) throw new FilesystemError(`file "${relativePath}" not found`);
  if (!stat.isFile()) {
    throw new FilesystemError(`"${relativePath}" is not a file`);
  }

  await assertRealPathInsideRoot(absolutePath);

  const hash = createHash("sha256");
  const stream = createReadStream(absolutePath);

  for await (const chunk of stream) {
    hash.update(chunk as Buffer);
  }

  return hash.digest("hex");
}

/** Hashes an in-memory string; used before writing new file content. */
export function hashText(content: string): string {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

/** Hashes an in-memory buffer. */
export function hashBuffer(content: Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}

export interface FolderHashChild {
  name: string;
  kind: "file" | "folder";
  contentHash: string | null;
}

/**
 * A folder's synthetic hash from its direct children. This makes a moved or
 * renamed folder recognizable when its subtree moves together.
 */
export function folderContentHash(children: FolderHashChild[]): string {
  const lines = [...children]
    .sort((left, right) => left.name.localeCompare(right.name))
    .map(
      (child) =>
        `${child.kind}\u0000${child.name}\u0000${child.contentHash ?? ""}`,
    );

  return createHash("sha256").update(lines.join("\n")).digest("hex");
}
