import { boolean } from "drizzle-orm/cockroach-core";
import { sql } from "drizzle-orm";
import {
  integer,
  text,
  pgTable,
  pgEnum,
  date,
  bigint,
  json,
  real,
  timestamp,
  uuid,
  index,
  uniqueIndex,
  vector,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
// Tool state is intentionally opaque at the database layer. The tools package
// owns the precise ToolStateEntry type; keeping this local avoids a package
// cycle between @repo/db and @repo/tools.
type ToolStateEntry = unknown;

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  hashedPassword: text("hashedPassword").notNull(),
});

export const todos = pgTable(
  "todos",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    done: boolean("done").default(false).notNull(),
    doByDate: timestamp("do_by_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    authorId: integer("author_id").notNull(),
    actorId: integer("actor_id").notNull(),
    descriptionEmbedding: vector("descriptionEmbedding", {
      dimensions: 768,
    }),
  },
  (table) => [
    index("todos_description_embedding_idx").using(
      "hnsw",
      table.descriptionEmbedding.op("vector_cosine_ops"),
    ),
  ],
);

// ---------------------------------------------------------------------------
// Files
// ---------------------------------------------------------------------------

export const fileEntryKind = pgEnum("fileEntryKind", ["file", "folder"]);

export const fileType = pgEnum("fileType", [
  "image",
  "text",
  "plaintext",
  "audio",
  "video",
  "other",
]);

/**
 * One shared tree of files and folders backed by the physical files/ root.
 * `relativePath` is POSIX-style and relative to FILES_ROOT; there is no owner
 * column because the workspace is global.
 */
export const fileEntries = pgTable(
  "fileEntries",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    parentId: integer("parentId").references(
      (): AnyPgColumn => fileEntries.id,
      { onDelete: "set null" },
    ),
    kind: fileEntryKind("kind").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    relativePath: text("relativePath").notNull(),
    fileType: fileType("fileType"),
    mimeType: text("mimeType"),
    size: bigint("size", { mode: "number" }),
    contentHash: text("contentHash"),
    filesystemModifiedAt: timestamp("filesystemModifiedAt", {
      withTimezone: true,
    }),
    lastEditedAt: timestamp("lastEditedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp("deletedAt", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: 768 }),
  },
  (table) => [
    // One live entry per path in the shared tree.
    uniqueIndex("file_entries_path_live_idx")
      .on(table.relativePath)
      .where(sql`"deletedAt" IS NULL`),
    index("file_entries_parent_idx").on(table.parentId),
    index("file_entries_embedding_idx").using(
      "hnsw",
      table.embedding.op("vector_cosine_ops"),
    ),
  ],
);

export const decisionType = pgEnum("decisionType", ["choice", "noul", "score"]);

export const userDecisionType = pgEnum("userDecisionType", [
  "yesNo",
  "list",
  "dropdown",
]);

export const userDecisionOptionKind = pgEnum("userDecisionOptionKind", [
  "static",
  "dynamic",
]);

export const decisions = pgTable("decisions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: decisionType().default("choice").notNull(),
  decisionPremise: text("decisionPremise").notNull(),
  instruction: text("instruction").notNull(),
  options: text("options").array(),
  optionDescriptions: text("optionDescriptions").array(),
  authorId: integer("authorId").notNull(),
});

export const userDecisionOptions = pgTable("userDecisionOptions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  kind: userDecisionOptionKind("kind").default("static").notNull(),
  label: text("label"),
  description: text("description"),
  value: text("value"),
  // Dynamic source config: { mode, path, where }.
  selector: json("selector"),
  labelPath: text("labelPath"),
  descriptionPath: text("descriptionPath"),
  valuePath: text("valuePath"),
  resultTaskId: integer("resultTaskId"),
  appendState: boolean("appendState").default(false).notNull(),
  sortOrder: integer("sortOrder").default(0).notNull(),
});

export const taskResults = pgTable("taskResults", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  type: decisionType().default("choice").notNull(),
  option: text("option"),
  scoreThreshold: real("scoreThreshold"),
  probabilityThreshold: real("probabilityThreshold"),
  confidenceThreshold: real("confidenceThreshold"),
  resultTaskId: integer("resultTaskId"),
  appendState: boolean("appendState").default(false).notNull(),
});

export const TaskType = pgEnum("TaskType", [
  "decision",
  "textPrompt",
  "tool",
  "userDecision",
]);

export const toolOutputTypeEnum = pgEnum("ToolOutputType", [
  "normal",
  "foreach",
]);

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: TaskType().default("decision").notNull(),
  decisionId: integer("decisionId"),
  fallbackTaskId: integer("fallbackTaskId"),
  toolKey: text("toolKey"),
  toolConfig: json("toolConfig"),
  toolOutputType: toolOutputTypeEnum("toolOutputType")
    .default("normal")
    .notNull(),
  // Conditional tool branches (currently used by the `if` tool).
  onTrueTaskId: integer("onTrueTaskId"),
  onFalseTaskId: integer("onFalseTaskId"),
  // Generation model used by prompt-style tools.
  model: text("model"),
  // System One decision model used by decision tasks and todo selection.
  decisionModel: text("decisionModel"),
  // Decision tasks ask the user to choose when the model finds no match.
  forceUserDecideIfNoMatch: boolean("forceUserDecideIfNoMatch")
    .default(true)
    .notNull(),
  // Presentation settings for userDecision tasks.
  userDecisionType: userDecisionType("userDecisionType")
    .default("list")
    .notNull(),
  userDecisionConfig: json("userDecisionConfig"),
});

export const queuedTaskStatus = pgEnum("queuedTaskStatus", [
  "queued",
  "running",
  "awaiting_input",
  "completed",
  "failed",
]);

export const queuedTasks = pgTable("queuedTasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  state: text("state").notNull(),
  /** Accumulated structured tool output, separate from the immutable state. */
  toolState: json("toolState")
    .$type<ToolStateEntry[]>()
    .notNull()
    .default(sql`'[]'::json`),
  /** Set for foreach children. */
  parentQueuedTaskId: integer("parentQueuedTaskId"),
  /** Chain depth, used instead of a shared per-run step budget. */
  depth: integer("depth").notNull().default(0),
  status: queuedTaskStatus().default("queued").notNull(),
  // Groups all steps that belong to one chain run.
  runId: uuid("runId")
    .default(sql`gen_random_uuid()`)
    .notNull(),
  // The step's SystemOne answer, chosen branch and any note.
  result: json("result"),
  // Immutable snapshot of a choice that is waiting for the user.
  pendingChoice: json("pendingChoice"),
  queued_at: timestamp("queued_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  queued_by: integer("queued_by").notNull(),
  // Per-step generation model override.
  model: text("model"),
  // Per-step decision model override.
  decisionModel: text("decisionModel"),
});

export const models = pgTable("models", {
  name: text("name").unique().primaryKey().notNull(),
  description: text("description"),
  pulled: boolean("pulled").default(false).notNull(),
  modified_at: date("modified_at"),
  model: text("model"),
  size: bigint("size", { mode: "bigint" }),
  digest: text("digest"),
  details: json("details"),
  expires_at: date("expires_at"),
  size_vram: bigint("size_vram", { mode: "bigint" }),
  capabilities: text("capabilities").array(),
});

export const transcriberBackend = pgEnum("transcriberBackend", [
  "whisper_cpp",
  "faster_whisper",
]);

/**
 * Global application settings. The table is a singleton: the service always
 * reads and writes row id 1. Empty strings mean "fall back to the environment
 * default", which keeps container configuration usable without a migration seed.
 */
export const appSettings = pgTable("appSettings", {
  id: integer("id").primaryKey().default(1),
  ollamaBaseUrl: text("ollamaBaseUrl").notNull().default(""),
  transcriberBackend: transcriberBackend("transcriberBackend")
    .default("faster_whisper")
    .notNull(),
  whisperApiUrl: text("whisperApiUrl").notNull().default(""),
  whisperModel: text("whisperModel"),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const userSettings = pgTable("userSettings", {
  userId: integer("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  defaultTaskId: integer("defaultTaskId").references(() => tasks.id, {
    onDelete: "set null",
  }),
  defaultModelName: text("defaultModelName").references(() => models.name, {
    onDelete: "set null",
  }),
  defaultDecisionModelName: text("defaultDecisionModelName").references(
    () => models.name,
    {
      onDelete: "set null",
    },
  ),
  defaultVisionModelName: text("defaultVisionModelName").references(
    () => models.name,
    {
      onDelete: "set null",
    },
  ),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
