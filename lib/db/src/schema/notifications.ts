import {
  pgTable,
  serial,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { mediaClipsTable } from "./media";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type", {
      enum: ["media_uploaded", "media_liked", "direct_message"],
    }).notNull(),
    actorId: text("actor_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    mediaId: integer("media_id").references(() => mediaClipsTable.id, {
      onDelete: "cascade",
    }),
    mediaTitle: text("media_title"),
    read: boolean("read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("notifications_user_id_created_at_idx").on(table.userId, table.createdAt)],
);

export const insertNotificationSchema = createInsertSchema(notificationsTable).omit({
  id: true,
  read: true,
  createdAt: true,
});
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type NotificationRow = typeof notificationsTable.$inferSelect;
