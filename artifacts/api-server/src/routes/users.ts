import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, ne, or, sql } from "drizzle-orm";
import {
  db,
  usersTable,
  userFollowsTable,
  mediaClipsTable,
} from "@workspace/db";
import {
  GetMeResponse,
  UpdateMeBody,
  UpdateMeResponse,
  CheckUsernameAvailabilityQueryParams,
  CheckUsernameAvailabilityResponse,
  ListUsersQueryParams,
  ListUsersResponse,
  ListOnlineUsersResponse,
  GetUserParams,
  GetUserResponse,
  ToggleFollowParams,
  ToggleFollowResponse,
  ListFollowersParams,
  ListFollowersResponse,
  ListFollowingParams,
  ListFollowingResponse,
} from "@workspace/api-zod";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import { getOnlineUsers } from "../lib/presence";

async function followCounts(
  userId: string,
): Promise<{ followerCount: number; followingCount: number }> {
  const [followers] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followingId, userId));
  const [following] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(userFollowsTable)
    .where(eq(userFollowsTable.followerId, userId));
  return {
    followerCount: followers?.count ?? 0,
    followingCount: following?.count ?? 0,
  };
}

export async function userExists(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  return Boolean(row);
}

const router: IRouter = Router();

router.get("/users/me", requireAuth, async (req, res): Promise<void> => {
  const user = await ensureUser(getUserId(req));
  res.json(GetMeResponse.parse(user));
});

router.patch("/users/me", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  if (parsed.data.username) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(
        and(
          eq(usersTable.username, parsed.data.username),
          ne(usersTable.id, userId),
        ),
      );
    if (existing) {
      res.status(409).json({ error: "Username is already taken" });
      return;
    }
  }

  const [updated] = await db
    .update(usersTable)
    .set(parsed.data)
    .where(eq(usersTable.id, userId))
    .returning();
  res.json(UpdateMeResponse.parse(updated));
});

router.get("/users/username-availability", async (req, res): Promise<void> => {
  const parsed = CheckUsernameAvailabilityQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "username query param is required" });
    return;
  }
  const [existing] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.username, parsed.data.username));
  res.json(
    CheckUsernameAvailabilityResponse.parse({
      username: parsed.data.username,
      available: !existing,
    }),
  );
});

router.get("/users/online", requireAuth, async (_req, res): Promise<void> => {
  res.json(ListOnlineUsersResponse.parse(getOnlineUsers()));
});

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const parsed = ListUsersQueryParams.safeParse(req.query);
  const search = parsed.success ? parsed.data.search : undefined;
  const rows = await db
    .select()
    .from(usersTable)
    .where(search ? or(ilike(usersTable.username, `%${search}%`)) : undefined)
    .orderBy(desc(usersTable.createdAt))
    .limit(50);
  res.json(ListUsersResponse.parse(rows));
});

router.get("/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const parsed = GetUserParams.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid user id" });
    return;
  }
  const viewerId = getUserId(req);
  const targetId = parsed.data.userId;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, targetId));
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const { followerCount, followingCount } = await followCounts(targetId);

  const [clips] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mediaClipsTable)
    .where(eq(mediaClipsTable.userId, targetId));

  const [existingFollow] = await db
    .select({ id: userFollowsTable.id })
    .from(userFollowsTable)
    .where(
      and(
        eq(userFollowsTable.followerId, viewerId),
        eq(userFollowsTable.followingId, targetId),
      ),
    );

  res.json(
    GetUserResponse.parse({
      ...user,
      followerCount,
      followingCount,
      clipCount: clips?.count ?? 0,
      isFollowing: !!existingFollow,
      isSelf: viewerId === targetId,
    }),
  );
});

router.post(
  "/users/:userId/follow",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ToggleFollowParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    const followerId = getUserId(req);
    await ensureUser(followerId);
    const followingId = parsed.data.userId;

    if (followerId === followingId) {
      res.status(400).json({ error: "You cannot follow yourself" });
      return;
    }

    const [target] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.id, followingId));
    if (!target) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const [existing] = await db
      .select({ id: userFollowsTable.id })
      .from(userFollowsTable)
      .where(
        and(
          eq(userFollowsTable.followerId, followerId),
          eq(userFollowsTable.followingId, followingId),
        ),
      );

    if (existing) {
      await db
        .delete(userFollowsTable)
        .where(eq(userFollowsTable.id, existing.id));
    } else {
      await db.insert(userFollowsTable).values({ followerId, followingId });
    }

    const { followerCount, followingCount } = await followCounts(followingId);
    res.json(
      ToggleFollowResponse.parse({
        following: !existing,
        followerCount,
        followingCount,
      }),
    );
  },
);

router.get(
  "/users/:userId/followers",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ListFollowersParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (!(await userExists(parsed.data.userId))) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        bio: usersTable.bio,
        avatarUrl: usersTable.avatarUrl,
        bannerUrl: usersTable.bannerUrl,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(userFollowsTable)
      .innerJoin(usersTable, eq(userFollowsTable.followerId, usersTable.id))
      .where(eq(userFollowsTable.followingId, parsed.data.userId))
      .orderBy(desc(userFollowsTable.createdAt));
    res.json(ListFollowersResponse.parse(rows));
  },
);

router.get(
  "/users/:userId/following",
  requireAuth,
  async (req, res): Promise<void> => {
    const parsed = ListFollowingParams.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid user id" });
      return;
    }
    if (!(await userExists(parsed.data.userId))) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const rows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        displayName: usersTable.displayName,
        bio: usersTable.bio,
        avatarUrl: usersTable.avatarUrl,
        bannerUrl: usersTable.bannerUrl,
        role: usersTable.role,
        createdAt: usersTable.createdAt,
      })
      .from(userFollowsTable)
      .innerJoin(usersTable, eq(userFollowsTable.followingId, usersTable.id))
      .where(eq(userFollowsTable.followerId, parsed.data.userId))
      .orderBy(desc(userFollowsTable.createdAt));
    res.json(ListFollowingResponse.parse(rows));
  },
);

export default router;
