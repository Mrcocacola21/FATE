import type { FastifyBaseLogger } from "fastify";

const lifecycleTags = new Set(["fate:join", "fate:leave", "fate:room:create", "fate:placement:start"]);
const safeFields = new Set(["tag", "event", "roomId", "matchId", "userId", "connectionId", "command",
  "commandCorrelationId", "revision", "durationMs", "errorCode", "eventType", "role", "reason", "ok"]);

/** Legacy game event adapter: metadata only, never state, payloads, rolls or names. */
export function logFate(logger: FastifyBaseLogger, obj: Record<string, unknown> & { tag: string }) {
  if (!logger) return;
  const normalized = { ...obj, connectionId: obj.connectionId ?? obj.socketId,
    errorCode: obj.errorCode ?? obj.code };
  const payload = Object.fromEntries(Object.entries(normalized).filter(([key]) => safeFields.has(key)));
  try {
    if (obj.tag === "fate:error") logger.error(payload, "Game diagnostic failed");
    else if (lifecycleTags.has(obj.tag)) logger.info(payload);
    else logger.debug(payload);
  } catch { /* Diagnostics must never change authoritative gameplay. */ }
}

export function shouldLogFateDebug() {
  return process.env.FATE_DEBUG === "1" || process.env.FATE_DEBUG === "true";
}
export default { logFate, shouldLogFateDebug };
