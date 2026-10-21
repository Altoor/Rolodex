import { boolean } from "drizzle-orm/cockroach-core";
import { integer, text, pgTable, pgEnum } from "drizzle-orm/pg-core";

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

export const decisionTypesEnum = pgEnum("types", ["choice", "noul", "score"]);

export const decisions = pgTable("decisions", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  type: decisionTypesEnum().default("choice").notNull(),
  decisionType: text("decisionType").notNull(),
  instruction: text("instruction").notNull(),
  options: text("options").array(),
  optionDescriptions: text("optionDescriptions").array(),
  authorId: integer("authorId").notNull(),
});
