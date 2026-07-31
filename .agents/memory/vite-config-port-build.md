---
name: vite.config PORT/BASE_PATH breaks production build
description: react-vite scaffold's vite.config throws on missing PORT/BASE_PATH, which crashes the deploy build
---

The Replit `react-vite` scaffold's `vite.config.ts` reads `process.env.PORT` and
`process.env.BASE_PATH` at module top-level and `throw`s if either is missing.

**Problem:** `PORT` is only needed for the dev/preview server. The production
deploy build (`vite build`) does NOT set `PORT`, so the config throws before the
build starts and publishing fails with:
`Error: PORT environment variable is required but was not provided.`

**Fix:** Convert to the function form `defineConfig(async ({ command }) => {...})`
and only require/validate `PORT` when `command === "serve"`. Default
`BASE_PATH` to `"/"` when absent. Keep the function `async` because the plugins
array uses top-level `await import(...)` for cartographer/dev-banner.

**How to apply:** Any time a deploy build fails on a missing env var that is only
used by the dev server, gate the check on `command === "serve"` rather than
throwing unconditionally.
