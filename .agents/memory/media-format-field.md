---
name: audioFormat encodes media type
description: How the free-form audioFormat string discriminates video vs audio clips in the media (Overheard/Self Recorded) feature
---

The `audioFormat` column/field (media clips) is overloaded to encode whether a clip is video or audio, because there is no dedicated `isVideo`/`mediaType` field.

Convention:
- Audio clips store a **bare subtype** (e.g. `mp3`, `wav`, `mp4` for m4a).
- Video clips store a **`video/` prefix** (e.g. `video/mp4`, `video/mov`).
- `isVideoFormat(fmt)` = `fmt.startsWith("video/")`; `formatLabel(fmt)` strips any `audio/`/`video/` prefix for the badge; `deriveMediaFormat(file)` builds the value on upload (extension fallback when `file.type` is empty).

**Why:** playback picks `<video>` vs `<audio>` from this. An `.m4a` (audio/mp4) and an `.mp4` video both report subtype "mp4", so the bare subtype alone is ambiguous — only the `video/` prefix disambiguates. Chosen over a DB migration + spec/codegen change since `audioFormat` is already free-form text.

**How to apply:** any new upload path or media consumer must set/read `audioFormat` with this prefix convention, not just a bare subtype. Legacy video rows stored as bare `mp4` (from an earlier build) will render as audio unless backfilled to `video/mp4`.

## Archive-lock parity for content fields
Any new "content" column on `media_clips` that reveals playable content (e.g. `objectPath`, `audioFormat`, `durationSeconds`, `thumbnailPath`) MUST be added to `LockableRow` and nulled inside `withArchiveLock` in `artifacts/api-server/src/routes/media.ts`, or locked/archived clips will leak that field to viewers without archive access.

**Why:** the archive paywall is enforced solely by nulling these fields at read time; there is no separate access filter on the object-storage path. A field left out of the null list bypasses the paywall.

**How to apply:** when adding such a field, update (1) the DB schema, (2) `mediaWithAuthor` select, (3) `LockableRow` + the null branch of `withArchiveLock`, (4) the favorite-of-month `groupBy`, and (5) the OpenAPI `MediaClip`/`MediaInput`/favorite-of-month schemas, then run codegen.
