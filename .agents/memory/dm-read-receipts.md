---
name: DM read-receipt ordering
description: In the DM fetch endpoint, mark messages read BEFORE selecting the rows to return.
---

# DM read-receipt ordering

In `GET /conversations/:userId/messages`, run the read-marking UPDATE (set `readAt`
on unread inbound messages) **before** the SELECT that builds the response, otherwise
the returned payload carries stale `readAt` values from a pre-update snapshot.

**Why:** the endpoint both marks reads and returns the thread. Selecting first, then
updating, returns rows that don't reflect the reads just applied — a transient
mismatch the sender/reader can see until the next refetch.

**How to apply:** whenever an endpoint mutates rows it also returns, order mutation
→ select (or use RETURNING). Realtime read receipts use a dedicated `pushMessageRead`
bus (separate from `pushDirectMessage`) → WS relays `{type:"message:read", readerId,
readAt}` to the original sender, whose client invalidates the active thread query.
