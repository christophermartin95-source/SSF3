import http from "http";
import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { logger } from "./lib/logger";
import { setupWebSocketServer } from "./ws";
import { getStripeSync } from "./lib/stripeClient";

async function initStripe(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger.warn("DATABASE_URL not set, skipping Stripe initialization");
    return;
  }
  try {
    await runMigrations({ databaseUrl });
    const stripeSync = await getStripeSync();
    // API_BASE_URL is set explicitly on Render (or any non-Replit host).
    // Fall back to REPLIT_DOMAINS for Replit-hosted deployments.
    const webhookBaseUrl =
      process.env.API_BASE_URL ??
      `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    stripeSync
      .syncBackfill()
      .then(() => logger.info("Stripe data synced"))
      .catch((err) => logger.error({ err }, "Error syncing Stripe data"));
    logger.info("Stripe initialized");
  } catch (err) {
    logger.error({ err }, "Failed to initialize Stripe (continuing without it)");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = http.createServer(app);

setupWebSocketServer(server);

await initStripe();

server.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exit(1);
});
