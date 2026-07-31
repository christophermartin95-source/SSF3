import { pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const userFollowsTable = pgTable(
  "user_follows",
  {
    id: serial("id").primaryKey(),
    followerId: text("follower_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    followingId: text("following_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.followerId, table.followingId)],
);

export const insertUserFollowSchema = createInsertSchema(userFollowsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertUserFollow = z.infer<typeof insertUserFollowSchema>;
export type UserFollowRow = typeof userFollowsTable.$inferSelect;
