import {
  applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  type GameState,
  type PlayerId,
  type RNG,
} from "rules";
import { z } from "zod";
import { LobbyNameSchema } from "../lobby/metadata";

/** Creation inputs only; never sockets, identities or a serialized whole state. */
export const initialConfigSchema = z
  .object({
    lobbyName: LobbyNameSchema.optional(),
    origin: z.enum(["MANUAL", "MATCHMAKING"]).optional(),
    formatVersion: z.literal(1),
    rngAlgorithm: z.literal("lcg32-numerical-recipes-v1"),
    gameMode: z.enum(["standard", "classic", "draft"]),
    hostSeat: z.enum(["P1", "P2"]),
    hostOccupied: z.boolean(),
    arenaId: z.string().nullable(),
  })
  .strict();
export type InitialMatchConfig = z.infer<typeof initialConfigSchema>;

/** Same revision-zero domain state for live creation and historical replay. */
export function createInitialMatchState(config: InitialMatchConfig, rng: RNG): GameState {
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  state = applyAction(state, { type: "lobbyInit", host: config.hostSeat }, rng).state;
  const seats: Record<PlayerId, boolean> = { P1: false, P2: false };
  seats[config.hostSeat] = config.hostOccupied;
  return { ...state, seats, arenaId: config.arenaId };
}
