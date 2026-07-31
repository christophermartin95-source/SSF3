import { pgTable, serial, text, integer, boolean, timestamp, index, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const commentsTable = pgTable(
  "comments",
  {
    id: serial("id").primaryKey(),
    targetType: text("target_type", { enum: ["media", "live_session"] }).notNull(),
    targetId: integer("target_id").notNull(),
    userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    content: text("content").notNull(),
    upvoteCount: integer("upvote_count").notNull().default(0),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("comments_target_idx").on(table.targetType, table.targetId)],
);

export const commentUpvotesTable = pgTable(
  "comment_upvotes",
  {
    id: serial("id").primaryKey(),
    commentId: integer("comment_id")
      .notNull()
      .references(() => commentsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.commentId, table.userId)],
);

export const insertCommentSchema = createInsertSchema(commentsTable).omit({
  id: true,
  upvoteCount: true,
  pinned: true,
  createdAt: true,
});
export type InsertComment = z.infer<typeof insertCommentSchema>;
export type CommentRow = typeof commentsTable.$inferSelect;
export type CommentUpvoteRow = typeof commentUpvotesTable.$inferSelect;
