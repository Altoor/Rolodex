import { boolean } from "drizzle-orm/cockroach-core";
import { integer, text, pgTable } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
});

export const todos = pgTable("todos", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text("name").notNull(),
  content: text("content").notNull(),
  done: boolean("done").default(false).notNull(),
  authorId: integer("author_id").notNull(),
  actorId: integer("actor_id").notNull(),
});
