# Memory Index

- [Orval query-key invalidation](orval-query-keys.md) — invalidateQueries must use the URL-based key orval generates (e.g. `["/api/media"]`), not an arbitrary string like `["listMedia"]`.
- [Drizzle array params in raw sql](drizzle-array-params.md) — never interpolate a JS array into `sql\`ANY(${arr})\``; use `inArray()` instead, or it produces invalid SQL.
- [API route path parity](api-route-path-parity.md) — Express route paths must exactly match the paths baked into the orval-generated client, or requests 404 silently until end-to-end tested.
- [Stripe connector credentials](stripe-connector-credentials.md) — connector API returns secret key as `settings.secret`, not `secret_key`; also try standalone `runMigrations()` if stripe.* tables seem missing.
- [zod.coerce.boolean() query params](zod-coerce-boolean-query-params.md) — sending `?flag=false` coerces to `true`; omit falsy optional boolean query params entirely instead of passing `false`.
- [Publish-time schema constraints](publish-schema-constraints.md) — unique constraints must ship day one; prod duplicates block publish ALTERs, and the fix (fresh table name) requires declining the rename prompt.
- [audioFormat encodes media type](media-format-field.md) — media clips use a `video/` prefix on the free-form audioFormat string (bare subtype = audio) to pick `<video>` vs `<audio>`; no dedicated isVideo field.
- [DM read-receipt ordering](dm-read-receipts.md) — in the DM fetch endpoint, mark messages read BEFORE selecting the returned rows, or the payload carries stale readAt.
- [Orval query `enabled` needs queryKey](orval-query-options-enabled.md) — `{query:{enabled}}` alone fails typecheck (queryKey required); prefer conditional mounting over the enabled flag.
- [vite.config PORT build crash](vite-config-port-build.md) — scaffold throws on missing PORT/BASE_PATH; deploy build has no PORT, so gate the check on command==="serve".
- [AudioPlayer storage src prefix](audio-player-storage-src.md) — media playback src must be `/api/storage${objectPath}`, not the raw objectPath.
- [Share pages server-rendered](share-pages-server-rendered.md) — link-preview OG tags must be emitted by api-server under `/api/share/*`, not the SPA; archived clips stay locked (no audio).
- [Deployment response-size cap (~30MB)](deploy-response-size-cap.md) — prod infra 500s on any single response >~30MB; serve/fetch large media in chunks (Safari's `bytes=0-` = whole file).
- [Dev/prod separate databases](dev-prod-separate-databases.md) — dev (app DATABASE_URL, `helium`) and prod are distinct DBs, not primary+replica; a "dev test" of a destructive endpoint hits real dev data, and filtered reads can hide DB size.
- [Production data writes](prod-data-writes.md) — prod DB is read-only via tooling & separate from dev; grant prod admin via ADMIN_EMAILS allowlist in ensureUser + republish, not direct DB writes.
- [Orval inline request bodies](orval-inline-bodies.md) — inline requestBody schemas collide (TS2308) between zod+types outputs; always define a named component schema and $ref it.
- [Prod backfill via defaults](prod-backfill-via-defaults.md) — prod DB can't be UPDATE-backfilled; for grandfathered flag columns, DEFAULT = "done" value + insert path sets "not done" explicitly.
