import WebSocket from "ws";

type PresenceListener = (userId: string, online: boolean) => void;

/** Owned by one server instance; includes matchmaking subscriptions outside rooms. */
export class AccountConnections {
  private readonly sockets = new Map<WebSocket, Set<string>>();
  /** Open sockets per account, so presence flips only on the first and the last one. */
  private readonly counts = new Map<string, number>();
  private readonly listeners = new Set<PresenceListener>();

  bind(socket: WebSocket, ...userIds: string[]) {
    const previous = this.sockets.get(socket) ?? new Set<string>();
    const next = new Set(userIds);
    this.sockets.set(socket, next);
    for (const userId of next) if (!previous.has(userId)) this.adjust(userId, 1);
    for (const userId of previous) if (!next.has(userId)) this.adjust(userId, -1);
  }
  remove(socket: WebSocket) {
    const owners = this.sockets.get(socket);
    this.sockets.delete(socket);
    for (const userId of owners ?? []) this.adjust(userId, -1);
  }
  isOnline(userId: string) {
    return (this.counts.get(userId) ?? 0) > 0;
  }
  /** Called when an account gets its first connection or loses its last one. */
  onPresenceChange(listener: PresenceListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  private adjust(userId: string, delta: number) {
    const before = this.counts.get(userId) ?? 0;
    const after = Math.max(0, before + delta);
    if (after) this.counts.set(userId, after);
    else this.counts.delete(userId);
    if (before > 0 !== after > 0)
      for (const listener of this.listeners) listener(userId, after > 0);
  }
  revoke(userId: string) {
    for (const [socket, owners] of this.sockets) {
      if (!owners.has(userId)) continue;
      if (socket.readyState === WebSocket.OPEN) {
        try {
          socket.send(
            JSON.stringify({
              type: "error",
              code: "ACCOUNT_BLOCKED",
              message: "Account access is blocked",
            }),
          );
          socket.close(1008, "ACCOUNT_BLOCKED");
        } catch {
          socket.terminate();
        }
      }
    }
  }
}
