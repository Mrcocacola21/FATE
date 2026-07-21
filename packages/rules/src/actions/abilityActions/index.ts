import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../../model";
import { isInsideBoard } from "../../model";
import type { RNG } from "../../rng";
import {
  ABILITY_ARTEMIDA_SILVER_CRESCENT,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_FALSE_TRAIL_EXPLOSION,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_KAISER_DORA,
  ABILITY_KALADIN_FIFTH,
  ABILITY_LUCHE_DIVINE_RAY,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_POPPINS,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_TRICKSTER_AOE,
  ABILITY_UNDYNE_ENERGY_SPEAR,
  getAbilitySpec,
} from "../../abilities";
import { chebyshev } from "../../board";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_KALADIN_ID } from "../../heroes";
import { commitAbilityCost } from "../abilityCosts";
import { tryApplyDirectAbility } from "./directHandlers";
import { applyTricksterAoEAfterUse } from "./tricksterAoE";
import type { UseAbilityAction } from "./types";

const BLIND_CENTER_RESTRICTED_ABILITIES = new Set<string>([
  ABILITY_ARTEMIDA_SILVER_CRESCENT,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_KAISER_DORA,
  ABILITY_KALADIN_FIFTH,
  ABILITY_LUCHE_DIVINE_RAY,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_POPPINS,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_UNDYNE_ENERGY_SPEAR,
]);

function blindCenterIsLegal(unit: UnitState, action: UseAbilityAction): boolean {
  if (!unit.blindUntilOwnTurnStart || !BLIND_CENTER_RESTRICTED_ABILITIES.has(action.abilityId)) {
    return true;
  }
  const payload = action.payload as Record<string, unknown> | undefined;
  const raw = payload?.center ?? payload?.target ?? payload?.line;
  if (!raw || typeof raw !== "object") return false;
  const coord = raw as { col?: unknown; row?: unknown };
  if (!Number.isInteger(coord.col) || !Number.isInteger(coord.row)) return false;
  return chebyshev(unit.position!, { col: coord.col as number, row: coord.row as number }) <= 1;
}

function getAbilityUserOrNull(
  state: GameState,
  action: UseAbilityAction
): UnitState | null {
  if (state.phase !== "battle") {
    return null;
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return null;
  }
  if (
    unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID &&
    action.abilityId !== ABILITY_FALSE_TRAIL_EXPLOSION
  ) {
    return null;
  }
  if (unit.owner !== state.currentPlayer) {
    return null;
  }
  if (state.activeUnitId !== unit.id) {
    return null;
  }
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
    return null;
  }

  return unit;
}

export function applyUseAbility(
  state: GameState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  const unit = getAbilityUserOrNull(state, action);
  if (!unit) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(action.abilityId);
  if (!spec) {
    return { state, events: [] };
  }
  if (!blindCenterIsLegal(unit, action)) {
    return { state, events: [] };
  }

  const directResult = tryApplyDirectAbility(state, unit, action, rng, spec.id);
  if (directResult) {
    return directResult;
  }

  if (spec.kind === "passive" || spec.kind === "impulse") {
    return { state, events: [] };
  }

  const isTricksterAoE = spec.id === ABILITY_TRICKSTER_AOE;
  const aoeCenter = isTricksterAoE ? unit.position : null;
  if (isTricksterAoE) {
    if (unit.class !== "trickster" && unit.heroId !== HERO_KALADIN_ID) {
      return { state, events: [] };
    }
    if (!aoeCenter || !isInsideBoard(aoeCenter, state.boardSize)) {
      return { state, events: [] };
    }
  }

  const committed = commitAbilityCost(state, unit.id, spec.id);
  if (!committed.ok) {
    return { state, events: [] };
  }

  const updatedUnit: UnitState = committed.unit;
  let nextState: GameState = committed.state;
  const events: GameEvent[] = committed.events;

  if (isTricksterAoE && aoeCenter) {
    const tricksterResult = applyTricksterAoEAfterUse(
      nextState,
      updatedUnit,
      aoeCenter,
      spec.id,
      rng
    );
    return {
      state: tricksterResult.state,
      events: [...events, ...tricksterResult.events],
    };
  }

  return { state: nextState, events };
}
