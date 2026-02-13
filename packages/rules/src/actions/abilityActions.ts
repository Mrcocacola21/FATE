import type { ApplyResult, GameAction, GameEvent, GameState, UnitState } from "../model";
import type { RNG } from "../rng";
import { isInsideBoard } from "../model";
import { resolveAoE } from "../aoe";
import {
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_ENGINEERING_MIRACLE,
  ABILITY_TRICKSTER_AOE,
  ABILITY_EL_SID_COMPEADOR_TISONA,
  ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST,
  ABILITY_EL_SID_COMPEADOR_KOLADA,
  ABILITY_GENGHIS_KHAN_KHANS_DECREE,
  ABILITY_GENGHIS_KHAN_MONGOL_CHARGE,
  ABILITY_CHIKATILO_ASSASSIN_MARK,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_FALSE_TRAIL_EXPLOSION,
  ABILITY_LECHY_CONFUSE_TERRAIN,
  ABILITY_LECHY_GUIDE_TRAVELER,
  ABILITY_LECHY_STORM,
  ABILITY_GROZNY_INVADE_TIME,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
  spendCharges,
} from "../abilities";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { requestRoll } from "../shared/rollUtils";
import { evAbilityUsed, evAoeResolved } from "../shared/events";
import { applyKaiserDora } from "./heroes/kaiser";
import { applyElCidDemonDuelist, applyElCidTisona } from "./heroes/elCid";
import { applyKhansDecree, applyMongolCharge } from "./heroes/genghisKhan";
import { applyGroznyInvadeTime } from "./heroes/grozny";
import { HERO_FALSE_TRAIL_TOKEN_ID } from "../heroes";
import {
  applyChikatiloAssassinMark,
  applyChikatiloDecoyStealth,
  applyFalseTrailExplosion,
} from "./heroes/chikatilo";
import {
  applyLechyGuideTraveler,
  applyLechyStorm,
} from "./heroes/lechy";
import type { TricksterAoEContext } from "./types";

export function applyUseAbility(
  state: GameState,
  action: Extract<GameAction, { type: "useAbility" }>,
  rng: RNG
): ApplyResult {
  if (state.phase !== "battle") {
    return { state, events: [] };
  }

  const unit = state.units[action.unitId];
  if (!unit || !unit.isAlive || !unit.position) {
    return { state, events: [] };
  }
  if (
    unit.heroId === HERO_FALSE_TRAIL_TOKEN_ID &&
    action.abilityId !== ABILITY_FALSE_TRAIL_EXPLOSION
  ) {
    return { state, events: [] };
  }

  if (unit.owner !== state.currentPlayer) {
    return { state, events: [] };
  }

  if (state.activeUnitId !== unit.id) {
    return { state, events: [] };
  }

  const spec = getAbilitySpec(action.abilityId);
  if (!spec) {
    return { state, events: [] };
  }

  if (spec.id === ABILITY_KAISER_DORA) {
    return applyKaiserDora(state, unit, action, rng);
  }

  if (spec.id === ABILITY_KAISER_ENGINEERING_MIRACLE) {
    return { state, events: [] };
  }

  if (spec.id === ABILITY_KAISER_CARPET_STRIKE) {
    return { state, events: [] };
  }

  if (spec.id === ABILITY_EL_SID_COMPEADOR_TISONA) {
    return applyElCidTisona(state, unit, action, rng);
  }

  if (spec.id === ABILITY_EL_SID_COMPEADOR_DEMON_DUELIST) {
    return applyElCidDemonDuelist(state, unit, action);
  }

  if (spec.id === ABILITY_EL_SID_COMPEADOR_KOLADA) {
    return { state, events: [] };
  }

  if (spec.id === ABILITY_GENGHIS_KHAN_KHANS_DECREE) {
    return applyKhansDecree(state, unit);
  }

  if (spec.id === ABILITY_GENGHIS_KHAN_MONGOL_CHARGE) {
    return applyMongolCharge(state, unit);
  }

  if (spec.id === ABILITY_CHIKATILO_ASSASSIN_MARK) {
    return applyChikatiloAssassinMark(state, unit, action);
  }

  if (spec.id === ABILITY_CHIKATILO_DECOY) {
    return applyChikatiloDecoyStealth(state, unit);
  }

  if (spec.id === ABILITY_FALSE_TRAIL_EXPLOSION) {
    return applyFalseTrailExplosion(state, unit);
  }

  if (spec.id === ABILITY_LECHY_GUIDE_TRAVELER) {
    return applyLechyGuideTraveler(state, unit, action);
  }

  if (spec.id === ABILITY_LECHY_CONFUSE_TERRAIN) {
    return { state, events: [] };
  }

  if (spec.id === ABILITY_LECHY_STORM) {
    return applyLechyStorm(state, unit);
  }

  if (spec.id === ABILITY_GROZNY_INVADE_TIME) {
    return applyGroznyInvadeTime(state, unit, action, rng);
  }

  const isTricksterAoE = spec.id === ABILITY_TRICKSTER_AOE;
  const aoeCenter = isTricksterAoE ? unit.position : null;

  if (isTricksterAoE) {
    if (unit.class !== "trickster") {
      return { state, events: [] };
    }
    if (!aoeCenter || !isInsideBoard(aoeCenter, state.boardSize)) {
      return { state, events: [] };
    }
  }

  const cost = spec.actionCost;
  const costs = cost?.consumes ?? {};

  // Проверяем экономику
  if (!canSpendSlots(unit, costs)) {
    return { state, events: [] };
  }

  // Сколько зарядов надо на использование
  const chargeAmount = spec.chargesPerUse ?? spec.chargeCost ?? 0;

  // Платим зарядами
  const { unit: afterCharges, ok } = spendCharges(
    unit,
    spec.id,
    chargeAmount
  );
  if (!ok || !afterCharges) {
    return { state, events: [] };
  }

  // Обновляем экономику
  const updatedUnit: UnitState = spendSlots(afterCharges, costs);

  // TODO: сюда потом добавим реальный эффект способности (урон/баф/телепорт)

  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [updatedUnit.id]: updatedUnit,
    },
  };

  const events: GameEvent[] = [
    evAbilityUsed({ unitId: updatedUnit.id, abilityId: spec.id }),
  ];

  if (isTricksterAoE && aoeCenter) {
    const res = resolveAoE(
      nextState,
      updatedUnit.id,
      aoeCenter,
      {
        radius: TRICKSTER_AOE_RADIUS,
        shape: "chebyshev",
        revealHidden: false,
        targetFilter: (u, caster) => u.id !== caster.id,
        abilityId: spec.id,
        emitEvent: false,
      },
      rng
    );
    nextState = res.nextState;
    events.push(...res.events);

    const affectedUnitIds = res.affectedUnitIds.filter(
      (id) => id !== updatedUnit.id
    );
    const revealedUnitIds: string[] = [];

    if (affectedUnitIds.length === 0) {
      events.push(
        evAoeResolved({
          sourceUnitId: updatedUnit.id,
          abilityId: spec.id,
          casterId: updatedUnit.id,
          center: aoeCenter,
          radius: TRICKSTER_AOE_RADIUS,
          affectedUnitIds,
          revealedUnitIds,
          damagedUnitIds: [],
          damageByUnitId: {},
        })
      );
      return { state: nextState, events };
    }

    const queuedState: GameState = {
      ...nextState,
      pendingCombatQueue: [],
      pendingAoE: {
        casterId: updatedUnit.id,
        abilityId: spec.id,
        center: aoeCenter,
        radius: TRICKSTER_AOE_RADIUS,
        affectedUnitIds,
        revealedUnitIds,
        damagedUnitIds: [],
        damageByUnitId: {},
      },
    };

    const ctx: TricksterAoEContext = {
      casterId: updatedUnit.id,
      targetsQueue: affectedUnitIds,
      currentTargetIndex: 0,
    };

    const requested = requestRoll(
      queuedState,
      updatedUnit.owner,
      "tricksterAoE_attackerRoll",
      ctx,
      updatedUnit.id
    );

    return {
      state: requested.state,
      events: [...events, ...requested.events],
    };
  }

  return { state: nextState, events };
}

