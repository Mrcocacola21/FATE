// packages/server/src/roomQueue.ts

const roomQueues = new Map<string, Promise<unknown>>();

export function enqueueRoomCommand<T>(
  roomKey: string,
  task: () => Promise<T> | T
): Promise<T> {
  const previous = roomQueues.get(roomKey) ?? Promise.resolve();

  const run = previous
    .catch(() => undefined)
    .then(() => task());

  roomQueues.set(roomKey, run);
  // Observe both outcomes without creating an unhandled rejected finally promise.
  const release = () => {
    if (roomQueues.get(roomKey) === run) roomQueues.delete(roomKey);
  };
  void run.then(release, release);

  return run;
}

export function fateRoomKey(roomId: string): string {
  return `fate:${roomId}`;
}

export const FATE_CREATE_KEY = "fate:create";

export function getQueuedFateRoomIds(): Set<string> {
  return new Set(Array.from(roomQueues.keys())
    .filter((key) => key.startsWith("fate:") && key !== FATE_CREATE_KEY)
    .map((key) => key.slice(5)));
}

/** Shutdown runs after inbound work has stopped; finish commands before journal drain. */
export async function drainRoomCommands(timeoutMs = 5000): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  const drain = async () => {
    while (roomQueues.size) await Promise.allSettled([...roomQueues.values()]);
    return true;
  };
  const complete = await Promise.race([
    drain(),
    new Promise<false>((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); }),
  ]);
  if (timer) clearTimeout(timer);
  return complete;
}
