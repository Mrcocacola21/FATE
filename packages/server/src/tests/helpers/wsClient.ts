import WebSocket from "ws";
import type { ServerMessage } from "../../ws";

type Waiter = { match: (message: ServerMessage) => boolean; resolve: (message: ServerMessage) => void; reject: (error: Error) => void; timer: NodeJS.Timeout };
type MessageOf<T> = ServerMessage extends infer Message
  ? Message extends { type: infer Type } ? T extends Type ? Message : never : never
  : never;

/** Buffer frames before open resolves. Consume by predicate, never by incidental arrival order. */
export async function connectWs(url: string) {
  const socket = new WebSocket(url);
  const messages: ServerMessage[] = [];
  const waiters = new Set<Waiter>();
  let failure: Error | undefined;
  const fail = (error: Error) => {
    failure = error;
    for (const waiter of waiters) { clearTimeout(waiter.timer); waiter.reject(error); }
    waiters.clear();
  };
  socket.on("message", data => {
    let message: ServerMessage;
    try { message = JSON.parse(data.toString()) as ServerMessage; } catch { fail(new Error("Invalid JSON from WS server")); return; }
    const waiter = [...waiters].find(item => item.match(message));
    if (waiter) { waiters.delete(waiter); clearTimeout(waiter.timer); waiter.resolve(message); }
    else messages.push(message);
  });
  socket.on("error", fail);
  socket.on("close", () => fail(new Error("WS closed while awaiting a frame")));
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => { socket.terminate(); reject(new Error("WS connect timed out")); }, 10000);
    socket.once("open", () => { clearTimeout(timer); resolve(); });
    socket.once("error", error => { clearTimeout(timer); reject(error); });
  });
  const waitFor = (match: (message: ServerMessage) => boolean, description: string, timeoutMs = 10000): Promise<ServerMessage> => {
    const index = messages.findIndex(match);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    if (failure) return Promise.reject(failure);
    return new Promise((resolve, reject) => {
      const waiter: Waiter = { match, resolve, reject, timer: setTimeout(() => {
        waiters.delete(waiter);
        reject(new Error(`WS timeout: ${description}; buffered types: ${messages.slice(-8).map(item => item.type).join(", ")}`));
      }, timeoutMs) };
      waiters.add(waiter);
    });
  };
  return {
    socket, messages,
    send(message: object) { messages.length = 0; socket.send(JSON.stringify(message)); },
    waitFor,
    wait<T extends ServerMessage["type"]>(type: T) {
      return waitFor(message => message.type === type, type) as Promise<MessageOf<T>>;
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      await new Promise<void>(resolve => {
        const timer = setTimeout(() => socket.terminate(), 1000);
        socket.once("close", () => { clearTimeout(timer); resolve(); });
        socket.close();
      });
    },
  };
}

export type WsClient = Awaited<ReturnType<typeof connectWs>>;
