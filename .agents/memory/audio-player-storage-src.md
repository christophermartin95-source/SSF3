---
name: AudioPlayer storage src prefix
description: Playable audio URLs must prefix objectPath with /api/storage in the earshot frontend.
---

The API returns `objectPath` as a raw storage object path, NOT a playable URL. Any `<AudioPlayer src=...>` (or download/upload) must use `` `/api/storage${clip.objectPath}` ``.

**Why:** Passing `clip.objectPath` directly renders the player but playback requests hit the wrong URL and silently fail. This was caught in code review when a new favourites list forgot the prefix.

**How to apply:** Whenever adding a new surface that plays a media clip, copy the src pattern from `media-section.tsx` ClipCard (`src={`/api/storage${clip.objectPath}`}`), not just `clip.objectPath`.
