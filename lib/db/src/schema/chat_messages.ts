import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const chatMessagesTable = pgTable("chat_messages", {
  id: serial("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  content: text("content"),
  mediaObjectPath: text("media_object_path"),
  mediaType: text("media_type"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertChatMessageSchema = createInsertSchema(chatMessagesTable).omit(
  {
    id: true,
    createdAt: true,
  },
);
export type InsertChatMessage = z.infer<typeof insertChatMessageSchema>;
export type ChatMessageRow = typeof chatMessagesTable.$inferSelect;
