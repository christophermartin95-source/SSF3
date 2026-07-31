import {
  pgTable,
  serial,
  text,
  integer,
  real,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const mediaClipsTable = pgTable("media_clips", {
  id: serial("id").primaryKey(),
  userId: text("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  description: text("description"),
  section: text("section", { enum: ["overheard", "self_recorded"] }).notNull(),
  audioFormat: text("audio_format").notNull(),
  objectPath: text("object_path").notNull(),
  thumbnailPath: text("thumbnail_path"),
  durationSeconds: real("duration_seconds"),
  likeCount: integer("like_count").notNull().default(0),
  playCount: integer("play_count").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const mediaLikesTable = pgTable(
  "media_likes",
  {
    id: serial("id").primaryKey(),
    mediaId: integer("media_id")
      .notNull()
      .references(() => mediaClipsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.mediaId, table.userId)],
);

export const mediaFavoritesTable = pgTable(
  "media_favorites",
  {
    id: serial("id").primaryKey(),
    mediaId: integer("media_id")
      .notNull()
      .references(() => mediaClipsTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.mediaId, table.userId)],
);

export const insertMediaClipSchema = createInsertSchema(mediaClipsTable).omit({
  id: true,
  likeCount: true,
  playCount: true,
  createdAt: true,
});
export type InsertMediaClip = z.infer<typeof insertMediaClipSchema>;
export type MediaClipRow = typeof mediaClipsTable.$inferSelect;
export type MediaLikeRow = typeof mediaLikesTable.$inferSelect;
export type MediaFavoriteRow = typeof mediaFavoritesTable.$inferSelect;
