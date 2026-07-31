import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const liveSessionsTable = pgTable("live_sessions", {
  id: serial("id").primaryKey(),
  hostUserId: text("host_user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  status: text("status", { enum: ["scheduled", "live", "ended"] })
    .notNull()
    .default("live"),
  listenerCount: integer("listener_count").notNull().default(0),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
});

export const insertLiveSessionSchema = createInsertSchema(
  liveSessionsTable,
).omit({
  id: true,
  status: true,
  listenerCount: true,
  startedAt: true,
  endedAt: true,
});
export type InsertLiveSession = z.infer<typeof insertLiveSessionSchema>;
export type LiveSessionRow = typeof liveSessionsTable.$inferSelect;
