---
name: Production data writes on Replit
description: Why prod DB rows (e.g. admin role) can't be changed directly and the app-side pattern to do it
---

# Changing production data (e.g. promoting a prod admin)

`executeSql({ environment: "production" })` is **READ-ONLY** (SELECT only) — no UPDATE/INSERT/DELETE against prod. There is no agent tool that writes to the production database.

Dev and prod are fully separated: separate Clerk instances **and** separate Postgres databases. A user/admin created in development does **not** exist in production, so you can't "log in as the dev admin" to fix prod via the app's admin API.

**Pattern to grant admin (or seed privileged data) in production:** add an app-side bootstrap keyed on trusted server config, then republish.
- Owner-email allowlist: `ADMIN_EMAILS` env var (shared env → available in prod). In the JIT user-provisioning path (`ensureUser`), promote a user to `admin` when their Clerk primary email is in the allowlist. Handle both the new-user insert path and the existing-user promotion path (existing rows won't re-run the insert branch).

**Why:** This is the only way to write role changes to prod without direct DB access.
**How to apply:** Make the code change in dev, verify, then the **user must republish** for it to reach the running prod server. Promotion fires when the user next hits an authenticated endpoint (e.g. `GET /api/users/me` on app load).

**Gotcha (memoization):** if you cache "already checked this user" to bound Clerk lookups, only cache *definitive* results. Caching a transient Clerk-lookup failure permanently blocks promotion until process restart. Return a tri-state (true/false/null) and skip caching on null.
