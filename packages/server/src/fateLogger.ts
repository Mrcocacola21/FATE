import type { FastifyBaseLogger } from "fastify";

const FATE_DEBUG = process.env.FATE_DEBUG === "1" || process.env.FATE_DEBUG === "true";

function ts() {
  return new Date().toISOString();
}

const INFO_TAGS = new Set([
  "fate:join",
  "fate:leave",
  "fate:room:create",
  "fate:placement:start",
  "fate:initiative:resolved",
  "fate:actionResult",
  "fate:roll:requested",
  "fate:roll:resolved",
  "fate:damage",
  "fate:move",
  "fate:stakes:placed",
]);

const INFO_EVENT_TYPES = new Set([
  "attackResolved",
  "rollRequested",
  "unitMoved",
  "damageDealt",
  "stakesPlaced",
  "initiativeRolled",
  "startGame",
]);

export function logFate(logger: FastifyBaseLogger, obj: Record<string, any>) {
  const payload = { tag: obj.tag, ts: ts(), ...obj };
  try {
    const tag: string = obj.tag;
    if (INFO_TAGS.has(tag)) {
      logger.info(payload);
      return;
    }

    if (tag === "fate:event") {
      const eventType = (obj as any).eventType as string | undefined;
      if (eventType && INFO_EVENT_TYPES.has(eventType)) {
        logger.info(payload);
        return;
      }
      if (FATE_DEBUG) {
        logger.debug(payload);
      }
      return;
    }

    if (tag === "fate:incoming") {
      logger.debug(payload);
      return;
    }

    // default: debug when FATE_DEBUG enabled, otherwise info
    if (FATE_DEBUG) {
      logger.debug(payload);
    } else {
      logger.info(payload);
    }
  } catch (e) {
    try {
      logger.error({ tag: obj.tag ?? "fate:log_error", ts: ts(), message: "fate logging failed", err: String(e) });
    } catch {
      // swallow
    }
  }
}

export function shouldLogFateDebug() {
  return FATE_DEBUG;
}

export default { logFate, shouldLogFateDebug };
