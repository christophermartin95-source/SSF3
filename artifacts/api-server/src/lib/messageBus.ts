type Listener = (recipientId: string, message: unknown) => void;

const listeners = new Set<Listener>();

export const pushDirectMessage = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  publish(recipientId: string, message: unknown): void {
    for (const listener of listeners) listener(recipientId, message);
  },
};

const readListeners = new Set<Listener>();

export const pushMessageRead = {
  subscribe(listener: Listener): () => void {
    readListeners.add(listener);
    return () => readListeners.delete(listener);
  },
  publish(recipientId: string, payload: unknown): void {
    for (const listener of readListeners) listener(recipientId, payload);
  },
};
