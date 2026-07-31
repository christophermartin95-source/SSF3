import { Router, type IRouter } from "express";
import { and, asc, desc, eq, gte, ilike, inArray, lt, sql } from "drizzle-orm";
import {
  db,
  mediaClipsTable,
  mediaLikesTable,
  mediaFavoritesTable,
  usersTable,
  commentsTable,
  mediaPlaysTable,
} from "@workspace/db";
import { userExists } from "./users";
import { notifyMediaUploaded, notifyMediaLiked } from "../lib/notifications";
import {
  ListMediaQueryParams,
  ListMediaResponse,
  CreateMediaBody,
  CreateMediaResponse,
  GetRecentActivityResponse,
  GetMediaStatsSummaryResponse,
  GetMediaParams,
  GetMediaResponse,
  DeleteMediaParams,
  ToggleMediaLikeParams,
  ToggleMediaLikeResponse,
  RecordMediaPlayParams,
  RecordMediaPlayResponse,
  ListMediaCommentsParams,
  ListMediaCommentsResponse,
  CreateMediaCommentParams,
  CreateMediaCommentBody,
  CreateMediaCommentResponse,
  DeleteCommentParams,
  ToggleCommentUpvoteParams,
  ToggleCommentUpvoteResponse,
  ToggleCommentPinParams,
  ToggleCommentPinResponse,
  GetMediaFavoriteOfMonthQueryParams,
  GetMediaFavoriteOfMonthResponse,
  ToggleMediaFavoriteParams,
  ToggleMediaFavoriteResponse,
  ListMediaFavoritesResponse,
  ListUserFavoritesParams,
  ListUserFavoritesResponse,
  ListUserLikesParams,
  ListUserLikesResponse,
} from "@workspace/api-zod";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import {
  listComments,
  createComment,
  deleteComment,
  toggleCommentUpvote,
  toggleCommentPin,
} from "../lib/commentsService";

const router: IRouter = Router();

export const ARCHIVE_CUTOFF_MS = 1000 * 60 * 60 * 24 * 30 * 3; // ~3 months

function archiveCutoffDate(): Date {
  return new Date(Date.now() - ARCHIVE_CUTOFF_MS);
}

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
  thumbnailPath: mediaClipsTable.thumbnailPath,
  durationSeconds: mediaClipsTable.durationSeconds,
  likeCount: mediaClipsTable.likeCount,
  playCount: mediaClipsTable.playCount,
  createdAt: mediaClipsTable.createdAt,
};

type LockableRow = {
  id: number;
  createdAt: Date;
  objectPath: string;
  audioFormat: string;
  thumbnailPath: string | null;
  durationSeconds: number | null;
};

async function withArchiveLock<T extends LockableRow>(
  rows: T[],
  viewerId: string | null,
): Promise<
  (Omit<T, "objectPath" | "audioFormat" | "thumbnailPath" | "durationSeconds"> & {
    objectPath: string | null;
    audioFormat: string | null;
    thumbnailPath: string | null;
    durationSeconds: number | null;
    locked: boolean;
  })[]
> {
  const cutoff = archiveCutoffDate();
  const hasOldRows = rows.some((r) => r.createdAt < cutoff);
  let hasAccess = false;
  if (hasOldRows) {
    const { stripeService } = await import("../lib/stripeService");
    hasAccess = viewerId ? await stripeService.hasActiveArchiveAccess(viewerId) : false;
  }
  return rows.map((r) => {
    const locked = r.createdAt < cutoff && !hasAccess;
    if (!locked) return { ...r, locked: false };
    return {
      ...r,
      objectPath: null,
      audioFormat: null,
      thumbnailPath: null,
      durationSeconds: null,
      locked: true,
    };
  });
}

async function withLikedByMe<
  T extends { id: number },
>(rows: T[], viewerId: string | null): Promise<(T & { likedByMe: boolean })[]> {
  if (!viewerId || rows.length === 0) {
    return rows.map((r) => ({ ...r, likedByMe: false }));
  }
  const ids = rows.map((r) => r.id);
  const liked = await db
    .select({ mediaId: mediaLikesTable.mediaId })
    .from(mediaLikesTable)
    .where(
      and(
        eq(mediaLikesTable.userId, viewerId),
        inArray(mediaLikesTable.mediaId, ids),
      ),
    );
  const likedSet = new Set(liked.map((l) => l.mediaId));
  return rows.map((r) => ({ ...r, likedByMe: likedSet.has(r.id) }));
}

async function withFavoritedByMe<
  T extends { id: number },
>(rows: T[], viewerId: string | null): Promise<(T & { favoritedByMe: boolean })[]> {
  if (!viewerId || rows.length === 0) {
    return rows.map((r) => ({ ...r, favoritedByMe: false }));
  }
  const ids = rows.map((r) => r.id);
  const favorited = await db
    .select({ mediaId: mediaFavoritesTable.mediaId })
    .from(mediaFavoritesTable)
    .where(
      and(
        eq(mediaFavoritesTable.userId, viewerId),
        inArray(mediaFavoritesTable.mediaId, ids),
      ),
    );
  const favoritedSet = new Set(favorited.map((f) => f.mediaId));
  return rows.map((r) => ({ ...r, favoritedByMe: favoritedSet.has(r.id) }));
}

router.get("/media", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListMediaQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  if (parsed.data.archived) {
    const { stripeService } = await import("../lib/stripeService");
    const hasAccess = await stripeService.hasActiveArchiveAccess(getUserId(req));
    if (!hasAccess) {
      res.status(402).json({ error: "Archive access requires an active subscription" });
      return;
    }
  }

  const conditions = [];
  if (parsed.data.section) conditions.push(eq(mediaClipsTable.section, parsed.data.section));
  if (parsed.data.userId) conditions.push(eq(mediaClipsTable.userId, parsed.data.userId));
  if (parsed.data.archived) {
    conditions.push(lt(mediaClipsTable.createdAt, archiveCutoffDate()));
  }
  if (parsed.data.search?.trim()) {
    conditions.push(ilike(mediaClipsTable.title, `%${parsed.data.search.trim()}%`));
  }

  const orderBy =
    parsed.data.sort === "oldest"
      ? [asc(mediaClipsTable.createdAt)]
      : parsed.data.sort === "popular"
        ? [desc(mediaClipsTable.likeCount), desc(mediaClipsTable.createdAt)]
        : [desc(mediaClipsTable.createdAt)];

  const rows = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(...orderBy)
    .limit(100);

  const viewerId = getUserId(req);
  const locked = parsed.data.archived
    ? rows.map((r) => ({ ...r, locked: false }))
    : await withArchiveLock(rows, viewerId);
  const withLikes = await withLikedByMe(locked, viewerId);
  const withFavorites = await withFavoritedByMe(withLikes, viewerId);
  res.json(ListMediaResponse.parse(withFavorites));
});

router.post("/media", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);
  const parsed = CreateMediaBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const [created] = await db
    .insert(mediaClipsTable)
    .values({ ...parsed.data, userId })
    .returning();

  const [row] = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaClipsTable.id, created.id));

  res
    .status(201)
    .json(
      CreateMediaResponse.parse({
        ...row,
        likedByMe: false,
        favoritedByMe: false,
        locked: false,
      }),
    );

  void notifyMediaUploaded(userId, created.id, created.title);
});

router.get("/media/recent", requireAuth, async (req, res): Promise<void> => {
  const rows = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .orderBy(desc(mediaClipsTable.createdAt))
    .limit(20);
  const viewerId = getUserId(req);
  const locked = await withArchiveLock(rows, viewerId);
  const withLikes = await withLikedByMe(locked, viewerId);
  const withFavorites = await withFavoritedByMe(withLikes, viewerId);
  res.json(GetRecentActivityResponse.parse(withFavorites));
});

router.get("/media/stats/summary", requireAuth, async (_req, res): Promise<void> => {
  const [totals] = await db
    .select({
      totalClips: sql<number>`count(*)::int`,
      overheardCount: sql<number>`count(*) filter (where ${mediaClipsTable.section} = 'overheard')::int`,
      selfRecordedCount: sql<number>`count(*) filter (where ${mediaClipsTable.section} = 'self_recorded')::int`,
    })
    .from(mediaClipsTable);

  const topUploaders = await db
    .select({
      userId: mediaClipsTable.userId,
      username: usersTable.username,
      avatarUrl: usersTable.avatarUrl,
      clipCount: sql<number>`count(*)::int`,
    })
    .from(mediaClipsTable)
    .innerJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .groupBy(mediaClipsTable.userId, usersTable.username, usersTable.avatarUrl)
    .orderBy(desc(sql`count(*)`))
    .limit(5);

  res.json(
    GetMediaStatsSummaryResponse.parse({
      totalClips: totals?.totalClips ?? 0,
      overheardCount: totals?.overheardCount ?? 0,
      selfRecordedCount: totals?.selfRecordedCount ?? 0,
      topUploaders,
    }),
  );
});

router.get("/media/favorite-of-month", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetMediaFavoriteOfMonthQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query params" });
    return;
  }

  const commentCountExpr = sql<number>`count(distinct ${commentsTable.id})::int`;
  const scoreExpr = sql<number>`(${mediaClipsTable.likeCount} + count(distinct ${commentsTable.id}))::int`;

  const [row] = await db
    .select({
      ...mediaWithAuthor,
      commentCount: commentCountExpr,
      score: scoreExpr,
    })
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .leftJoin(
      commentsTable,
      and(eq(commentsTable.targetType, "media"), eq(commentsTable.targetId, mediaClipsTable.id)),
    )
    .where(
      and(
        eq(mediaClipsTable.section, parsed.data.section),
        gte(mediaClipsTable.createdAt, sql`date_trunc('month', now())`),
      ),
    )
    .groupBy(
      mediaClipsTable.id,
      mediaClipsTable.userId,
      usersTable.username,
      usersTable.avatarUrl,
      mediaClipsTable.title,
      mediaClipsTable.description,
      mediaClipsTable.section,
      mediaClipsTable.audioFormat,
      mediaClipsTable.objectPath,
      mediaClipsTable.thumbnailPath,
      mediaClipsTable.durationSeconds,
      mediaClipsTable.likeCount,
      mediaClipsTable.playCount,
      mediaClipsTable.createdAt,
    )
    .orderBy(desc(scoreExpr), desc(mediaClipsTable.likeCount), desc(mediaClipsTable.createdAt))
    .limit(1);

  if (!row) {
    res.json(GetMediaFavoriteOfMonthResponse.parse(null));
    return;
  }

  const viewerId = getUserId(req);
  const [locked] = await withArchiveLock([row], viewerId);
  const [withLikes] = await withLikedByMe([locked], viewerId);
  const [withFavorite] = await withFavoritedByMe([withLikes], viewerId);
  res.json(GetMediaFavoriteOfMonthResponse.parse(withFavorite));
});

router.get("/media/favorites", requireAuth, async (req, res): Promise<void> => {
  const viewerId = getUserId(req);
  const rows = await db
    .select(mediaWithAuthor)
    .from(mediaFavoritesTable)
    .innerJoin(mediaClipsTable, eq(mediaFavoritesTable.mediaId, mediaClipsTable.id))
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaFavoritesTable.userId, viewerId))
    .orderBy(desc(mediaFavoritesTable.createdAt));

  const locked = await withArchiveLock(rows, viewerId);
  const withLikes = await withLikedByMe(locked, viewerId);
  const withFavorites = withLikes.map((r) => ({ ...r, favoritedByMe: true }));
  res.json(ListMediaFavoritesResponse.parse(withFavorites));
});

router.get(
  "/users/:userId/favorites",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ListUserFavoritesParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (!(await userExists(parsed.data.userId))) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const viewerId = getUserId(req);
    const rows = await db
      .select(mediaWithAuthor)
      .from(mediaFavoritesTable)
      .innerJoin(mediaClipsTable, eq(mediaFavoritesTable.mediaId, mediaClipsTable.id))
      .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
      .where(eq(mediaFavoritesTable.userId, parsed.data.userId))
      .orderBy(desc(mediaFavoritesTable.createdAt));

    const locked = await withArchiveLock(rows, viewerId);
    const withLikes = await withLikedByMe(locked, viewerId);
    const withFavorites = await withFavoritedByMe(withLikes, viewerId);
    res.json(ListUserFavoritesResponse.parse(withFavorites));
  },
);

router.get(
  "/users/:userId/likes",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ListUserLikesParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (!(await userExists(parsed.data.userId))) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const viewerId = getUserId(req);
    const rows = await db
      .select(mediaWithAuthor)
      .from(mediaLikesTable)
      .innerJoin(mediaClipsTable, eq(mediaLikesTable.mediaId, mediaClipsTable.id))
      .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
      .where(eq(mediaLikesTable.userId, parsed.data.userId))
      .orderBy(desc(mediaLikesTable.createdAt));

    const locked = await withArchiveLock(rows, viewerId);
    const withLikes = await withLikedByMe(locked, viewerId);
    const withFavorites = await withFavoritedByMe(withLikes, viewerId);
    res.json(ListUserLikesResponse.parse(withFavorites));
  },
);

router.get("/media/:mediaId", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetMediaParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const [row] = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaClipsTable.id, parsed.data.mediaId));
  if (!row) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }
  const viewerId = getUserId(req);
  const [locked] = await withArchiveLock([row], viewerId);
  const [withLike] = await withLikedByMe([locked], viewerId);
  const [withFavorite] = await withFavoritedByMe([withLike], viewerId);
  res.json(GetMediaResponse.parse(withFavorite));
});

router.delete("/media/:mediaId", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteMediaParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const userId = getUserId(req);
  const [row] = await db
    .select({ userId: mediaClipsTable.userId })
    .from(mediaClipsTable)
    .where(eq(mediaClipsTable.id, parsed.data.mediaId));
  if (!row) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }
  if (row.userId !== userId) {
    res.status(403).json({ error: "Not the owner of this clip" });
    return;
  }
  await db.delete(mediaClipsTable).where(eq(mediaClipsTable.id, parsed.data.mediaId));
  res.status(204).end();
});

router.post("/media/:mediaId/like", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleMediaLikeParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const userId = getUserId(req);
  await ensureUser(userId);
  const mediaId = parsed.data.mediaId;

  const [existingLike] = await db
    .select({ id: mediaLikesTable.id })
    .from(mediaLikesTable)
    .where(and(eq(mediaLikesTable.mediaId, mediaId), eq(mediaLikesTable.userId, userId)));

  if (existingLike) {
    await db.delete(mediaLikesTable).where(eq(mediaLikesTable.id, existingLike.id));
    await db
      .update(mediaClipsTable)
      .set({ likeCount: sql`${mediaClipsTable.likeCount} - 1` })
      .where(eq(mediaClipsTable.id, mediaId));
  } else {
    await db.insert(mediaLikesTable).values({ mediaId, userId });
    await db
      .update(mediaClipsTable)
      .set({ likeCount: sql`${mediaClipsTable.likeCount} + 1` })
      .where(eq(mediaClipsTable.id, mediaId));
  }

  const [row] = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaClipsTable.id, mediaId));
  if (!row) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }
  const [locked] = await withArchiveLock([row], userId);
  const [withFavorite] = await withFavoritedByMe([locked], userId);
  res.json(
    ToggleMediaLikeResponse.parse({ ...withFavorite, likedByMe: !existingLike }),
  );

  if (!existingLike) {
    void notifyMediaLiked(userId, row.userId, mediaId, row.title);
  }
});

router.post("/media/:mediaId/favorite", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleMediaFavoriteParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const mediaId = parsed.data.mediaId;
  const userId = getUserId(req);
  await ensureUser(userId);

  const [existingFavorite] = await db
    .select({ id: mediaFavoritesTable.id })
    .from(mediaFavoritesTable)
    .where(
      and(eq(mediaFavoritesTable.mediaId, mediaId), eq(mediaFavoritesTable.userId, userId)),
    );

  if (existingFavorite) {
    await db.delete(mediaFavoritesTable).where(eq(mediaFavoritesTable.id, existingFavorite.id));
  } else {
    await db.insert(mediaFavoritesTable).values({ mediaId, userId });
  }

  const [row] = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaClipsTable.id, mediaId));
  if (!row) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }
  const [locked] = await withArchiveLock([row], userId);
  const [withLike] = await withLikedByMe([locked], userId);
  res.json(
    ToggleMediaFavoriteResponse.parse({ ...withLike, favoritedByMe: !existingFavorite }),
  );
});

router.get("/media/:mediaId/comments", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListMediaCommentsParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const rows = await listComments("media", parsed.data.mediaId, getUserId(req));
  res.json(ListMediaCommentsResponse.parse(rows));
});

router.post("/media/:mediaId/comments", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = CreateMediaCommentParams.safeParse(req.params);
  const bodyParsed = CreateMediaCommentBody.safeParse(req.body);
  if (!paramsParsed.success || !bodyParsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }
  const userId = getUserId(req);
  await ensureUser(userId);

  const [mediaExists] = await db
    .select({ id: mediaClipsTable.id })
    .from(mediaClipsTable)
    .where(eq(mediaClipsTable.id, paramsParsed.data.mediaId));
  if (!mediaExists) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }

  const row = await createComment(
    "media",
    paramsParsed.data.mediaId,
    userId,
    bodyParsed.data.content,
  );
  res.status(201).json(CreateMediaCommentResponse.parse(row));
});

router.delete("/comments/:commentId", requireAuth, async (req, res): Promise<void> => {
  const parsed = DeleteCommentParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid comment id" });
    return;
  }
  const result = await deleteComment(parsed.data.commentId, getUserId(req));
  if (result === "not_found") {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  if (result === "forbidden") {
    res.status(403).json({ error: "Not the author of this comment" });
    return;
  }
  res.status(204).end();
});

router.post("/comments/:commentId/upvote", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleCommentUpvoteParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid comment id" });
    return;
  }
  const userId = getUserId(req);
  await ensureUser(userId);
  const { result, comment } = await toggleCommentUpvote(parsed.data.commentId, userId);
  if (result === "not_found" || !comment) {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  res.json(ToggleCommentUpvoteResponse.parse(comment));
});

router.post("/comments/:commentId/pin", requireAuth, async (req, res): Promise<void> => {
  const parsed = ToggleCommentPinParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid comment id" });
    return;
  }
  const userId = getUserId(req);
  await ensureUser(userId);
  const { result, comment } = await toggleCommentPin(parsed.data.commentId, userId);
  if (result === "not_found") {
    res.status(404).json({ error: "Comment not found" });
    return;
  }
  if (result === "forbidden" || !comment) {
    res.status(403).json({ error: "Only the content owner can pin comments" });
    return;
  }
  res.json(ToggleCommentPinResponse.parse(comment));
});

router.post("/media/:mediaId/play", requireAuth, async (req, res): Promise<void> => {
  const parsed = RecordMediaPlayParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const mediaId = parsed.data.mediaId;
  const viewerId = getUserId(req);

  const [existing] = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaClipsTable.id, mediaId));
  if (!existing) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }
  const [preCheck] = await withArchiveLock([existing], viewerId);
  if (preCheck.locked) {
    res.status(402).json({ error: "Archive access requires an active subscription" });
    return;
  }

  await db
    .update(mediaClipsTable)
    .set({ playCount: sql`${mediaClipsTable.playCount} + 1` })
    .where(eq(mediaClipsTable.id, mediaId));

  // Also record a play segment if start/end seconds are provided
  const startSecond = typeof req.body?.startSecond === "number" ? req.body.startSecond : null;
  const endSecond = typeof req.body?.endSecond === "number" ? req.body.endSecond : null;
  if (startSecond !== null && endSecond !== null && endSecond > startSecond) {
    await db.insert(mediaPlaysTable).values({
      mediaId,
      userId: viewerId,
      startSecond,
      endSecond,
    });
  }

  const [row] = await db
    .select(mediaWithAuthor)
    .from(mediaClipsTable)
    .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
    .where(eq(mediaClipsTable.id, mediaId));
  if (!row) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }
  const [locked] = await withArchiveLock([row], viewerId);
  const [withLike] = await withLikedByMe([locked], viewerId);
  const [withFavorite] = await withFavoritedByMe([withLike], viewerId);
  res.json(RecordMediaPlayResponse.parse(withFavorite));
});

/**
 * GET /media/:mediaId/play-heatmap
 *
 * Returns aggregated play counts per second bucket for a clip.
 * Buckets are 1-second intervals from 0 to duration (or 60s default).
 */
router.get("/media/:mediaId/play-heatmap", requireAuth, async (req, res): Promise<void> => {
  const parsed = RecordMediaPlayParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid media id" });
    return;
  }
  const mediaId = parsed.data.mediaId;

  const [clip] = await db
    .select({ durationSeconds: mediaClipsTable.durationSeconds })
    .from(mediaClipsTable)
    .where(eq(mediaClipsTable.id, mediaId));
  if (!clip) {
    res.status(404).json({ error: "Media clip not found" });
    return;
  }

  const duration = clip.durationSeconds ?? 60;
  const maxSecond = Math.ceil(duration);

  // Aggregate plays: for each 1-second bucket, count how many play segments cover it
  const plays = await db
    .select({
      startSecond: mediaPlaysTable.startSecond,
      endSecond: mediaPlaysTable.endSecond,
    })
    .from(mediaPlaysTable)
    .where(eq(mediaPlaysTable.mediaId, mediaId));

  const buckets = new Array(maxSecond).fill(0);
  for (const play of plays) {
    const start = Math.max(0, Math.floor(play.startSecond));
    const end = Math.min(maxSecond, Math.ceil(play.endSecond));
    for (let i = start; i < end && i < maxSecond; i++) {
      buckets[i]++;
    }
  }

  const maxCount = Math.max(1, ...buckets);
  const normalized = buckets.map((count) => count / maxCount);

  res.json({
    mediaId,
    duration,
    buckets: normalized,
    rawCounts: buckets,
  });
});

export default router;
