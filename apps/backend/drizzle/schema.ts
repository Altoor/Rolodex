import { pgTable, integer, text, primaryKey } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"



export const todos = pgTable("todos", {
	id: integer().generatedAlwaysAsIdentity({ name: "posts_id_seq" }),
	content: text().notNull(),
	authorId: integer("author_id").notNull(),
	name: text().notNull(),
	actorId: integer("actor_id").notNull(),
}, (table) => [
	primaryKey({ columns: [table.id], name: "posts_pkey"}),
]);

export const users = pgTable("users", {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	name: text().notNull(),
});
