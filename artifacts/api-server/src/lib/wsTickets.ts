import crypto from "crypto";

interface TicketEntry {
  userId: string;
  expiresAt: number;
}

const tickets = new Map<string, TicketEntry>();
const TICKET_TTL_MS = 30_000;

export function createTicket(userId: string): string {
  const ticket = crypto.randomUUID();
  tickets.set(ticket, { userId, expiresAt: Date.now() + TICKET_TTL_MS });
  return ticket;
}

export function consumeTicket(ticket: string): string | null {
  const entry = tickets.get(ticket);
  if (!entry) return null;
  tickets.delete(ticket);
  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

setInterval(() => {
  const now = Date.now();
  for (const [ticket, entry] of tickets) {
    if (entry.expiresAt < now) tickets.delete(ticket);
  }
}, 60_000).unref();
