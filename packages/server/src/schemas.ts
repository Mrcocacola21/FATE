// packages/server/src/schemas.ts

import { z } from "zod";

export const PlayerIdSchema = z.union([z.literal("P1"), z.literal("P2")]);

export const CoordSchema = z.object({
  col: z.number().int(),
  row: z.number().int(),
});

export const CreateGameBodySchema = z.object({
  seed: z.number().int().optional(),
  arenaId: z.string().optional(),
});

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rollInitiative") }),
  z.object({ type: z.literal("chooseArena"), arenaId: z.string() }),
  z.object({
    type: z.literal("placeUnit"),
    unitId: z.string(),
    position: CoordSchema,
  }),
  z.object({ type: z.literal("move"), unitId: z.string(), to: CoordSchema }),
  z.object({
    type: z.literal("attack"),
    attackerId: z.string(),
    defenderId: z.string(),
    defenderUseBerserkAutoDefense: z.boolean().optional(),
  }),
  z.object({ type: z.literal("enterStealth"), unitId: z.string() }),
  z.object({
    type: z.literal("searchStealth"),
    unitId: z.string(),
    mode: z.union([z.literal("action"), z.literal("move")]),
  }),
  z.object({
    type: z.literal("useAbility"),
    unitId: z.string(),
    abilityId: z.string(),
    payload: z.unknown().optional(),
  }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("unitStartTurn"), unitId: z.string() }),
]);

export type GameActionInput = z.infer<typeof GameActionSchema>;
