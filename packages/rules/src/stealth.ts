// packages/rules/src/stealth.ts

import {
    Coord,
    GameEvent,
    GameState,
    PlayerId,
    UnitState,
    UnitClass,
    isInsideBoard,
  } from "./model";
  import { RNG, rollD6 } from "./rng";
  import { getUnitDefinition } from "./units";
  
  // Направления вокруг клетки (начиная с севера по часовой стрелке)
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
  
  type StealthRevealReason =
    | "search"
    | "aoeHit"
    | "durationExpired"
    | "forcedDisplacement";
  
  /**
   * Попытка войти в скрытность.
   * Ограничения:
   * - только в фазе боя (проверяется в actions.ts)
   * - только класс с canStealth
   * - не более 1 попытки за ход (stealthAttemptedThisTurn)
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
  
    const roll = rollD6(rng);
    let success = false;
  
    // Правила:
    // Лучник: скрытность при к6 = 6
    // Убийца: скрытность при к6 = 5–6
    // Остальные (если появятся canStealth) — по умолчанию на 6
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
   * Раскрытие скрытого героя, включая логику "две фигуры в одной клетке".
   * - снимаем скрытность
   * - если в клетке есть другая фигура: пытаемся рандомно выкинуть героя на соседнюю
   * - если некуда сместить — герой получает 1 урон (может умереть)
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
  
    // Позиция на момент раскрытия гарантированно не null
    const basePos: Coord = u.position!;
  
    // Ищем другие фигуры в той же клетке
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
      // Пытаемся сдвинуть героя в одну из свободных соседних клеток
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
        // Некуда сместиться — герой получает 1 урон
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
      const dist = Math.max(dx, dy); // Chebyshev-радиус
  
      if (dist <= radius) {
        // Массовая атака задела скрытого — он раскрывается
        const res = revealUnit(nextState, u.id, "aoeHit", rng);
        nextState = res.state;
        events.push(...res.events);
      }
    }
  
    return { state: nextState, events };
  }
  
  /**
   * Поиск скрытых врагов вокруг юнита (радиус 1 по Chebyshev).
   * Для каждого найденного врага — бросаем к6, при 5–6 раскрываем.
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
    
        const pos = u.position; // здесь уже не null
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
   * Обработка начала хода игрока:
   * - сбрасываем флаг stealthAttemptedThisTurn для его юнитов
   * - тикаем таймеры скрытности
   * - если таймер обнулился — раскрываем героя по причине "durationExpired"
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
        // каждый ход можно снова пытаться войти в скрытность один раз
        stealthAttemptedThisTurn: false,
      };
  
      if (updated.isStealthed) {
        if (updated.stealthTurnsLeft > 0) {
          updated.stealthTurnsLeft -= 1;
        }
  
        if (updated.stealthTurnsLeft <= 0) {
          // сначала сохраняем обновлённого юнита,
          // затем раскрываем его через revealUnit
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
  
  