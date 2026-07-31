type Listener = (recipientId: string, notification: unknown) => void;

const listeners = new Set<Listener>();

export const pushNotification = {
  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  publish(recipientId: string, notification: unknown): void {
    for (const listener of listeners) listener(recipientId, notification);
  },
};
