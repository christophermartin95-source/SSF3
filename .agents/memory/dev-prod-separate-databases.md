---
name: Dev and prod are separate databases
description: This project's development and production Postgres are distinct DBs; how to read each safely and why a "dev test" can hit real data.
---

# Dev and production are separate databases

This project has two independent Postgres databases, NOT one shared DB with a replica:
- **Development**: the running app's `process.env.DATABASE_URL` (host prefix `helium`). This is ALSO what `executeSql({environment:"development"})` reads. The dev workflow (api-server) writes here.
- **Production**: the deployed site's DB, read via `executeSql({environment:"production"})`. Completely separate — writes to dev do NOT propagate here.

**Verified by**: setting a sentinel `display_name` in dev did not appear in the production view, and deletions in dev were still absent from production minutes later (far beyond any replica lag). They are separate primaries, not primary+replica.

**Why this matters / the trap:**
- A destructive endpoint tested against the *local dev server* runs against the **dev** DB, which may be fully populated (e.g. from prior e2e test runs). Do not assume "dev is empty."
- A **filtered** `executeSql` query (e.g. `WHERE username=... OR display_name ILIKE '%cm%'`) can return one row and mislead you into thinking the whole DB has one user. Use `SELECT count(*)` / unfiltered listing to judge DB size.

**How to apply:**
- Production DB is READ-ONLY via `executeSql`. To WRITE to prod, go through the deployed app (e.g. a secret-gated endpoint) after a republish — shared env vars only reach prod on publish.
- Before running any bulk/destructive operation, confirm WHICH database you're hitting: query the app's real `DATABASE_URL` directly (`pnpm --filter @workspace/db exec node -e '...pg...'`) rather than trusting the `executeSql` dev/prod labels or a filtered read.
