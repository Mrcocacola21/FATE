// packages/rules/src/stealth.ts

import {
    Coord,
    GameEvent,
    GameState,
    PlayerId,
    UnitState,
    UnitClass,
    isInsideBoard,
    StealthRevealReason,
  } from "./model";
  import { RNG, rollD6 } from "./rng";
  import { getUnitDefinition } from "./units";
  
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
  
    if (unit.stealthAttemptedThisTurn) {
      return { state, events: [] };
    }
  
    if (unit.isStealthed) {
      return { state, events: [] };
    }
  
    const def = getUnitDefinition(unit.class);
    if (!def.canStealth) {
      return { state, events: [] };
    }

    const pos = unit.position;
    const hasStealthedOverlap = Object.values(state.units).some((u) => {
      if (!u.isAlive || !u.isStealthed || !u.position) return false;
      if (u.id === unit.id) return false;
      return u.position.col === pos.col && u.position.row === pos.row;
    });
    if (hasStealthedOverlap) {
      const updated: UnitState = {
        ...unit,
        stealthAttemptedThisTurn: true,
      };
      const newState: GameState = {
        ...state,
        units: {
          ...state.units,
          [updated.id]: updated,
        },
      };
      const events: GameEvent[] = [
        { type: "stealthEntered", unitId: updated.id, success: false },
      ];
      return { state: newState, events };
    }
  
    const roll = rollD6(rng);
    let success = false;
  
    // РџСЂР°РІРёР»Р°:
    // Р›СѓС‡РЅРёРє: СЃРєСЂС‹С‚РЅРѕСЃС‚СЊ РїСЂРё Рє6 = 6
    // РЈР±РёР№С†Р°: СЃРєСЂС‹С‚РЅРѕСЃС‚СЊ РїСЂРё Рє6 = 5вЂ“6
    // РћСЃС‚Р°Р»СЊРЅС‹Рµ (РµСЃР»Рё РїРѕСЏРІСЏС‚СЃСЏ canStealth) вЂ” РїРѕ СѓРјРѕР»С‡Р°РЅРёСЋ РЅР° 6
    if (unit.class === "archer") {
      success = roll === 6;
    } else if (unit.class === "assassin") {
      success = roll >= 5;
    } else {
      success = roll === 6;
    }
  
    const newState: GameState = {
      ...state,
      units: { ...state.units },
    };
  
    const updated: UnitState = {
      ...unit,
      stealthAttemptedThisTurn: true,
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
      },
    ];
  
    return { state: newState, events };
  }
  
  /**
   * Р Р°СЃРєСЂС‹С‚РёРµ СЃРєСЂС‹С‚РѕРіРѕ РіРµСЂРѕСЏ, РІРєР»СЋС‡Р°СЏ Р»РѕРіРёРєСѓ "РґРІРµ С„РёРіСѓСЂС‹ РІ РѕРґРЅРѕР№ РєР»РµС‚РєРµ".
   * - СЃРЅРёРјР°РµРј СЃРєСЂС‹С‚РЅРѕСЃС‚СЊ
   * - РµСЃР»Рё РІ РєР»РµС‚РєРµ РµСЃС‚СЊ РґСЂСѓРіР°СЏ С„РёРіСѓСЂР°: РїС‹С‚Р°РµРјСЃСЏ СЂР°РЅРґРѕРјРЅРѕ РІС‹РєРёРЅСѓС‚СЊ РіРµСЂРѕСЏ РЅР° СЃРѕСЃРµРґРЅСЋСЋ
   * - РµСЃР»Рё РЅРµРєСѓРґР° СЃРјРµСЃС‚РёС‚СЊ вЂ” РіРµСЂРѕР№ РїРѕР»СѓС‡Р°РµС‚ 1 СѓСЂРѕРЅ (РјРѕР¶РµС‚ СѓРјРµСЂРµС‚СЊ)
   */
  export function revealUnit(
    state: GameState,
    unitId: string,
    reason: StealthRevealReason,
    rng: RNG
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
        }
      }
    }
  
    nextState.units[u.id] = u;
  
    // Р•СЃР»Рё СЂР°СЃРєСЂС‹С‚РёРµ РїСЂРѕРёР·РѕС€Р»Рѕ РїРѕ РїСЂРёС‡РёРЅРµ durationExpired/aoeHit/forcedDisplacement,
    // СЃС‡РёС‚Р°РµРј, С‡С‚Рѕ С‚РµРїРµСЂСЊ РІСЃРµ РёРіСЂРѕРєРё "СѓР·РЅР°Р»Рё" Рѕ СЋРЅРёС‚Рµ.
    if (reason === "durationExpired" || reason === "aoeHit" || reason === "forcedDisplacement") {
      nextState.knowledge = {
        ...nextState.knowledge,
        P1: { ...(nextState.knowledge?.P1 ?? {}), [u.id]: true },
        P2: { ...(nextState.knowledge?.P2 ?? {}), [u.id]: true },
      };
    }

    events.push({
      type: "stealthRevealed",
      unitId: u.id,
      reason,
    });
  
    return { state: nextState, events };
  }
  
  export function revealStealthedInArea(
    state: GameState,
    center: Coord,
    radius: number,
    rng: RNG
  ): { state: GameState; events: GameEvent[] } {
    let nextState: GameState = state;
    const events: GameEvent[] = [];
  
    for (const u of Object.values(state.units)) {
      if (!u.isAlive || !u.isStealthed || !u.position) continue;
  
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
   * РћР±СЂР°Р±РѕС‚РєР° РЅР°С‡Р°Р»Р° С…РѕРґР° РёРіСЂРѕРєР°:
   * - СЃР±СЂР°СЃС‹РІР°РµРј С„Р»Р°Рі stealthAttemptedThisTurn РґР»СЏ РµРіРѕ СЋРЅРёС‚РѕРІ
   * - С‚РёРєР°РµРј С‚Р°Р№РјРµСЂС‹ СЃРєСЂС‹С‚РЅРѕСЃС‚Рё
   * - РµСЃР»Рё С‚Р°Р№РјРµСЂ РѕР±РЅСѓР»РёР»СЃСЏ вЂ” СЂР°СЃРєСЂС‹РІР°РµРј РіРµСЂРѕСЏ РїРѕ РїСЂРёС‡РёРЅРµ "durationExpired"
   */
  export function processStartOfTurnStealth(
    state: GameState,
    currentPlayer: PlayerId,
    rng: RNG
  ): { state: GameState; events: GameEvent[] } {
    let nextState: GameState = {
      ...state,
      units: { ...state.units },
    };
  
    const events: GameEvent[] = [];
  
    for (const unit of Object.values(nextState.units)) {
      if (!unit.isAlive) continue;
      if (unit.owner !== currentPlayer) continue;
  
      let updated: UnitState = {
        ...unit,
        // РєР°Р¶РґС‹Р№ С…РѕРґ РјРѕР¶РЅРѕ СЃРЅРѕРІР° РїС‹С‚Р°С‚СЊСЃСЏ РІРѕР№С‚Рё РІ СЃРєСЂС‹С‚РЅРѕСЃС‚СЊ РѕРґРёРЅ СЂР°Р·
        stealthAttemptedThisTurn: false,
      };
  
      if (updated.isStealthed) {
        if (updated.stealthTurnsLeft > 0) {
          updated.stealthTurnsLeft -= 1;
        }
  
        if (updated.stealthTurnsLeft <= 0) {
          // СЃРЅР°С‡Р°Р»Р° СЃРѕС…СЂР°РЅСЏРµРј РѕР±РЅРѕРІР»С‘РЅРЅРѕРіРѕ СЋРЅРёС‚Р°,
          // Р·Р°С‚РµРј СЂР°СЃРєСЂС‹РІР°РµРј РµРіРѕ С‡РµСЂРµР· revealUnit
          nextState.units[updated.id] = updated;
          const res = revealUnit(
            nextState,
            updated.id,
            "durationExpired",
            rng
          );
          nextState = res.state;
          events.push(...res.events);
          continue;
        }
      }
  
      nextState.units[updated.id] = updated;
    }
  
    return { state: nextState, events };
  }
  
  

