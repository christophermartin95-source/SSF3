---
name: Prod backfill via column defaults
description: How to add a "new users only" flag column when the production DB cannot be backfilled directly
---

# Rule
When adding a NOT NULL flag column where existing users must be treated as "already done" (e.g. an `onboarded` flag), set the column DEFAULT to the "already done" value and have the app explicitly insert the "not done" value when provisioning new rows. Do NOT default to "not done" and plan a backfill.

**Why:** Prod DB is separate from dev and read-only via tooling — there is no way to run an UPDATE backfill on publish. Postgres fills existing rows with the column default when an ADD COLUMN ... NOT NULL DEFAULT ships, so the default IS the backfill.

**How to apply:** Any future flag/state column where pre-existing rows should be grandfathered in: default = grandfathered value; JIT-provisioning / insert path sets the fresh value explicitly. Also add enum constraints in the OpenAPI spec (not just drizzle's TS-only `enum`) so clients can't write arbitrary strings — drizzle text enums create no DB CHECK constraint.
