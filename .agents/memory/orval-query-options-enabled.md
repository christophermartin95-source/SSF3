---
name: orval query hook `enabled` option requires queryKey
description: Passing `{ query: { enabled } }` to an orval-generated useQuery hook fails typecheck unless queryKey is also supplied.
---

Orval generates React Query hooks whose `query` options type is `UseQueryOptions<... & { queryKey: QueryKey }>` — `queryKey` is **required**. So `useListX(id, { query: { enabled: false } })` fails typecheck with TS2741 "Property 'queryKey' is missing".

**Why:** the generated option type intersects with `{ queryKey: QueryKey }` to preserve the URL-based key, so a partial `{ enabled }` object is not assignable.

**How to apply:** to conditionally run a query, prefer conditional *mounting* over the `enabled` flag — e.g. put the hook in a child component that only renders when needed (Radix Tabs unmount inactive content; only render a dialog's list child when open). Call the hook plainly (`useListX(id)`) with no options. If you must use `enabled`, also pass the generated key via `getListXQueryKey(id)`. Orval query keys are URL-based arrays like `["/api/users/${id}/followers"]` — use that exact form for `invalidateQueries` too.
