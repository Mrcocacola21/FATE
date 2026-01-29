import type { FastifyBaseLogger } from "fastify";

const PONG_DEBUG_TICK = process.env.PONG_DEBUG_TICK !== "0";

function timestamp() {
  return new Date().toISOString();
}

// logPong uses an injected Fastify logger so logs are merged with server logs
export function logPong(logger: FastifyBaseLogger, obj: Record<string, any>) {
  const payload = { tag: obj.tag, ts: timestamp(), ...obj };
  try {
    // route by tag
    if (obj.tag === "pong:tick") {
      if (!PONG_DEBUG_TICK) return;
      logger.debug(payload);
      return;
    }
    if (obj.tag === "pong:error") {
      // include err if present
      const err = (obj as any).err;
      if (err) {
        logger.error({ ...payload, err });
      } else {
        logger.error(payload);
      }
      return;
    }
    // normal events
    logger.info(payload);
  } catch (e) {
    try {
      logger.error({ tag: obj.tag, ts: timestamp(), message: "logging_failed", err: String(e) });
    } catch {
      // best effort
      // swallow
    }
  }
}

export function shouldLogTick() {
  return PONG_DEBUG_TICK;
}

export default { logPong, shouldLogTick };
