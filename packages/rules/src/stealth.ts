// packages/rules/src/stealth.ts

import {
  Coord,
  GameEvent,
  GameState,
  UnitState,
  UnitClass,
  isInsideBoard,
  StealthRevealReason,
} from "./model";
import { RNG, rollD6 } from "./rng";
import { getUnitDefinition } from "./units";
import { canSpendSlots, spendSlots } from "./turnEconomy";
import {
  HERO_CHIKATILO_ID,
  HERO_FALSE_TRAIL_TOKEN_ID,
  HERO_HASSAN_ID,
  HERO_LECHY_ID,
} from "./heroes";
import { applyGriffithFemtoRebirth } from "./actions/heroes/griffith";
  
  // РќР°РїСЂР°РІР»РµРЅРёСЏ РІРѕРєСЂСѓРі РєР»РµС‚РєРё (РЅР°С‡РёРЅР°СЏ СЃ СЃРµРІРµСЂР° РїРѕ С‡Р°СЃРѕРІРѕР№ СЃС‚СЂРµР»РєРµ)
  const NEIGHBOR_OFFSETS: Coord[] = [
    { col: 0, row: -1 }, // N
    { col: 1, row: -1 }, // NE
    { col: 1, row: 0 }, // E
    { col: 1, row: 1 }, // SE
    { col: 0, row: 1 }, // S
    { col: -1, row: 1 }, // SW
    { col: -1, row: 0 }, // W
    { col: -1, row: -1 }, // NW
  ];
  
  // use StealthRevealReason from model

export function getStealthSuccessMinRoll(unit: UnitState): number | null {
  if (typeof unit.stealthSuccessMinRoll === "number") {
    return unit.stealthSuccessMinRoll;
  }
  if (unit.heroId === HERO_HASSAN_ID) {
    return 4;
  }
  if (unit.heroId === HERO_LECHY_ID) {
    return 5;
  }
  if (unit.class === "assassin") {
    return 5;
  }
  if (unit.class === "archer") {
    return 6;
  }
  return null;
}
  
  /**
   * РџРѕРїС‹С‚РєР° РІРѕР№С‚Рё РІ СЃРєСЂС‹С‚РЅРѕСЃС‚СЊ.
   * РћРіСЂР°РЅРёС‡РµРЅРёСЏ:
   * - С‚РѕР»СЊРєРѕ РІ С„Р°Р·Рµ Р±РѕСЏ (РїСЂРѕРІРµСЂСЏРµС‚СЃСЏ РІ actions.ts)
   * - С‚РѕР»СЊРєРѕ РєР»Р°СЃСЃ СЃ canStealth
   * - РЅРµ Р±РѕР»РµРµ 1 РїРѕРїС‹С‚РєРё Р·Р° С…РѕРґ (stealthAttemptedThisTurn)
   */
  export function attemptEnterStealth(
    state: GameState,
    unitId: string,
    rng: RNG
  ): { state: GameState; events: GameEvent[] } {
    const unit = state.units[unitId];
    if (!unit || !unit.isAlive || !unit.position) {
      return { state, events: [] };
    }

    if (!canSpendSlots(unit, { stealth: true })) {
      return { state, events: [] };
    }

    const baseUnit: UnitState = spendSlots(unit, { stealth: true });

    if (unit.isStealthed) {
      return {
        state: {
          ...state,
          units: {
            ...state.units,
            [baseUnit.id]: baseUnit,
          },
        },
        events: [],
      };
    }

    const def = getUnitDefinition(unit.class);
    const threshold = getStealthSuccessMinRoll(unit);
    if (threshold === null) {
      return {
        state: {
          ...state,
          units: {
            ...state.units,
            [baseUnit.id]: baseUnit,
          },
        },
        events: [
          {
            type: "stealthEntered",
            unitId: baseUnit.id,
            success: false,
          },
        ],
      };
    }

    const pos = unit.position;
    const hasStealthedOverlap = Object.values(state.units).some((u) => {
      if (!u.isAlive || !u.isStealthed || !u.position) return false;
      if (u.id === unit.id) return false;
      return u.position.col === pos.col && u.position.row === pos.row;
    });
    if (hasStealthedOverlap) {
      const newState: GameState = {
        ...state,
        units: {
          ...state.units,
          [baseUnit.id]: baseUnit,
        },
      };
      const events: GameEvent[] = [
        { type: "stealthEntered", unitId: baseUnit.id, success: false },
      ];
      return { state: newState, events };
    }

    const roll = rollD6(rng);
    const success = roll >= threshold;

    const newState: GameState = {
      ...state,
      units: { ...state.units },
    };

    const updated: UnitState = {
      ...baseUnit,
    };

    if (success) {
      updated.isStealthed = true;
      const maxTurns = def.maxStealthTurns ?? 3;
      updated.stealthTurnsLeft = maxTurns;
    }

    newState.units[updated.id] = updated;

    const events: GameEvent[] = [
      {
        type: "stealthEntered",
        unitId: updated.id,
        success,
        roll,
      },
    ];

    return { state: newState, events };
  }

  export function revealUnit(
    state: GameState,
    unitId: string,
    reason: StealthRevealReason,
    rng: RNG,
    revealerId?: string
  ): { state: GameState; events: GameEvent[] } {
    const unit = state.units[unitId];
    if (!unit || !unit.isAlive || !unit.position || !unit.isStealthed) {
      return { state, events: [] };
    }
  
    let events: GameEvent[] = [];
  
    let nextState: GameState = {
      ...state,
      units: { ...state.units },
    };
  
    let u: UnitState = {
      ...unit,
      isStealthed: false,
      stealthTurnsLeft: 0,
    };
  
    // РџРѕР·РёС†РёСЏ РЅР° РјРѕРјРµРЅС‚ СЂР°СЃРєСЂС‹С‚РёСЏ РіР°СЂР°РЅС‚РёСЂРѕРІР°РЅРЅРѕ РЅРµ null
    const basePos: Coord = u.position!;
  
    // РС‰РµРј РґСЂСѓРіРёРµ С„РёРіСѓСЂС‹ РІ С‚РѕР№ Р¶Рµ РєР»РµС‚РєРµ
    const overlapping: UnitState[] = [];
    for (const other of Object.values(nextState.units)) {
      if (!other.isAlive || !other.position) continue;
      if (other.id === u.id) continue;
      if (
        other.position.col === basePos.col &&
        other.position.row === basePos.row
      ) {
        overlapping.push(other);
      }
    }
  
    if (overlapping.length > 0) {
      // РџС‹С‚Р°РµРјСЃСЏ СЃРґРІРёРЅСѓС‚СЊ РіРµСЂРѕСЏ РІ РѕРґРЅСѓ РёР· СЃРІРѕР±РѕРґРЅС‹С… СЃРѕСЃРµРґРЅРёС… РєР»РµС‚РѕРє
      const freeNeighbors: Coord[] = [];
  
      for (const offset of NEIGHBOR_OFFSETS) {
        const candidate: Coord = {
          col: basePos.col + offset.col,
          row: basePos.row + offset.row,
        };
        if (!isInsideBoard(candidate, nextState.boardSize)) continue;
  
        let occupied = false;
        for (const other of Object.values(nextState.units)) {
          if (!other.isAlive || !other.position) continue;
          if (other.id === u.id) continue;
          if (
            other.position.col === candidate.col &&
            other.position.row === candidate.row
          ) {
            occupied = true;
            break;
          }
        }
  
        if (!occupied) {
          freeNeighbors.push(candidate);
        }
      }
  
      if (freeNeighbors.length > 0) {
        const idx = Math.floor(rng.next() * freeNeighbors.length);
        const dest = freeNeighbors[idx];
        const from: Coord = basePos;
  
        u = {
          ...u,
          position: dest,
        };
  
        events.push({
          type: "unitMoved",
          unitId: u.id,
          from,
          to: dest,
        });
      } else {
        // РќРµРєСѓРґР° СЃРјРµСЃС‚РёС‚СЊСЃСЏ вЂ” РіРµСЂРѕР№ РїРѕР»СѓС‡Р°РµС‚ 1 СѓСЂРѕРЅ
        const newHp = Math.max(0, u.hp - 1);
        const deathPosition = u.position ? { ...u.position } : null;
        u = {
          ...u,
          hp: newHp,
        };
        if (newHp <= 0) {
          u = {
            ...u,
            isAlive: false,
            position: null,
          };
          events.push({
            type: "unitDied",
            unitId: u.id,
            killerId: null,
          });
          const rebirth = applyGriffithFemtoRebirth(u, deathPosition);
          if (rebirth.transformed) {
            u = rebirth.unit;
            events.push(...rebirth.events);
          }
        }
      }
    }
  
    nextState.units[u.id] = u;
  
    // Р•СЃР»Рё СЂР°СЃРєСЂС‹С‚РёРµ РїСЂРѕРёР·РѕС€Р»Рѕ РїРѕ РїСЂРёС‡РёРЅРµ timerExpired/aoeHit/forcedDisplacement,
    // СЃС‡РёС‚Р°РµРј, С‡С‚Рѕ С‚РµРїРµСЂСЊ РІСЃРµ РёРіСЂРѕРєРё "СѓР·РЅР°Р»Рё" Рѕ СЋРЅРёС‚Рµ.
    if (
      reason === "timerExpired" ||
      reason === "aoeHit" ||
      reason === "forcedDisplacement" ||
      reason === "stakeTriggered"
    ) {
      nextState.knowledge = {
        ...nextState.knowledge,
        P1: { ...(nextState.knowledge?.P1 ?? {}), [u.id]: true },
        P2: { ...(nextState.knowledge?.P2 ?? {}), [u.id]: true },
      };
    }

    const clearedLastKnown = {
      ...nextState.lastKnownPositions,
      P1: { ...(nextState.lastKnownPositions?.P1 ?? {}) },
      P2: { ...(nextState.lastKnownPositions?.P2 ?? {}) },
    };
    delete clearedLastKnown.P1[u.id];
    delete clearedLastKnown.P2[u.id];
    nextState.lastKnownPositions = clearedLastKnown;

    events.push({
      type: "stealthRevealed",
      unitId: u.id,
      reason,
      revealerId,
    });
  
    return { state: nextState, events };
  }
  
  export function revealStealthedInArea(
    state: GameState,
    center: Coord,
    radius: number,
    rng: RNG,
    targetFilter?: (unit: UnitState) => boolean
  ): { state: GameState; events: GameEvent[] } {
    let nextState: GameState = state;
    const events: GameEvent[] = [];
  
    for (const u of Object.values(state.units)) {
      if (!u.isAlive || !u.isStealthed || !u.position) continue;
      if (targetFilter && !targetFilter(u)) continue;
  
      const dx = Math.abs(u.position.col - center.col);
      const dy = Math.abs(u.position.row - center.row);
      const dist = Math.max(dx, dy); // Chebyshev-СЂР°РґРёСѓСЃ
  
      if (dist <= radius) {
        // РњР°СЃСЃРѕРІР°СЏ Р°С‚Р°РєР° Р·Р°РґРµР»Р° СЃРєСЂС‹С‚РѕРіРѕ вЂ” РѕРЅ СЂР°СЃРєСЂС‹РІР°РµС‚СЃСЏ
        const res = revealUnit(nextState, u.id, "aoeHit", rng);
        nextState = res.state;
        events.push(...res.events);
      }
    }
  
    return { state: nextState, events };
  }
  
  /**
   * РџРѕРёСЃРє СЃРєСЂС‹С‚С‹С… РІСЂР°РіРѕРІ РІРѕРєСЂСѓРі СЋРЅРёС‚Р° (СЂР°РґРёСѓСЃ 1 РїРѕ Chebyshev).
   * Р”Р»СЏ РєР°Р¶РґРѕРіРѕ РЅР°Р№РґРµРЅРЅРѕРіРѕ РІСЂР°РіР° вЂ” Р±СЂРѕСЃР°РµРј Рє6, РїСЂРё 5вЂ“6 СЂР°СЃРєСЂС‹РІР°РµРј.
   */
  export function performSearchStealth(
    state: GameState,
    searcherId: string,
    rng: RNG
  ): { state: GameState; events: GameEvent[] } {
    const searcher = state.units[searcherId];
    if (!searcher || !searcher.isAlive || !searcher.position) {
      return { state, events: [] };
    }
  
    const events: GameEvent[] = [];
    let currentState = state;
  
    const sx = searcher.position.col;
    const sy = searcher.position.row;
  
    const candidates = Object.values(state.units).filter((u) => {
        if (!u.isAlive || !u.isStealthed || !u.position) return false;
        if (u.owner === searcher.owner) return false;
    
        const pos = u.position; // Р·РґРµСЃСЊ СѓР¶Рµ РЅРµ null
        const dx = Math.abs(pos.col - sx);
        const dy = Math.abs(pos.row - sy);
        const dist = Math.max(dx, dy); // Chebyshev
    
        return dist <= 1;
    });
    
    
  
    if (candidates.length === 0) {
      return { state, events };
    }
  
    for (const hidden of candidates) {
      const roll = rollD6(rng);
      if (roll >= 5) {
        const res = revealUnit(currentState, hidden.id, "search", rng);
        currentState = res.state;
        events.push(...res.events);
      }
    }
  
    return { state: currentState, events };
  }
  
  /**
   * Обработка начала хода конкретной фигуры:
   * - если фигура в стелсе, тикаем таймер её собственной очереди
   * - на 4-й собственный ход раскрываем до действий
   */
  export function processUnitStartOfTurnStealth(
    state: GameState,
    unitId: string,
    rng: RNG
  ): { state: GameState; events: GameEvent[] } {
    const unit = state.units[unitId];
    if (!unit || !unit.isAlive) {
      return { state, events: [] };
    }

    if (!unit.isStealthed) {
      return { state, events: [] };
    }

    if (unit.heroId === HERO_CHIKATILO_ID) {
      const otherRealUnits = Object.values(state.units).filter(
        (u) =>
          u.isAlive &&
          u.id !== unit.id &&
          u.heroId !== HERO_FALSE_TRAIL_TOKEN_ID
      );
      if (otherRealUnits.length === 0) {
        const res = revealUnit(state, unit.id, "timerExpired", rng);
        return { state: res.state, events: res.events };
      }

      const tokenId = unit.chikatiloFalseTrailTokenId;
      const tokenAlive =
        tokenId && state.units[tokenId] && state.units[tokenId].isAlive;
      if (tokenAlive) {
        return { state, events: [] };
      }
    }

    // Reveal on the 4th own turn start.
    if (unit.stealthTurnsLeft <= 0) {
      const res = revealUnit(state, unit.id, "timerExpired", rng);
      return { state: res.state, events: res.events };
    }

    const updated: UnitState = {
      ...unit,
      stealthTurnsLeft: unit.stealthTurnsLeft - 1,
    };

    const nextState: GameState = {
      ...state,
      units: {
        ...state.units,
        [updated.id]: updated,
      },
    };

    return { state: nextState, events: [] };
  }
