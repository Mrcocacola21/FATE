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

  roomQueues.set(
    roomKey,
    run.finally(() => {
      if (roomQueues.get(roomKey) === run) {
        roomQueues.delete(roomKey);
      }
    })
  );

  return run;
}

export function fateRoomKey(roomId: string): string {
  return `fate:${roomId}`;
}

export const FATE_CREATE_KEY = "fate:create";
