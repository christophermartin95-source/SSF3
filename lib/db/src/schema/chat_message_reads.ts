import { pgTable, serial, text, integer, timestamp, unique } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { chatMessagesTable } from "./chat_messages";
import { usersTable } from "./users";

export const chatMessageReadsTable = pgTable(
  "chat_message_read_receipts",
  {
    id: serial("id").primaryKey(),
    messageId: integer("message_id")
      .notNull()
      .references(() => chatMessagesTable.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [unique().on(table.messageId, table.userId)],
);

export const insertChatMessageReadSchema = createInsertSchema(chatMessageReadsTable).omit(
  {
    id: true,
    createdAt: true,
  },
);
export type InsertChatMessageRead = z.infer<typeof insertChatMessageReadSchema>;
export type ChatMessageReadRow = typeof chatMessageReadsTable.$inferSelect;
