import { integer, text, pgTable } from 'drizzle-orm/pg-core';
import { relations } from "drizzle-orm/relations";

export const users = pgTable('users', {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
});


export const posts = pgTable('posts', {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  content: text('content').notNull(),
  authorId: integer('author_id').notNull(),
});


export const usersRelation = relations(users, ({ one, many }) => ({
  posts: many(posts),
}));

export const postsRelation = relations(posts, ({ one, many }) => ({
  author: one(users, {
    fields: [posts.authorId],
    references: [users.id],
  }),
}));