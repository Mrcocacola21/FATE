import type { BoardVfxRequest, QueuedBoardVfxRequest } from "./vfxTypes";
import { vfxRegistry } from "./vfxRegistry";

const MAX_ACTIVE_VFX = 64;
const MAX_PROCESSED_VFX_IDS = 512;

export function getInitialVfxLogIndex(
  batch: { logIndex: number } | null | undefined,
): number {
  return batch?.logIndex ?? -1;
}

export function enqueueBoardVfx(params: {
  current: QueuedBoardVfxRequest[];
  incoming: BoardVfxRequest[];
  now: number;
  processedIds?: Set<string>;
}): QueuedBoardVfxRequest[] {
  const currentIds = new Set(params.current.map((effect) => effect.id));
  const queued: QueuedBoardVfxRequest[] = [];

  for (const effect of params.incoming) {
    if (currentIds.has(effect.id) || params.processedIds?.has(effect.id)) continue;
    const definition = vfxRegistry[effect.effectId];
    const delayMs = Math.max(0, effect.delayMs ?? 0);
    const durationMs = Math.max(100, effect.durationMs ?? definition.durationMs);
    const startedAt = params.now + delayMs;
    queued.push({
      ...effect,
      startedAt,
      expiresAt: startedAt + durationMs,
    });
    currentIds.add(effect.id);
  }

  return [...params.current, ...queued].slice(-MAX_ACTIVE_VFX);
}

export function rememberProcessedVfxRequests(
  processedIds: Set<string>,
  requests: BoardVfxRequest[],
) {
  for (const request of requests) {
    processedIds.add(request.id);
  }
  if (processedIds.size > MAX_PROCESSED_VFX_IDS) {
    for (const id of processedIds) {
      if (processedIds.size <= MAX_PROCESSED_VFX_IDS) break;
      processedIds.delete(id);
    }
  }
}

export function pruneExpiredBoardVfx(
  effects: QueuedBoardVfxRequest[],
  now: number,
): QueuedBoardVfxRequest[] {
  return effects.filter((effect) => effect.expiresAt > now);
}

export function shouldProcessVfxBatch(
  lastProcessedLogIndex: number,
  nextLogIndex: number,
): boolean {
  return Number.isInteger(nextLogIndex) && nextLogIndex > lastProcessedLogIndex;
}

export function simplifyVfxForReducedMotion(
  requests: BoardVfxRequest[],
): BoardVfxRequest[] {
  return requests.flatMap((request) => {
    const definition = vfxRegistry[request.effectId];
    if (definition.reducedMotion === "hide") return [];
    const durationMs = Math.min(request.durationMs ?? definition.durationMs, 450);
    if (request.placement === "path") {
      const path = request.path ?? [];
      const first = path[0];
      const last = path[path.length - 1];
      return [first, last]
        .filter((cell): cell is NonNullable<typeof cell> => Boolean(cell))
        .map((cell, index) => ({
          ...request,
          id: `${request.id}:reduced:${index}`,
          placement: "cell" as const,
          sourceCell: cell,
          path: undefined,
          durationMs,
        }));
    }
    if (request.placement === "line") {
      return request.targetCell
        ? [
            {
              ...request,
              placement: "cell" as const,
              sourceCell: request.targetCell,
              targetCell: undefined,
              durationMs,
            },
          ]
        : [];
    }
    return [{ ...request, durationMs }];
  });
}
