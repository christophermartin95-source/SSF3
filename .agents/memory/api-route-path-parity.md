---
name: API route path parity
description: Backend Express routes must exactly match orval-generated client paths, or requests 404 without a compile error
---

Nothing in TypeScript checks that an Express route's path string (e.g. `router.post("/live-sessions", ...)`) matches the path baked into the orval-generated frontend client (e.g. `/api/live/sessions`). A mismatch compiles cleanly on both sides and only surfaces at runtime as a 404 ("Cannot POST /api/live/sessions"), which is easy to miss with unit/type checks alone.

**Why:** Found via full e2e testing on Earshot — `live-sessions` vs `live/sessions` and `/messages/:userId` vs `/conversations/:userId/messages` were both silently wrong; typecheck passed both times.

**How to apply:** After scaffolding or hand-writing Express routes for an orval/OpenAPI-backed frontend, grep the generated client (`lib/api-client-react/src/generated/api.ts`, search for the resource name) to confirm the exact path strings, then diff against `router.<method>(...)` calls in the route file. Always run a real end-to-end browser test (not just typecheck) before declaring a feature done — typecheck cannot catch route path drift.
