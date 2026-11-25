import fs from "node:fs/promises";
import path from "node:path";
import { TrialCommitConflictError } from "./types";

/** Trial bookkeeping lives under these roots and must never be committed. */
const ROOT_SKIP = new Set([".trials", ".tmp"]);

interface FileStamp {
  size: number;
  mtimeMs: number;
}

interface FileManifest {
  /** Production state when the trial started. */
  baseline: Record<string, FileStamp>;
  /** Trial state immediately after the copy, before the tool ran. */
  trialInitial: Record<string, FileStamp>;
}

function manifestPath(filesRoot: string): string {
  return `${filesRoot}.baseline.json`;
}

function isFileStamp(value: unknown): value is FileStamp {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as FileStamp).size === "number" &&
    typeof (value as FileStamp).mtimeMs === "number"
  );
}

function isManifest(value: unknown): value is FileManifest {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const valid = (entries: unknown) =>
    typeof entries === "object" &&
    entries !== null &&
    Object.values(entries as Record<string, unknown>).every(isFileStamp);
  return valid(record.baseline) && valid(record.trialInitial);
}

function toPosix(value: string): string {
  return value.split(path.sep).join("/");
}

async function snapshotTree(
  root: string,
  skipRootEntries = false,
): Promise<Record<string, FileStamp>> {
  const result: Record<string, FileStamp> = {};

  const walk = async (directory: string) => {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (skipRootEntries && ROOT_SKIP.has(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await walk(absolute);
      } else if (entry.isFile()) {
        try {
          const stat = await fs.stat(absolute);
          result[toPosix(path.relative(root, absolute))] = {
            size: stat.size,
            mtimeMs: stat.mtimeMs,
          };
        } catch {
          // A file removed mid-scan is treated as absent.
        }
      }
    }
  };

  await walk(root);
  return result;
}

export async function writeFileManifest(
  filesRoot: string,
  productionRoot: string,
): Promise<void> {
  const manifest: FileManifest = {
    baseline: await snapshotTree(productionRoot, true),
    trialInitial: await snapshotTree(filesRoot),
  };
  await fs.writeFile(manifestPath(filesRoot), JSON.stringify(manifest), "utf8");
}

async function readFileManifest(filesRoot: string): Promise<FileManifest> {
  try {
    const raw = await fs.readFile(manifestPath(filesRoot), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (isManifest(parsed)) return parsed;
  } catch {
    // Fall through to the actionable conflict below.
  }
  throw new TrialCommitConflictError(
    "This step's file baseline is missing. Discard the step and run it again.",
  );
}

function sameStamp(a: FileStamp | undefined, b: FileStamp | undefined): boolean {
  if (!a || !b) return a === b;
  return a.size === b.size && a.mtimeMs === b.mtimeMs;
}

async function sameContent(a: string, b: string): Promise<boolean> {
  try {
    const [left, right] = await Promise.all([fs.readFile(a), fs.readFile(b)]);
    return left.equals(right);
  } catch {
    return false;
  }
}

type FileChange =
  | { kind: "add" | "modify"; relative: string }
  | { kind: "delete"; relative: string };

/**
 * Computes and applies only the file changes the attempt made. Untouched
 * production files are left alone, and a concurrent edit to a path the attempt
 * also touched becomes a retryable conflict.
 */
export async function commitFiles(
  filesRoot: string,
  productionRoot: string,
): Promise<void> {
  const manifest = await readFileManifest(filesRoot);
  const [trialNow, productionNow] = await Promise.all([
    snapshotTree(filesRoot),
    snapshotTree(productionRoot, true),
  ]);

  const changes: FileChange[] = [];
  for (const [relative, stamp] of Object.entries(trialNow)) {
    const initial = manifest.trialInitial[relative];
    if (!initial) changes.push({ kind: "add", relative });
    else if (!sameStamp(initial, stamp)) {
      changes.push({ kind: "modify", relative });
    }
  }
  for (const relative of Object.keys(manifest.trialInitial)) {
    if (!trialNow[relative]) changes.push({ kind: "delete", relative });
  }

  const applied = new Set<string>();
  for (const change of changes) {
    const trialPath = path.join(filesRoot, change.relative);
    const productionPath = path.join(productionRoot, change.relative);
    const production = productionNow[change.relative];
    const baseline = manifest.baseline[change.relative];

    if (change.kind === "delete") {
      if (!production) {
        applied.add(change.relative);
        continue;
      }
      if (!sameStamp(production, baseline)) {
        throw new TrialCommitConflictError(
          `"${change.relative}" changed while this step was waiting for review. Discard and retry it.`,
        );
      }
      continue;
    }

    if (production) {
      if (await sameContent(trialPath, productionPath)) {
        applied.add(change.relative);
        continue;
      }
      if (change.kind === "add" || !sameStamp(production, baseline)) {
        throw new TrialCommitConflictError(
          `"${change.relative}" changed while this step was waiting for review. Discard and retry it.`,
        );
      }
    } else if (change.kind === "modify") {
      throw new TrialCommitConflictError(
        `"${change.relative}" was removed while this step was waiting for review. Discard and retry it.`,
      );
    }
  }

  let counter = 0;
  for (const change of changes) {
    if (applied.has(change.relative)) continue;
    const productionPath = path.join(productionRoot, change.relative);

    if (change.kind === "delete") {
      await fs.rm(productionPath, { force: true });
      continue;
    }

    const trialPath = path.join(filesRoot, change.relative);
    await fs.mkdir(path.dirname(productionPath), { recursive: true });
    const temporary = `${productionPath}.tmp-${process.pid}-${counter++}`;
    await fs.copyFile(trialPath, temporary);
    await fs.rename(temporary, productionPath);
  }
}

export async function removeFileManifest(filesRoot: string): Promise<void> {
  await fs.rm(manifestPath(filesRoot), { force: true });
}
