---
name: Publish-time schema constraints vs prod data
description: Adding unique constraints after launch can block Replit publish when prod has duplicate rows; how to handle it.
---

# Publish-time schema constraints vs production data

Rule: any table that should have a uniqueness guarantee (read receipts, likes, follows, votes) must get its unique constraint **from day one**. Adding the constraint later fails at publish time if production already contains duplicate rows — the publish schema diff runs `ALTER TABLE ... ADD CONSTRAINT` against prod, which errors on duplicates and fails the whole deployment.

**Why:** Live chat read receipts shipped without a unique `(message_id, user_id)` constraint. A frontend effect with an unstable react-query mutation object in its deps re-fired every render and flooded inserts (12k rows for 11 real pairs in prod). Adding the constraint in dev then broke publish because prod's duplicates made the ALTER fail.

**How to apply:**
- Agent cannot write to prod (read-only replica). Do NOT write migration scripts, deploy hooks, or startup DDL — the Publish flow is the only supported schema path.
- If prod duplicates block a new constraint on an **ephemeral** table, rename the SQL table in the schema (fresh table name). Publish then drops the old prod table and creates the new one cleanly.
- CRITICAL: when the user republishes, the Publish UI may ask if the old table was *renamed* to the new one. They must answer NO (treat as drop + create); confirming the rename carries the duplicates over and the constraint fails again.
- Frontend effects that fire mutations per item must keep an in-flight guard (e.g. `useRef<Set<id>>`) — server round-trip state alone doesn't arrive fast enough to prevent duplicate sends, and react-query mutation objects change identity every render, so effects depending on them re-run each render.
