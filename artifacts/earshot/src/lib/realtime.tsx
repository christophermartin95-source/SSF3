import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/react";
import { getRealtimeTicket, type PresenceEntry } from "@workspace/api-client-react";

type WireMessage =
  | { type: "presence:snapshot"; users: PresenceEntry[] }
  | { type: "message:new"; message: unknown }
  | { type: "live:chunk"; sessionId: number; data: string }
  | { type: "live:started"; session: unknown }
  | { type: "live:scheduled"; session: unknown }
  | { type: "live:ended"; session: unknown }
  | { type: string; [key: string]: unknown };

type Handler = (msg: WireMessage) => void;

interface RealtimeContextValue {
  connected: boolean;
  presence: PresenceEntry[];
  setSection: (section: string | null) => void;
  sendJson: (payload: Record<string, unknown>) => void;
  sendBinary: (chunk: ArrayBuffer | Blob) => void;
  subscribe: (type: string, handler: Handler) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

function wsUrl(ticket: string): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws?ticket=${encodeURIComponent(ticket)}`;
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isSignedIn } = useUser();
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceEntry[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const sectionRef = useRef("browsing");
  const listenersRef = useRef(new Set<{ type: string; handler: Handler }>());
  const closedRef = useRef(false);

  useEffect(() => {
    if (!isSignedIn) return;
    closedRef.current = false;

    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    async function connect() {
      if (closedRef.current) return;
      try {
        const { ticket } = await getRealtimeTicket();
        if (closedRef.current) return;
        const ws = new WebSocket(wsUrl(ticket));
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          ws.send(JSON.stringify({ type: "presence:update", section: sectionRef.current }));
        };

        ws.onmessage = (event) => {
          if (typeof event.data !== "string") return;
          let msg: WireMessage;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          if (msg.type === "presence:snapshot") {
            setPresence((msg as { users: PresenceEntry[] }).users);
          }
          for (const listener of listenersRef.current) {
            if (listener.type === msg.type) listener.handler(msg);
          }
        };

        ws.onclose = () => {
          setConnected(false);
          if (!closedRef.current) retryTimer = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch {
        if (!closedRef.current) retryTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      closedRef.current = true;
      if (retryTimer) clearTimeout(retryTimer);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [isSignedIn]);

  const setSection = useCallback((section: string | null) => {
    const resolved = section ?? "browsing";
    sectionRef.current = resolved;
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "presence:update", section: resolved }));
    }
  }, []);

  const sendJson = useCallback((payload: Record<string, unknown>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const sendBinary = useCallback((chunk: ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(chunk);
    }
  }, []);

  const subscribe = useCallback((type: string, handler: Handler) => {
    const entry = { type, handler };
    listenersRef.current.add(entry);
    return () => listenersRef.current.delete(entry);
  }, []);

  return (
    <RealtimeContext.Provider
      value={{ connected, presence, setSection, sendJson, sendBinary, subscribe }}
    >
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) throw new Error("useRealtime must be used within a RealtimeProvider");
  return ctx;
}

/** Tracks the current section for presence purposes while a component is mounted. */
export function usePresenceSection(section: string | null): void {
  const { setSection } = useRealtime();
  useEffect(() => {
    setSection(section);
    return () => setSection("browsing");
  }, [section, setSection]);
}
