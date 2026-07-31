import { Router, type IRouter } from "express";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db, liveSessionsTable, usersTable } from "@workspace/db";
import { ARCHIVE_CUTOFF_MS } from "./media";
import {
  ListLiveSessionsQueryParams,
  ListLiveSessionsResponse,
  CreateLiveSessionBody,
  CreateLiveSessionResponse,
  GetLiveSessionParams,
  GetLiveSessionResponse,
  UpdateLiveSessionParams,
  UpdateLiveSessionBody,
  UpdateLiveSessionResponse,
  JoinLiveSessionParams,
  JoinLiveSessionResponse,
  LeaveLiveSessionParams,
  LeaveLiveSessionResponse,
  ListLiveSessionCommentsParams,
  ListLiveSessionCommentsResponse,
  CreateLiveSessionCommentParams,
  CreateLiveSessionCommentBody,
  CreateLiveSessionCommentResponse,
} from "@workspace/api-zod";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import { endLiveRoom, broadcastToAll } from "../lib/presence";
import { listComments, createComment } from "../lib/commentsService";

const router: IRouter = Router();

function archiveCutoffDate(): Date {
  return new Date(Date.now() - ARCHIVE_CUTOFF_MS);
}

const liveSessionWithHost = {
  id: liveSessionsTable.id,
  hostUserId: liveSessionsTable.hostUserId,
  hostUsername: usersTable.username,
  hostAvatarUrl: usersTable.avatarUrl,
  title: liveSessionsTable.title,
  status: liveSessionsTable.status,
  listenerCount: liveSessionsTable.listenerCount,
  scheduledAt: liveSessionsTable.scheduledAt,
  startedAt: liveSessionsTable.startedAt,
  endedAt: liveSessionsTable.endedAt,
};

router.get("/live/sessions", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListLiveSessionsQueryParams.safeParse(req.query);
  const status = parsed.success ? parsed.data.status : undefined;
  const archived = parsed.success ? parsed.data.archived : false;

  if (archived) {
    const { stripeService } = await import("../lib/stripeService");
    const hasAccess = await stripeService.hasActiveArchiveAccess(getUserId(req));
    if (!hasAccess) {
      res.status(402).json({ error: "Archive access requires an active subscription" });
      return;
    }
  }

  const conditions = [];
  if (status) conditions.push(eq(liveSessionsTable.status, status));
  conditions.push(
    archived
      ? lt(liveSessionsTable.startedAt, archiveCutoffDate())
      : gte(liveSessionsTable.startedAt, archiveCutoffDate()),
  );

  const rows = await db
    .select(liveSessionWithHost)
    .from(liveSessionsTable)
    .innerJoin(usersTable, eq(liveSessionsTable.hostUserId, usersTable.id))
    .where(and(...conditions))
    .orderBy(desc(liveSessionsTable.startedAt))
    .limit(50);
  res.json(ListLiveSessionsResponse.parse(rows));
});

router.post("/live/sessions", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);
  const parsed = CreateLiveSessionBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }
  const scheduledAt = parsed.data.scheduledAt
    ? new Date(parsed.data.scheduledAt)
    : null;
  const isFutureSchedule = !!scheduledAt && scheduledAt.getTime() > Date.now();

  const [created] = await db
    .insert(liveSessionsTable)
    .values({
      title: parsed.data.title,
      hostUserId: userId,
      scheduledAt,
      status: isFutureSchedule ? "scheduled" : "live",
    })
    .returning();
  const [row] = await db
    .select(liveSessionWithHost)
    .from(liveSessionsTable)
    .innerJoin(usersTable, eq(liveSessionsTable.hostUserId, usersTable.id))
    .where(eq(liveSessionsTable.id, created.id));

  if (isFutureSchedule) {
    broadcastToAll({ type: "live:scheduled", session: row });
  } else {
    broadcastToAll({ type: "live:started", session: row });
  }

  res.status(201).json(CreateLiveSessionResponse.parse(row));
});

router.get("/live/sessions/:sessionId", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetLiveSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const [row] = await db
    .select(liveSessionWithHost)
    .from(liveSessionsTable)
    .innerJoin(usersTable, eq(liveSessionsTable.hostUserId, usersTable.id))
    .where(eq(liveSessionsTable.id, parsed.data.sessionId));
  if (!row) {
    res.status(404).json({ error: "Live session not found" });
    return;
  }
  res.json(GetLiveSessionResponse.parse(row));
});

router.patch("/live/sessions/:sessionId", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = UpdateLiveSessionParams.safeParse(req.params);
  const bodyParsed = UpdateLiveSessionBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const userId = getUserId(req);
  const sessionId = paramsParsed.data.sessionId;

  const [existing] = await db
    .select({ hostUserId: liveSessionsTable.hostUserId })
    .from(liveSessionsTable)
    .where(eq(liveSessionsTable.id, sessionId));
  if (!existing) {
    res.status(404).json({ error: "Live session not found" });
    return;
  }
  if (existing.hostUserId !== userId) {
    res.status(403).json({ error: "Not the host of this session" });
    return;
  }

  const update: Record<string, unknown> = { ...bodyParsed.data };
  if (bodyParsed.data.scheduledAt) {
    update.scheduledAt = new Date(bodyParsed.data.scheduledAt);
  }
  if (bodyParsed.data.status === "ended") {
    update.endedAt = new Date();
    endLiveRoom(sessionId);
  }
  if (bodyParsed.data.status === "live") {
    update.startedAt = new Date();
  }

  await db.update(liveSessionsTable).set(update).where(eq(liveSessionsTable.id, sessionId));
  const [row] = await db
    .select(liveSessionWithHost)
    .from(liveSessionsTable)
    .innerJoin(usersTable, eq(liveSessionsTable.hostUserId, usersTable.id))
    .where(eq(liveSessionsTable.id, sessionId));

  if (bodyParsed.data.status === "live") {
    broadcastToAll({ type: "live:started", session: row });
  } else if (bodyParsed.data.status === "ended") {
    broadcastToAll({ type: "live:ended", session: row });
  }

  res.json(UpdateLiveSessionResponse.parse(row));
});

router.post("/live/sessions/:sessionId/join", requireAuth, async (req, res): Promise<void> => {
  const parsed = JoinLiveSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  await ensureUser(getUserId(req));
  const sessionId = parsed.data.sessionId;
  const [existing] = await db
    .select({ status: liveSessionsTable.status })
    .from(liveSessionsTable)
    .where(eq(liveSessionsTable.id, sessionId));
  if (!existing) {
    res.status(404).json({ error: "Live session not found" });
    return;
  }
  await db
    .update(liveSessionsTable)
    .set({ listenerCount: sql`${liveSessionsTable.listenerCount} + 1` })
    .where(eq(liveSessionsTable.id, sessionId));

  const [row] = await db
    .select(liveSessionWithHost)
    .from(liveSessionsTable)
    .innerJoin(usersTable, eq(liveSessionsTable.hostUserId, usersTable.id))
    .where(eq(liveSessionsTable.id, sessionId));
  res.json(JoinLiveSessionResponse.parse(row));
});

router.get("/live/sessions/:sessionId/comments", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListLiveSessionCommentsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const rows = await listComments("live_session", parsed.data.sessionId, getUserId(req));
  res.json(ListLiveSessionCommentsResponse.parse(rows));
});

router.post("/live/sessions/:sessionId/comments", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = CreateLiveSessionCommentParams.safeParse(req.params);
  const bodyParsed = CreateLiveSessionCommentBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const userId = getUserId(req);
  await ensureUser(userId);

  const [sessionExists] = await db
    .select({ id: liveSessionsTable.id })
    .from(liveSessionsTable)
    .where(eq(liveSessionsTable.id, paramsParsed.data.sessionId));
  if (!sessionExists) {
    res.status(404).json({ error: "Live session not found" });
    return;
  }

  const row = await createComment(
    "live_session",
    paramsParsed.data.sessionId,
    userId,
    bodyParsed.data.content,
  );
  res.status(201).json(CreateLiveSessionCommentResponse.parse(row));
});

router.post("/live/sessions/:sessionId/leave", requireAuth, async (req, res): Promise<void> => {
  const parsed = LeaveLiveSessionParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid session id" });
    return;
  }
  const sessionId = parsed.data.sessionId;
  await db
    .update(liveSessionsTable)
    .set({ listenerCount: sql`greatest(${liveSessionsTable.listenerCount} - 1, 0)` })
    .where(eq(liveSessionsTable.id, sessionId));

  const [row] = await db
    .select(liveSessionWithHost)
    .from(liveSessionsTable)
    .innerJoin(usersTable, eq(liveSessionsTable.hostUserId, usersTable.id))
    .where(eq(liveSessionsTable.id, sessionId));
  if (!row) {
    res.status(404).json({ error: "Live session not found" });
    return;
  }
  res.json(LeaveLiveSessionResponse.parse(row));
});

export default router;
