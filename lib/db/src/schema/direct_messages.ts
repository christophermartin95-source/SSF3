import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const directMessagesTable = pgTable("direct_messages", {
  id: serial("id").primaryKey(),
  senderId: text("sender_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  recipientId: text("recipient_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  readAt: timestamp("read_at", { withTimezone: true }),
});

export const insertDirectMessageSchema = createInsertSchema(
  directMessagesTable,
).omit({
  id: true,
  createdAt: true,
  readAt: true,
});
export type InsertDirectMessage = z.infer<typeof insertDirectMessageSchema>;
export type DirectMessageRow = typeof directMessagesTable.$inferSelect;
