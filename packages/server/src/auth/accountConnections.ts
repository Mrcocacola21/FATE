import WebSocket from "ws";

/** Owned by one server instance; includes matchmaking subscriptions outside rooms. */
export class AccountConnections {
  private readonly sockets = new Map<WebSocket, Set<string>>();
  bind(socket: WebSocket, ...userIds: string[]) {
    this.sockets.set(socket, new Set(userIds));
  }
  remove(socket: WebSocket) {
    this.sockets.delete(socket);
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
