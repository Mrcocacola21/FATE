import type { Prisma } from "@prisma/client";
import type { GameEvent, PlayerId } from "rules";
import { GameActionSchema } from "../schemas";
import type { ActionLogEntry, GameRoom } from "../store";

export type DraftAction = { type: "draftStarted" | "draftBanHero" | "draftPickHero"; player: PlayerId; heroId?: string };
export interface AcceptedActionRecord {
  matchId: string;
  revision: number;
  actorUserId: string | null;
  actorSeat: PlayerId | null;
  actionType: string;
  actionPayload: Prisma.InputJsonObject;
  events: Prisma.InputJsonValue[];
  createdAt: Date;
}

// Ability payloads are extensible domain JSON. Strip credentials recursively,
// including nested passthrough fields, rather than storing the WS envelope.
const excluded = new Set([
  "accesstoken", "refreshtoken", "resumetoken", "authorization", "cookie", "cookies",
  "password", "passwordhash", "connid", "connectionid", "socketid", "roomid", "userid", "ip",
  "requestmetadata", "requestid", "authsession", "authcookie", "authcookies", "headers", "chainid", "visualbatchid",
  "ischaincomplete", "defervisuals",
]);
function jsonValue(value: unknown, depth = 0): Prisma.InputJsonValue | null {
  if (depth > 64) throw new Error("MATCH_ACTION_INVALID_JSON");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map((item) => jsonValue(item, depth + 1));
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([key, item]) => item !== undefined && !excluded.has(key.replace(/[_-]/g, "").toLowerCase()))
      .map(([key, item]) => [key, jsonValue(item, depth + 1)]);
    return Object.fromEntries(entries);
  }
  throw new Error("MATCH_ACTION_INVALID_JSON");
}

export function toPersistedAction(action: ActionLogEntry["action"]): Prisma.InputJsonObject {
  if (["draftStarted", "draftBanHero", "draftPickHero"].includes(action.type)) {
    const draft = action as DraftAction;
    return { type: draft.type, player: draft.player, ...(draft.heroId ? { heroId: draft.heroId } : {}) };
  }
  return jsonValue(GameActionSchema.parse(action)) as Prisma.InputJsonObject;
}

export function toPersistedEvents(events: GameEvent[]): Prisma.InputJsonValue[] {
  return events.filter((event) => event.type !== "combatVisualBatchReady")
    .map((event) => jsonValue(event) as Prisma.InputJsonValue);
}

export function toAcceptedActionRecord(room: GameRoom, entry: ActionLogEntry): AcceptedActionRecord | null {
  if (!room.matchId || room.roomMode === "test" || ["setReady", "lobbyInit"].includes(entry.action.type)) return null;
  return {
    matchId: room.matchId,
    revision: entry.revision,
    actorUserId: entry.playerId ? room.seatIdentities[entry.playerId]?.userId ?? null : null,
    actorSeat: entry.playerId ?? null,
    actionType: entry.action.type,
    actionPayload: toPersistedAction(entry.action),
    events: toPersistedEvents(entry.events),
    createdAt: new Date(entry.at),
  };
}
