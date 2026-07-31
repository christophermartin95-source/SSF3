---
name: zod.coerce.boolean() query param footgun
description: Orval/zod-generated query param schemas using zod.coerce.boolean() treat the literal string "false" as true; affects any boolean query param in this project's openapi-generated API clients.
---

`zod.coerce.boolean()` (used by orval-generated Zod schemas for `type: boolean` query params) calls JS `Boolean(value)` under the hood. Since query params arrive as strings, `Boolean("false")` evaluates to `true`. Any endpoint with an optional boolean query param (e.g. `archived`) will incorrectly treat it as `true` if the frontend explicitly sends `?archived=false`.

**Why:** Discovered while testing the comments upvote/pin feature — `useListMedia({ section, archived: false })` sent `archived=false` in the querystring, which the server coerced to `true`, triggering the archive-subscription paywall (402) for ordinary recent-content requests.

**How to apply:** When calling any generated hook/query with an optional boolean param backed by `zod.coerce.boolean()`, omit the key entirely when the value is `false`/default (e.g. `{ ...(archived ? { archived: true } : {}) }`) rather than passing `archived: false` explicitly. Check `lib/api-zod/src/generated/api.ts` for other `coerce.boolean()` params before wiring new UI calls.
