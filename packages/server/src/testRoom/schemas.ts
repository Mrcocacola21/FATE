import { z } from "zod";

const PlayerIdSchema = z.enum(["P1", "P2"]);
const CoordSchema = z.object({
  col: z.number().int().min(0).max(50),
  row: z.number().int().min(0).max(50),
});

const UnitIdSchema = z.string().min(1).max(160);
const HeroIdSchema = z.string().min(1).max(120);
const RuleDeclarationIdSchema = z.enum([
  "normal_rule",
  "court",
  "chess_party",
  "moon_game",
  "advantage_game",
]);

const DebugStateCommandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("debugSpawnUnit"),
    heroId: HeroIdSchema,
    owner: PlayerIdSchema,
    coord: CoordSchema,
    options: z
      .object({
        hp: z.number().int().min(0).max(99).optional(),
        stealthed: z.boolean().optional(),
        transformed: z.boolean().optional(),
        charges: z.enum(["empty", "full"]).optional(),
      })
      .optional(),
  }),
  z.object({ type: z.literal("debugRemoveUnit"), unitId: UnitIdSchema }),
  z.object({
    type: z.literal("debugMoveUnit"),
    unitId: UnitIdSchema,
    to: CoordSchema,
  }),
  z.object({
    type: z.literal("debugSetHp"),
    unitId: UnitIdSchema,
    hp: z.number().int().min(0).max(99),
  }),
  z.object({
    type: z.literal("debugDirectDamage"),
    unitId: UnitIdSchema,
    amount: z.number().int().min(0).max(99),
  }),
  z.object({
    type: z.literal("debugSetCharges"),
    unitId: UnitIdSchema,
    abilityId: z.string().min(1).max(160).optional(),
    value: z.number().int().min(-99).max(99).optional(),
    mode: z.enum(["set", "add", "fill", "clear"]),
  }),
  z.object({
    type: z.literal("debugSetStatus"),
    unitId: UnitIdSchema,
    status: z.enum([
      "isStealthed",
      "movementDisabledNextTurn",
      "transformed",
      "bunker",
      "gutsBerserkModeActive",
      "papyrusUnbelieverActive",
      "sansUnbelieverUnlocked",
      "mettatonExUnlocked",
      "mettatonNeoUnlocked",
      "undyneImmortalActive",
      "chicken",
    ]),
    value: z.boolean(),
  }),
  z.object({
    type: z.literal("debugSetOwner"),
    unitId: UnitIdSchema,
    owner: PlayerIdSchema,
  }),
  z.object({
    type: z.literal("debugSetMarkedTarget"),
    sourceUnitId: UnitIdSchema,
    targetUnitId: UnitIdSchema,
    value: z.boolean(),
  }),
  z.object({
    type: z.literal("debugSetTurn"),
    player: PlayerIdSchema,
    unitId: UnitIdSchema.nullable().optional(),
  }),
  z.object({
    type: z.literal("debugSetPhase"),
    phase: z.enum(["lobby", "placement", "battle", "ended"]),
  }),
  z.object({
    type: z.literal("debugResetActions"),
    unitId: UnitIdSchema.optional(),
  }),
  z.object({ type: z.literal("debugClearPendingRoll") }),
  z.object({
    type: z.literal("debugSetRuleDeclaration"),
    ruleId: RuleDeclarationIdSchema,
    chooserPlayer: PlayerIdSchema.optional(),
    threshold: z.number().int().min(3).max(50).optional(),
  }),
  z.object({
    type: z.literal("debugAddMarker"),
    marker: z.object({
      kind: z.enum(["stake", "forest"]),
      owner: PlayerIdSchema,
      coord: CoordSchema,
      revealed: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal("debugRemoveMarker"),
    kind: z.enum(["stake", "forest"]),
    markerId: z.string().min(1).max(160).optional(),
    coord: CoordSchema.optional(),
  }),
  z.object({ type: z.literal("debugClearMarkers") }),
  z.object({ type: z.literal("debugClearBoard") }),
  z.object({
    type: z.literal("debugApplyPreset"),
    presetId: z.enum([
      "empty",
      "basic-duel",
      "aoe-cluster",
      "line-attack",
      "rider-path",
      "stake-trigger",
      "stealth-reveal",
      "transformation",
      "impulse",
      "healing-status",
    ]),
  }),
]);

export const TestRoomCommandSchema = z.discriminatedUnion("type", [
  ...DebugStateCommandSchema.options,
  z.object({
    type: z.literal("debugSetDiceQueue"),
    values: z.array(z.number().int().min(1).max(6)).max(100),
  }),
  z.object({ type: z.literal("debugClearDiceQueue") }),
  z.object({
    type: z.literal("debugSimulateStartTurn"),
    unitId: UnitIdSchema,
  }),
  z.object({
    type: z.literal("debugTriggerRuleRoundEnd"),
    rolls: z.array(z.number().int().min(1).max(6)).max(12).optional(),
  }),
  z.object({ type: z.literal("debugDeleteRoom") }),
  z.object({ type: z.literal("debugExportSnapshot") }),
  z.object({
    type: z.literal("debugImportSnapshot"),
    snapshot: z.unknown(),
  }),
]);

export const TestRoomCommandMessageSchema = z.object({
  type: z.literal("testRoomCommand"),
  command: TestRoomCommandSchema,
});

export type TestRoomCommand = z.infer<typeof TestRoomCommandSchema>;
