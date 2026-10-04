import type { MatchAction } from "@prisma/client";
import type { GameAction } from "rules";
import { z } from "zod";
import { isDeepStrictEqual } from "node:util";
import { GameActionSchema } from "../schemas";
import { replaySetupSchema, type ReplaySetup } from "./actionSetup";
import { ReplayError } from "./replayError";

const draftSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("draftStarted"), player: z.enum(["P1", "P2"]) }).strict(),
  z
    .object({
      type: z.literal("draftBanHero"),
      player: z.enum(["P1", "P2"]),
      heroId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("draftPickHero"),
      player: z.enum(["P1", "P2"]),
      heroId: z.string().min(1),
    })
    .strict(),
  z
    .object({
      type: z.literal("setGameMode"),
      player: z.enum(["P1", "P2"]),
      gameMode: z.enum(["standard", "classic", "draft"]),
    })
    .strict(),
]);
export type ReplayAction = GameAction | z.infer<typeof draftSchema>;

export function deserializeReplayAction(
  row: Pick<MatchAction, "matchId" | "revision" | "actionPayload" | "actionType" | "actorSeat">,
): {
  action: ReplayAction;
  setup?: ReplaySetup;
} {
  const fail = (
    code: "INVALID_ACTION_LOG" | "UNSUPPORTED_ACTION_FORMAT" = "INVALID_ACTION_LOG",
  ): never => {
    throw new ReplayError(code, { matchId: row.matchId, revision: row.revision });
  };
  if (!Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision > 2147483647) fail();
  const payload = row.actionPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return fail();
  const { _replay, ...rawAction } = payload;
  if (rawAction.type !== row.actionType || ["lobbyInit"].includes(row.actionType)) return fail();
  let setup: ReplaySetup | undefined;
  if (_replay !== undefined) {
    if (!_replay || typeof _replay !== "object" || Array.isArray(_replay)) return fail();
    if (_replay.formatVersion !== 1) return fail("UNSUPPORTED_ACTION_FORMAT");
    const parsed = replaySetupSchema.safeParse(_replay);
    if (!parsed.success) return fail();
    setup = parsed.data;
  }
  const parsed =
    row.actionType.startsWith("draft") || row.actionType === "setGameMode"
      ? draftSchema.safeParse(rawAction)
      : GameActionSchema.safeParse(rawAction);
  if (!parsed.success) return fail();
  // Reject erased/unknown fields; ability payload itself remains extensible domain JSON.
  const action = parsed.data;
  if (!isDeepStrictEqual(rawAction, action)) return fail();
  if ("player" in action && action.player !== row.actorSeat) return fail();
  if (row.actorSeat !== null && row.actorSeat !== "P1" && row.actorSeat !== "P2") return fail();
  if (action.type === "resolvePendingRoll") {
    if (!action.player) return fail();
    return { action: { ...action, player: action.player }, setup };
  }
  return { action, setup };
}
