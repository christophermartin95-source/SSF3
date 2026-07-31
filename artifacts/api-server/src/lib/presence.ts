import type { WebSocket } from "ws";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";

export interface PresenceEntry {
  userId: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  status: "online" | "away";
  section: string;
  lastSeenAt: string;
}

interface ConnectionInfo {
  ws: WebSocket;
  liveSessionIds: Set<number>;
}

interface UserPresence {
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  section: string;
  lastSeenAt: string;
  connections: Set<ConnectionInfo>;
}

const presenceByUser = new Map<string, UserPresence>();

interface LiveRoom {
  broadcasterUserId: string;
  listeners: Set<string>;
}

const liveRooms = new Map<number, LiveRoom>();

function snapshot(): PresenceEntry[] {
  return Array.from(presenceByUser.entries()).map(([userId, p]) => ({
    userId,
    username: p.username,
    displayName: p.displayName,
    avatarUrl: p.avatarUrl,
    status: "online" as const,
    section: p.section,
    lastSeenAt: p.lastSeenAt,
  }));
}

type PresenceListener = (entries: PresenceEntry[]) => void;
const presenceListeners = new Set<PresenceListener>();

export function onPresenceChange(listener: PresenceListener): () => void {
  presenceListeners.add(listener);
  return () => presenceListeners.delete(listener);
}

function notifyPresenceChange(): void {
  const entries = snapshot();
  for (const listener of presenceListeners) listener(entries);
}

export function getOnlineUsers(): PresenceEntry[] {
  return snapshot();
}

export async function registerConnection(
  userId: string,
  ws: WebSocket,
): Promise<ConnectionInfo> {
  const conn: ConnectionInfo = { ws, liveSessionIds: new Set() };

  let presence = presenceByUser.get(userId);
  if (!presence) {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    presence = {
      username: user?.username ?? userId,
      displayName: user?.displayName ?? null,
      avatarUrl: user?.avatarUrl ?? null,
      section: "browsing",
      lastSeenAt: new Date().toISOString(),
      connections: new Set(),
    };
    presenceByUser.set(userId, presence);
  }
  presence.connections.add(conn);
  presence.lastSeenAt = new Date().toISOString();
  notifyPresenceChange();
  return conn;
}

export function updateSection(userId: string, section: string): void {
  const presence = presenceByUser.get(userId);
  if (!presence) return;
  presence.section = section;
  presence.lastSeenAt = new Date().toISOString();
  notifyPresenceChange();
}

export function unregisterConnection(
  userId: string,
  conn: ConnectionInfo,
): void {
  const presence = presenceByUser.get(userId);
  if (!presence) return;
  presence.connections.delete(conn);
  for (const sessionId of conn.liveSessionIds) {
    leaveLiveRoom(sessionId, userId);
  }
  if (presence.connections.size === 0) {
    presenceByUser.delete(userId);
    notifyPresenceChange();
  }
}

export function getConnections(userId: string): WebSocket[] {
  const presence = presenceByUser.get(userId);
  if (!presence) return [];
  return Array.from(presence.connections).map((c) => c.ws);
}

export function isOnline(userId: string): boolean {
  return presenceByUser.has(userId);
}

export function joinLiveRoom(
  sessionId: number,
  userId: string,
  conn: ConnectionInfo | null,
  asBroadcaster: boolean,
): void {
  let room = liveRooms.get(sessionId);
  if (!room) {
    room = { broadcasterUserId: asBroadcaster ? userId : "", listeners: new Set() };
    liveRooms.set(sessionId, room);
  }
  if (asBroadcaster) {
    room.broadcasterUserId = userId;
  } else {
    room.listeners.add(userId);
  }
  conn?.liveSessionIds.add(sessionId);
}

export function leaveLiveRoom(sessionId: number, userId: string): void {
  const room = liveRooms.get(sessionId);
  if (!room) return;
  room.listeners.delete(userId);
  if (room.broadcasterUserId === userId) {
    room.broadcasterUserId = "";
  }
  if (!room.broadcasterUserId && room.listeners.size === 0) {
    liveRooms.delete(sessionId);
  }
}

export function relayLiveChunk(
  sessionId: number,
  fromUserId: string,
  chunk: Buffer,
): void {
  const room = liveRooms.get(sessionId);
  if (!room || room.broadcasterUserId !== fromUserId) return;
  for (const listenerId of room.listeners) {
    for (const ws of getConnections(listenerId)) {
      if (ws.readyState === ws.OPEN) {
        ws.send(
          JSON.stringify({
            type: "live:chunk",
            sessionId,
            data: chunk.toString("base64"),
          }),
        );
      }
    }
  }
}

export function endLiveRoom(sessionId: number): void {
  liveRooms.delete(sessionId);
}

type BroadcastListener = (payload: unknown) => void;
const broadcastListeners = new Set<BroadcastListener>();

export function onBroadcast(listener: BroadcastListener): () => void {
  broadcastListeners.add(listener);
  return () => broadcastListeners.delete(listener);
}

export function broadcastToAll(payload: unknown): void {
  for (const listener of broadcastListeners) listener(payload);
}
