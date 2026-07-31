import type { Server as HttpServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db, liveSessionsTable } from "@workspace/db";
import { consumeTicket } from "../lib/wsTickets";
import {
  registerConnection,
  unregisterConnection,
  updateSection,
  onPresenceChange,
  joinLiveRoom,
  leaveLiveRoom,
  relayLiveChunk,
  onBroadcast,
} from "../lib/presence";
import { pushDirectMessage, pushMessageRead } from "../lib/messageBus";
import { pushNotification } from "../lib/notificationBus";
import { logger } from "../lib/logger";

interface ClientMessage {
  type: string;
  section?: string;
  sessionId?: number;
  data?: string;
}

export function setupWebSocketServer(server: HttpServer): void {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url ?? "", "http://localhost");
    if (url.pathname !== "/api/ws") return;

    const ticket = url.searchParams.get("ticket") ?? "";
    const userId = consumeTicket(ticket);
    if (!userId) {
      socket.destroy();
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      handleConnection(ws, userId);
    });
  });

  onPresenceChange((entries) => {
    const payload = JSON.stringify({ type: "presence:snapshot", users: entries });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  });

  pushDirectMessage.subscribe((recipientId, message) => {
    for (const client of wss.clients) {
      const meta = clientUserIds.get(client);
      if (meta === recipientId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "message:new", message }));
      }
    }
  });

  pushMessageRead.subscribe((recipientId, payload) => {
    const data = payload as { readerId: string; readAt: string };
    for (const client of wss.clients) {
      const meta = clientUserIds.get(client);
      if (meta === recipientId && client.readyState === WebSocket.OPEN) {
        client.send(
          JSON.stringify({
            type: "message:read",
            readerId: data.readerId,
            readAt: data.readAt,
          }),
        );
      }
    }
  });

  pushNotification.subscribe((recipientId, notification) => {
    for (const client of wss.clients) {
      const meta = clientUserIds.get(client);
      if (meta === recipientId && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type: "notification:new", notification }));
      }
    }
  });

  onBroadcast((payload) => {
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  });
}

const clientUserIds = new WeakMap<WebSocket, string>();

async function handleConnection(ws: WebSocket, userId: string): Promise<void> {
  clientUserIds.set(ws, userId);
  const conn = await registerConnection(userId, ws);

  ws.on("message", (raw, isBinary) => {
    if (isBinary) {
      // Binary frames are audio chunks for the currently broadcasting session.
      // The client is expected to have called live:start first.
      for (const sessionId of conn.liveSessionIds) {
        relayLiveChunk(sessionId, userId, raw as Buffer);
      }
      return;
    }

    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    switch (msg.type) {
      case "presence:update":
        if (typeof msg.section === "string") updateSection(userId, msg.section);
        break;
      case "live:start":
        if (typeof msg.sessionId === "number") {
          joinLiveRoom(msg.sessionId, userId, conn, true);
        }
        break;
      case "live:join":
        if (typeof msg.sessionId === "number") {
          joinLiveRoom(msg.sessionId, userId, conn, false);
        }
        break;
      case "live:leave":
        if (typeof msg.sessionId === "number") {
          leaveLiveRoom(msg.sessionId, userId);
          conn.liveSessionIds.delete(msg.sessionId);
        }
        break;
      case "live:end":
        if (typeof msg.sessionId === "number") {
          void db
            .update(liveSessionsTable)
            .set({ status: "ended", endedAt: new Date() })
            .where(eq(liveSessionsTable.id, msg.sessionId));
          leaveLiveRoom(msg.sessionId, userId);
        }
        break;
      default:
        break;
    }
  });

  ws.on("close", () => {
    unregisterConnection(userId, conn);
  });

  ws.on("error", (err) => {
    logger.warn({ err, userId }, "WebSocket connection error");
  });
}
