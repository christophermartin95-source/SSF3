import { and, eq, ne } from "drizzle-orm";
import {
  db,
  notificationsTable,
  usersTable,
  type NotificationRow,
} from "@workspace/db";
import { pushNotification } from "./notificationBus";
import { logger } from "./logger";

export interface SerializedNotification {
  id: number;
  type: "media_uploaded" | "media_liked" | "direct_message";
  actorId: string | null;
  actorUsername: string | null;
  actorDisplayName: string | null;
  actorAvatarUrl: string | null;
  mediaId: number | null;
  mediaTitle: string | null;
  read: boolean;
  createdAt: string;
}

type Actor = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export function serializeNotification(
  row: NotificationRow,
  actor: Actor | null,
): SerializedNotification {
  return {
    id: row.id,
    type: row.type,
    actorId: row.actorId,
    actorUsername: actor?.username ?? null,
    actorDisplayName: actor?.displayName ?? null,
    actorAvatarUrl: actor?.avatarUrl ?? null,
    mediaId: row.mediaId,
    mediaTitle: row.mediaTitle,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}

async function getActor(actorId: string): Promise<Actor | null> {
  const [actor] = await db
    .select({
      id: usersTable.id,
      username: usersTable.username,
      displayName: usersTable.displayName,
      avatarUrl: usersTable.avatarUrl,
    })
    .from(usersTable)
    .where(eq(usersTable.id, actorId));
  return actor ?? null;
}

/**
 * Notify every user except the uploader that a new clip was uploaded.
 */
export async function notifyMediaUploaded(
  actorId: string,
  mediaId: number,
  mediaTitle: string,
): Promise<void> {
  try {
    const recipients = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(ne(usersTable.id, actorId));
    if (recipients.length === 0) return;

    const inserted = await db
      .insert(notificationsTable)
      .values(
        recipients.map((r) => ({
          userId: r.id,
          type: "media_uploaded" as const,
          actorId,
          mediaId,
          mediaTitle,
        })),
      )
      .returning();

    const actor = await getActor(actorId);
    for (const row of inserted) {
      pushNotification.publish(row.userId, serializeNotification(row, actor));
    }
  } catch (err) {
    logger.warn({ err, actorId, mediaId }, "Failed to create upload notifications");
  }
}

/**
 * Notify the owner of a clip that someone liked it (skips self-likes).
 */
export async function notifyMediaLiked(
  actorId: string,
  ownerId: string | null,
  mediaId: number,
  mediaTitle: string,
): Promise<void> {
  if (!ownerId || ownerId === actorId) return;
  try {
    const [row] = await db
      .insert(notificationsTable)
      .values({
        userId: ownerId,
        type: "media_liked",
        actorId,
        mediaId,
        mediaTitle,
      })
      .returning();
    if (!row) return;
    const actor = await getActor(actorId);
    pushNotification.publish(row.userId, serializeNotification(row, actor));
  } catch (err) {
    logger.warn({ err, actorId, ownerId, mediaId }, "Failed to create like notification");
  }
}

/**
 * Notify a user that they received a direct message (skips self-messages).
 * A short preview of the message is stored in mediaTitle for display.
 */
export async function notifyNewDirectMessage(
  actorId: string,
  recipientId: string,
  content: string,
): Promise<void> {
  if (recipientId === actorId) return;
  try {
    const preview = content.length > 120 ? `${content.slice(0, 117)}...` : content;
    const [row] = await db
      .insert(notificationsTable)
      .values({
        userId: recipientId,
        type: "direct_message",
        actorId,
        mediaTitle: preview,
      })
      .returning();
    if (!row) return;
    const actor = await getActor(actorId);
    pushNotification.publish(row.userId, serializeNotification(row, actor));
  } catch (err) {
    logger.warn({ err, actorId, recipientId }, "Failed to create direct message notification");
  }
}
