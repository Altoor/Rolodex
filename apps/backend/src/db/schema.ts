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
  vector,
} from "drizzle-orm/pg-core";

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

export const decisionType = pgEnum("decisionType", ["choice", "noul", "score"]);

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

export const TaskType = pgEnum("TaskType", ["decision", "textPrompt", "tool"]);

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: TaskType().default("decision").notNull(),
  decisionId: integer("decisionId"),
  fallbackTaskId: integer("fallbackTaskId"),
  toolKey: text("toolKey"),
  toolConfig: json("toolConfig"),
  // Generation model used by prompt-style tools.
  model: text("model"),
  // System One decision model used by decision tasks and todo selection.
  decisionModel: text("decisionModel"),
});

export const queuedTaskStatus = pgEnum("queuedTaskStatus", [
  "queued",
  "running",
  "completed",
  "failed",
]);

export const queuedTasks = pgTable("queuedTasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  state: text("state").notNull(),
  status: queuedTaskStatus().default("queued").notNull(),
  // Groups all steps that belong to one chain run.
  runId: uuid("runId")
    .default(sql`gen_random_uuid()`)
    .notNull(),
  // The step's SystemOne answer, chosen branch and any note.
  result: json("result"),
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
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
