import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { db, chatMessagesTable, chatMessageReadsTable, usersTable } from "@workspace/db";
import {
  ListChatMessagesResponse,
  SendChatMessageBody,
  SendChatMessageResponse,
  MarkChatMessageReadBody,
  MarkChatMessageReadResponse,
} from "@workspace/api-zod";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import { broadcastToAll } from "../lib/presence";

const router: IRouter = Router();

const MAX_MESSAGES = 100;

router.get("/chat/messages", requireAuth, async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: chatMessagesTable.id,
      userId: chatMessagesTable.userId,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
      content: chatMessagesTable.content,
      mediaObjectPath: chatMessagesTable.mediaObjectPath,
      mediaType: chatMessagesTable.mediaType,
      createdAt: chatMessagesTable.createdAt,
    })
    .from(chatMessagesTable)
    .innerJoin(usersTable, eq(chatMessagesTable.userId, usersTable.id))
    .orderBy(desc(chatMessagesTable.createdAt))
    .limit(MAX_MESSAGES);

  const messageIds = rows.map((r) => r.id);
  const readRows = messageIds.length
    ? await db
        .select({
          messageId: chatMessageReadsTable.messageId,
          userId: usersTable.id,
          username: usersTable.username,
          displayName: usersTable.displayName,
          avatarUrl: usersTable.avatarUrl,
        })
        .from(chatMessageReadsTable)
        .innerJoin(usersTable, eq(chatMessageReadsTable.userId, usersTable.id))
        .where(inArray(chatMessageReadsTable.messageId, messageIds))
    : [];

  // Build a map of messageId -> readBy[]
  const readsByMessage = new Map<number, typeof readRows>();
  for (const row of readRows) {
    const arr = readsByMessage.get(row.messageId);
    if (arr) arr.push(row);
    else readsByMessage.set(row.messageId, [row]);
  }

  const messages = rows.map((r) => ({
    ...r,
    readBy: readsByMessage.get(r.id) ?? [],
  }));

  res.json(ListChatMessagesResponse.parse(messages));
});

router.post("/chat/messages", requireAuth, async (req, res): Promise<void> => {
  const parsed = SendChatMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const content = parsed.data.content?.trim() || null;
  const mediaObjectPath = parsed.data.mediaObjectPath || null;
  const mediaType = parsed.data.mediaType || null;

  if (!content && !mediaObjectPath) {
    res.status(400).json({ error: "Message must have text or media" });
    return;
  }
  if (mediaObjectPath && !mediaType) {
    res.status(400).json({ error: "Media messages require a media type" });
    return;
  }
  if (mediaObjectPath && !mediaObjectPath.startsWith("/objects/")) {
    res.status(400).json({ error: "Invalid media path" });
    return;
  }

  const userId = getUserId(req);
  await ensureUser(userId);

  const [created] = await db
    .insert(chatMessagesTable)
    .values({ userId, content, mediaObjectPath, mediaType })
    .returning();

  const [user] = await db
    .select({
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const message = SendChatMessageResponse.parse({
    ...created,
    username: user?.username ?? null,
    displayName: user?.displayName ?? null,
    avatarUrl: user?.avatarUrl ?? null,
  });

  broadcastToAll({ type: "chat:new", message });
  res.status(201).json(message);
});

router.post("/chat/read", requireAuth, async (req, res): Promise<void> => {
  const parsed = MarkChatMessageReadBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const userId = getUserId(req);
  await ensureUser(userId);

  const [created] = await db
    .insert(chatMessageReadsTable)
    .values({ messageId: parsed.data.messageId, userId })
    .onConflictDoNothing({ target: [chatMessageReadsTable.messageId, chatMessageReadsTable.userId] })
    .returning();

  if (!created) {
    res.status(201).json({ id: 0, messageId: parsed.data.messageId, userId, createdAt: new Date() });
    return;
  }

  const [user] = await db
    .select({
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, userId));

  const payload = MarkChatMessageReadResponse.parse(created);

  broadcastToAll({
    type: "chat:read",
    messageId: payload.messageId,
    userId,
    username: user?.username ?? null,
    displayName: user?.displayName ?? null,
    avatarUrl: user?.avatarUrl ?? null,
  });

  res.status(201).json(payload);
});

export default router;
