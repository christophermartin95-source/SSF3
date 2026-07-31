import { Router, type IRouter } from "express";
import { and, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, directMessagesTable, usersTable } from "@workspace/db";
import {
  ListConversationsResponse,
  ListMessagesParams,
  ListMessagesResponse,
  SendMessageParams,
  SendMessageBody,
  SendMessageResponse,
  BroadcastMessageBody,
  BroadcastMessageResponse,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin, getUserId, ensureUser } from "../lib/auth";
import { pushDirectMessage, pushMessageRead } from "../lib/messageBus";
import { notifyNewDirectMessage } from "../lib/notifications";

const router: IRouter = Router();

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);

  const rows = await db
    .select({
      otherUserId: sql<string>`case when ${directMessagesTable.senderId} = ${userId} then ${directMessagesTable.recipientId} else ${directMessagesTable.senderId} end`,
      content: directMessagesTable.content,
      createdAt: directMessagesTable.createdAt,
      readAt: directMessagesTable.readAt,
      recipientId: directMessagesTable.recipientId,
    })
    .from(directMessagesTable)
    .where(
      or(
        eq(directMessagesTable.senderId, userId),
        eq(directMessagesTable.recipientId, userId),
      ),
    )
    .orderBy(desc(directMessagesTable.createdAt));

  const byUser = new Map<
    string,
    { lastMessage: string; lastMessageAt: Date; unreadCount: number }
  >();
  for (const row of rows) {
    const existing = byUser.get(row.otherUserId);
    if (!existing) {
      byUser.set(row.otherUserId, {
        lastMessage: row.content,
        lastMessageAt: row.createdAt,
        unreadCount: row.recipientId === userId && !row.readAt ? 1 : 0,
      });
    } else if (row.recipientId === userId && !row.readAt) {
      existing.unreadCount += 1;
    }
  }

  const otherUserIds = Array.from(byUser.keys());
  const users = otherUserIds.length
    ? await db.select().from(usersTable).where(inArray(usersTable.id, otherUserIds))
    : [];
  const usersById = new Map(users.map((u) => [u.id, u]));

  const conversations = otherUserIds
    .map((otherUserId) => {
      const user = usersById.get(otherUserId);
      const meta = byUser.get(otherUserId)!;
      if (!user) return null;
      return {
        userId: otherUserId,
        username: user.username,
        displayName: user.displayName,
        avatarUrl: user.avatarUrl,
        lastMessage: meta.lastMessage,
        lastMessageAt: meta.lastMessageAt,
        unreadCount: meta.unreadCount,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort((a, b) => b.lastMessageAt.getTime() - a.lastMessageAt.getTime());

  res.json(ListConversationsResponse.parse(conversations));
});

router.get("/conversations/:userId/messages", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListMessagesParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const currentUserId = getUserId(req);
  const otherUserId = parsed.data.userId;

  const readAt = new Date();
  const marked = await db
    .update(directMessagesTable)
    .set({ readAt })
    .where(
      and(
        eq(directMessagesTable.senderId, otherUserId),
        eq(directMessagesTable.recipientId, currentUserId),
        isNull(directMessagesTable.readAt),
      ),
    )
    .returning({ id: directMessagesTable.id });

  if (marked.length > 0) {
    pushMessageRead.publish(otherUserId, {
      readerId: currentUserId,
      readAt: readAt.toISOString(),
    });
  }

  const rows = await db
    .select()
    .from(directMessagesTable)
    .where(
      or(
        and(
          eq(directMessagesTable.senderId, currentUserId),
          eq(directMessagesTable.recipientId, otherUserId),
        ),
        and(
          eq(directMessagesTable.senderId, otherUserId),
          eq(directMessagesTable.recipientId, currentUserId),
        ),
      ),
    )
    .orderBy(directMessagesTable.createdAt);

  res.json(ListMessagesResponse.parse(rows));
});

router.post("/conversations/:userId/messages", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = SendMessageParams.safeParse(req.params);
  const bodyParsed = SendMessageBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const senderId = getUserId(req);
  await ensureUser(senderId);
  const recipientId = paramsParsed.data.userId;

  const [recipient] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, recipientId));
  if (!recipient) {
    res.status(404).json({ error: "Recipient not found" });
    return;
  }

  const [created] = await db
    .insert(directMessagesTable)
    .values({ senderId, recipientId, content: bodyParsed.data.content })
    .returning();

  const message = SendMessageResponse.parse(created);
  pushDirectMessage.publish(recipientId, message);
  void notifyNewDirectMessage(senderId, recipientId, bodyParsed.data.content);
  res.status(201).json(message);
});

router.post("/conversations/broadcast", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const bodyParsed = BroadcastMessageBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const senderId = getUserId(req);
  await ensureUser(senderId);
  const content = bodyParsed.data.content;

  const recipients = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(ne(usersTable.id, senderId));

  if (recipients.length === 0) {
    res.status(201).json(BroadcastMessageResponse.parse({ recipientCount: 0 }));
    return;
  }

  const created = await db
    .insert(directMessagesTable)
    .values(recipients.map((r) => ({ senderId, recipientId: r.id, content })))
    .returning();

  for (const row of created) {
    const message = SendMessageResponse.parse(row);
    pushDirectMessage.publish(row.recipientId, message);
    void notifyNewDirectMessage(senderId, row.recipientId, content);
  }

  res.status(201).json(BroadcastMessageResponse.parse({ recipientCount: created.length }));
});

export default router;
