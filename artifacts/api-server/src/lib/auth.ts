import { getAuth, createClerkClient } from "@clerk/express";
import type { Request, Response, NextFunction } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable, type User } from "@workspace/db";
import { logger } from "./logger";

export const clerkClient = createClerkClient({
  secretKey: process.env.CLERK_SECRET_KEY,
});

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// Bounds Clerk lookups to at most one per user per process. Only successful
// (definitive) determinations are cached — transient Clerk failures are left
// uncached so a later request can retry.
const adminCheckedUserIds = new Set<string>();

// Returns true/false when the allowlist status is known, or null when it could
// not be determined (e.g. a transient Clerk lookup failure) and should be
// retried later.
async function isAdminEmail(userId: string): Promise<boolean | null> {
  const adminEmails = getAdminEmails();
  if (adminEmails.length === 0) return false;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.emailAddresses
      .find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress?.toLowerCase();
    return email ? adminEmails.includes(email) : false;
  } catch (err) {
    logger.warn({ err, userId }, "Failed to check admin email allowlist");
    return null;
  }
}

function slugifyUsername(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 20);
  return base.length > 0 ? base : `user${Math.floor(Math.random() * 100000)}`;
}

async function generateAvailableUsername(seed: string): Promise<string> {
  const base = slugifyUsername(seed);
  let candidate = base;
  let attempt = 0;
  while (true) {
    const [existing] = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.username, candidate));
    if (!existing) return candidate;
    attempt += 1;
    candidate = `${base}${Math.floor(Math.random() * 10000)}`;
    if (attempt > 20) {
      candidate = `user${Date.now()}`;
    }
  }
}

/**
 * Ensures a local `users` row exists for the given Clerk user ID, JIT
 * provisioning it from Clerk profile data on first sight.
 */
export async function ensureUser(userId: string): Promise<User> {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (existing) {
    // Promote to admin if this user's email is in the owner allowlist.
    if (existing.role !== "admin" && !adminCheckedUserIds.has(userId)) {
      const allow = await isAdminEmail(userId);
      // Only cache definitive determinations; retry after transient failures.
      if (allow !== null) adminCheckedUserIds.add(userId);
      if (allow === true) {
        const [promoted] = await db
          .update(usersTable)
          .set({ role: "admin" })
          .where(eq(usersTable.id, userId))
          .returning();
        if (promoted) {
          logger.info({ userId }, "Promoted user to admin via ADMIN_EMAILS");
          return promoted;
        }
      }
    }
    return existing;
  }

  let seed = `user${userId.slice(-8)}`;
  let avatarUrl: string | null = null;
  let displayName: string | null = null;
  const adminEmails = getAdminEmails();
  let role: "user" | "admin" = "user";
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    seed =
      clerkUser.username ||
      clerkUser.emailAddresses[0]?.emailAddress?.split("@")[0] ||
      seed;
    avatarUrl = clerkUser.imageUrl || null;
    displayName =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      null;
    const primaryEmail = clerkUser.emailAddresses
      .find((e) => e.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress?.toLowerCase();
    if (primaryEmail && adminEmails.includes(primaryEmail)) {
      role = "admin";
    }
    // Clerk lookup succeeded — role is now a definitive determination.
    adminCheckedUserIds.add(userId);
  } catch (err) {
    logger.warn({ err, userId }, "Failed to fetch Clerk profile for JIT user provisioning");
    // Leave uncached so the existing-user path can retry promotion later.
  }

  const username = await generateAvailableUsername(seed);

  const [created] = await db
    .insert(usersTable)
    .values({ id: userId, username, displayName, avatarUrl, role, onboarded: "false" })
    .onConflictDoNothing({ target: usersTable.id })
    .returning();

  if (created) return created;

  const [row] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!row) throw new Error("Failed to provision user");
  return row;
}

export function getUserId(req: Request): string {
  const auth = getAuth(req);
  if (!auth?.userId) throw new Error("Not authenticated");
  return auth.userId;
}

export async function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = getUserId(req);
  const user = await ensureUser(userId);
  if (user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}

export async function requireArchiveAccess(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const { stripeService } = await import("./stripeService");
  const userId = getUserId(req);
  const hasAccess = await stripeService.hasActiveArchiveAccess(userId);
  if (!hasAccess) {
    res.status(402).json({ error: "Archive access requires an active subscription" });
    return;
  }
  next();
}
