---
name: Drizzle array params in raw sql
description: Why interpolating a JS array into sql`ANY(${arr})` breaks, and the correct fix
---

Interpolating a plain JS array into a drizzle `sql` template like `` sql`${col} = ANY(${ids})` `` (even with an explicit `::int[]` cast) does not produce a Postgres array literal. Drizzle expands the array as multiple individually-bound parameters joined by commas, so the query becomes `ANY(($2, $3, $4)::int[])` — a tuple/record, not an array — which Postgres rejects with "cannot cast type record to integer[]".

**Why:** This bug is sneaky because the identical SQL string, when hand-run with a literal `ARRAY[1,2,3]::int[]`, works fine — the failure only appears with drizzle's parameter binding of a JS array, and the resulting 500 error's stack trace can look like it's from an unrelated part of the route (e.g. Zod parsing) if you don't check server logs directly.

**How to apply:** Never write `sql\`... = ANY(${jsArray})\``` for membership checks. Use drizzle's `inArray(column, jsArray)` helper (from `drizzle-orm`) instead — it handles parameterization correctly for both text and integer columns.
