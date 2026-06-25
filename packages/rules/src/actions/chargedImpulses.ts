import type {
  ApplyResult,
  Coord,
  GameState,
  PendingRoll,
  ResolveRollChoice,
  UnitState,
} from "../model";
import {
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_UNDYNE_ENERGY_SPEAR,
  getAbilitySpec,
  getCharges,
} from "../abilities";
import {
  HERO_PAPYRUS_ID,
  HERO_SANS_ID,
  HERO_UNDYNE_ID,
} from "../heroes";
import { clearPendingRoll, requestRoll } from "../core";
import { hasUndyneImmortalActive, isUndyneLineAxis } from "../undyne";
import { applySansGasterBlaster } from "./heroes/sans";
import { applyUndyneEnergySpear } from "./heroes/undyne";
import { applyPapyrusCoolGuy } from "./heroes/papyrus";
import {
  getPapyrusCoolGuyCost,
  isLineAxis,
} from "./heroes/papyrus/helpers";

function allBoardCells(state: GameState): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      cells.push({ col, row });
    }
  }
  return cells;
}

function allLineCells(state: GameState, unit: UnitState): Coord[] {
  if (!unit.position) return [];
  const cells: Coord[] = [];
  const directions = [-1, 0, 1]
    .flatMap((col) => [-1, 0, 1].map((row) => ({ col, row })))
    .filter((direction) => direction.col !== 0 || direction.row !== 0);
  for (const direction of directions) {
    let col = unit.position.col + direction.col;
    let row = unit.position.row + direction.row;
    while (
      col >= 0 &&
      col < state.boardSize &&
      row >= 0 &&
      row < state.boardSize
    ) {
      cells.push({ col, row });
      col += direction.col;
      row += direction.row;
    }
  }
  return cells;
}

function getReadyImpulseAbilityId(unit: UnitState): string | null {
  if (unit.heroId === HERO_SANS_ID) {
    const spec = getAbilitySpec(ABILITY_SANS_GASTER_BLASTER);
    const required = spec?.chargesPerUse ?? spec?.chargeCost ?? 0;
    return required > 0 &&
      getCharges(unit, ABILITY_SANS_GASTER_BLASTER) >= required
      ? ABILITY_SANS_GASTER_BLASTER
      : null;
  }
  if (unit.heroId === HERO_PAPYRUS_ID) {
    return getCharges(unit, ABILITY_PAPYRUS_COOL_GUY) >=
      getPapyrusCoolGuyCost(unit)
      ? ABILITY_PAPYRUS_COOL_GUY
      : null;
  }
  if (unit.heroId === HERO_UNDYNE_ID) {
    const spec = getAbilitySpec(ABILITY_UNDYNE_ENERGY_SPEAR);
    const required = spec?.chargesPerUse ?? spec?.chargeCost ?? 0;
    return hasUndyneImmortalActive(unit) ||
      (required > 0 &&
        getCharges(unit, ABILITY_UNDYNE_ENERGY_SPEAR) >= required)
      ? ABILITY_UNDYNE_ENERGY_SPEAR
      : null;
  }
  return null;
}

export function maybeTriggerChargedImpulseChoice(
  state: GameState,
  unitId: string
): ApplyResult {
  if (state.pendingRoll) return { state, events: [] };
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  const abilityId = getReadyImpulseAbilityId(unit);
  if (!abilityId) return { state, events: [] };

  const options =
    abilityId === ABILITY_SANS_GASTER_BLASTER
      ? allLineCells(state, unit)
      : allBoardCells(state);
  if (options.length === 0) return { state, events: [] };

  return requestRoll(
    state,
    unit.owner,
    "chargedImpulseTargetChoice",
    { unitId: unit.id, abilityId, options },
    unit.id
  );
}

export function resolveChargedImpulseTargetChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  if (
    !choice ||
    typeof choice !== "object" ||
    choice.type !== "chargedImpulseTarget"
  ) {
    return { state, events: [] };
  }
  const unitId =
    typeof pending.context.unitId === "string" ? pending.context.unitId : "";
  const abilityId =
    typeof pending.context.abilityId === "string"
      ? pending.context.abilityId
      : "";
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state: clearPendingRoll(state), events: [] };
  }
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as Coord[])
    : [];
  const target = choice.position;
  if (
    !options.some(
      (option) => option.col === target.col && option.row === target.row
    )
  ) {
    return { state, events: [] };
  }

  const baseState = clearPendingRoll(state);
  if (abilityId === ABILITY_SANS_GASTER_BLASTER) {
    const stepCol = Math.sign(target.col - unit.position.col);
    const stepRow = Math.sign(target.row - unit.position.row);
    const directionTarget = {
      col: unit.position.col + stepCol,
      row: unit.position.row + stepRow,
    };
    return applySansGasterBlaster(baseState, unit, {
      type: "useAbility",
      unitId: unit.id,
      abilityId,
      payload: { target: directionTarget },
    });
  }
  if (abilityId === ABILITY_PAPYRUS_COOL_GUY) {
    const axis = isLineAxis(choice.axis)
      ? choice.axis
      : unit.papyrusLineAxis ?? "row";
    return applyPapyrusCoolGuy(baseState, unit, {
      type: "useAbility",
      unitId: unit.id,
      abilityId,
      payload: { target, axis },
    });
  }
  if (abilityId === ABILITY_UNDYNE_ENERGY_SPEAR) {
    const axis = isUndyneLineAxis(choice.axis) ? choice.axis : "row";
    return applyUndyneEnergySpear(baseState, unit, {
      type: "useAbility",
      unitId: unit.id,
      abilityId,
      payload: { target, axis },
    });
  }
  return { state: clearPendingRoll(state), events: [] };
}
