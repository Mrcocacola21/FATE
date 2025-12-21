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
    UnitState,
    PlayerId,
    UnitClass,
    Coord,
  } from "./model";
  import { DefaultRNG } from "./rng";
  import { ABILITY_BERSERK_AUTO_DEFENSE } from "./abilities";
  
  // ---------- ВСПОМОГАТЕЛЬНЫЕ УТИЛИТЫ ЛОГГИНГА ----------
  
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
        `  ${u.id} [${u.class}] owner=${u.owner}` +
          ` pos=${coordToString(u.position)}` +
          ` hp=${u.hp} alive=${u.isAlive} stealthed=${u.isStealthed}` +
          ` moved=${u.hasMovedThisTurn ?? "-"} acted=${u.hasActedThisTurn ?? "-"} stealthTried=${u.stealthAttemptedThisTurn ?? "-"}` +
          ` charges=${JSON.stringify(u.charges)}`
      );
    }
  }
  
  function findUnit(
    state: GameState,
    owner: PlayerId,
    cls: UnitClass
  ): UnitState {
    const unit = Object.values(state.units).find(
      (u) => u.owner === owner && u.class === cls
    );
    if (!unit) {
      throw new Error(`Unit not found: owner=${owner}, class=${cls}`);
    }
    return unit;
  }
  
  // небольшой хелпер для координат
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
  
    dumpUnits(state);
  
    return state;
  }
  
  // ---------- ШАГ 2. ИНИЦИАТИВА И АРЕНА ----------
  
  function stepInitiativeAndArena(
    state: GameState,
    rng: DefaultRNG
  ): GameState {
    header("STEP 2: roll initiative & choose arena");
  
    // бросок инициативы через общий applyAction
    let res = applyAction(state, { type: "rollInitiative" } as any, rng);
    state = res.state;
    dumpEvents(res.events, "Initiative events");
    console.log("initiative in state:", state.initiative);
    console.log(
      "placementFirstPlayer=",
      state.placementFirstPlayer,
      "currentPlayer=",
      state.currentPlayer
    );
  
    // выбор арены (условный id)
    res = applyAction(
      state,
      { type: "chooseArena", arenaId: "arena-plain" } as any,
      rng
    );
    state = res.state;
    dumpEvents(res.events, "Arena events");
    console.log("arenaId in state:", state.arenaId);
  
    return state;
  }
  
  // ---------- ШАГ 3. РАССТАНОВКА 7+7 И ПЕРЕХОД В BATTLE ----------
  
  function stepPlacementAutoBattle(state: GameState, rng: DefaultRNG): GameState {
    header("STEP 3: placement of 7+7 units with auto battle start");
  
    // координаты b–h задней линии для обоих игроков
    const p1Coords = ["b0", "c0", "d0", "e0", "f0", "g0", "h0"].map(
      coordFromNotation
    );
    const p2Coords = ["b8", "c8", "d8", "e8", "f8", "g8", "h8"].map(
      coordFromNotation
    );
  
    let p1Index = 0;
    let p2Index = 0;
  
    function nextUnplaced(state: GameState, owner: PlayerId): UnitState | null {
      return (
        Object.values(state.units).find(
          (u) => u.owner === owner && !u.position && u.isAlive
        ) ?? null
      );
    }
  
    while (state.phase === "placement") {
      const current = state.currentPlayer;
      const unit = nextUnplaced(state, current);
      if (!unit) {
        // у этого игрока уже все 7 стоят — просто переключаем ход
        const resEnd = applyAction(state, { type: "endTurn" }, rng);
        state = resEnd.state;
        dumpEvents(resEnd.events, "EndTurn (placement) events");
        continue;
      }
  
      let pos: Coord;
      if (current === "P1") {
        pos = p1Coords[p1Index];
        p1Index++;
      } else {
        pos = p2Coords[p2Index];
        p2Index++;
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
  
      // как только фаза стала battle — выходим
      if (state.phase === "battle") {
        break;
      }
    }
  
    console.log("After placement: phase=", state.phase);
    console.log("startingUnitId=", state.startingUnitId);
    console.log("currentPlayer (should start battle)=", state.currentPlayer);
  
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    return state;
  }
  
  // ---------- ШАГ 4. СЦЕНАРИЙ: РЫЦАРЬ ИЩЕТ АССАСИНА В СКРЫТНОСТИ ----------
  
  function stepKnightSearchAssassin(state: GameState, rng: DefaultRNG): GameState {
    header("STEP 4: knight moves & searches stealthed assassin");
  
    // Берём P1 knight и P2 assassin
    const knight = findUnit(state, "P1", "knight");
    const assassin = findUnit(state, "P2", "assassin");
  
    // Расставляем их вручную для сценария:
    // knight в центре, assassin рядом (по диагонали).
    const knightPos = C(4, 4);
    const assassinPos = C(5, 5);
  
    const units = { ...state.units };
    units[knight.id] = {
      ...knight,
      position: knightPos,
      isStealthed: false,
      stealthTurnsLeft: 0,
      hasActedThisTurn: false,
      hasMovedThisTurn: false,
      stealthAttemptedThisTurn: false,
    };
    units[assassin.id] = {
      ...assassin,
      position: assassinPos,
      isStealthed: true, // форсим стелс
      stealthTurnsLeft: 3,
    };
  
    state = {
      ...state,
      units,
      currentPlayer: "P1",
      activeUnitId: null,
    };
  
    console.log("Before scenario:");
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    // 1) Начинаем ход рыцаря
    let res = applyAction(
      state,
      { type: "unitStartTurn", unitId: knight.id },
      rng
    );
    state = res.state;
    dumpEvents(res.events, "unitStartTurn(knight)");
  
    // 2) Рыцарь перемещается на соседнюю клетку (например, на (4,5))
    const moveTo = C(4, 5);
    res = applyAction(
      state,
      { type: "move", unitId: knight.id, to: moveTo },
      rng
    );
    state = res.state;
    dumpEvents(res.events, "move(knight)");
  
    // 3) Рыцарь использует поиск как ДЕЙСТВИЕ
    res = applyAction(
      state,
      { type: "searchStealth", unitId: knight.id, mode: "action" } as any,
      rng
    );
    state = res.state;
    dumpEvents(res.events, "searchStealth(knight, action)");
  
    const assassinAfter = state.units[assassin.id];
    console.log(
      "Assassin after search: stealthed=",
      assassinAfter?.isStealthed,
      "stealthTurnsLeft=",
      assassinAfter?.stealthTurnsLeft
    );
  
    console.log("Units after search:");
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    return state;
  }
  
  // ---------- ШАГ 5. СЦЕНАРИЙ: НАЕЗДНИК ЕДЕТ ЧЕРЕЗ ВРАГОВ И БЬЁТ ПО ПУТИ ----------
  
  function stepRiderPathAttack(state: GameState, rng: DefaultRNG): GameState {
    header("STEP 5: rider moves through enemies and auto-attacks path");
  
    const rider = findUnit(state, "P1", "rider");
    const enemy1 = findUnit(state, "P2", "spearman");
    const enemy2 = findUnit(state, "P2", "archer");
  
    // Ставим наездника и двух врагов на одну линию:
    // rider: (0,2) -> f2 (5,2)
    // enemy1: (2,2), enemy2: (4,2)
    const units = { ...state.units };
    units[rider.id] = {
      ...rider,
      position: C(0, 2),
      hasMovedThisTurn: false,
      hasActedThisTurn: false,
      stealthAttemptedThisTurn: false,
    };
    units[enemy1.id] = {
      ...enemy1,
      position: C(2, 2),
      isStealthed: false,
    };
    units[enemy2.id] = {
      ...enemy2,
      position: C(4, 2),
      isStealthed: false,
    };
  
    state = {
      ...state,
      units,
      currentPlayer: "P1",
      activeUnitId: null,
    };
  
    console.log("Before rider scenario:");
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    // 1) Старт хода наездника
    let res = applyAction(
      state,
      { type: "unitStartTurn", unitId: rider.id },
      rng
    );
    state = res.state;
    dumpEvents(res.events, "unitStartTurn(rider)");
  
    // 2) Длинный ход по горизонтали, через врагов
    const target = C(5, 2);
    res = applyAction(
      state,
      { type: "move", unitId: rider.id, to: target },
      rng
    );
    state = res.state;
    dumpEvents(res.events, "move(rider) + rider path attacks");
  
    console.log("After rider move & path attacks:");
    dumpUnits(state, "P2");
  
    return state;
  }
  
  // ---------- ШАГ 6. СЦЕНАРИЙ: БЕРСЕРК АВТО-УКЛОНЕНИЕ ----------
  
  function stepBerserkerAutoDefense(state: GameState, rng: DefaultRNG): GameState {
    header("STEP 6: berserker auto-dodges using charges");
  
    const attacker = findUnit(state, "P1", "knight");
    const berserker = findUnit(state, "P2", "berserker");
  
    // Ставим их рядом, чтобы можно было атаковать
    const units = { ...state.units };
    units[attacker.id] = {
      ...attacker,
      position: C(3, 3),
      hasActedThisTurn: false,
      hasMovedThisTurn: false,
      stealthAttemptedThisTurn: false,
    };
    units[berserker.id] = {
      ...berserker,
      position: C(4, 3),
      isStealthed: false,
      // форсим заряды авто-защиты = 6
      charges: {
        ...(berserker.charges || {}),
        [ABILITY_BERSERK_AUTO_DEFENSE]: 6,
      },
    };
  
    state = {
      ...state,
      units,
      currentPlayer: "P1",
      activeUnitId: null,
    };
  
    console.log("Before berserker scenario:");
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    // 1) Начало хода атакера
    let res = applyAction(
      state,
      { type: "unitStartTurn", unitId: attacker.id },
      rng
    );
    state = res.state;
    dumpEvents(res.events, "unitStartTurn(attacker)");
  
    // 2) Атака рыцаря по берсерку, при этом берсерк объявляет auto-defense
    res = applyAction(
      state,
      {
        type: "attack",
        attackerId: attacker.id,
        defenderId: berserker.id,
        defenderUseBerserkAutoDefense: true,
      },
      rng
    );
    state = res.state;
    dumpEvents(res.events, "attack with berserker auto-defense");
  
    const berserkerAfter = state.units[berserker.id];
    console.log(
      "Berserker after attack: hp=",
      berserkerAfter?.hp,
      "alive=",
      berserkerAfter?.isAlive,
      "charges=",
      berserkerAfter?.charges
    );
  
    console.log("Units after berserker scenario:");
    dumpUnits(state, "P1");
    dumpUnits(state, "P2");
  
    return state;
  }
  
  // ---------- ШАГ 7. ПРОВЕРКА endTurn / roundStarted ----------
  
  function stepEndTurnRound(state: GameState, rng: DefaultRNG): GameState {
    header("STEP 7: endTurn / roundStarted");
  
    console.log(
      "Before endTurn: currentPlayer=",
      state.currentPlayer,
      "turnNumber=",
      state.turnNumber,
      "roundNumber=",
      state.roundNumber
    );
  
    const res = applyAction(state, { type: "endTurn" }, rng);
    state = res.state;
    dumpEvents(res.events, "endTurn events");
  
    console.log(
      "After endTurn: currentPlayer=",
      state.currentPlayer,
      "turnNumber=",
      state.turnNumber,
      "roundNumber=",
      state.roundNumber
    );
  
    return state;
  }
  
  // ---------- MAIN ----------
  
  function main() {
    const rng = new DefaultRNG();
  
    let state = stepCreateGameAndArmies(rng);
    state = stepInitiativeAndArena(state, rng);
    state = stepPlacementAutoBattle(state, rng);
    state = stepKnightSearchAssassin(state, rng);
    state = stepRiderPathAttack(state, rng);
    state = stepBerserkerAutoDefense(state, rng);
    state = stepEndTurnRound(state, rng);
  
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
    dumpUnits(state);
  }
  
  main();
  