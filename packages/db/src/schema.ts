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
  // For foreach tasks: runs once after every per-item branch is terminal.
  joinTaskId: integer("joinTaskId"),
  // Generation model used by prompt-style tools.
  model: text("model"),
  // System One decision model used by decision tasks and todo selection.
  decisionModel: text("decisionModel"),
  // Which tool-state values decision tasks add to the model's prompt state.
  // Shape: { mode: "none" | "all" | "paths", paths: string[] }. This never
  // changes the run's task state or tool state.
  decisionStateConfig: json("decisionStateConfig"),
  // Decision tasks ask the user to choose when the model finds no match.
  forceUserDecideIfNoMatch: boolean("forceUserDecideIfNoMatch")
    .default(true)
    .notNull(),
  // Presentation settings for userDecision tasks.
  userDecisionType: userDecisionType("userDecisionType")
    .default("list")
    .notNull(),
  userDecisionConfig: json("userDecisionConfig"),
  // Model-backed tasks default to exclusive execution; deterministic tools and
  // user decisions may run alongside other queued steps.
  canRunInParallel: boolean("canRunInParallel").default(true).notNull(),
  // Prioritized steps jump to the top of the queue, even when they must run
  // exclusively.
  prioritize: boolean("prioritize").default(false).notNull(),
  // Draft tasks belong to an assisted task-builder run. They are hidden from
  // normal task lists/export and promoted or deleted when the run ends.
  isDraft: boolean("isDraft").default(false).notNull(),
  draftOwnerId: integer("draftOwnerId"),
});

export const runMode = pgEnum("runMode", ["standard", "assisted"]);

export const runStatus = pgEnum("runStatus", [
  "running",
  "awaiting_step_review",
  "awaiting_decision_review",
  "awaiting_user_choice",
  "completed",
  "cancelled",
  "failed",
]);

/**
 * One chain run. Standard runs are executed by the queue exactly as before;
 * assisted runs pause after each reviewed step until the user accepts it.
 */
export const runs = pgTable(
  "runs",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: runMode("mode").default("standard").notNull(),
    status: runStatus("status").default("running").notNull(),
    state: text("state").notNull(),
    startTaskId: integer("startTaskId"),
    startTaskSnapshot: json("startTaskSnapshot"),
    parentRunId: uuid("parentRunId"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("runs_status_user_idx").on(table.status, table.userId),
    index("runs_mode_idx").on(table.mode),
  ],
);

/**
 * One externally reachable REST hook owned by a user. The slug is random and
 * unguessable; requests must also present the endpoint's API key.
 */
export const apiEndpoints = pgTable(
  "apiEndpoints",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    slug: text("slug").notNull().unique(),
    taskId: integer("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    /** SHA-256 of the full API key. The key itself is never stored. */
    keyHash: text("keyHash").notNull(),
    keyPrefix: text("keyPrefix").notNull(),
    keyLastFour: text("keyLastFour").notNull(),
    /** Optional field in the request body used as the task state. */
    stateField: text("stateField"),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updatedAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("api_endpoints_user_idx").on(table.userId),
    uniqueIndex("api_endpoints_key_hash_idx").on(table.keyHash),
  ],
);

/**
 * One optional per-user key for the standard `/api/v1` surface. Endpoint keys
 * remain valid; this gives users a single key they can rotate independently.
 */
export const standardApiKeys = pgTable("standardApiKeys", {
  userId: integer("userId")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  /** SHA-256 of the full API key. The key itself is never stored. */
  keyHash: text("keyHash").notNull().unique(),
  keyPrefix: text("keyPrefix").notNull(),
  keyLastFour: text("keyLastFour").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

/**
 * One accepted invocation of an API endpoint. It maps the public request id to
 * the standard run that executes the endpoint's task.
 */
export const apiRequests = pgTable(
  "apiRequests",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    endpointId: uuid("endpointId")
      .notNull()
      .references(() => apiEndpoints.id, { onDelete: "cascade" }),
    userId: integer("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    runId: uuid("runId")
      .notNull()
      .unique()
      .references(() => runs.id, { onDelete: "cascade" }),
    /** Snapshot of the state that was queued. */
    state: text("state").notNull(),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("api_requests_endpoint_idx").on(table.endpointId),
    index("api_requests_user_idx").on(table.userId),
  ],
);

export const attemptKind = pgEnum("attemptKind", [
  "initial",
  "revision",
  "replay",
]);

export const attemptStatus = pgEnum("attemptStatus", [
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "committed",
]);

/**
 * One execution of a step with a particular task snapshot. A rejected outcome
 * is kept here until the run is accepted/cancelled so it can be previewed and
 * compared; it is never partially committed.
 */
export const stepAttempts = pgTable(
  "stepAttempts",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    queuedTaskId: integer("queuedTaskId")
      .notNull()
      .references(() => queuedTasks.id, { onDelete: "cascade" }),
    runId: uuid("runId")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    attemptNumber: integer("attemptNumber").notNull(),
    kind: attemptKind("kind").default("initial").notNull(),
    status: attemptStatus("status").default("running").notNull(),
    taskSnapshot: json("taskSnapshot").notNull(),
    beforeState: text("beforeState").notNull(),
    beforeToolState: json("beforeToolState")
      .notNull()
      .default(sql`'[]'::json`),
    afterState: text("afterState"),
    afterToolState: json("afterToolState"),
    result: json("result"),
    effectJournal: json("effectJournal"),
    revision: json("revision"),
    review: json("review"),
    workspaceKey: text("workspaceKey"),
    cause: text("cause"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
    finishedAt: timestamp("finishedAt", { withTimezone: true }),
    committedAt: timestamp("committedAt", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("step_attempts_step_number_idx").on(
      table.queuedTaskId,
      table.attemptNumber,
    ),
    index("step_attempts_run_idx").on(table.runId),
  ],
);

/**
 * Append-only observable trace for an assisted run. Events are scoped to the
 * run and removed with it.
 */
export const traceEvents = pgTable(
  "traceEvents",
  {
    id: bigint("id", { mode: "number" })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    runId: uuid("runId")
      .notNull()
      .references(() => runs.id, { onDelete: "cascade" }),
    attemptId: integer("attemptId").references(() => stepAttempts.id, {
      onDelete: "cascade",
    }),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    payload: json("payload"),
    createdAt: timestamp("createdAt", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("trace_events_run_sequence_idx").on(table.runId, table.sequence),
    index("trace_events_attempt_idx").on(table.attemptId),
  ],
);

export const queuedTaskStatus = pgEnum("queuedTaskStatus", [
  "queued",
  "running",
  "awaiting_input",
  // A join row parked until every branch in its fork group is terminal.
  "waiting",
  "completed",
  "failed",
]);

export const queuedTasks = pgTable(
  "queuedTasks",
  {
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
    /**
     * Groups a foreach fan-out and its join barrier. Every branch row inherits
     * the group; the join row uses it to wait for its siblings. Null outside a
     * fan-out (and for rows after the fan-in).
     */
    forkGroupId: uuid("forkGroupId"),
    /** Per-item ordinal inside a fan-out, used for deterministic join ordering. */
    forkIndex: integer("forkIndex"),
    /** True for the single barrier row that runs after all branches finish. */
    isJoin: boolean("isJoin").default(false).notNull(),
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
  },
  (table) => [index("queued_tasks_fork_group_idx").on(table.forkGroupId)],
);

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
  // Upper bound for steps the queue may execute at the same time.
  maxParallelTasks: integer("maxParallelTasks").default(5).notNull(),
  // Optional per-request Ollama keep_alive. Null means "do not send one", so
  // the Ollama server's own OLLAMA_KEEP_ALIVE setting applies (the compose
  // files set 30m). This avoids the app overriding deployment configuration.
  ollamaKeepAlive: text("ollamaKeepAlive"),
  // Warm model-backed steps before they run, and optionally at startup.
  preloadModels: boolean("preloadModels").default(true).notNull(),
  warmModelsOnStartup: boolean("warmModelsOnStartup").default(false).notNull(),
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
  /** Opt in to assisted runs from the landing page and task builder. */
  autoImprovement: boolean("autoImprovement").default(false).notNull(),
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
