import { Router, type IRouter } from "express";
import { desc, eq, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  mediaClipsTable,
  commentsTable,
  liveSessionsTable,
  directMessagesTable,
} from "@workspace/db";
import {
  AdminSetUserRoleBody,
  AdminSetUserRoleParams,
  AdminListUsersResponse,
  AdminSetUserRoleResponse,
  AdminGetStatsResponse,
  AdminUpdateMediaParams,
  AdminUpdateMediaBody,
  AdminUpdateMediaResponse,
  AdminDeleteMediaParams,
  AdminDeleteCommentParams,
  AdminDeleteLiveSessionParams,
} from "@workspace/api-zod";
import { requireAuth, requireAdmin } from "../lib/auth";

const router: IRouter = Router();

const mediaWithAuthor = {
  id: mediaClipsTable.id,
  userId: mediaClipsTable.userId,
  username: usersTable.username,
  avatarUrl: usersTable.avatarUrl,
  title: mediaClipsTable.title,
  description: mediaClipsTable.description,
  section: mediaClipsTable.section,
  audioFormat: mediaClipsTable.audioFormat,
  objectPath: mediaClipsTable.objectPath,
  durationSeconds: mediaClipsTable.durationSeconds,
  likeCount: mediaClipsTable.likeCount,
  playCount: mediaClipsTable.playCount,
  createdAt: mediaClipsTable.createdAt,
};

router.get(
  "/admin/users",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const rows = await db
      .select()
      .from(usersTable)
      .orderBy(desc(usersTable.createdAt))
      .limit(200);
    res.json(AdminListUsersResponse.parse(rows));
  },
);

router.patch(
  "/admin/users/:userId/role",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const paramsParsed = AdminSetUserRoleParams.safeParse(req.params);
    const bodyParsed = AdminSetUserRoleBody.safeParse(req.body);
    if (!paramsParsed.success || !bodyParsed.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const [updated] = await db
      .update(usersTable)
      .set({ role: bodyParsed.data.role })
      .where(eq(usersTable.id, paramsParsed.data.userId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(AdminSetUserRoleResponse.parse(updated));
  },
);

router.get(
  "/admin/stats",
  requireAuth,
  requireAdmin,
  async (_req, res): Promise<void> => {
    const [[{ userCount }], [{ mediaCount }], [{ liveSessionCount }], [{ commentCount }]] =
      await Promise.all([
        db.select({ userCount: sql<number>`count(*)::int` }).from(usersTable),
        db.select({ mediaCount: sql<number>`count(*)::int` }).from(mediaClipsTable),
        db
          .select({ liveSessionCount: sql<number>`count(*)::int` })
          .from(liveSessionsTable),
        db.select({ commentCount: sql<number>`count(*)::int` }).from(commentsTable),
      ]);
    res.json(
      AdminGetStatsResponse.parse({
        userCount,
        mediaCount,
        liveSessionCount,
        commentCount,
      }),
    );
  },
);

router.patch(
  "/admin/media/:mediaId",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsedParams = AdminUpdateMediaParams.safeParse(req.params);
    if (!parsedParams.success) {
      res.status(400).json({ error: "Invalid media id" });
      return;
    }
    const parsedBody = AdminUpdateMediaBody.safeParse(req.body);
    if (!parsedBody.success) {
      res.status(400).json({ error: "Invalid section" });
      return;
    }
    const updated = await db
      .update(mediaClipsTable)
      .set({ section: parsedBody.data.section })
      .where(eq(mediaClipsTable.id, parsedParams.data.mediaId))
      .returning({ id: mediaClipsTable.id });
    if (updated.length === 0) {
      res.status(404).json({ error: "Media clip not found" });
      return;
    }
    const [row] = await db
      .select(mediaWithAuthor)
      .from(mediaClipsTable)
      .innerJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
      .where(eq(mediaClipsTable.id, parsedParams.data.mediaId));
    res.json(
      AdminUpdateMediaResponse.parse({
        ...row,
        likedByMe: false,
        favoritedByMe: false,
        locked: false,
      }),
    );
  },
);

router.delete(
  "/admin/media/:mediaId",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = AdminDeleteMediaParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid media id" });
      return;
    }
    const result = await db
      .delete(mediaClipsTable)
      .where(eq(mediaClipsTable.id, parsed.data.mediaId))
      .returning({ id: mediaClipsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Media clip not found" });
      return;
    }
    res.status(204).end();
  },
);

router.delete(
  "/admin/comments/:commentId",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = AdminDeleteCommentParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid comment id" });
      return;
    }
    const result = await db
      .delete(commentsTable)
      .where(eq(commentsTable.id, parsed.data.commentId))
      .returning({ id: commentsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Comment not found" });
      return;
    }
    res.status(204).end();
  },
);

router.delete(
  "/admin/live/:sessionId",
  requireAuth,
  requireAdmin,
  async (req, res): Promise<void> => {
    const parsed = AdminDeleteLiveSessionParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid session id" });
      return;
    }
    const result = await db
      .delete(liveSessionsTable)
      .where(eq(liveSessionsTable.id, parsed.data.sessionId))
      .returning({ id: liveSessionsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Live session not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
