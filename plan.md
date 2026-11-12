# Filesystem Feature — Implementation Plan

## 1. Goal

Add a user-facing filesystem backed by a real `files/` folder in the repository, an indexed database representation, a `/files` page, and a set of tools that let tasks discover, read, create, and edit files and folders.

The feature should let a user:

- Browse a real folder tree in the UI.
- Preview images, text, plaintext, audio, video, and other files.
- Edit plaintext files in place.
- Create folders and plaintext files from the UI.
- Drag-and-drop files into folders.
- Select a task at the bottom of the page and run it with dropped/selected files as context.
- Use task tools to scan the filesystem, search files/folders, read file contents, and create/update file metadata.

This plan is split into independently testable stages. Each stage ends with a concrete test procedure and a “done when” checklist.

---

## 2. Key decisions and recommendations

These are the recommended defaults. They can be changed before implementation starts.

### 2.1 One `fileEntries` table instead of separate file/folder tables

Use one polymorphic table, `fileEntries`, with `kind = "file" | "folder"`.

Why:

- A tree is naturally self-referential (`parentId`).
- Search, rename/move, path updates, and embedding refresh are shared.
- The tools need a single resolver (`find file or folder by id/path/query`).
- GraphQL can expose one `FileEntry` type with a `kind` field.

The user-facing language is still “file” and “folder”; the database row just stores which one it is.

### 2.2 Single shared `files/` tree

Physical layout:

```text
files/
  .gitkeep
  notes/
    shopping.txt
  image.png
```

- `FILES_ROOT` defaults to `<repo>/files`.
- There is one global tree shared by all users of the app.
- The UI presents `files/` directly as the root.
- `fileEntries` rows are global; there is no `ownerId` and no per-user filtering.
- If attribution is wanted later, add nullable `createdBy` / `updatedBy` audit columns, but do **not** use them for access control unless the storage model changes.
- The API never accepts a raw filesystem path from the browser; it accepts IDs and relative paths that are validated against `FILES_ROOT`.

This is a shared workspace. If per-user isolation is needed later, add a `workspaceId`/`rootPath` column and scope every query and filesystem operation by it.

### 2.3 Change detection: mtime/size as a cheap prefilter, SHA-256 as the source of truth

Do **not** rely on native “last edited” (mtime) alone. mtime is unreliable because:

- Copying a file can preserve the old mtime.
- `touch` changes mtime without changing content.
- Some editors replace files or write in stages.
- mtime granularity differs by filesystem.

Recommended algorithm:

1. Use `(size, mtimeMs)` as a cheap “possibly changed” check.
2. If size/mtime differs, stream the file through SHA-256.
3. Compare the new hash with the stored `contentHash`.
4. If the hash is the same, update only filesystem metadata and report `unchanged`.
5. If the hash differs, report `changed`.

For files larger than a configurable limit, allow a `hash: "auto" | "always" | "never"` option. Default `auto` trusts size+mtime for very large files unless `always` is requested.

Folder move detection:

- Store a `contentHash` for folders too, computed from the sorted direct children’s `(name, kind, contentHash)`.
- A folder that disappears and reappears elsewhere with the same folder hash is a move/rename.
- If the hash changed at the same time, fall back to path/subtree matching.

Move detection for files:

- A deleted path plus an added path with the same `contentHash` and `size` is reported as `moved`.
- If several identical files exist, match the closest basename/parent as a tie-breaker. Document that move detection is best-effort for duplicate content.

### 2.4 “Name” is the filename; “title” edits rename the file

The UI calls it the title, but it maps to the filesystem basename:

- Editing a file/folder title renames the physical entry and updates `relativePath`/descendant paths.
- Editing the description changes only database metadata.
- The vector is refreshed when `name` or `description` changes.
- A rename never accepts `/`, `\`, `..`, control characters, or an empty name.

Keeping title and filename identical avoids a second source of truth and keeps the tree trustworthy.

### 2.5 `text` vs `plaintext`

Recommended definitions:

- **`plaintext`**: UTF-8 text that can be shown and edited verbatim. Examples: `.txt`, `.log`, `.csv`, source code, YAML, JSON.
- **`text`**: text-bearing documents where a format-specific reader/renderer is useful. Examples: `.md`, `.html`, `.pdf`, `.docx`. Initially, `.md`/`.html` can be read as text; PDF/DOCX return metadata and a “reader not implemented yet” error in the first pass.

This distinction lets the UI decide between a raw editor (`plaintext`) and a formatted/read-only preview (`text`), and lets future per-type tools add OCR/PDF extraction without changing the file model.

### 2.6 File context is seeded into `toolState`

When a task is started with files, pre-seed its `toolState`:

```json
[
  { "files": [ { "id": 12, "name": "invoice.txt", "path": "inbox/invoice.txt", ... } ] },
  { "folders": [ { "id": 4, "name": "inbox", "path": "inbox", ... } ] }
]
```

This makes existing mechanisms work immediately:

- `mergeToolInput` exposes `files` and `folders` to tools.
- `if`, `filter_tool_state`, and `display_block` can use paths like `files.0.name`.
- PathFormField can offer `files.0.name`, `files.0.path`, etc.

No extra `queuedTaskFiles` join table is required for the first version. If run provenance/replay becomes important, add it later.

### 2.7 Uploads use a streaming HTTP endpoint; previews use signed URLs

Large uploads use a dedicated streaming route so multi-GB files never pass through GraphQL/Yoga multipart:

- `POST /files/upload?name=<name>&parentId=<id>` — raw body, Bearer auth, streamed directly to disk.
- `uploadFiles(files: [File!]!, parentId: Int): [FileEntry!]!` remains for small GraphQL multipart uploads and API tests; it is capped by Yoga's total request-body limit.
- `GET /files/:id/content?token=...` — authenticated/streaming view for binary/media previews.

Text content for editing comes from a GraphQL query with a size limit. Binary/media preview uses the streaming view endpoint because `<img>`, `<audio>`, and `<video>` cannot send GraphQL queries.

### 2.8 Per-file-type content tools

Each file type gets its own read tool. They share services internally, but each tool can later use a different model (vision for images, OCR/PDF extraction for text, transcription for audio).

---

## 3. Architecture overview

```text
apps/web
  /files page
  file tree, preview, editor, upload, task runner
        │
        ▼
packages/ui
  files page components
  shadcn file-tree + breadcrumb primitives
        │
        ▼
packages/queries
  file queries/mutations + generated types
        │
        ▼
apps/backend
  GraphQL file schema + streaming upload route
  signed file view route
  file services
        │
        ├── packages/db ──────► PostgreSQL + pgvector
        │
        └── packages/tools
              file tools
              filesystem services
              scan/index engine
              embeddings
                    │
                    ▼
                 files/
```

Recommended placement of the filesystem domain code, following the existing todo-tool pattern:

```text
packages/tools/src/tools/file/
  services/
    paths.ts          path safety, shared root, relative paths
    storage.ts        stat/list/read/write/move/delete
    hash.ts           streaming SHA-256
    type.ts           MIME + FileType detection
    manifest.ts       walk disk, build manifest
    sync.ts           diff disk vs DB, detect moves, reconcile
    entry.ts          DB CRUD + embedding helpers
    search.ts         vector + lexical + decision fallback
    selection.ts      decision-model fallback for files/folders
    dto.ts            DB row → tool/GraphQL DTO
  findFile.ts
  findFiles.ts
  findFolder.ts
  findFolders.ts
  scanFiles.ts
  updateFileMetadata.ts
  detectFileType.ts
  readPlaintextFile.ts
  readTextFile.ts
  readImageFile.ts
  readAudioFile.ts
  readVideoFile.ts
  readOtherFile.ts
  createFolder.ts
  createFile.ts
  deleteFileEntry.ts   (recommended; used by tasks/tests too)
```

Backend imports these services directly, as it already does for `saveTodoWithEmbedding`.

If this domain grows beyond tools, it can later be extracted into `packages/files` without changing the tool-facing APIs.

---

## 4. Database design

### 4.1 Enums

```ts
export const fileEntryKind = pgEnum("fileEntryKind", ["file", "folder"]);

export const fileType = pgEnum("fileType", [
  "image",
  "text",
  "plaintext",
  "audio",
  "video",
  "other",
]);
```

### 4.2 `fileEntries` table

Recommended columns:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | integer identity | Primary key, same style as `todos`. |
| `parentId` | integer nullable | Self-reference; `null` = top level of `files/`. |
| `kind` | `fileEntryKind` not null | `file` or `folder`. |
| `name` | text not null | Basename incl. extension for files. |
| `description` | text not null default `''` | User/model-editable description. |
| `relativePath` | text not null | POSIX path relative to `FILES_ROOT`, e.g. `inbox/invoice.txt`. |
| `fileType` | `fileType` nullable | Null for folders and until detected. |
| `mimeType` | text nullable | Detected MIME type. |
| `size` | bigint nullable | Bytes; null for folders. |
| `contentHash` | text nullable | SHA-256 of file contents; synthetic hash for folders. |
| `filesystemModifiedAt` | timestamp with timezone nullable | Native `mtime`. |
| `lastEditedAt` | timestamp with timezone not null | Best-known content edit time: max(existing, fs mtime, app write time). |
| `createdAt` | timestamp with timezone not null default now | |
| `updatedAt` | timestamp with timezone not null default now | Metadata row update time. |
| `deletedAt` | timestamp with timezone nullable | Soft delete so scans can report removals and avoid unique collisions. |
| `embedding` | `vector(768)` nullable | Embedding of name + path + description. |

Indexes:

```sql
-- One live entry per path in the shared tree.
CREATE UNIQUE INDEX file_entries_path_live_idx
  ON "fileEntries" ("relativePath")
  WHERE "deletedAt" IS NULL;

CREATE INDEX file_entries_parent_idx
  ON "fileEntries" ("parentId");

CREATE INDEX file_entries_embedding_idx
  ON "fileEntries"
  USING hnsw ("embedding" vector_cosine_ops);
```

### 4.3 Embedding text

Use a dedicated helper in `@repo/ai`, analogous to `todoEmbeddingText`:

```ts
export function fileEntryEmbeddingText(entry: {
  name: string;
  relativePath: string;
  description: string;
}): string {
  return `${entry.name}\n${entry.relativePath}\n\n${entry.description}`;
}
```

Refresh when:

- `name` changes (including rename).
- `relativePath` changes (move).
- `description` changes.
- A new entry is created.
- The sync engine discovers a previously unknown entry.

Content changes do **not** change the embedding unless a future “include text excerpt” feature is added.

### 4.4 Relations

Add to `packages/db/src/relations/relations.ts`:

- `fileEntries.parent` → self (`parentId`).
- `fileEntries.children` → many self.

No user relation unless optional audit columns are added later.

### 4.5 Migration and backfill

- Run `pnpm --filter backend generate` to create the Drizzle migration.
- Run `pnpm --filter backend push` for local development.
- Add a backfill script for entries with no embedding:

```text
apps/backend/src/scripts/backfillFileEntryEmbeddings.ts
```

Script command:

```json
"files:backfill-embeddings": "tsx src/scripts/backfillFileEntryEmbeddings.ts"
```

---

## 5. Filesystem rules and safety

### 5.1 Root and path validation

- `FILES_ROOT` is resolved once at startup; default `<repo>/files`.
- There is no per-user subroot; every operation resolves paths directly under `FILES_ROOT`.
- Every accepted relative path is normalized to POSIX separators.
- Reject:
  - absolute paths,
  - `..` segments,
  - NUL/control characters,
  - empty names,
  - paths outside `FILES_ROOT`.
- After resolving, verify `resolved === root || resolved.startsWith(root + path.sep)`.
- For reads/writes, also verify `realpath` does not escape via symlink.
- Never follow symlinks during scans; treat them as `other` or skip them (recommended: skip with a reported warning).

### 5.2 File operations

- Create folders recursively with `fs.mkdir(..., { recursive: false })` after ensuring the parent exists.
- Create files with exclusive write (`flag: "wx"` unless overwrite is explicitly allowed).
- Write atomically: write to a temp file in the same directory, then rename.
- Rename/move with `fs.rename`; on cross-device errors, fall back to copy + unlink.
- Delete with `fs.rm`; non-empty folders require `recursive: true`.
- Enforce a maximum upload size:
  - streaming endpoint: default 10 GiB/file, configurable with `MAX_STREAM_UPLOAD_BYTES`;
  - GraphQL multipart: 25 MB total request body, 25 MB/file, 20 files/request.
- Sanitize upload filenames; on collision append ` (1)`, ` (2)`, etc.
- Upload to a temp directory inside `FILES_ROOT`, then rename into place.

### 5.3 Ignored entries

Ignore and never index:

- `.gitkeep`,
- `.tmp/` upload staging directory,
- hidden system files matching a small configurable ignore list (e.g. `.DS_Store`, `Thumbs.db`).

Do not ignore all dotfiles by default; some are real user files.

---

## 6. Scan and change-detection engine

### 6.1 Inputs

`syncFileTree(options)` and the `scan_files` tool accept:

- `path?: string` — optional subtree to scan; default entire `files/` tree.
- `apply?: boolean` — update DB; default `true`.
- `includeUnchanged?: boolean` — default `false`.
- `hash?: "auto" | "always" | "never"` — default `auto`.
- `detectMoves?: boolean` — default `true`.
- `maxEntries?: number` — default 5,000; abort with a clear error above this.
- `maxHashBytes?: number` — default e.g. 100 MB per file in `auto` mode.

### 6.2 Algorithm

1. **Walk disk**
   - Recursively walk the selected subtree with `opendir`/`lstat`.
   - Build entries: `{ relativePath, parentPath, kind, name, size, mtimeMs }`.
   - Skip ignored paths and symlinks.
   - Sort by depth so parent IDs can be resolved before children.

2. **Load DB snapshot**
   - Load all non-deleted `fileEntries` in the scanned subtree. The tree is shared, so there is no owner filter.

3. **Diff by path**
   - Path on disk only → `added`.
   - Path in DB only → candidate `deleted` (or `moved` in step 5).
   - Path in both:
     - Kind changed (`file` ↔ `folder`) → delete old + add new; report `changed`.
     - File size/mtime unchanged → `unchanged`.
     - File size/mtime changed → hash and compare:
       - same hash → `unchanged` (metadata refresh only),
       - different hash → `changed`.
     - Folder → recompute folder hash from direct children and compare.

4. **Update metadata**
   - Always refresh `size`, `mimeType`, `filesystemModifiedAt`, `contentHash`, `lastEditedAt`, `updatedAt` where applicable.
   - Detect `fileType` (see Section 7.5) and persist it.
   - Compute/refresh the vector when `name`, `relativePath`, or `description` changed.
   - For new/changed files, hash first, then insert/update so the row is consistent.

5. **Detect moves**
   - Hash new files before declaring them purely “added”.
   - Match removed file rows to added disk paths by `contentHash` + `size`.
   - Match removed folder rows to added disk paths by folder `contentHash`.
   - On match:
     - Update the existing row’s `relativePath`, `parentId`, and `name`.
     - For folders, rewrite descendant paths with a prefix replacement in one transaction.
     - Refresh embeddings for renamed/moved entries.
     - Report `moved` with `fromPath` and `toPath`.
   - Unmatched removed rows → `deleted` (soft delete by setting `deletedAt`).

6. **Return report**

```ts
interface ScanReport {
  counts: {
    added: number;
    changed: number;
    moved: number;
    deleted: number;
    unchanged: number;
  };
  entries: ScanEntry[];
}
```

Each `ScanEntry`:

```ts
interface ScanEntry {
  kind: "file" | "folder";
  change: "added" | "changed" | "moved" | "deleted" | "unchanged";
  id: number | null;
  name: string;
  path: string;
  fromPath?: string;
  fileType?: string | null;
  mimeType?: string | null;
  size?: number | null;
  lastEditedAt?: string | null;
  filesystemModifiedAt?: string | null;
  contentHash?: string | null;
}
```

### 6.3 Safety

- Reconcile in a transaction where possible.
- Never delete a DB row for a path outside the scanned subtree.
- On errors, leave the DB unchanged for the failed entry and continue with others, collecting warnings.
- The tool/test output should include warnings without failing the entire scan unless nothing could be scanned.

---

## 7. Tool catalog

Add `"file"` to `ToolDefinition.category` (`"ai" | "todo" | "file" | "ui"`) and register every tool in `packages/tools/src/registry/registry.ts`.

### 7.1 Shared output shape

Every file/folder DTO should be stable:

```ts
interface FileEntryRef {
  id: number;
  kind: "file" | "folder";
  name: string;
  description: string;
  path: string;
  parentId: number | null;
  fileType: string | null;
  mimeType: string | null;
  size: number | null;
  contentHash: string | null;
  lastEditedAt: string | null;
  filesystemModifiedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  deletedAt: string | null;
}
```

Tools should output and append the same DTO so PathFormField paths are predictable.

### 7.2 Search tools

#### `find_file`

- Like `find_todo`, filtered to `kind = "file"`.
- Input: `query?`, `id?`, `path?`, `limit? = 5`, `decisionModel?`.
- Output: `{ file, score, candidates }`.
- Appends: `{ file }`.

#### `find_files`

- Like `find_todos`, filtered to `kind = "file"`.
- Input: `query?`, `limit? = 15`, `decisionModel?`.
- Output: `{ files, candidates }`.
- Appends: `{ files }`.
- Supports `outputTypes: ["normal", "foreach"]`.
- Foreach items: `{ file }`.

#### `find_folder`

- Like `find_todo`, filtered to `kind = "folder"`.
- Output: `{ folder, score, candidates }`.
- Appends: `{ folder }`.

#### `find_folders`

- Like `find_todos`, filtered to `kind = "folder"`.
- Output: `{ folders, candidates }`.
- Appends: `{ folders }`.
- Supports `outputTypes: ["normal", "foreach"]`.
- Foreach items: `{ folder }`.

Search strategy is shared with todos:

1. explicit id/path,
2. pgvector similarity on `embedding`,
3. lexical `ILIKE` fallback on `name` / `description` / `relativePath`,
4. decision-model selection fallback.

### 7.3 `scan_files`

- Runs the sync engine.
- Input: `path?`, `apply?`, `includeUnchanged?`, `hash?`, `detectMoves?`, `maxEntries?`.
- Output: `{ counts, entries, warnings }`.
- Appends: `{ changes: entries }` (only changed entries unless `includeUnchanged`).
- Supports `outputTypes: ["normal", "foreach"]`.
- Foreach items: `{ entry }`, where `entry` includes `change`, `kind`, `id`, `path`, `fromPath`, etc.
- Example configs:
  - preview only: `{ "apply": false, "includeUnchanged": false }`
  - full resync: `{ "apply": true }`

### 7.4 `update_file_metadata`

- Input: `id?`, `path?`, `name?`, `description?`, `parentId?`.
- Resolves a file or folder from id/path/toolState.
- Renames the physical entry if `name` changes.
- Moves the physical entry if `parentId` changes (recommended in stage 6; can be deferred).
- Refreshes the vector when name/path/description changes.
- Output: `{ file }` or `{ folder }` based on kind; appends the same.
- This is the tool used by “add a name and description”.

### 7.5 `detect_file_type`

- Input: `id?`, `path?`.
- Uses extension + MIME sniffing (`file-type` for binary formats, extension map for text).
- Persists `fileType` and `mimeType`.
- Output: `{ file, type, mimeType, confidence, reason }`.
- Appends: `{ file }`.
- Mapping:
  - `image/*` → `image`
  - `audio/*` → `audio`
  - `video/*` → `video`
  - UTF-8 text + plaintext extensions → `plaintext`
  - Markdown extensions (`.md`, `.markdown`, `.mdx`, `.mdown`, `.mkd`, `.mkdn`) → `plaintext` (editable verbatim, MIME `text/markdown`)
  - text-bearing structured/document extensions → `text`
  - everything else → `other`

### 7.6 Per-type content tools

All take `id?` or `path?`, resolve the file, verify it exists, and enforce a size limit.

| Tool | Returns / appends | Notes |
| --- | --- | --- |
| `read_plaintext_file` | `{ file, content }` | UTF-8 text; supports `maxBytes`; used by the editor. |
| `read_text_file` | `{ file, content, format }` | Structured text/document extraction; may return `unsupported` for PDF/DOCX in MVP. |
| `read_image_file` | `{ file, image: { mimeType, width?, height?, base64? }, url? }` | `includeBase64` defaults false; `url` is a signed view URL for preview/vision later. |
| `read_audio_file` | `{ file, audio: { mimeType, duration?, url } }` | Transcription can be added later. |
| `read_video_file` | `{ file, video: { mimeType, duration?, url } }` | Metadata + signed URL in MVP. |
| `read_other_file` | `{ file, url, base64? }` | Download/opaque binary. |

Each tool appends its full output object so paths like `content`, `image.url`, `audio.url` are available downstream.

### 7.7 Creation tools

#### `create_folder`

- Input: `parentId?`, `parentPath?`, `name`, `description?`.
- Creates the physical folder and DB row.
- Refreshes embedding.
- Output: `{ folder }`; appends `{ folder }`.

#### `create_file`

- MVP supports plaintext only.
- Input: `parentId?`, `parentPath?`, `name`, `content?`, `description?`, `overwrite? = false`.
- Creates the physical UTF-8 file and DB row, detects type, hashes, refreshes embedding.
- Output: `{ file }`; appends `{ file }`.
- Rejects non-plaintext extensions unless a `fileType` is explicitly requested later.

#### `delete_file_entry` (recommended)

- Not explicitly requested for tools, but useful for tests and task flows.
- Input: `id?`, `path?`, `recursive? = false`.
- Deletes physical entry and soft-deletes/removes DB row.
- Output: `{ id, kind, name, path }`.

### 7.8 PathFormField expectations

Every tool output must be documented in `packages/ui/src/lib/toolStatePaths.ts`:

- `find_file` → `file.*`
- `find_files` → `files`, `files.0.*`, and foreach `file.*`
- `find_folder` → `folder.*`
- `find_folders` → `folders`, `folders.0.*`, and foreach `folder.*`
- `scan_files` → `changes`, `changes.0.*`, `counts.*`, and foreach `entry.*`
- `update_file_metadata` → `file.*` / `folder.*`
- `detect_file_type` → `file.*`
- `read_plaintext_file` / `read_text_file` → `file.*`, `content`
- `read_image_file` → `file.*`, `image.*`, `url`
- `read_audio_file` / `read_video_file` → `file.*`, `audio.*` / `video.*`, `url`
- `create_folder` → `folder.*`
- `create_file` → `file.*`

Also add every path-aware file tool to `PATH_AWARE_TOOLS` in `packages/ui/src/components/task/taskCard/components/toolTaskFields.tsx` so its config JSON can reference earlier paths.

---

## 8. Prompt tool changes

Current output is `{ text }`. Extend it so a prompt can produce named fields that become first-class toolState paths.

### 8.1 New optional config

```json
{
  "prompt": "Write a name and description for the folder {{folder.name}}.",
  "system": "You name files and folders clearly and briefly.",
  "fields": {
    "name": {
      "type": "string",
      "description": "Short folder name. No slashes."
    },
    "description": {
      "type": "string",
      "description": "One or two sentences describing the contents."
    },
    "content": {
      "type": "string",
      "description": "Plaintext to write into the file."
    }
  }
}
```

### 8.2 Behavior

- If `fields` is omitted, behavior stays exactly as today: output `{ text, thinking, model }`, append `{ text }`.
- If `fields` is present:
  - Build a JSON schema from the field definitions.
  - Pass it as Ollama’s `format`.
  - Parse the response as JSON.
  - Validate required fields.
  - Return `output = { text, thinking, model, ...parsedFields }`.
  - Append `{ text, ...parsedFields }` so downstream tasks get `name`, `description`, `content`, etc.
- Support field types: `string`, `number`, `boolean`, `object`, `array`, `enum`.
- Add an `onInvalid` option:
  - `"fail"` (default): throw a `ToolInputError` containing the raw model output.
  - `"text"`: keep the raw response in `text` and omit structured fields.
- Keep `format` as an escape hatch; if both `format` and `fields` are set, merge them or reject the combination with a clear error (recommended: reject to avoid ambiguity).

### 8.3 PathFormField support

Update `inferToolStatePaths` for `prompt`:

- Always add `text`.
- Parse `toolConfig.fields` and add one path per key.
- If `fields` is empty/invalid, only `text` is offered.

This makes a prompt task’s output immediately usable as:

- `name` for `create_folder`,
- `description` for `update_file_metadata`,
- `content` for `create_file` or a plaintext write,
- `text` as generic context.

### 8.4 Optional follow-up

Add `contextPaths?: string[]` later to inject specific toolState values into a prompt without dumping all of `toolState`. Not required for the first version because `useToolState` already exists.

---

## 9. Task and file context integration

### 9.1 `createQueuedTask` mutation

Add optional args:

```graphql
createQueuedTask(
  taskId: Int
  state: String!
  fileIds: [Int!]
  folderIds: [Int!]
): QueuedTask
```

Service behavior:

1. Resolve and validate every ID exists.
2. Build `FileEntryRef` DTOs.
3. Seed `toolState`:
   - `{ files: [...] }` when file IDs are present.
   - `{ folders: [...] }` when folder IDs are present.
4. Keep `state` as the user’s text. If empty, use a short summary like `Files: invoice.txt, photo.png`.
5. Insert the queued task and trigger the queue as today.

This is backwards-compatible: existing callers omit the new args and get `toolState: []`.

### 9.2 Tool resolution from context

The shared resolver should accept any of:

- `input.id`, `input.fileId`, `input.folderId`
- `input.path`
- `input.file`, `input.files`
- `input.folder`, `input.folders`
- `input.entry`, `input.entries`
- a query fallback against `context.state`

This lets `scan_files` foreach → `read_plaintext_file` work with `{ entry }`, `find_files` foreach → `update_file_metadata` work with `{ file }`, and a user-provided context work with `{ files }`.

### 9.3 Files page bottom runner

- Bottom bar contains:
  - task select (`TASKS` query),
  - optional state textarea,
  - “Run with files” button,
  - a drop zone labeled “Drop files here to run or upload”.
- Dropping onto a folder in the tree uploads into that folder.
- Dropping onto the bottom bar:
  1. uploads the files,
  2. indexes them,
  3. calls `createQueuedTask` with their IDs,
  4. shows a “Run started” notice with a link to `/` (where live runs are shown).
- If no task is selected, use the user’s default task; if neither exists, show an inline error.

### 9.4 Task flow example

```text
scan_files (foreach)
  └── read_plaintext_file
        └── prompt with fields { summary }
              └── update_file_metadata (description = summary)
```

Or:

```text
find_folder
  └── prompt with fields { name, description }
        └── create_folder
```

---

## 10. Backend API

### 10.1 GraphQL types ✅

Add `apps/backend/src/schema/file/`:

- `file.ts` — `FileEntry` object, `FileEntryKind` enum, `FileType` enum.
- `file-queries.ts`
- `file-mutations.ts`
- `file-service.ts`
- `file-upload.ts` — raw streaming upload route (not GraphQL).
- `index.ts`

Expose:

```graphql
scalar File

enum FileEntryKind { file folder }
enum FileType { image text plaintext audio video other }

type FileEntry {
  id: Int!
  parentId: Int
  kind: FileEntryKind!
  name: String!
  description: String!
  path: String!
  fileType: FileType
  mimeType: String
  size: Int
  contentHash: String
  lastEditedAt: DateTime!
  filesystemModifiedAt: DateTime
  createdAt: DateTime!
  updatedAt: DateTime!
  deletedAt: DateTime
}
```

The `File` scalar is the WHATWG `File` object provided by Yoga’s multipart parser.

Queries:

```graphql
fileEntries(parentId: Int, includeDeleted: Boolean): [FileEntry!]!
getFileEntry(id: Int!): FileEntry
getFileText(id: Int!, maxBytes: Int): String
createFileViewToken(id: Int!): FileViewToken!
```

Mutations:

```graphql
createFileEntry(kind: FileEntryKind!, parentId: Int, name: String!, description: String, content: String): FileEntry!
updateFileEntry(id: Int!, name: String, description: String, parentId: Int): FileEntry!
deleteFileEntry(id: Int!, recursive: Boolean): String
writeFileText(id: Int!, content: String!): FileEntry!
uploadFiles(files: [File!]!, parentId: Int): [FileEntry!]!
indexFileTree(path: String, apply: Boolean): JSON
```

`FileViewToken`:

```graphql
type FileViewToken {
  url: String!
  expiresAt: DateTime!
}
```

### 10.2 Service rules ✅

- Every mutation calls `requireUserId(ctx)` for authentication only; the file tree is shared, so there is no per-entry ownership check.
- Name/path validation is shared with the tools.
- `writeFileText` only allows `plaintext` files (or prominent `text` files explicitly marked editable).
- `createFileEntry` supports folders and plaintext files; binary/large uploads use the streaming endpoint (`uploadFiles` remains for small multipart uploads).
- `deleteFileEntry` is recursive only when `recursive: true`; otherwise reject non-empty folders.
- All mutations that change a path/name/description refresh the embedding.
- `indexFileTree` can be used by the UI “refresh” button and by tests; it delegates to `syncFileTree`.

### 10.3 Uploads ✅

#### 10.3.1 Streaming upload endpoint (primary; large files)

```http
POST /files/upload?name=<filename>&parentId=<optional id>
Authorization: Bearer <jwt>
Content-Type: application/octet-stream

<raw file bytes>
```

- Filename can also come from the `X-File-Name` header.
- The body is streamed directly into `files/.tmp/`, so memory usage stays flat regardless of file size.
- After the stream completes, the temp file is atomically moved into place and indexed (type detection, SHA-256, DB row, embedding).
- Default limit: 10 GiB/file, configurable with `MAX_STREAM_UPLOAD_BYTES`. Declared `Content-Length` is rejected early; the stream is also counted to enforce the limit.
- Returns `201` with `{ "file": FileEntryRef }`.
- Cleans up temp and target files if streaming or indexing fails.
- CORS/preflight is handled on this route because the web app uploads with `fetch()`.
- Implemented in `apps/backend/src/schema/file/file-upload.ts`.

#### 10.3.2 GraphQL multipart upload (small files)

Add `scalar File` to the Pothos schema and expose:

```graphql
uploadFiles(files: [File!]!, parentId: Int): [FileEntry!]!
```

- Auth: the normal `Authorization: Bearer <jwt>` header; `requireUserId` is still called.
- Content type: `multipart/form-data` per the GraphQL multipart request spec.
- Each variable is a WHATWG `File` with `name`, `type`, `size`, and `arrayBuffer()`.
- Yoga's `maxRequestBodySize` caps the entire multipart request at 25 MB.
- `uploadFilesForApi` additionally enforces 25 MB/file and 20 files/request before reading any file.
- Write each file to `files/.tmp/`, sanitize names, resolve collisions, move into the target folder, and index it.
- Fail the whole mutation with a clear error naming the bad file; roll back created rows/files.
- Do **not** use `fetchAPI.formDataLimits`: the installed Yoga version only accepts Fetch API constructor overrides there. A direct `@whatwg-node/fetch` dependency was removed because it only configured per-part limits and did not solve the total-body/memory limit.
- Add `File` to GraphQL codegen's scalar mapping (`File: "File"`).

### 10.4 File view endpoint ✅

`GET /files/:id/content?token=<signed-token>`

- Token payload: `{ sub: userId, fileId, purpose: "file-view" }`, signed with `TOKEN_SECRET`, 5-minute expiry.
- Validate signature, expiry, and that the resolved DB path is still inside `FILES_ROOT`.
- The shared tree means any authenticated user may view a file; the token exists to authenticate `<img>`/`<audio>`/`<video>` requests and to avoid exposing raw paths.
- Set:
  - `Content-Type: <mimeType>`
  - `Content-Length`
  - `Content-Disposition: inline; filename*=UTF-8''<encoded-name>`
  - `Cache-Control: private, max-age=60`
  - `Accept-Ranges: bytes`
- Support HTTP `Range` requests (`206 Partial Content`) for audio/video.
- Return `404` for missing/deleted files and `401/403` for invalid or expired tokens.

### 10.5 Server routing and CORS ✅

`apps/backend/server.ts` uses a small router:

```text
/files/upload        → streaming upload handler
/files/:id/content   → view handler
everything else      → yoga (including /graphql multipart uploads)
```

- Yoga handles CORS for `/graphql`, including the multipart upload preflight.
- The streaming upload route handles its own CORS preflight because the web app calls it with `fetch()` and an `Authorization` header.
- The view route is loaded by `<img>`, `<audio>`, and `<video>`, so it does not need CORS for normal preview; add it only if the page starts fetching it with JavaScript.

### 10.6 Codegen workflow ✅

After backend schema changes:

1. Start the backend: `pnpm --filter backend api`.
2. Run `pnpm codegen` (or `pnpm --filter @repo/queries codegen`).
3. Build queries: `pnpm --filter @repo/queries build`.
4. Build UI: `pnpm --filter @repo/ui build:components`.
5. Run `pnpm check-types`.

Add new query/mutation modules:

```text
packages/queries/src/files/file-queries.ts
packages/queries/src/files/file-mutations.ts
```

Include a `FileEntryFields` fragment so every consumer stays in sync. Add `File` to the codegen scalar map inside the client preset output config in `packages/queries/codegen.ts`:

```ts
generates: {
  "./src/__generated__/": {
    preset: "client",
    config: { scalars: { File: "File" } },
    // ...
  }
}
```

---

## 11. Frontend files page

### 11.1 Route and navigation

- Add `apps/web/app/files/page.tsx`:

```tsx
import FilesPage from "@repo/ui/pages/files";
export default function Page() { return <FilesPage />; }
```

- Add `packages/ui/src/pages/files.tsx`, wrapped in `AuthGate`.
- Add `{ href: "/files", label: "Files", requiresAuth: true }` to `NAV_ITEMS` in `headerMenu.tsx`.

### 11.2 Layout

```text
PageHeader “Files”
┌────────────────────────────────────────────────────────────┐
│ Left: file tree (fixed width / 1/3)                        │
│  - toolbar: New folder, New file, Refresh, Upload          │
│  - tree                                                    │
├────────────────────────────────────────────────────────────┤
│ Right: preview (2/3)                                       │
│  - breadcrumb                                              │
│  - title + Edit + Delete                                   │
│  - Accordion: Description                                  │
│  - preview / editor                                        │
└────────────────────────────────────────────────────────────┘
Bottom bar: task select + state + drop zone + Run button
```

Responsive:

- Desktop: two columns.
- Mobile: tree above preview, bottom bar sticky.
- Empty preview: `EmptyState` prompting selection.
- Loading: `LoadingState`.
- Error: `ErrorState` with retry.

### 11.3 UI primitives

Add to `packages/ui/src/components/ui/`:

- `file-tree.tsx` — built on existing `Collapsible` + `Button` per the shadcn AI Elements File Tree docs. Exports:
  - `FileTree`
  - `FileTreeFolder`
  - `FileTreeFile`
  - `FileTreeIcon`
  - `FileTreeName`
  - `FileTreeActions`
- `breadcrumb.tsx` — from the shadcn base Breadcrumb docs.
- `alert-dialog.tsx` — for delete confirmation (or use a local dialog; recommended to add the primitive).

The File Tree implementation should follow the documented composition:

- folder = `Collapsible` with a `CollapsibleTrigger` rendered as a ghost `Button`,
- file = ghost `Button` that calls `onSelect(path)`,
- actions render next to the file button, not inside it.

### 11.4 Tree data and behavior

- Fetch `fileEntries` for the user.
- Convert the flat list into a nested tree:
  - sort folders first, then files, then by name,
  - attach children by `parentId`.
- Root is synthetic; it is not a DB row.
- Selection state: `selectedId`.
- Expansion state: `Set<number>` (folders).
- Toolbar actions:
  - **New folder**: inline dialog; parent = selected folder or root.
  - **New file**: dialog with name; creates an empty plaintext file; parent = selected folder or root.
  - **Refresh**: call `indexFileTree` and refetch.
  - **Upload**: file picker.
- Drag/drop:
  - Folder nodes are drop targets; highlight on drag-over.
  - Root/tree background drops into the root.
  - Multiple files supported.
  - Dropping a directory: first pass can use `webkitGetAsEntry` to traverse and upload the contained files; if that is too much for the first pass, show a clear “folder upload not supported yet” message and keep file-only drops.
- Per-node actions (via `FileTreeActions` or context menu):
  - Rename (same as edit title),
  - Delete,
  - Download.

### 11.5 Preview pane

Header:

- `Breadcrumb`: `Files / folder / subfolder / file.txt`. Each folder segment is clickable and selects/expands that folder.
- Title: `entry.name`.
- `Accordion` with one item “Description”:
  - displays `entry.description` or “No description yet”.
  - Edit mode shows a textarea.
- Actions:
  - **Edit**: toggles metadata editing (title + description). Save calls `updateFileEntry`; refresh tree and embedding.
  - **Delete**: opens confirmation; calls `deleteFileEntry`; clears selection.

Body by `fileType` / MIME:

| Type | Preview |
| --- | --- |
| `plaintext` | `<textarea>` (or lightweight code editor) + Save/Cancel; loads `getFileText`; warns above `maxBytes`. |
| `text` | Read-only formatted/raw preview initially; later Markdown renderer/PDF extractor. |
| `image` | `<img src={signedUrl} alt={name} />` with max dimensions and “open in new tab”. |
| `audio` | `<audio controls src={signedUrl} />`. |
| `video` | `<video controls src={signedUrl} />`. |
| `other` | File metadata + Download button. |

- File metadata footer: size, MIME, last edited (DB), filesystem modified (native), hash (truncated), full path.
- Renaming a file updates the selected breadcrumb/tree after refetch.
- If the selected file is deleted or renamed externally, handle `404` and clear selection with a toast.

### 11.6 Editing title/description

- A small form with:
  - `name` (title) input,
  - `description` textarea.
- Save is disabled while pending.
- Server-side name validation errors are shown inline.
- On success:
  - refetch `fileEntries`,
  - keep the same entry selected by ID,
  - update the preview header.
- If `name` changes, the physical file is renamed and the tree path updates.

### 11.7 Bottom task runner

- Component: `fileTaskRunner.tsx`.
- Data: `TASKS` query, user default task.
- State:
  - selected task ID,
  - optional state text,
  - uploading/running flags,
  - result/error.
- Drop handling:
  - Upload files to the root (or currently selected folder),
  - create a queued task with uploaded IDs,
  - show “Run started”.
- Button “Run with current folder” / “Run with selected files” for non-drop use.
- Do not block the UI while the task runs; link to `/` for the live chain-of-thought.

### 11.8 Files page client services

Add:

```text
packages/ui/src/components/files/
  file-tree-view.tsx
  file-preview.tsx
  file-preview-header.tsx
  file-metadata-editor.tsx
  file-plaintext-editor.tsx
  file-upload-dropzone.tsx
  file-task-runner.tsx
  file-create-dialogs.tsx
  file-actions.ts
  types.ts
```

`file-actions.ts` wraps GraphQL mutations and the streaming upload endpoint so components stay presentational. Large uploads use `POST /files/upload`; small API-driven uploads may still use `uploadFiles` with `File` variables.

---

## 12. Staged implementation plan

Each stage is complete and testable on its own. Do not start the next stage until its “Done when” checks pass.

> **Status:** ✅ Stages 1–4 are implemented and verified. ⬜ Stages 5–9 remain.

---

### Stage 1 — Storage foundation + database model ✅ DONE

**Goal:** The repository has a real `files/` root, the `fileEntries` table/migration, and safe read/write/index primitives.

**Status:** ✅ Complete — migration applied, storage services and smoke script pass, types pass.

**Tasks:**

1. Create `files/.gitkeep` and update `.gitignore`:
   ```gitignore
   files/*
   !files/.gitkeep
   ```
2. Add `FILES_ROOT` config (default `<repo>/files`) and startup validation. Add it to `turbo.json` `globalEnv` if it can vary by environment.
3. Add `fileEntryKind` and `fileType` enums and the `fileEntries` table to `packages/db/src/schema.ts`.
4. Add relations in `packages/db/src/relations/relations.ts`.
5. Generate and apply the migration.
6. Add filesystem services:
   - `paths.ts` — root resolution, relative path normalization, traversal checks.
   - `storage.ts` — stat/list/read/write/move/delete, atomic writes.
   - `hash.ts` — streaming SHA-256.
   - `type.ts` — MIME/extension/type detection.
   - `entry.ts` — DB CRUD + `fileEntryEmbeddingText`/`saveFileEntryWithEmbedding`.
7. Add `fileEntryEmbeddingText` to `@repo/ai`.
8. Add `apps/backend/src/scripts/backfillFileEntryEmbeddings.ts`.
9. Add a tiny debug script or test harness:
   - `apps/backend/src/scripts/createFileEntrySmoke.ts` (temporary, or a Vitest test) that creates a folder inside `files/`, writes a test file, inserts a row, reads it back, and deletes it.

**Test:**

```bash
pnpm --filter backend generate
pnpm --filter backend push
pnpm --filter backend check-types
pnpm --filter @repo/tools check-types
```

- Inspect the table in `psql`:
  ```sql
  \d "fileEntries"
  ```
- Run the smoke script and verify a row exists with `relativePath`, `size`, `contentHash`, `lastEditedAt`.
- Verify the embedding is non-null when Ollama is running; verify the script still succeeds when Ollama is down (embedding may be null, as with todos).

**Done when:**

- Migration applies cleanly.
- `files/` is created safely.
- A file can be written and indexed manually.
- Path traversal attempts (`../`, absolute paths, symlink escape) are rejected.
- Type checking passes.

---

### Stage 2 — Scan/sync engine and change detection ✅ DONE

**Goal:** A CLI can reconcile the physical tree with `fileEntries` and report added/changed/moved/deleted/unchanged entries.

**Status:** ✅ Complete — add/change/touch/move/delete/type/idempotence/embedding checks passed.

**Tasks:**

1. Implement `manifest.ts`:
   - recursive walk,
   - ignore list,
   - symlink skip,
   - `lstat` metadata.
2. Implement `sync.ts`:
   - diff by path,
   - mtime/size prefilter + SHA-256,
   - folder hash,
   - move detection,
   - soft delete,
   - metadata/type/embedding refresh.
3. Implement `detectFileType` shared service.
4. Add `apps/backend/src/scripts/indexFiles.ts`:
   - args: `--path`, `--apply`, `--include-unchanged`, `--hash`,
   - calls `syncFileTree` and prints the report.
5. Add script:
   ```json
   "files:index": "tsx src/scripts/indexFiles.ts"
   ```
6. Add a simple `files:scan` test fixture under `files/` (not committed).

**Test matrix:**

1. Empty root → scan reports no changes.
2. Add `notes/a.txt` → scan reports `added`, DB row exists.
3. Edit content, same filename → scan reports `changed`; hash changes.
4. `touch notes/a.txt` without content change → scan reports `unchanged`; metadata refreshes.
5. Rename `a.txt` → `b.txt` → scan reports `moved` (not delete+add) and DB path updates.
6. Move to a subfolder → scan reports `moved`; parent/path update.
7. Delete a file → scan reports `deleted`; row gets `deletedAt`.
8. Add an image, audio file, and unknown binary → types are `image`, `audio`, `other`.
9. Add a folder, move it with children → folder move is detected and descendant paths update.
10. Run twice in a row → second run reports no changes (idempotent).

**Done when:**

- The DB always matches the disk after an `apply` scan.
- The report is accurate for all five change kinds.
- The scan is idempotent.
- Embeddings update on rename/move and new entries.

---

### Stage 3 — File tools ✅ DONE

**Goal:** All file/folder tools are registered and testable from the Tools page, with PathFormField-compatible outputs.

**Status:** ✅ Complete — 16 file tools registered, runtime checks, PathFormField mapping, types/lint pass.

**Tasks:**

1. Implement shared resolver/search/selection services.
2. Implement and register:
   - `find_file`, `find_files`
   - `find_folder`, `find_folders`
   - `scan_files`
   - `update_file_metadata`
   - `detect_file_type`
   - `read_plaintext_file`, `read_text_file`, `read_image_file`, `read_audio_file`, `read_video_file`, `read_other_file`
   - `create_folder`, `create_file`
   - `delete_file_entry` (recommended)
   - Markdown files (`.md`, `.markdown`, `.mdx`, etc.) are classified as `plaintext` and are accepted by `create_file`.
3. Add `"file"` to `ToolDefinition.category`.
4. Update `registry.ts`.
5. Update `packages/ui/src/lib/toolStatePaths.ts` with the static file tool paths listed in Section 7.8.
6. Add file tools to `PATH_AWARE_TOOLS` where config can reference earlier paths.

**Test via `/tools` page:**

For each tool, use the built-in test form with `state`, `toolConfig`, and a hand-written `toolState` snapshot:

- `scan_files` with `{ "apply": false }` → returns added/changed/etc. without mutating DB.
- `find_folder` / `find_folders` → vector search, lexical fallback, and explicit `id`/`path`.
- `find_file` / `find_files` → same, plus foreach output.
- `update_file_metadata` with `{ "id": 1, "description": "..." }` → DB + embedding update; verify with a second `find_folder`.
- `detect_file_type` on a `.txt`, `.png`, `.mp3`, `.pdf`, unknown binary.
- `read_plaintext_file` returns content; `read_text_file` returns content or a clear unsupported error.
- `read_image_file` returns metadata and a URL/base64 according to config.
- `create_folder` → physical folder + DB row + vector.
- `create_file` with content → physical file + DB row + vector.
- `create_file` with `note.md` → accepted as plaintext; `read_plaintext_file` returns its content.
- Foreach: `find_folders` and `scan_files` return `foreach` items when `outputType = foreach`.

**Done when:**

- Every tool appears on the Tools page.
- Every tool can be run with an empty/synthetic toolState.
- Outputs match the documented DTOs.
- PathFormField shows the expected paths for each tool in the task builder.
- Types/lint pass.

---

### Stage 4 — Backend GraphQL API + signed view endpoint ✅ DONE

**Goal:** The frontend can list, create, rename/move, delete, read, upload, and preview files through the backend.

**Status:** ✅ Complete — GraphQL CRUD, signed view route, GraphQL multipart, and streaming upload verified (including a 50 MB streamed file and Range requests).

**Tasks:**

1. Add GraphQL file schema/service/mutations/queries.
2. Add `getFileText`, `fileEntries`, `getFileEntry`, `createFileViewToken`, `indexFileTree`.
3. Add `writeFileText`, `createFileEntry`, `updateFileEntry`, `deleteFileEntry`, `uploadFiles`.
4. Add the `File` scalar for small GraphQL multipart uploads.
5. Add the streaming upload route `POST /files/upload` (raw body, default 10 GiB/file, `MAX_STREAM_UPLOAD_BYTES`).
6. Add the signed view route in `server.ts`.
7. Add query/mutation documents in `packages/queries/src/files/`.
8. Run codegen and build.

**Test with `curl` / GraphQL:**

1. Authenticate and get a token.
2. `createFileEntry(kind: folder, name: "inbox")`.
3. `createFileEntry(kind: file, name: "note.txt", content: "hello")`.
4. `fileEntries` returns both.
5. `updateFileEntry` renames the file; physical file renamed; path updated.
6. `writeFileText` updates content; `getFileText` returns it.
7. Upload a PNG and a TXT via a GraphQL multipart request (small-file path):
   ```bash
   curl http://localhost:4000/graphql \
     -H "Authorization: Bearer $TOKEN" \
     -F operations='{"query":"mutation($files:[File!]!){uploadFiles(files:$files){id name path}}","variables":{"files":[null,null]}}' \
     -F map='{"0":["variables.files.0"],"1":["variables.files.1"]}' \
     -F 0=@photo.png \
     -F 1=@note.txt
   ```
   Both appear in `fileEntries`.
8. Upload a file larger than the GraphQL body limit via the streaming endpoint:
   ```bash
   curl -X POST "http://localhost:4000/files/upload?name=video.mp4" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/octet-stream" \
     --data-binary @video.mp4
   ```
   Verify `201`, correct `size`/`contentHash`, and identical bytes on disk. A 50 MB test file is sufficient to prove streaming past 25 MB.
9. Streaming upload preflight returns CORS headers; a request without auth returns `401`.
10. `createFileViewToken` + `GET /files/:id/content?token=...`:
    - returns correct `Content-Type`,
    - supports `Range` for a media file.
11. `deleteFileEntry` deletes a file and a non-empty folder with `recursive: true`.
12. A request without a view token is rejected; a token for a different file ID is rejected.

**Done when:**

- Full CRUD round-trips work over GraphQL.
- Small GraphQL multipart uploads and large streaming uploads both return refs and are indexed.
- Streaming uploads work above the 25 MB GraphQL body limit with flat memory usage.
- View URLs work in a browser tab and in `<img>`/`<audio>`/`<video>`.
- Codegen output is committed/updated.
- Types/lint pass.

---

### Stage 5 — Read-only files page ⬜ PENDING

**Goal:** `/files` shows the tree and previews the selected file, with breadcrumb, title, and description accordion.

**Tasks:**

1. Add route, page, nav item.
2. Add `file-tree.tsx` and `breadcrumb.tsx` UI primitives.
3. Build the tree from `fileEntries`.
4. Add preview header:
   - breadcrumb,
   - title,
   - description accordion,
   - placeholder Edit/Delete buttons (disabled or hidden until Stage 6).
5. Add preview renderers for:
   - plaintext/text (read-only `<pre>` or `<textarea readOnly>`),
   - image,
   - audio,
   - video,
   - other/download.
6. Add metadata footer.
7. Add loading/empty/error states.

**Test:**

1. Start backend + web.
2. Visit `/files`; tree shows folders first, then files.
3. Select a folder → expands; select a file → preview loads.
4. Breadcrumb reflects the path; clicking a folder segment selects/expands it.
5. Select `.txt`, `.png`, `.mp3`, `.mp4`, unknown binary → each renders the correct preview type.
6. Description accordion opens/closes and shows the DB description.
7. Delete/rename externally in the terminal; click Refresh; tree updates.
8. Empty root shows a friendly empty state.

**Done when:**

- The page is usable read-only.
- No console errors.
- All preview types render correctly.
- Types/lint pass.

---

### Stage 6 — Editing, creation, and drag-and-drop ⬜ PENDING

**Goal:** Users can edit metadata/content, create folders/files, delete entries, and upload by drag-and-drop.

**Tasks:**

1. Wire **Edit**:
   - title + description form,
   - save via `updateFileEntry`,
   - success refreshes tree + preview.
2. Wire **Delete**:
   - confirmation dialog,
   - `deleteFileEntry`,
   - clear selection.
3. Add plaintext editor:
   - load via `getFileText`,
   - save via `writeFileText`,
   - dirty-state warning,
   - size guard.
4. Add **New folder** and **New file** dialogs.
5. Add upload button and drag/drop onto folders/root using `POST /files/upload` (one parallel request per file); keep GraphQL `uploadFiles` for small API-driven uploads.
6. Add `file-actions.ts` client wrapper.
7. Add per-node download action.
8. Optional: rename/move via drag-and-drop between folders.

**Test:**

1. Edit a file title → physical file renamed, tree and breadcrumb update.
2. Edit a description → preview updates; run `find_folder`/`find_file` and verify the new text is searchable.
3. Edit a `.txt` file → save → re-select → content persists.
4. Create a folder → appears in tree.
5. Create a plaintext file → appears and opens empty.
6. Delete a file → disappears; `files/` no longer has it.
7. Delete a non-empty folder → confirmation explains recursion.
8. Drag a PNG from the desktop onto a folder → uploads into that folder and previews.
9. Drag multiple files → all upload.
10. Refresh after external changes → tree reconciles.

**Done when:**

- All UI actions round-trip to disk + DB.
- Renames update the physical filename.
- Deletes remove the physical entry.
- Uploads are indexed and searchable.
- Types/lint pass.

---

### Stage 7 — Prompt tool structured output + PathFormField ⬜ PENDING

**Goal:** A prompt can return named fields that downstream tools and file metadata fields can use directly.

**Tasks:**

1. Extend `prompt.ts`:
   - `fields` schema,
   - JSON schema generation,
   - parse/validate response,
   - `output`/`toolStateAppend` include parsed fields,
   - `onInvalid` behavior,
   - preserve current behavior when `fields` is absent.
2. Update `toolStatePaths.ts`:
   - parse `toolConfig.fields` for `prompt`,
   - add paths for every field,
   - keep `text`.
3. Update prompt tool documentation/example config.
4. Add a task-builder hint showing the generated field paths.

**Test:**

1. Run `prompt` with:
   ```json
   {
     "prompt": "Return a folder name and description for a folder of tax documents.",
     "fields": {
       "name": { "type": "string" },
       "description": { "type": "string" }
     }
   }
   ```
   Verify output and `toolStateAppend` contain `text`, `name`, `description`.
2. In a task builder, select a later `create_folder` task and confirm `name`/`description` appear in PathFormField.
3. Drag `name` into the `create_folder` config; run the flow; folder is created with that name.
4. Prompt without `fields` → output is still exactly `{ text }`.
5. Invalid model JSON with `onInvalid: "fail"` → clear error; with `"text"` → raw text preserved.
6. `prompt` → `update_file_metadata` with `description` path works.

**Done when:**

- Prompt outputs are first-class PathFormField values.
- Backward compatibility is preserved.
- Types/lint pass.

---

### Stage 8 — Task context, bottom runner, and end-to-end file flows ⬜ PENDING

**Goal:** Dropping files starts a task with those files in `toolState`, and scan/foreach flows work end-to-end.

**Tasks:**

1. Add `fileIds`/`folderIds` to `createQueuedTask` and seed `toolState`.
2. Update `packages/queries/src/tasks/task-mutations.ts` and codegen.
3. Add `fileTaskRunner.tsx` to the files page bottom.
4. Implement drop → upload → create task.
5. Add “Run started” feedback with a link to `/`.
6. Add file context hints in the task builder:
   - explain that `files`/`folders` are available at runtime,
   - include them in PathFormField suggestions where feasible (or document them in the files page and task builder).
7. Add a sample flow and test it:
   - `scan_files` (foreach) → `read_plaintext_file` → `prompt {fields: summary}` → `update_file_metadata`.
8. Ensure `mergeToolInput` resolves IDs from `entry`, `file`, `files`, `folder`, `folders`.
9. Add a `scan_files` “Refresh” path for the UI.

**Test:**

1. Create a task that uses `find_files` or `scan_files`.
2. Drop one `.txt` file onto the bottom bar with that task selected.
3. Verify:
   - file uploaded and indexed,
   - queued task created,
   - first step’s `toolState` contains `{ files: [...] }`,
   - task runs (watch `/`).
4. Create a task with `scan_files` foreach → `read_plaintext_file`; verify each child gets `{ entry }` and can read its file.
5. Rename a file externally, run `scan_files`, and verify a `moved` entry flows to the next task.
6. Drop multiple files → each is present in `files`.
7. Drop with no task selected → uses default task; with no default → inline error.
8. Verify a task using `create_file` with content from a `prompt` field works.

**Done when:**

- The bottom runner works.
- `toolState` context is visible in queued task data.
- Foreach scanning and reading works.
- The files page and task flow feel connected.

---

### Stage 9 — Hardening and optional enhancements ⬜ PENDING

**Goal:** Make the feature robust and decide which follow-ups to schedule.

**Tasks (required):**

1. Security review:
   - traversal/symlink checks,
   - upload limits,
   - token expiry,
   - authentication on every endpoint,
   - no raw path leakage outside `FILES_ROOT`.
2. Error handling:
   - deleted/moved files,
   - unsupported preview types,
   - Ollama/embedding failure (do not block file operations),
   - partial upload failures.
3. Performance:
   - scan pagination/max entries,
   - hash-size limits,
   - avoid re-embedding unchanged entries,
   - DB indexes.
4. Documentation:
   - `README` section on `files/`, `FILES_ROOT`, upload limits, and indexing.
   - tool docs/examples.
5. Add `files:index` to the developer workflow (manual or optional startup trigger).
6. Run the full checks:
   ```bash
   pnpm lint
   pnpm check-types
   pnpm build
   ```

**Optional follow-ups:**

- Filesystem watcher (`chokidar`) for live reindex.
- PDF/DOCX text extraction.
- OCR/vision model support for `read_image_file` / `read_text_file`.
- Audio transcription.
- Folder upload with recursive traversal.
- File blocks for the task chain-of-thought output.
- `queuedTaskFiles` join table for run provenance/replay.
- Trash/restore UI using `deletedAt`.
- Real-time tree updates via GraphQL subscription.
- Markdown/HTML rendering in preview.
- Code editor (Monaco/CodeMirror) instead of a textarea.

**Done when:**

- The feature passes the full repo checks.
- The security checklist has no open critical items.
- Documentation is updated.

---

## 13. Testing matrix

| Stage | Primary test | Automated checks |
| --- | --- | --- |
| 1 | DB migration + storage smoke script | `pnpm --filter backend check-types`, `pnpm --filter @repo/tools check-types` |
| 2 | `files:index` against add/change/move/delete fixtures | run twice, compare reports |
| 3 | Tools page test form for every tool | `pnpm --filter @repo/tools check-types`, `pnpm --filter @repo/ui check-types` |
| 4 | `curl` GraphQL CRUD + small multipart + 50 MB streaming upload + view/range | `pnpm codegen`, `pnpm --filter @repo/queries build` |
| 5 | Browser tree + preview | `pnpm --filter web check-types` |
| 6 | Browser edit/create/delete/upload | manual regression pass |
| 7 | Tools page + task builder path suggestions | `pnpm check-types` |
| 8 | Drop-to-run + foreach flow | inspect queued task `toolState` |
| 9 | Full regression + security checklist | `pnpm lint`, `pnpm check-types`, `pnpm build` |

---

## 14. Risks and open questions

1. **File title vs filename:** This plan makes them identical. If independent display titles are desired, add a separate `title` column and keep `name` as the basename.
2. **Folder uploads:** Recursive browser folder upload via `webkitGetAsEntry` is useful but adds complexity. Recommend file-only drops in the first version, then folder traversal in Stage 9.
3. **Large files:** Streaming uploads default to 10 GiB/file (`MAX_STREAM_UPLOAD_BYTES`); GraphQL multipart requests are capped at 25 MB total. The hash limit remains 100 MB in `auto` mode. Streaming uploads are not resumable yet; add tus/chunked uploads if unreliable multi-GB transfers become common.
4. **PDF/DOCX:** They are classified as `text` but cannot be extracted in the MVP. The UI should say “preview not implemented” rather than silently showing binary data.
5. **Move detection ambiguity:** Duplicate files with identical content can be matched to the wrong path. Use basename/parent similarity as a tie-breaker; document best-effort behavior.
6. **Embedding backfill:** If the `files/` tree already contains files, run the backfill script after migration.
7. **Codegen dependency:** `pnpm codegen` needs the backend running. Add this to the developer workflow.
8. **Task builder context hints:** Runtime-seeded `files`/`folders` are not produced by an upstream task, so `inferToolStatePaths` cannot infer them. Document them in the task builder or add a synthetic context source when a task is started from the files page.

---

## 15. Suggested commit sequence

1. ✅ `feat(db): add file entries schema and migration`
2. ✅ `feat(files): add filesystem paths, storage, hashing, and type detection`
3. ✅ `feat(files): add scan and sync engine with change detection`
4. ✅ `feat(tools): add file and folder tools`
5. ✅ `feat(api): add file GraphQL schema, streaming upload, and view route`
6. ⬜ `feat(web): add read-only files page`
7. ⬜ `feat(web): add file editing, creation, and uploads`
8. ⬜ `feat(tools): add structured prompt output fields`
9. ⬜ `feat(tasks): seed file context into queued tasks`
10. ⬜ `chore(files): hardening, docs, and regression fixes`
