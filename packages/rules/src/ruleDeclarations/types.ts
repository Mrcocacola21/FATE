import type { Coord, PlayerId } from "../model/shared";

export type RuleDeclarationId =
  | "normal_rule"
  | "court"
  | "chess_party"
  | "moon_game"
  | "advantage_game";

export type CourtSide = "attacker" | "defender";

export type CourtEffectId =
  | "judicialManeuver"
  | "escortTransfer"
  | "detention"
  | "damageCompensation"
  | "crimeScene"
  | "maximumSentence"
  | "proceduralRestrictions"
  | "forcedAppearance"
  | "falseAlibi"
  | "courtCosts"
  | "exposure"
  | "sentenceAnnulment";

export type MoonEffectId =
  | "lunarEclipse"
  | "meteorFall"
  | "crater"
  | "cheeseHoles"
  | "hollywoodShooting"
  | "tideChange";

export interface RuleHookContext {
  targetRound?: number;
}

export type RuleHook = (context: RuleHookContext) => unknown;

export type RuleDeclarationConfig = {
  id: RuleDeclarationId;
  nameKey: string;
  descriptionKey: string;
  timingKey: string;
  requiresSetup?: boolean;
  onBattleStart?: RuleHook;
  onRoundEnd?: RuleHook;
  onDamage?: RuleHook;
  onUnitDeath?: RuleHook;
  modifiesMovement?: RuleHook;
  modifiesTurnOrder?: RuleHook;
};

export type CourtState = {
  attackerPlayer: PlayerId;
  defenderPlayer: PlayerId;
  attackerRoll?: number;
  defenderRoll?: number;
  pendingEffects?: CourtPendingEffect[];
};

export type CourtPendingEffect = {
  side: CourtSide;
  player: PlayerId;
  roll: number;
  effectId: CourtEffectId;
};

export type ChessPartyState = {
  kings: {
    P1: string | null;
    P2: string | null;
  };
};

export type MoonGameState = {
  crater?: {
    center: Coord;
    radius: number;
    expiresAtRoundStart: number;
  } | null;
  noStealthUntilRoundEnd?: number | null;
  reverseTurnOrderUntilRoundEnd?: number | null;
  cheeseHoles?: {
    choices: Partial<Record<PlayerId, string>>;
  } | null;
};

export type AdvantageGameState = {
  threshold: number | null;
};

export type PendingRoundAdvance = {
  nextRoundNumber: number;
  nextTurnNumber: number;
  nextIndex: number;
  nextUnitId: string;
  nextPlayer: PlayerId;
};

export type RuleDeclarationData = {
  court?: CourtState;
  chessParty?: ChessPartyState;
  moonGame?: MoonGameState;
  advantageGame?: AdvantageGameState;
  pendingRoundAdvance?: PendingRoundAdvance | null;
  [key: string]: unknown;
};

export type RuleDeclarationState = {
  selectedRuleId: RuleDeclarationId | null;
  chooserPlayer: PlayerId | null;
  setupComplete: boolean;
  ruleData: RuleDeclarationData;
};

export type RuleChoice = {
  type: "chooseRuleDeclaration";
  ruleId: RuleDeclarationId;
};

export type RuleThresholdChoice = {
  type: "ruleThreshold";
  threshold: number;
};

export type RuleUnitChoice = {
  type: "ruleUnit";
  unitId: string;
};

export type RuleCellChoice = {
  type: "ruleCell";
  position: Coord;
};

export type RuleChargeChoice = {
  type: "ruleCharge";
  abilityId: string;
};

export type RuleDeclarationChoice =
  | RuleChoice
  | RuleThresholdChoice
  | RuleUnitChoice
  | RuleCellChoice
  | RuleChargeChoice;

export const RULE_DECLARATION_IDS = [
  "normal_rule",
  "court",
  "chess_party",
  "moon_game",
  "advantage_game",
] as const satisfies readonly RuleDeclarationId[];

export function isRuleDeclarationId(
  value: unknown
): value is RuleDeclarationId {
  return (
    typeof value === "string" &&
    (RULE_DECLARATION_IDS as readonly string[]).includes(value)
  );
}
