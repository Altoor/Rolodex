import type { Tool, ToolDefinition } from "../../model";
import { ToolInputError } from "../../model";
import {
  containsTemplate,
  mergeToolInput,
  readNumber,
  readString,
} from "../../utils";
import { asToolInputError } from "./services/errors";
import { toFileEntryRef, type FileEntryRef } from "./services/dto";
import {
  getFileEntryById,
  getFileEntryByPath,
  moveFileEntryTree,
  saveFileEntryWithEmbedding,
  type FileEntryRow,
} from "./services/entry";
import { createFolderEntry } from "./services/folders";
import {
  joinRelativePath,
  normalizeRelativePath,
  validateEntryName,
} from "./services/paths";
import {
  hasInputKey,
  resolveParentFolderById,
  resolveParentFolderByPath,
} from "./services/resolve";
import { moveEntry, pathExists } from "./services/storage";

const DEFINED_SOURCE_KEYS = [
  "files",
  "file",
  "entries",
  "entry",
  "ids",
  "paths",
] as const;

type SourceKey = (typeof DEFINED_SOURCE_KEYS)[number];

interface MovePlan {
  source: FileEntryRow;
  targetPath: string;
  changed: boolean;
}

const definition: ToolDefinition = {
  key: "move_files",
  name: "Move files",
  description:
    "Move one or more files or folders into an existing folder, or into a new folder created in the same call.",
  category: "file",
  usesModel: true,
  modelRoles: ["embedding"],
  inputMode: "json",
  inputSchema: {
    type: "object",
    properties: {
      files: {
        type: "array",
        items: {
          type: "any",
          description:
            "A file/folder id, relative path, or object with an id/path.",
        },
        description:
          "Files/folders to move. Each item can be an id, a relative path, or an object with id/path. When omitted, uses `files`/`file` from toolState.",
      },
      ids: {
        type: "array",
        items: {
          type: "number",
          description: "File/folder id.",
        },
        description: "Optional list of file/folder ids to move.",
      },
      paths: {
        type: "array",
        items: {
          type: "string",
          description: "Relative file/folder path.",
        },
        description: "Optional list of relative file/folder paths to move.",
      },
      parentId: {
        type: "number",
        description:
          "Existing destination folder id. Omit or use null for the root.",
      },
      parentPath: {
        type: "string",
        description:
          "Existing destination folder path. Omit or use an empty string for the root.",
      },
      folderName: {
        type: "string",
        description:
          "Create or reuse this folder as the destination, under parentId/parentPath or the root.",
      },
      folderDescription: {
        type: "string",
        description:
          "Description used when folderName creates a new destination folder.",
      },
    },
  },
  outputDescription:
    "The moved entries and the destination folder. Appended to toolState as `{ file }`/`{ files }` and `{ folder }`/`{ folders }`.",
  exampleConfig: {
    files: [
      { path: "inbox/invoice-001.pdf" },
      { path: "inbox/invoice-002.pdf" },
    ],
    folderName: "invoices",
  },
};

/** Reads an explicit destination parent, ignoring embedded source entries. */
async function resolveDestinationParent(
  input: Record<string, unknown>,
  viewerId: number,
): Promise<FileEntryRow | null> {
  if (hasInputKey(input, "parentId")) {
    const value = input.parentId;
    if (value === null) return null;

    const id = readNumber(input, "parentId");
    if (id === undefined) {
      throw new ToolInputError('"parentId" must be a number or null');
    }
    return resolveParentFolderById(id, viewerId);
  }

  if (hasInputKey(input, "parentPath")) {
    const value = input.parentPath;
    if (value === null) return null;
    if (typeof value !== "string") {
      throw new ToolInputError('"parentPath" must be a string or null');
    }
    return resolveParentFolderByPath(value, viewerId);
  }

  return null;
}

/**
 * Collects sources from explicit arrays or earlier toolState. When the config
 * defines any source key, only those configured keys are used so unrelated
 * toolState entries are not moved by accident.
 */
function collectSourceValues(
  input: Record<string, unknown>,
  config: Record<string, unknown> | null,
): unknown[] {
  const configuredKeys = config
    ? DEFINED_SOURCE_KEYS.filter((key) => hasInputKey(config, key))
    : [];
  const keys: readonly SourceKey[] =
    configuredKeys.length > 0
      ? configuredKeys
      : ["files", "file", "entries", "entry"];

  const values: unknown[] = [];

  for (const key of keys) {
    // Literal config values win over same-named runtime values; templated ones
    // must use the merged input so their `{{path}}` references are resolved.
    const value =
      config && hasInputKey(config, key) && !containsTemplate(config[key])
        ? config[key]
        : input[key];
    if (value === undefined || value === null) continue;

    if (key === "ids" || key === "paths") {
      if (!Array.isArray(value)) {
        throw new ToolInputError(`"${key}" must be an array`);
      }
      values.push(...value);
      continue;
    }

    if (Array.isArray(value)) {
      values.push(...value);
    } else {
      values.push(value);
    }
  }

  return values;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Resolves a source item expressed as an id, path, or object with id/path. */
async function resolveSource(
  value: unknown,
  index: number,
  viewerId: number,
): Promise<FileEntryRow> {
  if (typeof value === "number" && Number.isFinite(value)) {
    const row = await getFileEntryById(value, { viewerId });
    if (!row) throw new ToolInputError(`file entry ${value} not found`);
    return row;
  }

  if (typeof value === "string" && value.trim()) {
    const relativePath = normalizeRelativePath(value);
    const row = await getFileEntryByPath(relativePath, { viewerId });
    if (!row) {
      throw new ToolInputError(`file entry "${relativePath}" not found`);
    }
    return row;
  }

  if (isRecord(value)) {
    const id = value.id ?? value.fileId ?? value.folderId ?? value.entryId;
    if (typeof id === "number" && Number.isFinite(id)) {
      const row = await getFileEntryById(id, { viewerId });
      if (!row) throw new ToolInputError(`file entry ${id} not found`);
      return row;
    }

    const path = value.path ?? value.relativePath;
    if (typeof path === "string" && path.trim()) {
      const relativePath = normalizeRelativePath(path);
      const row = await getFileEntryByPath(relativePath, { viewerId });
      if (!row) {
        throw new ToolInputError(`file entry "${relativePath}" not found`);
      }
      return row;
    }
  }

  throw new ToolInputError(
    `files[${index}] must be an id, a relative path, or an object with an id/path`,
  );
}

function appendEntries(
  files: FileEntryRef[],
  folders: FileEntryRef[],
): Record<string, unknown> {
  const append: Record<string, unknown> = {};

  if (files.length === 1) append.file = files[0];
  if (files.length > 0) append.files = files;
  if (folders.length === 1) append.folder = folders[0];
  if (folders.length > 0) append.folders = folders;

  return append;
}

export const moveFilesTool: Tool = {
  definition,

  async execute(context) {
    try {
      const input = mergeToolInput(context);
      const sourceValues = collectSourceValues(input, context.config);

      if (sourceValues.length === 0) {
        throw new ToolInputError(
          'no files to move; provide "files", "ids", or "paths", or put files in toolState',
        );
      }

      const byId = new Map<number, FileEntryRow>();
      for (const [index, value] of sourceValues.entries()) {
        const row = await resolveSource(value, index, context.userId);
        byId.set(row.id, row);
      }
      const sources = [...byId.values()];

      // A folder already carries its children, so moving both independently
      // would duplicate work and could move an entry twice.
      for (const source of sources) {
        if (source.kind !== "folder") continue;

        const nested = sources.find(
          (candidate) =>
            candidate.id !== source.id &&
            candidate.relativePath.startsWith(`${source.relativePath}/`),
        );
        if (nested) {
          throw new ToolInputError(
            `cannot move both folder "${source.relativePath}" and its child "${nested.relativePath}"`,
          );
        }
      }

      const parent = await resolveDestinationParent(input, context.userId);
      const folderName = readString(input, "folderName");
      const destinationPath =
        folderName !== undefined
          ? joinRelativePath(
              parent?.relativePath ?? "",
              validateEntryName(folderName),
            )
          : (parent?.relativePath ?? "");

      const plannedTargets = new Set<string>();
      const plans: MovePlan[] = [];

      for (const source of sources) {
        if (
          source.kind === "folder" &&
          destinationPath !== source.relativePath &&
          destinationPath.startsWith(`${source.relativePath}/`)
        ) {
          throw new ToolInputError(
            `cannot move folder "${source.relativePath}" inside itself`,
          );
        }

        const targetPath = joinRelativePath(destinationPath, source.name);
        const changed = targetPath !== source.relativePath;

        if (changed) {
          if (plannedTargets.has(targetPath)) {
            throw new ToolInputError(
              `multiple entries would be moved to "${targetPath}"`,
            );
          }
          plannedTargets.add(targetPath);

          const existing = await getFileEntryByPath(targetPath, {
            viewerId: context.userId,
          });
          if (existing && existing.id !== source.id) {
            throw new ToolInputError(`"${targetPath}" already exists`);
          }
          if (await pathExists(targetPath)) {
            throw new ToolInputError(`"${targetPath}" already exists`);
          }
        }

        plans.push({ source, targetPath, changed });
      }

      // Create or reuse the destination only after validation, so a failed move
      // does not leave an empty folder behind.
      const destination =
        folderName !== undefined
          ? await createFolderEntry({
              parent,
              name: folderName,
              description: readString(input, "folderDescription") ?? "",
              reuseExisting: true,
              viewerId: context.userId,
            })
          : parent;

      const moved: FileEntryRow[] = [];
      const unchanged: FileEntryRow[] = [];

      for (const plan of plans) {
        if (!plan.changed) {
          unchanged.push(plan.source);
          continue;
        }

        await moveEntry(plan.source.relativePath, plan.targetPath);

        let updatedRows: FileEntryRow[];
        try {
          updatedRows = await moveFileEntryTree(
            plan.source.id,
            plan.source.relativePath,
            plan.targetPath,
            {
              name: plan.source.name,
              parentId: destination?.id ?? null,
            },
          );
        } catch (err) {
          // Best-effort rollback so disk and DB do not drift apart.
          await moveEntry(plan.targetPath, plan.source.relativePath).catch(
            () => undefined,
          );
          throw err;
        }

        for (const updated of updatedRows) {
          await saveFileEntryWithEmbedding(updated);
        }

        moved.push(
          updatedRows.find((row) => row.id === plan.source.id) ?? plan.source,
        );
      }

      const refs = [...moved, ...unchanged].map(toFileEntryRef);
      const files = refs.filter((ref) => ref.kind === "file");
      const folders = refs.filter((ref) => ref.kind === "folder");
      const destinationRef = destination ? toFileEntryRef(destination) : null;
      const destinationLabel = destination?.relativePath ?? "root";

      const summary =
        moved.length > 0
          ? `Moved ${moved.length} ${
              moved.length === 1 ? "entry" : "entries"
            } into "${destinationLabel}"${
              unchanged.length > 0 ? ` (${unchanged.length} already there)` : ""
            }`
          : `All ${unchanged.length} ${
              unchanged.length === 1 ? "entry is" : "entries are"
            } already in "${destinationLabel}"`;

      return {
        output: {
          files,
          folders,
          destination: destinationRef,
          moved: moved.length,
          unchanged: unchanged.length,
        },
        summary,
        toolStateAppend: appendEntries(files, folders),
      };
    } catch (err) {
      throw asToolInputError(err);
    }
  },
};
