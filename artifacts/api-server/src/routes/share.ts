import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  mediaClipsTable,
  usersTable,
  chatMessagesTable,
} from "@workspace/db";
import { ARCHIVE_CUTOFF_MS } from "./media";

const router: IRouter = Router();

const SITE_NAME = "SSF";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getOrigin(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0] ||
    req.protocol ||
    "https";
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0] ||
    req.headers.host ||
    "";
  return `${proto}://${host}`;
}

type SharePage = {
  title: string;
  description: string;
  url: string;
  image: string;
  media?: { kind: "audio" | "image"; src: string; audioUrl?: string };
  footer?: string;
};

function renderSharePage(page: SharePage): string {
  const { title, description, url, image, media, footer } = page;
  const t = escapeHtml(title);
  const d = escapeHtml(description);
  const twitterCard = "summary_large_image";

  const audioMeta =
    media?.kind === "audio" && media.audioUrl
      ? `
    <meta property="og:audio" content="${escapeHtml(media.audioUrl)}" />
    <meta property="og:audio:type" content="audio/mpeg" />`
      : "";

  const mediaBlock = media
    ? media.kind === "image"
      ? `<img class="media" src="${escapeHtml(media.src)}" alt="${t}" />`
      : `<audio class="media" controls preload="metadata" src="${escapeHtml(
          media.src,
        )}"></audio>`
    : `<div class="locked">${escapeHtml(
        footer ?? "This media isn't available to play here.",
      )}</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t} · ${SITE_NAME}</title>
    <meta name="description" content="${d}" />

    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${t}" />
    <meta property="og:description" content="${d}" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${escapeHtml(url)}" />
    <meta property="og:image" content="${escapeHtml(image)}" />${audioMeta}

    <meta name="twitter:card" content="${twitterCard}" />
    <meta name="twitter:title" content="${t}" />
    <meta name="twitter:description" content="${d}" />
    <meta name="twitter:image" content="${escapeHtml(image)}" />

    <style>
      :root { color-scheme: dark; }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
        font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto,
          Helvetica, Arial, sans-serif;
        background: radial-gradient(1200px 600px at 50% -10%, #1e293b, #0b1120 60%);
        color: #e2e8f0;
      }
      .card {
        width: 100%;
        max-width: 520px;
        background: rgba(15, 23, 42, 0.7);
        border: 1px solid rgba(148, 163, 184, 0.18);
        border-radius: 18px;
        padding: 28px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
        backdrop-filter: blur(6px);
      }
      .brand {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #a5b4fc;
        font-weight: 600;
      }
      .brand .dot { width: 8px; height: 8px; border-radius: 999px; background: #818cf8; }
      h1 { font-size: 24px; line-height: 1.2; margin: 14px 0 6px; }
      p.desc { margin: 0 0 18px; color: #94a3b8; font-size: 15px; line-height: 1.5; }
      .media { width: 100%; margin: 6px 0 20px; border-radius: 12px; display: block; }
      audio.media { height: 44px; }
      img.media { max-height: 360px; object-fit: contain; background: #0b1120; }
      .locked {
        margin: 6px 0 20px;
        padding: 16px;
        border: 1px dashed rgba(148, 163, 184, 0.35);
        border-radius: 12px;
        color: #94a3b8;
        font-size: 14px;
      }
      a.cta {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 100%;
        padding: 12px 16px;
        border-radius: 12px;
        background: #6366f1;
        color: white;
        font-weight: 600;
        text-decoration: none;
        transition: background 0.15s ease;
      }
      a.cta:hover { background: #4f46e5; }
      .foot { margin-top: 14px; text-align: center; font-size: 12px; color: #64748b; }
    </style>
  </head>
  <body>
    <main class="card">
      <span class="brand"><span class="dot"></span>${SITE_NAME}</span>
      <h1>${t}</h1>
      ${d ? `<p class="desc">${d}</p>` : ""}
      ${mediaBlock}
      <a class="cta" href="${escapeHtml(page.url.split("/api/")[0] || "/")}/">Open ${SITE_NAME}</a>
      <div class="foot">Shared from ${SITE_NAME}</div>
    </main>
  </body>
</html>`;
}

function renderNotFound(req: Request): string {
  return renderSharePage({
    title: "Not found",
    description: "This link may have expired or the media was removed.",
    url: getOrigin(req),
    image: `${getOrigin(req)}/opengraph.jpg`,
  });
}

/**
 * GET /share/clip/:id
 *
 * Public, server-rendered share page for a media clip. Includes Open Graph /
 * Twitter meta tags so the link previews nicely in other apps, plus a playable
 * audio element. Archived (paywalled) clips are shown locked — no public audio.
 */
router.get("/share/clip/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const origin = getOrigin(req);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).type("html").send(renderNotFound(req));
    return;
  }

  try {
    const [row] = await db
      .select({
        title: mediaClipsTable.title,
        description: mediaClipsTable.description,
        objectPath: mediaClipsTable.objectPath,
        createdAt: mediaClipsTable.createdAt,
        username: usersTable.username,
      })
      .from(mediaClipsTable)
      .leftJoin(usersTable, eq(mediaClipsTable.userId, usersTable.id))
      .where(eq(mediaClipsTable.id, id));

    if (!row) {
      res.status(404).type("html").send(renderNotFound(req));
      return;
    }

    const url = `${origin}/api/share/clip/${id}`;
    const archived = row.createdAt.getTime() < Date.now() - ARCHIVE_CUTOFF_MS;
    const author = row.username ? `@${row.username}` : "SSF";
    const description = row.description?.trim() || `An audio clip shared by ${author}.`;

    res
      .status(200)
      .type("html")
      .send(
        renderSharePage({
          title: row.title,
          description,
          url,
          image: `${origin}/opengraph.jpg`,
          media: archived
            ? undefined
            : {
                kind: "audio",
                src: `${origin}/api/storage${row.objectPath}`,
                audioUrl: `${origin}/api/storage${row.objectPath}`,
              },
          footer: archived
            ? "This clip has moved to Archives. Open SSF to listen."
            : undefined,
        }),
      );
  } catch (error) {
    req.log.error({ err: error }, "Error rendering clip share page");
    res.status(500).type("html").send(renderNotFound(req));
  }
});

/**
 * GET /share/chat/:id
 *
 * Public, server-rendered share page for a Live Chat media message (image or
 * audio) with Open Graph / Twitter meta tags and an inline player/preview.
 */
router.get("/share/chat/:id", async (req: Request, res: Response) => {
  const id = Number(req.params.id);
  const origin = getOrigin(req);
  if (!Number.isInteger(id) || id <= 0) {
    res.status(404).type("html").send(renderNotFound(req));
    return;
  }

  try {
    const [row] = await db
      .select({
        content: chatMessagesTable.content,
        mediaObjectPath: chatMessagesTable.mediaObjectPath,
        mediaType: chatMessagesTable.mediaType,
        username: usersTable.username,
        displayName: usersTable.displayName,
      })
      .from(chatMessagesTable)
      .leftJoin(usersTable, eq(chatMessagesTable.userId, usersTable.id))
      .where(eq(chatMessagesTable.id, id));

    if (!row || !row.mediaObjectPath) {
      res.status(404).type("html").send(renderNotFound(req));
      return;
    }

    const author =
      row.displayName || (row.username ? `@${row.username}` : "SSF");
    const isImage = row.mediaType === "image";
    const title = row.content?.trim() || `Shared ${isImage ? "image" : "audio"}`;
    const description = `Shared by ${author} in SSF Live Chat.`;
    const mediaSrc = `${origin}/api/storage${row.mediaObjectPath}`;
    const url = `${origin}/api/share/chat/${id}`;

    res
      .status(200)
      .type("html")
      .send(
        renderSharePage({
          title,
          description,
          url,
          image: isImage ? mediaSrc : `${origin}/opengraph.jpg`,
          media: {
            kind: isImage ? "image" : "audio",
            src: mediaSrc,
            audioUrl: isImage ? undefined : mediaSrc,
          },
        }),
      );
  } catch (error) {
    req.log.error({ err: error }, "Error rendering chat share page");
    res.status(500).type("html").send(renderNotFound(req));
  }
});

export default router;
