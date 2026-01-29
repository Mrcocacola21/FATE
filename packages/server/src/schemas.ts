// packages/server/src/schemas.ts

import { z } from "zod";

export const PlayerIdSchema = z.union([z.literal("P1"), z.literal("P2")]);
export const RoleSchema = z.union([
  z.literal("P1"),
  z.literal("P2"),
  z.literal("spectator"),
]);

export const CoordSchema = z.object({
  col: z.number().int(),
  row: z.number().int(),
});

export const MoveModeSchema = z.union([
  z.literal("normal"),
  z.literal("spearman"),
  z.literal("rider"),
  z.literal("knight"),
  z.literal("archer"),
  z.literal("trickster"),
  z.literal("assassin"),
  z.literal("berserker"),
]);

export const CreateGameBodySchema = z.object({
  seed: z.number().int().optional(),
  arenaId: z.string().optional(),
});

export const FigureSetSelectionSchema = z
  .object({
    assassin: z.string(),
    archer: z.string(),
    berserker: z.string(),
    rider: z.string(),
    spearman: z.string(),
    trickster: z.string(),
    knight: z.string(),
  })
  .partial();

const ResolveRollChoiceSchema = z.union([
  z.literal("auto"),
  z.literal("roll"),
  z.literal("skip"),
  z.literal("activate"),
  z.object({
    type: z.literal("intimidatePush"),
    to: CoordSchema,
  }),
  z.object({
    type: z.literal("placeStakes"),
    positions: z.array(CoordSchema).length(3),
  }),
  z.object({
    type: z.literal("forestTarget"),
    center: CoordSchema,
  }),
]);

export const GameActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("rollInitiative") }),
  z.object({ type: z.literal("chooseArena"), arenaId: z.string() }),
  z.object({ type: z.literal("lobbyInit"), host: PlayerIdSchema }),
  z.object({
    type: z.literal("setReady"),
    player: PlayerIdSchema,
    ready: z.boolean(),
  }),
  z.object({ type: z.literal("startGame") }),
  z.object({
    type: z.literal("placeUnit"),
    unitId: z.string(),
    position: CoordSchema,
  }),
  z.object({ type: z.literal("move"), unitId: z.string(), to: CoordSchema }),
  z.object({
    type: z.literal("requestMoveOptions"),
    unitId: z.string(),
    mode: MoveModeSchema.optional(),
  }),
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
  z.object({
    type: z.literal("resolvePendingRoll"),
    pendingRollId: z.string().min(1),
    choice: ResolveRollChoiceSchema.optional(),
    player: PlayerIdSchema.optional(),
  }),
  z.object({ type: z.literal("endTurn") }),
  z.object({ type: z.literal("unitStartTurn"), unitId: z.string() }),
]);

export type GameActionInput = z.infer<typeof GameActionSchema>;

export const JoinRoomMessageSchema = z.object({
  type: z.literal("joinRoom"),
  mode: z.union([z.literal("create"), z.literal("join")]),
  roomId: z.string().min(1).optional(),
  role: RoleSchema,
  name: z.string().min(1).optional(),
  figureSet: FigureSetSelectionSchema.optional(),
});

export const ActionMessageSchema = z.object({
  type: z.literal("action"),
  action: GameActionSchema,
});

export const RequestMoveOptionsMessageSchema = z.object({
  type: z.literal("requestMoveOptions"),
  unitId: z.string(),
  mode: MoveModeSchema.optional(),
});

export const SetReadyMessageSchema = z.object({
  type: z.literal("setReady"),
  ready: z.boolean(),
});

export const StartGameMessageSchema = z.object({
  type: z.literal("startGame"),
});

export const ResolvePendingRollMessageSchema = z.object({
  type: z.literal("resolvePendingRoll"),
  pendingRollId: z.string().min(1),
  choice: ResolveRollChoiceSchema.optional(),
});

export const LeaveRoomMessageSchema = z.object({
  type: z.literal("leaveRoom"),
});

export const SwitchRoleMessageSchema = z.object({
  type: z.literal("switchRole"),
  role: RoleSchema,
});

// Pong messages
export const PongJoinMessageSchema = z.object({
  type: z.literal("pongJoin"),
  roomId: z.string().min(1),
  role: RoleSchema,
  name: z.string().min(1).optional(),
});

export const PongInputMessageSchema = z.object({
  type: z.literal("pongInput"),
  dir: z.union([z.literal("up"), z.literal("down"), z.literal("stop")]),
});

export const PongStartMessageSchema = z.object({ type: z.literal("pongStart") });

export const PongResetMessageSchema = z.object({ type: z.literal("pongReset") });

export const ClientMessageSchema = z.discriminatedUnion("type", [
  JoinRoomMessageSchema,
  ActionMessageSchema,
  RequestMoveOptionsMessageSchema,
  SetReadyMessageSchema,
  StartGameMessageSchema,
  ResolvePendingRollMessageSchema,
  LeaveRoomMessageSchema,
  SwitchRoleMessageSchema,
  PongJoinMessageSchema,
  PongInputMessageSchema,
  PongStartMessageSchema,
  PongResetMessageSchema,
]);
