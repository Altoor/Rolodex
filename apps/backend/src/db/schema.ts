import { boolean } from "drizzle-orm/cockroach-core";
import {
  integer,
  text,
  pgTable,
  pgEnum,
  date,
  bigint,
  json,
  real,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  hashedPassword: text("hashedPassword").notNull(),
});

export const todos = pgTable("todos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  done: boolean("done").default(false).notNull(),
  authorId: integer("author_id").notNull(),
  actorId: integer("actor_id").notNull(),
});

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
  confidenceThreshold: real("confidenceThreshold").notNull(),
  resultTaskId: integer("resultTaskId"),
});

export const TaskType = pgEnum("TaskType", ["decision", "textPrompt", "tool"]);

export const tasks = pgTable("tasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: TaskType().default("decision").notNull(),
  decisionId: integer("decisionId"),
});

export const queuedTasks = pgTable("queuedTasks", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  taskId: integer("taskId").notNull(),
  state: text("state").notNull(),
  completed: boolean("completed").default(false).notNull(),
  queued_at: date("queued_at").notNull(),
  queued_by: integer("queued_by").notNull(),
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
