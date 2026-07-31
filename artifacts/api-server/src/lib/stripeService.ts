import { eq, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { getUncachableStripeClient } from "./stripeClient";

const ARCHIVE_ACCESS_PRODUCT_NAME = "SSF Archive Access";

export class StripeService {
  async createCustomer(userId: string, email?: string | null) {
    const stripe = await getUncachableStripeClient();
    const customer = await stripe.customers.create({
      email: email ?? undefined,
      metadata: { userId },
    });
    await db
      .update(usersTable)
      .set({ stripeCustomerId: customer.id })
      .where(eq(usersTable.id, userId));
    return customer;
  }

  async getOrCreateCustomerId(userId: string, email?: string | null): Promise<string> {
    const [user] = await db
      .select({ stripeCustomerId: usersTable.stripeCustomerId })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (user?.stripeCustomerId) return user.stripeCustomerId;
    const customer = await this.createCustomer(userId, email);
    return customer.id;
  }

  async getArchiveAccessPriceId(): Promise<string | null> {
    const stripe = await getUncachableStripeClient();
    const products = await stripe.products.list({ active: true, limit: 100 });
    const product = products.data.find((p) => p.name === ARCHIVE_ACCESS_PRODUCT_NAME);
    if (!product) return null;
    const prices = await stripe.prices.list({ product: product.id, active: true, limit: 1 });
    return prices.data[0]?.id ?? null;
  }

  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
  ) {
    const stripe = await getUncachableStripeClient();
    return await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: successUrl,
      cancel_url: cancelUrl,
    });
  }

  async hasActiveArchiveAccess(userId: string): Promise<boolean> {
    const [user] = await db
      .select({ stripeCustomerId: usersTable.stripeCustomerId })
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    if (!user?.stripeCustomerId) return false;

    const result = await db.execute<{ status: string }>(
      sql`SELECT status FROM stripe.subscriptions WHERE customer = ${user.stripeCustomerId} AND status IN ('active', 'trialing') LIMIT 1`,
    );
    return result.rows.length > 0;
  }
}

export const stripeService = new StripeService();
export { ARCHIVE_ACCESS_PRODUCT_NAME };
