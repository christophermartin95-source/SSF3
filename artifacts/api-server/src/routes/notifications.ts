import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import {
  ListNotificationsResponse,
  MarkNotificationReadParams,
} from "@workspace/api-zod";
import { serializeNotification } from "../lib/notifications";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);

  const rows = await db
    .select({
      notification: notificationsTable,
      actor: {
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        avatarUrl: usersTable.avatarUrl,
      },
    })
    .from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.actorId, usersTable.id))
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  res.json(
    ListNotificationsResponse.parse(
      rows.map((r) => serializeNotification(r.notification, r.actor?.id ? r.actor : null)),
    ),
  );
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await db
    .update(notificationsTable)
    .set({ read: true })
    .where(
      and(eq(notificationsTable.userId, userId), eq(notificationsTable.read, false)),
    );
  res.status(204).end();
});

router.post(
  "/notifications/:notificationId/read",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = MarkNotificationReadParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid notification id" });
      return;
    }
    const userId = getUserId(req);
    await db
      .update(notificationsTable)
      .set({ read: true })
      .where(
        and(
          eq(notificationsTable.id, parsed.data.notificationId),
          eq(notificationsTable.userId, userId),
        ),
      );
    res.status(204).end();
  },
);

export default router;
