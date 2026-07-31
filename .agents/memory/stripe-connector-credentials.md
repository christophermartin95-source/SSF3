---
name: Stripe connector credential field name
description: The Replit connector API returns the Stripe secret key under `settings.secret`, not `settings.secret_key` — a mismatch with some code templates.
---

When fetching Stripe credentials from the Replit connector API
(`GET /api/v2/connection?include_secrets=true&connector_names=stripe`), the
response's `settings` object uses the field name `secret` for the API secret
key (and `publishable` for the publishable key), NOT `secret_key`.

**Why:** A stripeClient.ts template used `settings.secret_key`, which is
always undefined, causing "Stripe integration not connected or missing
secret key" errors even though the connection was healthy
(verified via `listConnections('stripe')` in the code_execution sandbox).

**How to apply:** When writing/reviewing a Stripe connector credential
fetcher, check the field is `settings.secret` (and `settings.webhook_secret`
if present) before assuming the connection itself is broken.

Separately: if `stripe-replit-sync`'s `runMigrations()` is called from inside
the same async init path as `findOrCreateManagedWebhook()` in the API
server's startup script and the `stripe.*` tables don't appear to exist
afterward (queries against `stripe.accounts` etc. fail with "relation does
not exist"), try running `runMigrations()` standalone in an isolated script
first — it can succeed independently even when bundled into the server's
build/start flow doesn't seem to persist the tables under some restart
sequences. Re-check `information_schema.tables` for schema `stripe` after
running it standalone, then restart the server.

## Changing a Stripe price after go-live
Stripe prices are immutable once created — you cannot edit `unit_amount`/
`currency` on an existing price object. To change a subscription's price
(e.g. a currency or amount change requested after initial seeding):
1. List the product's active prices.
2. Deactivate (`active: false`) the old price(s) instead of deleting them.
3. Create a new price with the desired amount/currency, same product and
   recurring interval.
4. Any code that looks up "the" active price for a product (e.g.
   `prices.list({ active: true, limit: 1 })`) will then correctly pick up
   the new one, since only one price is active.

**How to apply:** Make the seeding/update script idempotent by checking for
a price matching the target amount+currency+interval before creating a new
one, and remember to also update any hardcoded price display strings in the
frontend (they won't update automatically just because Stripe changed).
