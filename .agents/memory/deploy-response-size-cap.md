---
name: Deployment response-size cap (~30MB)
description: The deployed app's infra returns 500 for any single HTTP response body larger than ~30MB; large media must be served/fetched in chunks.
---

# Deployment response-size cap (~30MB)

On the LIVE/published deployment (Google Frontend in front of the app), any single
HTTP response body larger than ~30MB fails with a **500** (empty/short body, ~3s).
Confirmed empirically via curl ranged requests against a 36MB object:
28MB range → 206 OK; 32MB range → 500. Small ranges always succeed.

**Why it bit us:** iOS/desktop Safari `<audio>` opens playback with an open-ended
`Range: bytes=0-` request = the entire file. For a 36MB audio file that response
exceeded the cap → 500 → "error playing" in Safari. This was a SEPARATE issue from
the earlier missing-Range-support fix; Range was already working (206s in logs).

**How to apply:**
- When proxying object storage / large files through the app server, cap every
  response well under the limit (we use `MAX_RESPONSE_BYTES = 8MB` in
  `objectStorage.ts` `downloadObject()`): clamp explicit ranges, clamp open-ended
  `bytes=0-` ranges, and for no-Range GETs of large files return the first chunk as
  206 (with `Content-Range`) instead of a 200 the infra rejects.
- Any CLIENT that downloads a full object (e.g. Save-to-device `fetchMediaBlob`)
  must loop over `Range: bytes=<start>-` requests, follow `Content-Range` totals,
  and reassemble a Blob — a single plain `fetch()` truncates or 500s on large files.
- This cap does NOT reproduce in dev (only the deployed infra enforces it), so it's
  only observable via prod logs / curl against the `.replit.app` domain.
