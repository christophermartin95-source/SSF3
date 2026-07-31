import { Router, type IRouter } from "express";
import { requireAuth, getUserId, ensureUser } from "../lib/auth";
import { stripeService } from "../lib/stripeService";
import { clerkClient } from "../lib/auth";

const router: IRouter = Router();

router.get("/stripe/subscription", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  const hasAccess = await stripeService.hasActiveArchiveAccess(userId);
  res.json({ active: hasAccess });
});

router.post("/stripe/checkout", requireAuth, async (req, res): Promise<void> => {
  const userId = getUserId(req);
  await ensureUser(userId);

  const priceId = await stripeService.getArchiveAccessPriceId();
  if (!priceId) {
    res.status(500).json({ error: "Archive access plan is not configured yet" });
    return;
  }

  let email: string | null = null;
  try {
    const clerkUser = await clerkClient.users.getUser(userId);
    email = clerkUser.emailAddresses[0]?.emailAddress ?? null;
  } catch {
    email = null;
  }

  const customerId = await stripeService.getOrCreateCustomerId(userId, email);
  const origin = `${req.protocol}://${req.get("host")}`;
  const session = await stripeService.createCheckoutSession(
    customerId,
    priceId,
    `${origin}/archives?checkout=success`,
    `${origin}/archives?checkout=cancelled`,
  );

  res.json({ url: session.url });
});

export default router;
