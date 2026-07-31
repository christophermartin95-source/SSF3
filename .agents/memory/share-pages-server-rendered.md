---
name: Share pages must be server-rendered under /api
description: Why media share links live in api-server, not the wouter SPA, and how the paywall is handled
---

Media share links (`/api/share/clip/:id`, `/api/share/chat/:id`) are served as
self-contained HTML by **api-server**, not the wouter SPA.

**Why:** The SPA renders client-side, so crawlers/link-preview bots (iMessage,
Slack, Twitter, etc.) never see its meta tags. Open Graph / Twitter tags must be
in the initial server HTML response. In prod `/api/*` routes to api-server, so
the share routes are reachable at the app origin.

**How to apply:**
- Any new "shareable link that previews in other apps" feature must be a server
  route emitting OG/Twitter meta in the first response — never rely on the SPA.
- Escape every user-derived field (title/description/urls) before interpolating
  into the HTML (there's an `escapeHtml` helper in `share.ts`).
- Paywall is preserved, not bypassed: archived clips (older than
  `ARCHIVE_CUTOFF_MS`, imported from `media.ts`) render a "locked" page with no
  audio element and no storage URL exposed. A public/anonymous viewer therefore
  never gets archived audio via a share link.
- `getOrigin()` derives the origin from `x-forwarded-proto`/`x-forwarded-host`
  (Replit's proxy sets these). Host-header spoofing only poisons the attacker's
  own generated link — low impact, left as-is.
