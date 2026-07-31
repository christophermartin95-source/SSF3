---
name: Orval query-key invalidation
description: How to correctly invalidate react-query caches for orval-generated API hooks
---

Orval-generated `get<Name>QueryKey(...)` helpers return the actual query key used by the generated hooks — the first element is the literal URL path (e.g. `["/api/media", params]`, `["/api/conversations/${userId}/messages"]`), not a human-readable name like `"listMedia"`.

**Why:** Writing `qc.invalidateQueries({ queryKey: ["listMedia"] })` compiles fine but silently matches nothing, because react-query's default prefix matching compares against the real key array, which starts with the URL string. The mutation appears to succeed (toast shows) but the list never refreshes — a very hard-to-spot silent failure since there's no error, just numbness.

**How to apply:** Always invalidate with the same key the query uses. Prefer importing and calling the generated `get<Name>QueryKey(...)` function directly rather than typing a literal array. If you must use a literal, use the exact URL path string (checkable via `grep getXQueryKey` in the generated api.ts) as the first element.
