import { pgTable, serial, integer, real, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { mediaClipsTable } from "./media";
import { usersTable } from "./users";

/**
 * Tracks which time ranges of each media clip were played.
 * Used to build a "most replayed" heatmap per clip.
 */
export const mediaPlaysTable = pgTable("media_plays", {
  id: serial("id").primaryKey(),
  mediaId: integer("media_id")
    .notNull()
    .references(() => mediaClipsTable.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  startSecond: real("start_second").notNull(),
  endSecond: real("end_second").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertMediaPlaySchema = createInsertSchema(mediaPlaysTable).omit({
  id: true,
  createdAt: true,
});

export type InsertMediaPlay = z.infer<typeof insertMediaPlaySchema>;
export type MediaPlayRow = typeof mediaPlaysTable.$inferSelect;
