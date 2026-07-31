const AUDIO_MIME_BY_EXT: Record<string, string> = {
  mp3: "audio/mpeg",
  mpeg: "audio/mpeg",
  mpga: "audio/mpeg",
  mpg: "audio/mpeg",
  mp2: "audio/mpeg",
  m4a: "audio/mp4",
  m4b: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  wave: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  caf: "audio/x-caf",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  aifc: "audio/aiff",
  webm: "audio/webm",
};

/**
 * Ensure a file destined for audio playback carries an `audio/*` content type.
 *
 * Browsers report some audio files (e.g. iPhone recordings, `.mpeg`/`.mpg`) with
 * a non-audio MIME type like `video/mpeg` or an empty type. That type is what gets
 * stored in object storage and served back, causing the <audio> element to fail to
 * decode the file. When the type isn't already `audio/*`, we rewrap the file with a
 * corrected MIME derived from its extension so playback works.
 */
const UNAMBIGUOUS_AUDIO_EXT = new Set(["mp3", "mpeg", "mpga", "mpg", "mp2"]);

export function normalizeAudioFile(file: File): File {
  if (file.type.startsWith("audio/")) return file;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const mime = AUDIO_MIME_BY_EXT[ext];
  if (!mime) return file;
  // Don't mislabel a real video container (e.g. video/webm) as audio. Only
  // override an explicit video/* type for extensions that are unambiguously
  // audio, like the MPEG-audio family (.mp3/.mpeg/.mpg reported as video/mpeg).
  if (file.type.startsWith("video/") && !UNAMBIGUOUS_AUDIO_EXT.has(ext)) {
    return file;
  }
  return new File([file], file.name, {
    type: mime,
    lastModified: file.lastModified,
  });
}

const VIDEO_EXTS = new Set(["mp4", "m4v", "mov", "webm", "ogv", "3gp", "3g2", "mkv"]);

/**
 * Derive the `audioFormat` value stored for a clip. Videos keep a `video/`
 * prefix (e.g. "video/mp4") so playback can render a <video> element; audio is
 * stored as a bare subtype (e.g. "mp3"). Falls back to the file extension when
 * the browser reports an empty MIME type, so a video isn't misclassified as
 * audio.
 */
export function deriveMediaFormat(file: File): string {
  const type = file.type?.toLowerCase() ?? "";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (type.startsWith("video/")) return type;
  if (type.startsWith("audio/")) return type.replace(/^audio\//, "");
  if (VIDEO_EXTS.has(ext)) return `video/${ext}`;
  return ext || "audio";
}

/** True if a stored `audioFormat` value represents a video clip. */
export function isVideoFormat(fmt: string | null | undefined): boolean {
  return !!fmt && fmt.toLowerCase().startsWith("video/");
}

/** Human-friendly format label for the badge (strips any audio//video/ prefix). */
export function formatLabel(fmt: string | null | undefined): string {
  return (fmt ?? "").replace(/^(audio|video)\//i, "");
}

/**
 * Verify the browser can actually decode a selected media file before we upload
 * it. A <video> element can decode both audio-only and video files, so this
 * lets video containers (e.g. MP4) through while rejecting files whose
 * codec/container can't be played back (which would otherwise upload fine but
 * fail on playback).
 */
export function canDecodeMedia(file: File, timeoutMs = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement("video");
    el.preload = "metadata";
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.onloadedmetadata = null;
      el.onerror = null;
      el.removeAttribute("src");
      el.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    el.onloadedmetadata = () => finish(Number.isFinite(el.duration) && el.duration > 0);
    el.onerror = () => finish(false);
    el.src = url;
  });
}

/**
 * Generate a poster thumbnail (JPEG) from a video file by grabbing a frame a
 * short way in. Returns a File ready to upload, or null if a frame couldn't be
 * captured (e.g. unsupported codec, no video track, or a tainted canvas).
 */
export function generateVideoThumbnail(
  file: File,
  timeoutMs = 15000,
): Promise<File | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const finish = (result: File | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      video.onloadedmetadata = null;
      video.onseeked = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
      resolve(result);
    };

    const capture = () => {
      try {
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) return finish(null);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return finish(null);
        ctx.drawImage(video, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return finish(null);
            const base = file.name.replace(/\.[^.]+$/, "") || "thumbnail";
            finish(
              new File([blob], `${base}.jpg`, {
                type: "image/jpeg",
                lastModified: Date.now(),
              }),
            );
          },
          "image/jpeg",
          0.8,
        );
      } catch {
        finish(null);
      }
    };

    const timer = setTimeout(() => finish(null), timeoutMs);
    video.onloadedmetadata = () => {
      // Seek a little way in so we skip an all-black opening frame.
      const target = Number.isFinite(video.duration)
        ? Math.min(0.5, video.duration / 2)
        : 0.1;
      video.onseeked = capture;
      try {
        video.currentTime = target;
      } catch {
        capture();
      }
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

const EXT_BY_MIME: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "audio/flac": "flac",
  "audio/webm": "weba",
  "audio/aiff": "aiff",
  "audio/x-caf": "caf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/svg+xml": "svg",
};

function sanitizeFilename(name: string): string {
  const cleaned = name
    .trim()
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  return cleaned || "download";
}

export type ShareKind = "clip" | "chat";

/** Build the public, shareable URL for a piece of media. */
export function buildShareUrl(kind: ShareKind, id: number): string {
  return `${window.location.origin}/api/share/${kind}/${id}`;
}

/**
 * Share a public link to a piece of media.
 *
 * On devices with a native share sheet (most phones) this opens it so the user
 * can send the link to any app. Everywhere else it copies the link to the
 * clipboard. Returns what happened so the caller can show the right feedback.
 */
export async function shareMedia(
  kind: ShareKind,
  id: number,
  title: string,
): Promise<"shared" | "copied" | "dismissed"> {
  const url = buildShareUrl(kind, id);
  const nav = navigator as Navigator & {
    share?: (data?: ShareData) => Promise<void>;
  };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, url });
      return "shared";
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return "dismissed";
      // Fall through to clipboard on any other share failure.
    }
  }
  await navigator.clipboard.writeText(url);
  return "copied";
}

/**
 * Fetch a stored media object as a Blob, reading it in byte ranges.
 *
 * The API caps each response at a few MB (the deployment infra rejects large
 * responses), returning 206 Partial Content with a `Content-Range` header. We
 * follow those ranges until the whole object is retrieved, then assemble one
 * Blob so downloads/saves work regardless of file size.
 */
async function fetchMediaBlob(url: string): Promise<Blob> {
  const parts: BlobPart[] = [];
  let type = "application/octet-stream";
  let start = 0;
  let total: number | undefined;

  // Guard against runaway loops; 4GB / typical chunk size is plenty.
  for (let i = 0; i < 4096; i++) {
    const res = await fetch(url, { headers: { Range: `bytes=${start}-` } });
    if (!res.ok && res.status !== 206) {
      throw new Error("Failed to fetch media");
    }
    type = res.headers.get("Content-Type") || type;

    const buf = await res.arrayBuffer();
    parts.push(buf);
    const received = buf.byteLength;

    if (res.status !== 206) {
      // A 200 means we got the whole file in one response.
      break;
    }

    // Partial content: we must be able to read the total size to know when to
    // stop, otherwise we could silently save a truncated file.
    const contentRange = res.headers.get("Content-Range");
    const m = contentRange ? /\/(\d+)\s*$/.exec(contentRange) : null;
    if (!m) throw new Error("Failed to fetch media");
    total = Number(m[1]);

    start += received;
    if (received === 0 || start >= total) break;
  }

  return new Blob(parts, { type });
}

/**
 * Download a stored media object to the user's device.
 *
 * On phones that support it (iOS Safari, Android Chrome) this opens the native
 * share sheet with the file attached, so the user can "Save to Files" or save an
 * image to Photos. Everywhere else it falls back to a normal file download.
 *
 * @param objectPath the stored object path (e.g. `/objects/uploads/<id>`)
 * @param baseName   a human-friendly name (title, etc.); an extension is added
 *                   automatically from the file's content type if missing.
 */
export async function saveMediaToDevice(
  objectPath: string,
  baseName: string,
): Promise<void> {
  const blob = await fetchMediaBlob(`/api/storage${objectPath}`);

  const type = blob.type || "application/octet-stream";
  const ext = EXT_BY_MIME[type] ?? type.split("/")[1]?.split(";")[0] ?? "bin";
  const hasExt = /\.[a-z0-9]{2,5}$/i.test(baseName);
  const filename = hasExt
    ? sanitizeFilename(baseName)
    : `${sanitizeFilename(baseName)}.${ext}`;

  const file = new File([blob], filename, { type });

  const nav = navigator as Navigator & {
    canShare?: (data?: ShareData) => boolean;
  };
  if (
    typeof nav.share === "function" &&
    typeof nav.canShare === "function" &&
    nav.canShare({ files: [file] })
  ) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (err) {
      // User dismissed the share sheet — treat as done, don't also download.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Otherwise fall through to the download fallback below.
    }
  }

  const blobUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = blobUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Delay revoke; revoking immediately can abort the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(blobUrl), 10_000);
}
