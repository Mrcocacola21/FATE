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
  ABILITY_ASGORE_FIREBALL,
  ABILITY_ASGORE_FIRE_PARADE,
  ABILITY_ASGORE_SOUL_PARADE,
  ABILITY_GUTS_ARBALET,
  ABILITY_GUTS_BERSERK_MODE,
  ABILITY_GUTS_CANNON,
  ABILITY_GUTS_EXIT_BERSERK,
  ABILITY_FEMTO_DIVINE_MOVE,
  ABILITY_HASSAN_TRUE_ENEMY,
  ABILITY_KALADIN_FIFTH,
  ABILITY_KALADIN_FIRST,
  ABILITY_JEBE_HAIL_OF_ARROWS,
  ABILITY_JEBE_KHANS_SHOOTER,
  ABILITY_LOKI_LAUGHT,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  ABILITY_RIVER_PERSON_BOATMAN,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  ABILITY_ODIN_SLEIPNIR,
  ABILITY_METTATON_EX,
  ABILITY_METTATON_FINAL_CHORD,
  ABILITY_METTATON_LASER,
  ABILITY_METTATON_NEO,
  ABILITY_METTATON_POPPINS,
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_PAPYRUS_LONG_BONE,
  ABILITY_PAPYRUS_ORANGE_BONE,
  ABILITY_PAPYRUS_SPAGHETTI,
  TRICKSTER_AOE_RADIUS,
  getAbilitySpec,
  spendCharges,
} from "../abilities";
import { canSpendSlots, spendSlots } from "../turnEconomy";
import { requestRoll } from "../core";
import { evAbilityUsed, evAoeResolved } from "../core";
import { applyKaiserDora } from "./heroes/kaiser";
import { applyElCidDemonDuelist, applyElCidTisona } from "./heroes/elCid";
import { applyKhansDecree, applyMongolCharge } from "./heroes/genghisKhan";
import { applyGroznyInvadeTime } from "./heroes/grozny";
import { HERO_FALSE_TRAIL_TOKEN_ID, HERO_KALADIN_ID } from "../heroes";
import {
  applyChikatiloAssassinMark,
  applyChikatiloDecoyStealth,
  applyFalseTrailExplosion,
} from "./heroes/chikatilo";
import {
  applyLechyGuideTraveler,
  applyLechyStorm,
} from "./heroes/lechy";
import { applyJebeHailOfArrows, applyJebeKhansShooter } from "./heroes/jebe";
import { applyHassanTrueEnemy } from "./heroes/hassan";
import { applyKaladinFifth, applyKaladinFirst } from "./heroes/kaladin";
import { applyLokiLaught } from "./heroes/loki";
import { applyFriskGenocide, applyFriskPacifism } from "./heroes/frisk";
import { applyAsgoreFireball, applyAsgoreFireParade } from "./heroes/asgore";
import { applyOdinSleipnir } from "./heroes/odin";
import { applyRiverBoatman, applyRiverTraLaLa } from "./heroes/riverPerson";
import {
  applyMettatonEx,
  applyMettatonFinalChord,
  applyMettatonLaser,
  applyMettatonNeo,
  applyMettatonPoppins,
} from "./heroes/mettaton";
import {
  applyPapyrusCoolGuy,
  applyPapyrusLongBoneToggle,
  applyPapyrusOrangeBoneToggle,
  applyPapyrusSpaghetti,
} from "./heroes/papyrus";
import {
  applyGutsArbalet,
  applyGutsBerserkMode,
  applyGutsCannon,
  applyGutsExitBerserk,
} from "./heroes/guts";
import { applyFemtoDivineMove } from "./heroes/griffith";
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
  if ((unit.lokiChickenSources?.length ?? 0) > 0) {
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

  if (spec.id === ABILITY_JEBE_HAIL_OF_ARROWS) {
    return applyJebeHailOfArrows(state, unit, action, rng);
  }

  if (spec.id === ABILITY_JEBE_KHANS_SHOOTER) {
    return applyJebeKhansShooter(state, unit, action);
  }

  if (spec.id === ABILITY_HASSAN_TRUE_ENEMY) {
    return applyHassanTrueEnemy(state, unit, action);
  }

  if (spec.id === ABILITY_LOKI_LAUGHT) {
    return applyLokiLaught(state, unit);
  }

  if (spec.id === ABILITY_FRISK_PACIFISM) {
    return applyFriskPacifism(state, unit);
  }

  if (spec.id === ABILITY_FRISK_GENOCIDE) {
    return applyFriskGenocide(state, unit);
  }

  if (spec.id === ABILITY_ASGORE_FIREBALL) {
    return applyAsgoreFireball(state, unit, action);
  }

  if (spec.id === ABILITY_ASGORE_FIRE_PARADE) {
    return applyAsgoreFireParade(state, unit, rng);
  }

  if (spec.id === ABILITY_ASGORE_SOUL_PARADE) {
    return { state, events: [] };
  }

  if (spec.id === ABILITY_ODIN_SLEIPNIR) {
    return applyOdinSleipnir(state, unit, action);
  }

  if (spec.id === ABILITY_RIVER_PERSON_BOATMAN) {
    return applyRiverBoatman(state, unit);
  }

  if (spec.id === ABILITY_RIVER_PERSON_TRA_LA_LA) {
    return applyRiverTraLaLa(state, unit);
  }

  if (spec.id === ABILITY_KALADIN_FIRST) {
    return applyKaladinFirst(state, unit);
  }

  if (spec.id === ABILITY_KALADIN_FIFTH) {
    return applyKaladinFifth(state, unit, action, rng);
  }

  if (spec.id === ABILITY_GUTS_ARBALET) {
    return applyGutsArbalet(state, unit, action);
  }

  if (spec.id === ABILITY_GUTS_CANNON) {
    return applyGutsCannon(state, unit, action);
  }

  if (spec.id === ABILITY_GUTS_BERSERK_MODE) {
    return applyGutsBerserkMode(state, unit);
  }

  if (spec.id === ABILITY_GUTS_EXIT_BERSERK) {
    return applyGutsExitBerserk(state, unit);
  }

  if (spec.id === ABILITY_FEMTO_DIVINE_MOVE) {
    return applyFemtoDivineMove(state, unit);
  }
  if (spec.id === ABILITY_PAPYRUS_SPAGHETTI) {
    return applyPapyrusSpaghetti(state, unit);
  }
  if (spec.id === ABILITY_PAPYRUS_COOL_GUY) {
    return applyPapyrusCoolGuy(state, unit, action);
  }
  if (spec.id === ABILITY_PAPYRUS_ORANGE_BONE) {
    return applyPapyrusOrangeBoneToggle(state, unit, action);
  }
  if (spec.id === ABILITY_PAPYRUS_LONG_BONE) {
    return applyPapyrusLongBoneToggle(state, unit, action);
  }
  if (spec.id === ABILITY_METTATON_POPPINS) {
    return applyMettatonPoppins(state, unit, action, rng);
  }
  if (spec.id === ABILITY_METTATON_LASER) {
    return applyMettatonLaser(state, unit, action);
  }
  if (spec.id === ABILITY_METTATON_EX) {
    return applyMettatonEx(state, unit);
  }
  if (spec.id === ABILITY_METTATON_NEO) {
    return applyMettatonNeo(state, unit);
  }
  if (spec.id === ABILITY_METTATON_FINAL_CHORD) {
    return applyMettatonFinalChord(state, unit);
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


