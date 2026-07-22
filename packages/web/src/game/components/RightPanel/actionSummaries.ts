import type { AbilityView, PlayerView, UnitClass, UnitState } from "rules";
import { FALSE_TRAIL_TOKEN_ID, HASSAN_ID, LECHY_ID, METTATON_ID } from "../../../rulesHints";
import { isActionableAbility } from "./rightPanelHelpers";
import { DEFAULT_ECONOMY } from "./rightPanelConstants";
import type { TurnEconomyState } from "./types";

export type ActionBarState = "available" | "spent" | "blocked" | "not_applicable" | "pending";

export type UnitDetailActionKind = "action" | "move" | "stealth";
export type PublicBattleActionKind = "move" | "attack" | "stealth";

export interface BasicAttackSummary {
  state: ActionBarState;
  damage: number;
  className: UnitClass;
  legalTargetCount?: number;
  reasonKey?: string;
  reasonText?: string;
}

export interface AbilityActionSummary {
  ability: AbilityView;
  state: ActionBarState;
  reasonText?: string;
  reasonKey?: string;
}

export interface UnitActionSummary {
  kind: "action";
  state: ActionBarState;
  reasonKey?: string;
  reasonText?: string;
  basicAttack: BasicAttackSummary | null;
  abilities: AbilityActionSummary[];
}

export interface UnitMoveSummary {
  kind: "move";
  state: ActionBarState;
  reasonKey?: string;
  movementActionsRemaining: number;
  legalMoveCount?: number;
  className?: UnitClass;
  notes: string[];
  abilities: AbilityActionSummary[];
}

export interface UnitStealthSummary {
  kind: "stealth";
  state: ActionBarState;
  reasonKey?: string;
  threshold: number | null;
  alreadyHidden: boolean;
  notes: string[];
  abilities: AbilityActionSummary[];
}

export type UnitDetailActionSummary = UnitActionSummary | UnitMoveSummary | UnitStealthSummary;

export interface PublicBattleActionBar {
  kind: PublicBattleActionKind;
  state: ActionBarState;
}

export interface UnitSummaryParams {
  unit: UnitState | null;
  abilityViews: AbilityView[];
  economy?: TurnEconomyState;
  view?: PlayerView;
  canAct: boolean;
  pendingRoll: boolean;
  attackDisabledReason?: string;
  legalAttackTargetCount?: number;
  legalMoveCount?: number;
}

function getEconomy(unit: UnitState | null, economy?: TurnEconomyState): TurnEconomyState {
  return economy ?? unit?.turn ?? DEFAULT_ECONOMY;
}

function isBattleReady(unit: UnitState | null): unit is UnitState {
  return !!unit && unit.isAlive && !!unit.position;
}

function pendingForUnit(
  unit: UnitState | null,
  view: PlayerView | undefined,
  pendingRoll: boolean,
) {
  return !!(pendingRoll && unit && view?.activeUnitId === unit.id);
}

function isChicken(unit: UnitState | null) {
  return (unit?.lokiChickenSources?.length ?? 0) > 0;
}

function movementBlocked(unit: UnitState | null) {
  return !!(
    unit?.movementDisabledNextTurn ||
    unit?.sansMoveLockArmed ||
    (unit?.kaladinMoveLockSources?.length ?? 0) > 0 ||
    (unit?.lokiMoveLockSources?.length ?? 0) > 0
  );
}

function projectedMovementActionsRemaining(unit: UnitState): number {
  const normalMove = unit.turn.moveUsed || unit.hasMovedThisTurn ? 0 : 1;
  const boatmanMoves = Math.max(0, Math.floor(unit.riverBoatmanExtraMoves ?? 0));
  const flexibleMove =
    unit.courtExtraFlexibleAction && !unit.courtExtraFlexibleAction.used ? 1 : 0;
  return normalMove + boatmanMoves + flexibleMove;
}

function moonBlocksStealth(unit: UnitState | null, view?: PlayerView) {
  const moon = view?.ruleDeclaration?.ruleData?.moonGame;
  return !!(
    unit &&
    view &&
    moon?.noStealthUntilRoundEnd &&
    moon.noStealthUntilRoundEnd >= view.roundNumber
  );
}

function unitBlocksStealth(unit: UnitState | null, view?: PlayerView) {
  return !!(
    unit &&
    view &&
    unit.cannotStealthUntilRoundEnd &&
    unit.cannotStealthUntilRoundEnd >= view.roundNumber
  );
}

export function getProjectedStealthThreshold(unit: UnitState | null): number | null {
  if (!unit || unit.heroId === METTATON_ID) return null;
  if (unit.asgorePatienceStealthActive) return 5;
  if (typeof unit.stealthSuccessMinRoll === "number") return unit.stealthSuccessMinRoll;
  if (unit.heroId === HASSAN_ID) return 4;
  if (unit.heroId === LECHY_ID) return 5;
  if (unit.class === "assassin") return 5;
  if (unit.class === "archer") return 6;
  return null;
}

function hasStealthOption(unit: UnitState | null, abilityViews: AbilityView[]) {
  return (
    !!unit &&
    unit.heroId !== FALSE_TRAIL_TOKEN_ID &&
    (getProjectedStealthThreshold(unit) !== null ||
      abilityViews.some((ability) => isActionableAbility(ability) && ability.slot === "stealth") ||
      !!unit.bunker)
  );
}

function hasPublicStealthOption(unit: UnitState | null | undefined) {
  if (!unit || unit.heroId === FALSE_TRAIL_TOKEN_ID || unit.heroId === METTATON_ID) return false;
  return (
    unit.class === "assassin" ||
    unit.class === "archer" ||
    unit.heroId === HASSAN_ID ||
    unit.heroId === LECHY_ID ||
    !!unit.bunker?.active
  );
}

function abilityState(ability: AbilityView, economy: TurnEconomyState): ActionBarState {
  if (
    (ability.slot === "action" && economy.actionUsed) ||
    (ability.slot === "attack" && (economy.actionUsed || economy.attackUsed)) ||
    (ability.slot === "stealth" && economy.stealthUsed)
  ) {
    return "spent";
  }
  return ability.isAvailable ? "available" : "blocked";
}

function summarizeAbilities(
  abilityViews: AbilityView[],
  economy: TurnEconomyState,
  slots: Set<AbilityView["slot"]>,
): AbilityActionSummary[] {
  return abilityViews
    .filter((ability) => isActionableAbility(ability) && slots.has(ability.slot))
    .map((ability) => ({
      ability,
      state: abilityState(ability, economy),
      reasonText: ability.disabledReason,
    }));
}

export function getUnitActionSummary(params: UnitSummaryParams): UnitActionSummary {
  const {
    unit,
    abilityViews,
    canAct,
    pendingRoll,
    view,
    attackDisabledReason,
    legalAttackTargetCount,
  } = params;
  const economy = getEconomy(unit, params.economy);
  let state: ActionBarState = "available";
  let reasonKey: string | undefined;
  let reasonText: string | undefined;

  if (!isBattleReady(unit) || unit.heroId === FALSE_TRAIL_TOKEN_ID) {
    state = "not_applicable";
  } else if (pendingForUnit(unit, view, pendingRoll)) {
    state = "pending";
    reasonKey = "actionUi.pendingBlocking";
  } else if (economy.actionUsed || economy.attackUsed) {
    state = "spent";
    reasonKey = "actionUi.actionAlreadySpent";
  } else if (isChicken(unit)) {
    state = "blocked";
    reasonKey = "game.chickenMoveOnly";
  } else if (!canAct) {
    state = "blocked";
    reasonKey = "game.notActiveUnit";
  }

  let basicAttack: BasicAttackSummary | null = null;
  if (unit && unit.heroId !== FALSE_TRAIL_TOKEN_ID) {
    let basicState = state;
    let basicReasonKey = reasonKey;
    let basicReasonText = reasonText;
    if (state === "available" && attackDisabledReason) {
      basicState = "blocked";
      basicReasonText = attackDisabledReason;
    } else if (
      state === "available" &&
      legalAttackTargetCount !== undefined &&
      legalAttackTargetCount <= 0
    ) {
      basicState = "blocked";
      basicReasonKey = "actionUi.targetRequired";
    }
    basicAttack = {
      state: basicState,
      damage: unit.attack,
      className: unit.class,
      legalTargetCount: legalAttackTargetCount,
      reasonKey: basicReasonKey,
      reasonText: basicReasonText,
    };
  }

  return {
    kind: "action",
    state,
    reasonKey,
    reasonText,
    basicAttack,
    abilities: summarizeAbilities(abilityViews, economy, new Set(["action", "attack"])),
  };
}

export function getUnitMoveSummary(params: UnitSummaryParams): UnitMoveSummary {
  const { unit, abilityViews, canAct, pendingRoll, view, legalMoveCount } = params;
  const economy = getEconomy(unit, params.economy);
  const notes: string[] = [];
  let state: ActionBarState = "available";
  let reasonKey: string | undefined;
  const movementActionsRemaining = unit
    ? view?.activeUnitId === unit.id && view.legalIntents
      ? view.legalIntents.movementActionsRemaining
      : projectedMovementActionsRemaining(unit)
    : 0;

  if (!isBattleReady(unit)) {
    state = "not_applicable";
  } else if (pendingForUnit(unit, view, pendingRoll)) {
    state = "pending";
    reasonKey = "actionUi.pendingBlocking";
  } else if (movementActionsRemaining <= 0) {
    state = "spent";
    reasonKey = "game.moveSlotUsed";
  } else if (movementBlocked(unit)) {
    state = "blocked";
    reasonKey = "actionUi.movementBlocked";
  } else if (!canAct) {
    state = "blocked";
    reasonKey = "game.notActiveUnit";
  }

  if (unit?.genghisKhanDiagonalMoveActive) notes.push("actionUi.diagonalMoveActive");
  if (unit?.genghisKhanDecreeMovePending) notes.push("actionUi.decreeMovePending");
  if (unit?.courtGlobalMoveOnce && !unit.courtGlobalMoveOnce.used) {
    notes.push("actionUi.courtGlobalMove");
  }
  if (view?.ruleDeclaration?.selectedRuleId === "moon_game" && view.ruleDeclaration.setupComplete) {
    notes.push("actionUi.moonMoveBonus");
  }
  if (unit?.sansBoneFieldStatus?.kind === "blue") notes.push("actionUi.blueBoneMoveWarning");

  return {
    kind: "move",
    state,
    reasonKey,
    movementActionsRemaining,
    legalMoveCount,
    className: unit?.class,
    notes,
    abilities: summarizeAbilities(abilityViews, economy, new Set(["move"])),
  };
}

export function getUnitStealthSummary(params: UnitSummaryParams): UnitStealthSummary {
  const { unit, abilityViews, canAct, pendingRoll, view } = params;
  const economy = getEconomy(unit, params.economy);
  const threshold = getProjectedStealthThreshold(unit);
  const notes: string[] = [];
  let state: ActionBarState = "available";
  let reasonKey: string | undefined;

  if (!isBattleReady(unit) || !hasStealthOption(unit, abilityViews)) {
    state = "not_applicable";
    reasonKey = "actionUi.cannotEnterStealth";
  } else if (pendingForUnit(unit, view, pendingRoll)) {
    state = "pending";
    reasonKey = "actionUi.pendingBlocking";
  } else if (economy.stealthUsed) {
    state = "spent";
    reasonKey = "game.stealthSlotUsed";
  } else if (isChicken(unit)) {
    state = "blocked";
    reasonKey = "game.chickenMoveOnly";
  } else if (moonBlocksStealth(unit, view) || unitBlocksStealth(unit, view)) {
    state = "blocked";
    reasonKey = "actionUi.cannotEnterStealth";
  } else if (!canAct) {
    state = "blocked";
    reasonKey = "game.notActiveUnit";
  }

  if (unit?.isStealthed) notes.push("actionUi.alreadyHidden");
  if (unit?.isStealthed) notes.push("actionUi.attackRevealsStealth");
  if (unit?.bunker?.active) notes.push("actionUi.bunkerActive");
  if (moonBlocksStealth(unit, view)) notes.push("ruleDeclarations.moonNoStealth");
  if (unitBlocksStealth(unit, view)) notes.push("actionUi.courtExposure");

  return {
    kind: "stealth",
    state,
    reasonKey,
    threshold,
    alreadyHidden: !!unit?.isStealthed,
    notes,
    abilities: summarizeAbilities(abilityViews, economy, new Set(["stealth"])),
  };
}

export function getUnitDetailActionBars(params: UnitSummaryParams): UnitDetailActionSummary[] {
  return [getUnitActionSummary(params), getUnitMoveSummary(params), getUnitStealthSummary(params)];
}

function publicSlotState(
  unit: UnitState | null | undefined,
  used: boolean,
  pending: boolean,
  applicable = true,
): ActionBarState {
  if (!unit || !unit.isAlive || !unit.position || !applicable) return "not_applicable";
  if (pending) return "pending";
  return used ? "spent" : "available";
}

export function getPublicBattleActionBars(
  unit: UnitState | null | undefined,
  view?: PlayerView,
  pendingRoll = false,
): PublicBattleActionBar[] {
  const economy = unit?.turn ?? DEFAULT_ECONOMY;
  const pending = !!(pendingRoll && unit && view?.activeUnitId === unit.id);
  const stealthApplicable = hasPublicStealthOption(unit);
  const movementActionsRemaining = unit ? projectedMovementActionsRemaining(unit) : 0;
  return [
    { kind: "move", state: publicSlotState(unit, movementActionsRemaining <= 0, pending) },
    {
      kind: "attack",
      state: publicSlotState(unit, economy.actionUsed || economy.attackUsed, pending),
    },
    {
      kind: "stealth",
      state: publicSlotState(unit, economy.stealthUsed, pending, stealthApplicable),
    },
  ];
}
