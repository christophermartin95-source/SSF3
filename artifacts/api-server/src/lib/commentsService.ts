import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, commentsTable, commentUpvotesTable, usersTable, mediaClipsTable, liveSessionsTable } from "@workspace/db";

export type CommentTargetType = "media" | "live_session";

const commentWithAuthor = {
  id: commentsTable.id,
  targetType: commentsTable.targetType,
  targetId: commentsTable.targetId,
  userId: commentsTable.userId,
  username: usersTable.username,
  avatarUrl: usersTable.avatarUrl,
  content: commentsTable.content,
  upvoteCount: commentsTable.upvoteCount,
  pinned: commentsTable.pinned,
  createdAt: commentsTable.createdAt,
};

async function withUpvotedByMe<T extends { id: number }>(
  rows: T[],
  viewerId: string | null,
): Promise<(T & { upvotedByMe: boolean })[]> {
  if (!viewerId || rows.length === 0) {
    return rows.map((r) => ({ ...r, upvotedByMe: false }));
  }
  const ids = rows.map((r) => r.id);
  const upvoted = await db
    .select({ commentId: commentUpvotesTable.commentId })
    .from(commentUpvotesTable)
    .where(and(eq(commentUpvotesTable.userId, viewerId), inArray(commentUpvotesTable.commentId, ids)));
  const upvotedSet = new Set(upvoted.map((u) => u.commentId));
  return rows.map((r) => ({ ...r, upvotedByMe: upvotedSet.has(r.id) }));
}

export async function listComments(
  targetType: CommentTargetType,
  targetId: number,
  viewerId: string | null = null,
) {
  const rows = await db
    .select(commentWithAuthor)
    .from(commentsTable)
    .leftJoin(usersTable, eq(commentsTable.userId, usersTable.id))
    .where(and(eq(commentsTable.targetType, targetType), eq(commentsTable.targetId, targetId)))
    .orderBy(desc(commentsTable.pinned), asc(commentsTable.createdAt));

  return withUpvotedByMe(rows, viewerId);
}

export async function createComment(
  targetType: CommentTargetType,
  targetId: number,
  userId: string,
  content: string,
) {
  const [created] = await db
    .insert(commentsTable)
    .values({ targetType, targetId, userId, content })
    .returning();

  const [row] = await db
    .select(commentWithAuthor)
    .from(commentsTable)
    .leftJoin(usersTable, eq(commentsTable.userId, usersTable.id))
    .where(eq(commentsTable.id, created.id));

  return { ...row, upvotedByMe: false };
}

export async function deleteComment(commentId: number, userId: string): Promise<"ok" | "not_found" | "forbidden"> {
  const [existing] = await db
    .select({ userId: commentsTable.userId })
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId));

  if (!existing) return "not_found";
  if (existing.userId !== userId) return "forbidden";

  await db.delete(commentsTable).where(eq(commentsTable.id, commentId));
  return "ok";
}

async function getCommentRow(commentId: number) {
  const [row] = await db
    .select({
      id: commentsTable.id,
      targetType: commentsTable.targetType,
      targetId: commentsTable.targetId,
    })
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId));
  return row;
}

async function fetchComment(commentId: number, viewerId: string | null) {
  const [row] = await db
    .select(commentWithAuthor)
    .from(commentsTable)
    .leftJoin(usersTable, eq(commentsTable.userId, usersTable.id))
    .where(eq(commentsTable.id, commentId));
  if (!row) return null;
  const [withUpvote] = await withUpvotedByMe([row], viewerId);
  return withUpvote;
}

export async function toggleCommentUpvote(
  commentId: number,
  userId: string,
): Promise<{ result: "ok" | "not_found"; comment: Awaited<ReturnType<typeof fetchComment>> }> {
  const existingComment = await getCommentRow(commentId);
  if (!existingComment) return { result: "not_found", comment: null };

  const [existingUpvote] = await db
    .select({ id: commentUpvotesTable.id })
    .from(commentUpvotesTable)
    .where(and(eq(commentUpvotesTable.commentId, commentId), eq(commentUpvotesTable.userId, userId)));

  if (existingUpvote) {
    await db.delete(commentUpvotesTable).where(eq(commentUpvotesTable.id, existingUpvote.id));
    await db
      .update(commentsTable)
      .set({ upvoteCount: sql`${commentsTable.upvoteCount} - 1` })
      .where(eq(commentsTable.id, commentId));
  } else {
    await db.insert(commentUpvotesTable).values({ commentId, userId });
    await db
      .update(commentsTable)
      .set({ upvoteCount: sql`${commentsTable.upvoteCount} + 1` })
      .where(eq(commentsTable.id, commentId));
  }

  const comment = await fetchComment(commentId, userId);
  return { result: "ok", comment };
}

async function isTargetOwner(targetType: CommentTargetType, targetId: number, userId: string): Promise<boolean> {
  if (targetType === "media") {
    const [row] = await db
      .select({ userId: mediaClipsTable.userId })
      .from(mediaClipsTable)
      .where(eq(mediaClipsTable.id, targetId));
    return row?.userId === userId;
  }
  const [row] = await db
    .select({ hostUserId: liveSessionsTable.hostUserId })
    .from(liveSessionsTable)
    .where(eq(liveSessionsTable.id, targetId));
  return row?.hostUserId === userId;
}

export async function toggleCommentPin(
  commentId: number,
  userId: string,
): Promise<{
  result: "ok" | "not_found" | "forbidden";
  comment: Awaited<ReturnType<typeof fetchComment>>;
}> {
  const existingComment = await getCommentRow(commentId);
  if (!existingComment) return { result: "not_found", comment: null };

  const targetType = existingComment.targetType as CommentTargetType;
  const canPin = await isTargetOwner(targetType, existingComment.targetId, userId);
  if (!canPin) return { result: "forbidden", comment: null };

  const [current] = await db
    .select({ pinned: commentsTable.pinned })
    .from(commentsTable)
    .where(eq(commentsTable.id, commentId));

  const nextPinned = !current?.pinned;

  if (nextPinned) {
    await db
      .update(commentsTable)
      .set({ pinned: false })
      .where(and(eq(commentsTable.targetType, targetType), eq(commentsTable.targetId, existingComment.targetId)));
  }

  await db.update(commentsTable).set({ pinned: nextPinned }).where(eq(commentsTable.id, commentId));

  const comment = await fetchComment(commentId, userId);
  return { result: "ok", comment };
}
