// packages/rules/src/manualTurnOrderTest.ts

import {
    createEmptyGame,
    createDefaultArmy,
    attachArmy,
    applyAction,
    coordFromNotation,
  } from "./index";
  import {
    GameState,
    GameEvent,
    PlayerId,
    Coord,
    UnitClass,
  } from "./model";
  import { DefaultRNG } from "./rng";
  
  // ---------- УТИЛИТЫ ЛОГГИНГА ----------
  
  function header(title: string) {
    console.log("\n==============================");
    console.log(title);
    console.log("==============================");
  }
  
  function coordToString(c: Coord | null | undefined): string {
    if (!c) return "-";
    return `(${c.col},${c.row})`;
  }
  
  function dumpEvents(events: GameEvent[], label = "Events") {
    if (events.length === 0) {
      console.log(label + ": <none>");
      return;
    }
    console.log(label + ":");
    for (const e of events) {
      console.log("   ", JSON.stringify(e));
    }
  }
  
  function dumpUnits(state: GameState, owner?: PlayerId) {
    console.log("Units" + (owner ? ` (${owner})` : "") + ":");
    for (const u of Object.values(state.units)) {
      if (owner && u.owner !== owner) continue;
      console.log(
        `  ${u.id} [${u.class}] owner=${u.owner} pos=${coordToString(
          u.position
        )} hp=${u.hp} alive=${u.isAlive}`
      );
    }
  }
  
  function dumpTurnOrder(state: GameState) {
    console.log("Turn order (index → unitId [class] owner):");
    state.turnOrder.forEach((id, idx) => {
      const u = state.units[id];
      if (!u) {
        console.log(`  [${idx}] ${id} (missing in units)`);
        return;
      }
      console.log(`  [${idx}] ${id} [${u.class}] owner=${u.owner}`);
    });
    console.log(
      "turnOrderIndex=",
      state.turnOrderIndex,
      "activeUnitId=",
      state.activeUnitId,
      "currentPlayer=",
      state.currentPlayer
    );
  }
  
  const C = (col: number, row: number): Coord => ({ col, row });
  
  // ---------- ШАГ 1. СОЗДАНИЕ ИГРЫ И АРМИЙ ----------
  
  function stepCreateGameAndArmies(rng: DefaultRNG): GameState {
    header("STEP 1: create game & armies");
  
    let state = createEmptyGame();
  
    console.log(
      "Initial:",
      "phase=",
      state.phase,
      "currentPlayer=",
      state.currentPlayer
    );
  
    const armyP1 = createDefaultArmy("P1");
    const armyP2 = createDefaultArmy("P2");
  
    state = attachArmy(state, armyP1);
    state = attachArmy(state, armyP2);
  
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    return state;
  }
  
  // ---------- ВСПОМОГАТЕЛЬНАЯ: ПОРЯДОК ЮНИТОВ ДЛЯ РАССТАНОВКИ ----------
  
  const CLASS_ORDER: UnitClass[] = [
    "rider",
    "spearman",
    "trickster",
    "assassin",
    "berserker",
    "archer",
    "knight",
  ];
  
  function buildPlacementOrder(
    state: GameState,
    owner: PlayerId,
    reverse: boolean
  ): string[] {
    const units = Object.values(state.units).filter(
      (u) => u.owner === owner
    );
  
    const classes = reverse ? [...CLASS_ORDER].reverse() : CLASS_ORDER;
  
    return classes.map((cls) => {
      const u = units.find((x) => x.class === cls);
      if (!u) {
        throw new Error(
          `No unit of class=${cls} for owner=${owner} in buildPlacementOrder`
        );
      }
      return u.id;
    });
  }
  
  // ---------- ШАГ 2. РАССТАНОВКА 7+7 И ФОРМИРОВАНИЕ turnOrder ----------
  
  function stepPlacementAndTurnOrder(
    state: GameState,
    rng: DefaultRNG
  ): GameState {
    header("STEP 2: placement of 7+7 units & building turnOrder");
  
    // Координаты b–h задней линии
    const p1Coords = ["b0", "c0", "d0", "e0", "f0", "g0", "h0"].map(
      coordFromNotation
    );
    const p2Coords = ["b8", "c8", "d8", "e8", "f8", "g8", "h8"].map(
      coordFromNotation
    );
  
    let p1CoordIndex = 0;
    let p2CoordIndex = 0;
  
    // Строим порядок юнитов:
    // P1: rider → spearman → trickster → assassin → berserker → archer → knight
    // P2: knight → archer → berserker → assassin → trickster → spearman → rider
    const orderP1 = buildPlacementOrder(state, "P1", false);
    const orderP2 = buildPlacementOrder(state, "P2", true);
  
    let p1UnitIndex = 0;
    let p2UnitIndex = 0;
  
    while (state.phase === "placement") {
      const current = state.currentPlayer;
  
      let unitIdToPlace: string | null = null;
  
      if (current === "P1") {
        // ищем следующего юнита P1 из заданного порядка, который ещё не поставлен
        while (p1UnitIndex < orderP1.length) {
          const candidateId = orderP1[p1UnitIndex++];
          const u = state.units[candidateId];
          if (u && !u.position && u.isAlive) {
            unitIdToPlace = candidateId;
            break;
          }
        }
      } else {
        // аналогично для P2, но в обратном порядке классов
        while (p2UnitIndex < orderP2.length) {
          const candidateId = orderP2[p2UnitIndex++];
          const u = state.units[candidateId];
          if (u && !u.position && u.isAlive) {
            unitIdToPlace = candidateId;
            break;
          }
        }
      }
  
      // У этого игрока больше нет нерасставленных фигур — передаём право расстановки
      if (!unitIdToPlace) {
        const resEnd = applyAction(state, { type: "endTurn" } as any, rng);
        state = resEnd.state;
        dumpEvents(resEnd.events, "EndTurn (placement) events");
        continue;
      }
  
      const unit = state.units[unitIdToPlace]!;
      let pos: Coord;
  
      if (current === "P1") {
        pos = p1Coords[p1CoordIndex++];
      } else {
        pos = p2Coords[p2CoordIndex++];
      }
  
      console.log(
        `Placing ${unit.id} [${unit.class}] for ${current} at ${coordToString(
          pos
        )}`
      );
  
      const res = applyAction(
        state,
        {
          type: "placeUnit",
          unitId: unit.id,
          position: pos,
        },
        rng
      );
      state = res.state;
      dumpEvents(res.events, "Placement events");
  
      console.log(
        "phase=",
        state.phase,
        "currentPlayer=",
        state.currentPlayer,
        "unitsPlaced=",
        state.unitsPlaced
      );
  
      if (state.phase === "battle") {
        break;
      }
    }
  
    console.log("\nAfter placement:");
    console.log("phase=", state.phase);
    console.log("startingUnitId=", state.startingUnitId);
    console.log(
      "currentPlayer (should be owner of startingUnitId)=",
      state.currentPlayer
    );
  
    dumpTurnOrder(state);
  
    return state;
  }
  
  // ---------- ШАГ 3. ПРОХОД ПО ОЧЕРЕДИ ХОДОВ ----------
  
  function stepWalkThroughTurnOrder(
    state: GameState,
    rng: DefaultRNG
  ): GameState {
    header("STEP 3: walking through turnOrder with unitStartTurn + endTurn");
  
    const maxSteps = state.turnOrder.length * 2; // пройдём по кругу 2 раза
  
    for (let step = 0; step < maxSteps; step++) {
      console.log(
        `\n--- Global turn=${state.turnNumber}, round=${state.roundNumber} ---`
      );
  
      const idx = state.turnOrderIndex;
      const order = state.turnOrder;
  
      if (order.length === 0) {
        console.log("turnOrder is empty → break");
        break;
      }
  
      const scheduledUnitId = order[idx];
      const scheduledUnit = state.units[scheduledUnitId];
  
      console.log(
        "Scheduled unit index=",
        idx,
        "id=",
        scheduledUnitId,
        "owner=",
        scheduledUnit?.owner,
        "currentPlayer=",
        state.currentPlayer
      );
  
      // Попытка начать ход НЕ той фигурой — должна игнорироваться
      const wrongIdx = (idx + 1) % order.length;
      const wrongUnitId = order[wrongIdx];
  
      if (wrongUnitId !== scheduledUnitId) {
        const resWrong = applyAction(
          state,
          { type: "unitStartTurn", unitId: wrongUnitId } as any,
          rng
        );
        if (
          resWrong.events.length > 0 ||
          resWrong.state.activeUnitId !== state.activeUnitId
        ) {
          console.log(
            "!!! ERROR: unitStartTurn(wrong unit) изменил состояние или создал события",
            resWrong.events
          );
        } else {
          console.log(
            `unitStartTurn(${wrongUnitId}) correctly ignored (not its turn)`
          );
        }
      }
  
      // Правильный unitStartTurn
      let res = applyAction(
        state,
        { type: "unitStartTurn", unitId: scheduledUnitId } as any,
        rng
      );
      state = res.state;
      dumpEvents(res.events, `unitStartTurn(${scheduledUnitId})`);
      console.log("activeUnitId after start=", state.activeUnitId);
  
      // Завершаем ход и смотрим, кто следующий
      res = applyAction(state, { type: "endTurn" } as any, rng);
      state = res.state;
      dumpEvents(res.events, "endTurn events");
  
      console.log(
        "After endTurn:",
        "currentPlayer=",
        state.currentPlayer,
        "turnNumber=",
        state.turnNumber,
        "roundNumber=",
        state.roundNumber,
        "turnOrderIndex=",
        state.turnOrderIndex
      );
    }
  
    return state;
  }
  
  // ---------- MAIN ----------
  
  function main() {
    const rng = new DefaultRNG();
  
    let state = stepCreateGameAndArmies(rng);
    state = stepPlacementAndTurnOrder(state, rng);
    state = stepWalkThroughTurnOrder(state, rng);
  
    header("FINAL STATE");
    console.log(
      "phase=",
      state.phase,
      "currentPlayer=",
      state.currentPlayer,
      "turnNumber=",
      state.turnNumber,
      "roundNumber=",
      state.roundNumber
    );
    dumpTurnOrder(state);
    dumpUnits(state);
  }
  
  main();
  