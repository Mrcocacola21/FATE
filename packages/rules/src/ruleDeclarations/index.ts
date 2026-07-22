export * from "./types";
export * from "./registry";

import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PendingRoll,
  PlayerId,
  ResolveRollChoice,
  UnitState,
} from "../model";
import { isInsideBoard } from "../model";
import type { RNG } from "../rng";
import { rollD6 } from "../rng";
import { addCoord, ALL_DIRS, chebyshev, coordsEqual, getUnitAt, isCellOccupied } from "../board";
import { getAbilitySpec, setCharges } from "../abilities";
import { HERO_FALSE_TRAIL_TOKEN_ID, getHeroDefinition } from "../heroes";
import { getUnitDefinition } from "../units";
import {
  applyStakeTriggerIfAny,
  clearPendingRoll,
  evAdvantageThresholdDeclared,
  evAdvantageWinTriggered,
  evChessKingDeathResolved,
  evChessKingSelected,
  evCourtEffectApplied,
  evCourtRolesAssigned,
  evCourtRolesSwapped,
  evCourtRollResult,
  evGameDraw,
  evMoonEffectApplied,
  evMoonRollResult,
  evPureBloodRedirected,
  evRuleDeclarationSelected,
  evRuleDeclarationSetupCompleted,
  evStealthRevealed,
  evUnitDied,
  evUnitHealed,
  evUnitMoved,
  requestRoll,
  replacePendingRoll,
} from "../core";
import { endGameWithWinner, hasPendingBattleResolution } from "../gameOver";
import {
  getAvailableRuleDeclarationIds,
} from "./registry";
import type {
  AdvantageGameState,
  CourtEffectId,
  CourtPendingEffect,
  CourtState,
  MoonEffectId,
  MoonGameState,
  PendingRoundAdvance,
  RuleDeclarationId,
  RuleDeclarationState,
} from "./types";
import { isRuleDeclarationId } from "./types";

const COURT_ATTACKER_EFFECTS: Record<number, CourtEffectId> = {
  1: "judicialManeuver",
  2: "escortTransfer",
  3: "detention",
  4: "damageCompensation",
  5: "crimeScene",
  6: "maximumSentence",
};

const COURT_DEFENDER_EFFECTS: Record<number, CourtEffectId> = {
  1: "proceduralRestrictions",
  2: "forcedAppearance",
  3: "falseAlibi",
  4: "courtCosts",
  5: "exposure",
  6: "sentenceAnnulment",
};

const MOON_EFFECTS: Record<number, MoonEffectId> = {
  1: "lunarEclipse",
  2: "meteorFall",
  3: "crater",
  4: "cheeseHoles",
  5: "hollywoodShooting",
  6: "tideChange",
};

function otherPlayer(player: PlayerId): PlayerId {
  return player === "P1" ? "P2" : "P1";
}

function emptyRuleState(): RuleDeclarationState {
  return {
    selectedRuleId: null,
    chooserPlayer: null,
    setupComplete: false,
    ruleData: {},
  };
}

function getRuleState(state: GameState): RuleDeclarationState {
  return state.ruleDeclaration ?? emptyRuleState();
}

function withRuleState(
  state: GameState,
  ruleDeclaration: RuleDeclarationState
): GameState {
  return { ...state, ruleDeclaration };
}

function getRuleUnitBaseMaxHp(unit: UnitState): number {
  const def = getUnitDefinition(unit.class);
  const hero = getHeroDefinition(unit.heroId);
  return hero?.baseHpOverride ?? def.maxHp;
}

function rollRuleD9(rng: RNG): number {
  return 1 + Math.floor(rng.next() * 9);
}

function mapRule2d9ToCoord(state: GameState, d1: number, d2: number): Coord {
  const max = Math.max(0, state.boardSize - 1);
  return {
    col: Math.max(0, Math.min(max, d1 - 1)),
    row: Math.max(0, Math.min(max, d2 - 1)),
  };
}

/**
 * Victory counts real roster heroes only. Tokens (including False Trail) and
 * debug board markers never keep an army alive unless a future rule opts them
 * into this predicate explicitly.
 */
export function isRealRosterUnit(unit: UnitState): boolean {
  return unit.heroId !== HERO_FALSE_TRAIL_TOKEN_ID && !unit.id.startsWith("debug-marker-");
}

export function livingRealUnits(state: GameState, player: PlayerId): UnitState[] {
  return Object.values(state.units).filter(
    (unit) =>
      unit.owner === player &&
      unit.isAlive &&
      isRealRosterUnit(unit)
  );
}

function selectableOwnUnits(state: GameState, player: PlayerId): string[] {
  return Object.values(state.units)
    .filter((unit) => unit.owner === player && unit.isAlive && isRealRosterUnit(unit))
    .map((unit) => unit.id)
    .sort();
}

function selectableEnemyUnits(state: GameState, player: PlayerId): string[] {
  return Object.values(state.units)
    .filter((unit) => unit.owner !== player && unit.isAlive && isRealRosterUnit(unit))
    .map((unit) => unit.id)
    .sort();
}

function emptyCells(state: GameState): Coord[] {
  const cells: Coord[] = [];
  for (let col = 0; col < state.boardSize; col += 1) {
    for (let row = 0; row < state.boardSize; row += 1) {
      const coord = { col, row };
      if (!isCellOccupied(state, coord)) cells.push(coord);
    }
  }
  return cells;
}

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

function squareArea(state: GameState, center: Coord, radius: number): Coord[] {
  const cells: Coord[] = [];
  for (let col = center.col - radius; col <= center.col + radius; col += 1) {
    for (let row = center.row - radius; row <= center.row + radius; row += 1) {
      const coord = { col, row };
      if (isInsideBoard(coord, state.boardSize)) cells.push(coord);
    }
  }
  return cells;
}

function isUnitInArea(unit: UnitState, cells: Set<string>): boolean {
  return !!unit.position && cells.has(coordKey(unit.position));
}

function cloneRuleData(state: GameState): RuleDeclarationState["ruleData"] {
  return { ...(getRuleState(state).ruleData ?? {}) };
}

function maxAdvantageThreshold(state: GameState): number {
  return Math.max(
    3,
    livingRealUnits(state, "P1").length,
    livingRealUnits(state, "P2").length
  );
}

export function requestRuleDeclarationChoice(
  state: GameState,
  initiativeWinner: PlayerId
): ApplyResult {
  const chooser = otherPlayer(initiativeWinner);
  const nextState = withRuleState(
    {
      ...state,
      currentPlayer: initiativeWinner,
      placementFirstPlayer: initiativeWinner,
    },
    {
      selectedRuleId: null,
      chooserPlayer: chooser,
      setupComplete: false,
      ruleData: {},
    }
  );

  return requestRoll(
    nextState,
    chooser,
    "ruleDeclarationChoice",
    {
      chooserPlayer: chooser,
      initiativeWinner,
      availableRuleIds: getAvailableRuleDeclarationIds(),
    },
    undefined
  );
}

function beginPlacementAfterRuleSetup(state: GameState): ApplyResult {
  const rule = getRuleState(state);
  const winner = state.placementFirstPlayer ?? state.initiative.winner ?? "P1";
  const placementState: GameState = {
    ...clearPendingRoll(state),
    phase: "placement",
    currentPlayer: winner,
    placementFirstPlayer: winner,
    pendingMove: null,
    activeUnitId: null,
    placementOrder: [],
    turnOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    turnOrderIndex: 0,
    unitsPlaced: { P1: 0, P2: 0 },
    ruleDeclaration: {
      ...rule,
      setupComplete: true,
    },
  };
  const events: GameEvent[] = [];
  if (rule.selectedRuleId) {
    events.push(evRuleDeclarationSetupCompleted({ ruleId: rule.selectedRuleId }));
  }
  events.push({
    type: "placementStarted",
    placementFirstPlayer: winner,
  });
  return { state: placementState, events };
}

function requestChessKingChoice(
  state: GameState,
  player: PlayerId,
  queue: PlayerId[],
  events: GameEvent[]
): ApplyResult {
  const requested = replacePendingRoll(
    state,
    player,
    "ruleDeclarationChessKingChoice",
    {
      player,
      queue,
      options: selectableOwnUnits(state, player),
    },
    undefined
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

function requestAdvantageThreshold(
  state: GameState,
  player: PlayerId,
  events: GameEvent[]
): ApplyResult {
  const max = maxAdvantageThreshold(state);
  const requested = replacePendingRoll(
    state,
    player,
    "ruleDeclarationAdvantageThreshold",
    {
      player,
      min: 3,
      max,
    },
    undefined
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function resolveRuleDeclarationChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  const rule = getRuleState(state);
  if (pending.kind !== "ruleDeclarationChoice") {
    return { state, events: [] };
  }
  if (rule.selectedRuleId || rule.setupComplete) {
    return { state, events: [] };
  }
  if (!choice || typeof choice !== "object" || choice.type !== "chooseRuleDeclaration") {
    return { state, events: [] };
  }
  if (!isRuleDeclarationId(choice.ruleId)) {
    return { state, events: [] };
  }
  if (rule.chooserPlayer !== pending.player) {
    return { state, events: [] };
  }

  const selectedRuleId = choice.ruleId;
  const baseRule: RuleDeclarationState = {
    selectedRuleId,
    chooserPlayer: pending.player,
    setupComplete: false,
    ruleData: {},
  };

  let nextState = withRuleState(clearPendingRoll(state), baseRule);
  const events: GameEvent[] = [
    evRuleDeclarationSelected({
      ruleId: selectedRuleId,
      chooserPlayer: pending.player,
    }),
  ];

  if (selectedRuleId === "normal_rule") {
    nextState = withRuleState(nextState, {
      ...baseRule,
      setupComplete: true,
      ruleData: {},
    });
    const placement = beginPlacementAfterRuleSetup(nextState);
    return { state: placement.state, events: [...events, ...placement.events] };
  }

  if (selectedRuleId === "court") {
    const attackerPlayer = pending.player;
    const defenderPlayer = otherPlayer(attackerPlayer);
    nextState = withRuleState(nextState, {
      ...baseRule,
      setupComplete: true,
      ruleData: {
        court: { attackerPlayer, defenderPlayer },
      },
    });
    const placement = beginPlacementAfterRuleSetup(nextState);
    return {
      state: placement.state,
      events: [
        ...events,
        evCourtRolesAssigned({ attackerPlayer, defenderPlayer }),
        ...placement.events,
      ],
    };
  }

  if (selectedRuleId === "moon_game") {
    nextState = withRuleState(nextState, {
      ...baseRule,
      setupComplete: true,
      ruleData: { moonGame: {} },
    });
    const placement = beginPlacementAfterRuleSetup(nextState);
    return { state: placement.state, events: [...events, ...placement.events] };
  }

  if (selectedRuleId === "chess_party") {
    nextState = withRuleState(nextState, {
      ...baseRule,
      ruleData: {
        chessParty: { kings: { P1: null, P2: null } },
      },
    });
    return requestChessKingChoice(nextState, "P1", ["P2"], events);
  }

  nextState = withRuleState(nextState, {
    ...baseRule,
    ruleData: {
      advantageGame: { threshold: null },
    },
  });
  return requestAdvantageThreshold(nextState, pending.player, events);
}

export function applyNormalVictoryCheck(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  if (state.phase === "ended") return { state, events };
  if (state.phase !== "battle") return { state, events };
  if (hasPendingBattleResolution(state)) return { state, events };

  const p1Alive = livingRealUnits(state, "P1").length > 0;
  const p2Alive = livingRealUnits(state, "P2").length > 0;
  if (p1Alive && p2Alive) return { state, events };

  const winner: PlayerId | null =
    !p1Alive && p2Alive ? "P2" : p1Alive && !p2Alive ? "P1" : null;
  if (winner) {
    return endGameWithWinner(
      state,
      events,
      winner,
      "allEnemyUnitsDefeated"
    );
  }
  return {
    state: {
      ...state,
      phase: "ended",
      gameOver: null,
      activeUnitId: null,
      pendingMove: null,
      pendingRoll: null,
      pendingCombatQueue: [],
      pendingAoE: null,
    },
    events,
  };
}

export function resolveChessKingChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  if (pending.kind !== "ruleDeclarationChessKingChoice") {
    return { state, events: [] };
  }
  const rule = getRuleState(state);
  if (rule.selectedRuleId !== "chess_party" || rule.setupComplete) {
    return { state, events: [] };
  }
  if (!choice || typeof choice !== "object" || choice.type !== "ruleUnit") {
    return { state, events: [] };
  }
  const player = (pending.context.player as PlayerId | undefined) ?? pending.player;
  const unit = state.units[choice.unitId];
  if (!unit || unit.owner !== player || !unit.isAlive || !isRealRosterUnit(unit)) {
    return { state, events: [] };
  }

  const data = cloneRuleData(state);
  const chessParty = data.chessParty ?? { kings: { P1: null, P2: null } };
  chessParty.kings = { ...chessParty.kings, [player]: unit.id };
  data.chessParty = chessParty;

  const nextState = withRuleState(clearPendingRoll(state), {
    ...rule,
    ruleData: data,
  });
  const events: GameEvent[] = [evChessKingSelected({ player, unitId: unit.id })];
  const queue = Array.isArray(pending.context.queue)
    ? ([...(pending.context.queue as PlayerId[])] as PlayerId[])
    : [];
  const nextPlayer = queue.shift();
  if (nextPlayer) {
    return requestChessKingChoice(nextState, nextPlayer, queue, events);
  }

  const placement = beginPlacementAfterRuleSetup(nextState);
  return { state: placement.state, events: [...events, ...placement.events] };
}

export function resolveAdvantageThresholdChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): ApplyResult {
  if (pending.kind !== "ruleDeclarationAdvantageThreshold") {
    return { state, events: [] };
  }
  const rule = getRuleState(state);
  if (rule.selectedRuleId !== "advantage_game" || rule.setupComplete) {
    return { state, events: [] };
  }
  if (!choice || typeof choice !== "object" || choice.type !== "ruleThreshold") {
    return { state, events: [] };
  }
  const threshold = Math.trunc(choice.threshold);
  const max = maxAdvantageThreshold(state);
  if (threshold < 3 || threshold > max) {
    return { state, events: [] };
  }
  const data = cloneRuleData(state);
  data.advantageGame = { threshold };
  const nextState = withRuleState(clearPendingRoll(state), {
    ...rule,
    ruleData: data,
  });
  const placement = beginPlacementAfterRuleSetup(nextState);
  return {
    state: placement.state,
    events: [
      evAdvantageThresholdDeclared({ player: pending.player, threshold }),
      ...placement.events,
    ],
  };
}

function getPendingRoundAdvance(state: GameState): PendingRoundAdvance | null {
  return getRuleState(state).ruleData.pendingRoundAdvance ?? null;
}

function setPendingRoundAdvance(
  state: GameState,
  advance: PendingRoundAdvance | null
): GameState {
  const rule = getRuleState(state);
  return withRuleState(state, {
    ...rule,
    ruleData: {
      ...rule.ruleData,
      pendingRoundAdvance: advance,
    },
  });
}

function nearestEmptyCell(state: GameState, origin: Coord): Coord | null {
  const cells = emptyCells(state);
  cells.sort((a, b) => {
    const da = chebyshev(a, origin);
    const db = chebyshev(b, origin);
    if (da !== db) return da - db;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });
  return cells[0] ?? null;
}

function clearExpiredRuleStatusesAtRoundEnd(
  state: GameState,
  endedRound: number
): ApplyResult {
  let units = state.units;
  const events: GameEvent[] = [];
  let changed = false;

  for (const unit of Object.values(units)) {
    let updated = unit;
    const clear =
      (status?: { expiresAtRoundEnd: number }) =>
        !!status && status.expiresAtRoundEnd <= endedRound;

    if (clear(updated.courtExtraFlexibleAction)) {
      updated = { ...updated, courtExtraFlexibleAction: undefined };
    }
    if (clear(updated.courtGlobalMoveOnce)) {
      updated = { ...updated, courtGlobalMoveOnce: undefined };
    }
    if (clear(updated.courtProceduralRestriction)) {
      updated = { ...updated, courtProceduralRestriction: undefined };
    }
    if (clear(updated.courtDamageCompensation)) {
      updated = { ...updated, courtDamageCompensation: undefined };
    }
    if (clear(updated.courtCosts)) {
      updated = { ...updated, courtCosts: undefined };
    }
    if (
      updated.cannotStealthUntilRoundEnd !== undefined &&
      updated.cannotStealthUntilRoundEnd <= endedRound
    ) {
      updated = { ...updated, cannotStealthUntilRoundEnd: undefined };
    }
    if (updated.courtStasis && updated.courtStasis.expiresAtRoundEnd <= endedRound) {
      const returnPosition = updated.courtStasis.returnPosition;
      const target = !isCellOccupied(state, returnPosition)
        ? returnPosition
        : nearestEmptyCell({ ...state, units }, returnPosition);
      updated = {
        ...updated,
        courtStasis: undefined,
        position: target ? { ...target } : null,
      };
      if (target) {
        events.push(evUnitMoved({ unitId: updated.id, from: returnPosition, to: target }));
      }
    }

    if (updated !== unit) {
      units = { ...units, [unit.id]: updated };
      changed = true;
    }
  }

  let nextState = changed ? { ...state, units } : state;
  const moon = getRuleState(nextState).ruleData.moonGame;
  if (moon) {
    const nextMoon: MoonGameState = { ...moon };
    let moonChanged = false;
    if (
      nextMoon.noStealthUntilRoundEnd !== undefined &&
      nextMoon.noStealthUntilRoundEnd !== null &&
      nextMoon.noStealthUntilRoundEnd <= endedRound
    ) {
      nextMoon.noStealthUntilRoundEnd = null;
      moonChanged = true;
    }
    if (
      nextMoon.reverseTurnOrderUntilRoundEnd !== undefined &&
      nextMoon.reverseTurnOrderUntilRoundEnd !== null &&
      nextMoon.reverseTurnOrderUntilRoundEnd <= endedRound
    ) {
      nextMoon.reverseTurnOrderUntilRoundEnd = null;
      moonChanged = true;
    }
    if (moonChanged) {
      const rule = getRuleState(nextState);
      nextState = withRuleState(nextState, {
        ...rule,
        ruleData: {
          ...rule.ruleData,
          moonGame: nextMoon,
        },
      });
    }
  }

  return { state: nextState, events };
}

export function completePendingRoundAdvance(
  state: GameState,
  leadingEvents: GameEvent[] = []
): ApplyResult {
  const advance = getPendingRoundAdvance(state);
  if (!advance || state.phase !== "battle") {
    return { state, events: leadingEvents };
  }

  let order = state.turnQueue.length > 0 ? [...state.turnQueue] : [...state.turnOrder];
  let nextIndex = advance.nextIndex;
  let nextUnitId = advance.nextUnitId;
  let nextPlayer = advance.nextPlayer;
  const moon = getRuleState(state).ruleData.moonGame;
  if (moon?.reverseTurnOrderUntilRoundEnd === advance.nextRoundNumber) {
    order = [...order].reverse();
    const aliveIndex = order.findIndex((unitId) => {
      const unit = state.units[unitId];
      return !!unit && unit.isAlive && !!unit.position;
    });
    if (aliveIndex >= 0) {
      nextIndex = aliveIndex;
      nextUnitId = order[aliveIndex];
      nextPlayer = state.units[nextUnitId]?.owner ?? nextPlayer;
    }
  }

  const rule = getRuleState(state);
  const nextState = withRuleState(
    {
      ...state,
      currentPlayer: nextPlayer,
      turnNumber: advance.nextTurnNumber,
      roundNumber: advance.nextRoundNumber,
      activeUnitId: null,
      pendingMove: null,
      turnQueue: order,
      turnOrder: order,
      turnQueueIndex: nextIndex,
      turnOrderIndex: nextIndex,
    },
    {
      ...rule,
      ruleData: {
        ...rule.ruleData,
        pendingRoundAdvance: null,
      },
    }
  );

  return {
    state: nextState,
    events: [
      ...leadingEvents,
      { type: "roundStarted", roundNumber: advance.nextRoundNumber },
      { type: "turnStarted", player: nextPlayer, turnNumber: advance.nextTurnNumber },
    ],
  };
}

function requestCourtAttackerRoll(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  const court = getRuleState(state).ruleData.court;
  if (!court) return completePendingRoundAdvance(state, events);
  const requested = requestRoll(
    state,
    court.attackerPlayer,
    "courtAttackerRoll",
    { side: "attacker" },
    undefined
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

function requestMoonRoundRoll(state: GameState, events: GameEvent[]): ApplyResult {
  const player = getRuleState(state).chooserPlayer ?? state.currentPlayer;
  const requested = requestRoll(
    state,
    player,
    "moonRoundRoll",
    {},
    undefined
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

export function handleRuleDeclarationRoundEnd(
  state: GameState,
  advance: PendingRoundAdvance,
  rng: RNG
): ApplyResult {
  void rng;
  const cleaned = clearExpiredRuleStatusesAtRoundEnd(state, state.roundNumber);
  let nextState = setPendingRoundAdvance(cleaned.state, advance);
  const rule = getRuleState(nextState);

  if (!rule.selectedRuleId || !rule.setupComplete) {
    return completePendingRoundAdvance(nextState, cleaned.events);
  }
  if (rule.selectedRuleId === "court") {
    return requestCourtAttackerRoll(nextState, cleaned.events);
  }
  if (rule.selectedRuleId === "moon_game") {
    return requestMoonRoundRoll(nextState, cleaned.events);
  }
  return completePendingRoundAdvance(nextState, cleaned.events);
}

function courtEffectForRoll(side: "attacker" | "defender", roll: number): CourtEffectId {
  return side === "attacker"
    ? COURT_ATTACKER_EFFECTS[roll] ?? "judicialManeuver"
    : COURT_DEFENDER_EFFECTS[roll] ?? "proceduralRestrictions";
}

export function resolveCourtRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  const rule = getRuleState(state);
  const court = rule.ruleData.court;
  if (rule.selectedRuleId !== "court" || !court) {
    return { state: clearPendingRoll(state), events: [] };
  }
  const side =
    pending.kind === "courtAttackerRoll"
      ? "attacker"
      : pending.kind === "courtDefenderRoll"
        ? "defender"
        : null;
  if (!side) return { state, events: [] };

  const player = side === "attacker" ? court.attackerPlayer : court.defenderPlayer;
  if (pending.player !== player) return { state, events: [] };

  const roll = rollD6(rng);
  const effectId = courtEffectForRoll(side, roll);
  const data = cloneRuleData(state);
  const nextCourt: CourtState = { ...court };
  if (side === "attacker") {
    nextCourt.attackerRoll = roll;
  } else {
    nextCourt.defenderRoll = roll;
    const attackerRoll = nextCourt.attackerRoll ?? 1;
    nextCourt.pendingEffects = [
      {
        side: "attacker",
        player: court.attackerPlayer,
        roll: attackerRoll,
        effectId: courtEffectForRoll("attacker", attackerRoll),
      },
      {
        side: "defender",
        player: court.defenderPlayer,
        roll,
        effectId,
      },
    ];
  }
  data.court = nextCourt;
  const nextState = withRuleState(clearPendingRoll(state), {
    ...rule,
    ruleData: data,
  });
  const events: GameEvent[] = [
    evCourtRollResult({ side, player, roll, effectId }),
  ];

  if (side === "attacker") {
    const requested = requestRoll(
      nextState,
      court.defenderPlayer,
      "courtDefenderRoll",
      { side: "defender" },
      undefined
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }

  return requestNextCourtEffect(nextState, events, rng);
}

function activeTargetRound(state: GameState): number {
  return getPendingRoundAdvance(state)?.nextRoundNumber ?? state.roundNumber;
}

function boundedChargeIds(unit: UnitState): string[] {
  return Object.keys(unit.charges ?? {})
    .filter((abilityId) => {
      const spec = getAbilitySpec(abilityId);
      return typeof spec?.maxCharges === "number" && spec.maxCharges > 0;
    })
    .sort();
}

function anyChargeIds(unit: UnitState): string[] {
  return Object.keys(unit.charges ?? {}).sort();
}

function courtUnitOptions(state: GameState, effect: CourtPendingEffect): string[] {
  switch (effect.effectId) {
    case "judicialManeuver":
    case "escortTransfer":
    case "damageCompensation":
    case "maximumSentence":
    case "proceduralRestrictions":
    case "forcedAppearance":
    case "falseAlibi":
    case "courtCosts":
    case "sentenceAnnulment":
      return selectableOwnUnits(state, effect.player).filter((unitId) => {
        const unit = state.units[unitId];
        if (!unit) return false;
        if (effect.effectId === "maximumSentence") return boundedChargeIds(unit).length > 0;
        if (effect.effectId === "sentenceAnnulment") return anyChargeIds(unit).length > 0;
        return !!unit.position;
      });
    case "detention":
    case "crimeScene":
      return selectableEnemyUnits(state, effect.player);
    case "exposure": {
      const hidden = selectableOwnUnits(state, effect.player).filter(
        (unitId) => state.units[unitId]?.isStealthed
      );
      return hidden.length > 0 ? hidden : selectableOwnUnits(state, effect.player);
    }
  }
}

function setCourtData(state: GameState, court: CourtState): GameState {
  const rule = getRuleState(state);
  return withRuleState(state, {
    ...rule,
    ruleData: {
      ...rule.ruleData,
      court,
    },
  });
}

function popCourtEffect(state: GameState): {
  state: GameState;
  effect: CourtPendingEffect | null;
} {
  const court = getRuleState(state).ruleData.court;
  const [effect, ...rest] = court?.pendingEffects ?? [];
  if (!court || !effect) return { state, effect: null };
  return {
    state: setCourtData(state, { ...court, pendingEffects: rest }),
    effect,
  };
}

function finishCourtCycle(state: GameState, events: GameEvent[]): ApplyResult {
  const rule = getRuleState(state);
  const court = rule.ruleData.court;
  if (!court) return completePendingRoundAdvance(state, events);
  const swapped: CourtState = {
    attackerPlayer: court.defenderPlayer,
    defenderPlayer: court.attackerPlayer,
  };
  const nextState = withRuleState(clearPendingRoll(state), {
    ...rule,
    ruleData: {
      ...rule.ruleData,
      court: swapped,
    },
  });
  return completePendingRoundAdvance(nextState, [
    ...events,
    evCourtRolesSwapped({
      attackerPlayer: swapped.attackerPlayer,
      defenderPlayer: swapped.defenderPlayer,
    }),
  ]);
}

function requestNextCourtEffect(
  state: GameState,
  events: GameEvent[],
  rng: RNG
): ApplyResult {
  void rng;
  const court = getRuleState(state).ruleData.court;
  const next = court?.pendingEffects?.[0] ?? null;
  if (!court || !next) {
    return finishCourtCycle(state, events);
  }
  const options = courtUnitOptions(state, next);
  if (options.length === 0) {
    const popped = popCourtEffect(state);
    return requestNextCourtEffect(popped.state, [
      ...events,
      evCourtEffectApplied({ effectId: next.effectId, player: next.player }),
    ], rng);
  }
  const requested = replacePendingRoll(
    state,
    next.player,
    "courtEffectUnitChoice",
    { effect: next, options },
    undefined
  );
  return { state: requested.state, events: [...events, ...requested.events] };
}

function revealUnit(state: GameState, unitId: string): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return { state, events: [] };
  const updated = {
    ...unit,
    isStealthed: false,
    stealthTurnsLeft: 0,
  };
  return {
    state: {
      ...state,
      units: { ...state.units, [unitId]: updated },
      knowledge: {
        P1: { ...(state.knowledge?.P1 ?? {}), [unitId]: true },
        P2: { ...(state.knowledge?.P2 ?? {}), [unitId]: true },
      },
      lastKnownPositions: {
        P1: { ...(state.lastKnownPositions?.P1 ?? {}) },
        P2: { ...(state.lastKnownPositions?.P2 ?? {}) },
      },
    },
    events: unit.isStealthed
      ? [evStealthRevealed({ unitId, reason: "forcedDisplacement" })]
      : [],
  };
}

function putInStasis(
  state: GameState,
  unitId: string,
  expiresAtRoundEnd: number
): GameState {
  const unit = state.units[unitId];
  if (!unit || !unit.position) return state;
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        position: null,
        courtStasis: {
          expiresAtRoundEnd,
          returnPosition: { ...unit.position },
        },
      },
    },
  };
}

function moveUnitTo(
  state: GameState,
  unitId: string,
  to: Coord,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || !unit.position || isCellOccupied(state, to)) {
    return { state, events: [] };
  }
  const from = unit.position;
  let nextState: GameState = {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        position: { ...to },
      },
    },
  };
  let events: GameEvent[] = [evUnitMoved({ unitId, from, to })];
  const moved = nextState.units[unitId];
  if (moved) {
    const stake = applyStakeTriggerIfAny(nextState, moved, to, rng);
    if (stake.triggered) {
      nextState = stake.state;
      events = [...events, ...stake.events];
    }
  }
  return { state: nextState, events };
}

function applyCourtUnitEffect(
  state: GameState,
  effect: CourtPendingEffect,
  unitId: string,
  rng: RNG
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive) return { state, events: [] };
  const targetRound = activeTargetRound(state);
  const expiresAtRoundEnd = targetRound;
  let nextState = state;
  let events: GameEvent[] = [];

  switch (effect.effectId) {
    case "judicialManeuver":
      nextState = {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            courtExtraFlexibleAction: { expiresAtRoundEnd, used: false },
          },
        },
      };
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
      break;
    case "escortTransfer":
      nextState = {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            courtGlobalMoveOnce: { expiresAtRoundEnd, used: false },
          },
        },
      };
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
      break;
    case "detention":
    case "falseAlibi":
      nextState = putInStasis(state, unitId, expiresAtRoundEnd);
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, targetId: unitId }));
      break;
    case "damageCompensation":
      nextState = {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            courtDamageCompensation: { expiresAtRoundEnd, used: false },
          },
        },
      };
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
      break;
    case "crimeScene": {
      const revealed = revealUnit(state, unitId);
      nextState = revealed.state;
      events.push(
        evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, targetId: unitId }),
        ...revealed.events
      );
      break;
    }
    case "proceduralRestrictions":
      nextState = {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            courtProceduralRestriction: { expiresAtRoundEnd },
          },
        },
      };
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
      break;
    case "forcedAppearance": {
      const options = emptyCells(state);
      const court = getRuleState(state).ruleData.court;
      const chooser = court?.attackerPlayer ?? otherPlayer(effect.player);
      const requested = replacePendingRoll(
        state,
        chooser,
        "courtForcedAppearanceDestination",
        { effect, unitId, options },
        undefined
      );
      return { state: requested.state, events: requested.events };
    }
    case "courtCosts":
      nextState = {
        ...state,
        units: {
          ...state.units,
          [unit.id]: {
            ...unit,
            courtCosts: { expiresAtRoundEnd, used: false },
          },
        },
      };
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
      break;
    case "exposure": {
      if (unit.isStealthed) {
        const revealed = revealUnit(state, unitId);
        nextState = revealed.state;
        events.push(...revealed.events);
      } else {
        nextState = {
          ...state,
          units: {
            ...state.units,
            [unit.id]: {
              ...unit,
              cannotStealthUntilRoundEnd: expiresAtRoundEnd,
            },
          },
        };
      }
      events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
      break;
    }
    case "maximumSentence":
    case "sentenceAnnulment": {
      const options =
        effect.effectId === "maximumSentence"
          ? boundedChargeIds(unit)
          : anyChargeIds(unit);
      if (options.length === 0) {
        events.push(evCourtEffectApplied({ effectId: effect.effectId, player: effect.player, unitId }));
        break;
      }
      const requested = replacePendingRoll(
        state,
        effect.player,
        "courtEffectChargeChoice",
        { effect, unitId, options },
        undefined
      );
      return { state: requested.state, events: requested.events };
    }
  }

  return { state: nextState, events };
}

export function resolveCourtEffectUnitChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  if (pending.kind !== "courtEffectUnitChoice") return { state, events: [] };
  if (!choice || typeof choice !== "object" || choice.type !== "ruleUnit") {
    return { state, events: [] };
  }
  const effect = pending.context.effect as CourtPendingEffect | undefined;
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as string[])
    : [];
  if (!effect || !options.includes(choice.unitId)) return { state, events: [] };
  const popped = popCourtEffect(clearPendingRoll(state));
  const applied = applyCourtUnitEffect(popped.state, effect, choice.unitId, rng);
  if (applied.state.pendingRoll) {
    return { state: applied.state, events: applied.events };
  }
  return requestNextCourtEffect(applied.state, applied.events, rng);
}

export function resolveCourtEffectChargeChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  if (pending.kind !== "courtEffectChargeChoice") return { state, events: [] };
  void rng;
  if (!choice || typeof choice !== "object" || choice.type !== "ruleCharge") {
    return { state, events: [] };
  }
  const effect = pending.context.effect as CourtPendingEffect | undefined;
  const unitId = pending.context.unitId as string | undefined;
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as string[])
    : [];
  if (!effect || !unitId || !options.includes(choice.abilityId)) {
    return { state, events: [] };
  }
  const unit = state.units[unitId];
  if (!unit) return { state, events: [] };
  const spec = getAbilitySpec(choice.abilityId);
  const nextValue =
    effect.effectId === "maximumSentence" ? spec?.maxCharges ?? 0 : 0;
  const updated = setCharges(unit, choice.abilityId, nextValue);
  const nextState = clearPendingRoll({
    ...state,
    units: {
      ...state.units,
      [unitId]: updated,
    },
  });
  const events = [
    evCourtEffectApplied({
      effectId: effect.effectId,
      player: effect.player,
      unitId,
      abilityId: choice.abilityId,
    }),
    {
      type: "chargesUpdated",
      unitId,
      deltas: {
        [choice.abilityId]: nextValue - (unit.charges[choice.abilityId] ?? 0),
      },
      now: {
        ...updated.charges,
      },
    } as GameEvent,
  ];
  return requestNextCourtEffect(nextState, events, rng);
}

export function resolveCourtForcedAppearanceDestination(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  if (pending.kind !== "courtForcedAppearanceDestination") {
    return { state, events: [] };
  }
  if (!choice || typeof choice !== "object" || choice.type !== "ruleCell") {
    return { state, events: [] };
  }
  const unitId = pending.context.unitId as string | undefined;
  const effect = pending.context.effect as CourtPendingEffect | undefined;
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as Coord[])
    : [];
  if (
    !unitId ||
    !effect ||
    !options.some((coord) => coordsEqual(coord, choice.position)) ||
    isCellOccupied(state, choice.position)
  ) {
    return { state, events: [] };
  }
  const moved = moveUnitTo(clearPendingRoll(state), unitId, choice.position, rng);
  return requestNextCourtEffect(moved.state, [
    evCourtEffectApplied({
      effectId: effect.effectId,
      player: effect.player,
      unitId,
      position: choice.position,
    }),
    ...moved.events,
  ], rng);
}

function setMoonData(state: GameState, moonGame: MoonGameState): GameState {
  const rule = getRuleState(state);
  return withRuleState(state, {
    ...rule,
    ruleData: {
      ...rule.ruleData,
      moonGame,
    },
  });
}

export function resolveMoonRoundRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  if (pending.kind !== "moonRoundRoll") return { state, events: [] };
  const rule = getRuleState(state);
  if (rule.selectedRuleId !== "moon_game") {
    return { state: clearPendingRoll(state), events: [] };
  }
  const roll = rollD6(rng);
  const effectId = MOON_EFFECTS[roll] ?? "lunarEclipse";
  const events: GameEvent[] = [evMoonRollResult({ roll, effectId })];
  const targetRound = activeTargetRound(state);
  let moon = rule.ruleData.moonGame ?? {};
  let nextState = clearPendingRoll(state);

  if (effectId === "lunarEclipse" || effectId === "crater") {
    const requested = requestRoll(
      nextState,
      pending.player,
      "moonCoordinateRoll",
      { effectId, count: 1, centers: [] },
      undefined
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }
  if (effectId === "meteorFall") {
    const requested = requestRoll(
      nextState,
      pending.player,
      "moonCoordinateRoll",
      { effectId, count: 3, centers: [] },
      undefined
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }
  if (effectId === "cheeseHoles") {
    moon = { ...moon, cheeseHoles: { choices: {} } };
    nextState = setMoonData(nextState, moon);
    const requested = requestRoll(
      nextState,
      "P1",
      "moonCheeseHolesChoice",
      { player: "P1", queue: ["P2"], options: selectableOwnUnits(nextState, "P1") },
      undefined
    );
    return { state: requested.state, events: [...events, ...requested.events] };
  }
  if (effectId === "hollywoodShooting") {
    moon = { ...moon, noStealthUntilRoundEnd: targetRound };
  }
  if (effectId === "tideChange") {
    moon = { ...moon, reverseTurnOrderUntilRoundEnd: targetRound };
  }
  nextState = setMoonData(nextState, moon);
  return completePendingRoundAdvance(nextState, [
    ...events,
    evMoonEffectApplied({ effectId }),
  ]);
}

export function resolveMoonCoordinateRoll(
  state: GameState,
  pending: PendingRoll,
  rng: RNG
): ApplyResult {
  if (pending.kind !== "moonCoordinateRoll") return { state, events: [] };
  const effectId = pending.context.effectId as MoonEffectId | undefined;
  const count = Number(pending.context.count ?? 1);
  const centers = Array.isArray(pending.context.centers)
    ? ([...(pending.context.centers as Coord[])] as Coord[])
    : [];
  if (!effectId) return { state: clearPendingRoll(state), events: [] };

  const d1 = rollRuleD9(rng);
  const d2 = rollRuleD9(rng);
  centers.push(mapRule2d9ToCoord(state, d1, d2));
  if (centers.length < count) {
    const requested = replacePendingRoll(
      state,
      pending.player,
      "moonCoordinateRoll",
      { effectId, count, centers },
      undefined
    );
    return { state: requested.state, events: requested.events };
  }

  let nextState = clearPendingRoll(state);
  const moon = getRuleState(nextState).ruleData.moonGame ?? {};
  const events: GameEvent[] = [];
  if (effectId === "lunarEclipse") {
    const center = centers[0];
    const area = new Set(squareArea(nextState, center, 2).map(coordKey));
    const units = { ...nextState.units };
    const affectedUnitIds: string[] = [];
    for (const unit of Object.values(units)) {
      if (!unit.isAlive || !unit.position || !isUnitInArea(unit, area)) continue;
      units[unit.id] = {
        ...unit,
        isStealthed: true,
        stealthTurnsLeft: Math.max(unit.stealthTurnsLeft ?? 0, 3),
      };
      affectedUnitIds.push(unit.id);
    }
    nextState = { ...nextState, units };
    events.push(
      evMoonEffectApplied({
        effectId,
        center,
        areaRadius: 2,
        affectedUnitIds,
      })
    );
  } else if (effectId === "meteorFall") {
    const affected = new Set<string>();
    for (const center of centers) {
      const area = new Set(squareArea(nextState, center, 1).map(coordKey));
      for (const unit of Object.values(nextState.units)) {
        if (!unit.isAlive || !unit.position || !isUnitInArea(unit, area)) continue;
        affected.add(unit.id);
      }
    }
    const damagedUnitIds: string[] = [];
    let working = nextState;
    for (const unitId of Array.from(affected).sort()) {
      const damaged = applyDirectDamage(working, unitId, 1, null);
      working = damaged.state;
      damagedUnitIds.push(unitId);
      events.push(...damaged.events);
    }
    nextState = working;
    events.unshift(
      evMoonEffectApplied({
        effectId,
        centers,
        areaRadius: 1,
        damagedUnitIds,
        affectedUnitIds: damagedUnitIds,
      })
    );
  } else if (effectId === "crater") {
    const center = centers[0];
    nextState = setMoonData(nextState, {
      ...moon,
      crater: {
        center,
        radius: 2,
        expiresAtRoundStart: activeTargetRound(nextState) + 1,
      },
    });
    events.push(
      evMoonEffectApplied({ effectId, center, areaRadius: 2 })
    );
  }

  return completePendingRoundAdvance(nextState, events);
}

export function resolveMoonCheeseHolesChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined,
  rng: RNG
): ApplyResult {
  if (pending.kind !== "moonCheeseHolesChoice") return { state, events: [] };
  void rng;
  if (!choice || typeof choice !== "object" || choice.type !== "ruleUnit") {
    return { state, events: [] };
  }
  const player = (pending.context.player as PlayerId | undefined) ?? pending.player;
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as string[])
    : [];
  if (!options.includes(choice.unitId)) return { state, events: [] };

  const rule = getRuleState(state);
  const moon = rule.ruleData.moonGame ?? {};
  const cheeseHoles = moon.cheeseHoles ?? { choices: {} };
  const choices = { ...cheeseHoles.choices, [player]: choice.unitId };
  let nextState = setMoonData(clearPendingRoll(state), {
    ...moon,
    cheeseHoles: { choices },
  });
  const queue = Array.isArray(pending.context.queue)
    ? ([...(pending.context.queue as PlayerId[])] as PlayerId[])
    : [];
  const nextPlayer = queue.shift();
  if (nextPlayer) {
    const requested = requestRoll(
      nextState,
      nextPlayer,
      "moonCheeseHolesChoice",
      { player: nextPlayer, queue, options: selectableOwnUnits(nextState, nextPlayer) },
      undefined
    );
    return { state: requested.state, events: requested.events };
  }

  const p1Id = choices.P1;
  const p2Id = choices.P2;
  const p1 = p1Id ? nextState.units[p1Id] : null;
  const p2 = p2Id ? nextState.units[p2Id] : null;
  const events: GameEvent[] = [];
  if (p1?.isAlive && p1.position && p2?.isAlive && p2.position) {
    const p1Pos = p1.position;
    const p2Pos = p2.position;
    nextState = {
      ...nextState,
      units: {
        ...nextState.units,
        [p1.id]: { ...p1, position: { ...p2Pos } },
        [p2.id]: { ...p2, position: { ...p1Pos } },
      },
    };
    events.push(
      evMoonEffectApplied({
        effectId: "cheeseHoles",
        swappedUnitIds: [p1.id, p2.id],
      }),
      evUnitMoved({ unitId: p1.id, from: p1Pos, to: p2Pos }),
      evUnitMoved({ unitId: p2.id, from: p2Pos, to: p1Pos })
    );
  } else {
    events.push(evMoonEffectApplied({ effectId: "cheeseHoles" }));
  }
  nextState = setMoonData(nextState, { ...moon, cheeseHoles: null });
  return completePendingRoundAdvance(nextState, events);
}

function applyDirectDamage(
  state: GameState,
  unitId: string,
  amount: number,
  killerId: string | null
): ApplyResult {
  const unit = state.units[unitId];
  if (!unit || !unit.isAlive || amount <= 0) return { state, events: [] };
  const hp = Math.max(0, unit.hp - amount);
  const updated: UnitState = {
    ...unit,
    hp,
    isAlive: hp > 0,
    position: hp > 0 ? unit.position : null,
  };
  const events: GameEvent[] = [];
  if (hp <= 0) {
    events.push(evUnitDied({ unitId, killerId }));
  }
  return {
    state: {
      ...state,
      units: { ...state.units, [unitId]: updated },
    },
    events,
  };
}

export function applyRuleDeclarationAfterAttack(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  let nextState = state;
  let nextEvents = [...events];
  for (const event of events) {
    if (event.type !== "attackResolved" || !event.hit || event.damage <= 0) {
      continue;
    }
    const attacker = nextState.units[event.attackerId];
    if (!attacker) continue;
    if (attacker.courtDamageCompensation && !attacker.courtDamageCompensation.used) {
      const maxHp = getRuleUnitBaseMaxHp(attacker);
      const hpAfter = Math.min(maxHp, attacker.hp + event.damage);
      nextState = {
        ...nextState,
        units: {
          ...nextState.units,
          [attacker.id]: {
            ...attacker,
            hp: hpAfter,
            courtDamageCompensation: {
              ...attacker.courtDamageCompensation,
              used: true,
            },
          },
        },
      };
      nextEvents.push(
        evUnitHealed({
          unitId: attacker.id,
          amount: Math.max(0, hpAfter - attacker.hp),
          hpAfter,
          sourceAbilityId: "courtDamageCompensation",
        })
      );
      continue;
    }
    if (attacker.courtCosts && !attacker.courtCosts.used) {
      nextState = {
        ...nextState,
        units: {
          ...nextState.units,
          [attacker.id]: {
            ...attacker,
            courtCosts: { ...attacker.courtCosts, used: true },
          },
        },
      };
      const damaged = applyDirectDamage(nextState, attacker.id, event.damage, null);
      nextState = damaged.state;
      nextEvents.push(...damaged.events);
    }
  }
  return { state: nextState, events: nextEvents };
}

export function applyRuleDeclarationWinChecks(
  state: GameState,
  events: GameEvent[]
): ApplyResult {
  if (state.phase === "ended") return { state, events };
  if (hasPendingBattleResolution(state)) return { state, events };
  const rule = getRuleState(state);
  let nextState = state;
  const nextEvents = [...events];

  if (rule.selectedRuleId === "normal_rule" || rule.selectedRuleId === null) {
    return applyNormalVictoryCheck(nextState, nextEvents);
  }

  if (rule.selectedRuleId === "chess_party") {
    const kings = rule.ruleData.chessParty?.kings;
    const deadKings = (["P1", "P2"] as const).filter((player) => {
      const unitId = kings?.[player];
      return !!unitId && nextState.units[unitId]?.isAlive === false;
    });
    if (deadKings.length === 2) {
      nextState = {
        ...nextState,
        phase: "ended",
        activeUnitId: null,
        pendingMove: null,
        pendingRoll: null,
      };
      nextEvents.push(evChessKingDeathResolved({ draw: true }), evGameDraw());
      return { state: nextState, events: nextEvents };
    }
    if (deadKings.length === 1) {
      const losingPlayer = deadKings[0];
      const winner = otherPlayer(losingPlayer);
      return endGameWithWinner(
        nextState,
        [...nextEvents, evChessKingDeathResolved({ losingPlayer, winner })],
        winner,
        "unknown"
      );
    }
  }

  if (rule.selectedRuleId === "advantage_game") {
    const threshold = rule.ruleData.advantageGame?.threshold ?? null;
    if (threshold && threshold >= 3) {
      const p1 = livingRealUnits(nextState, "P1").length;
      const p2 = livingRealUnits(nextState, "P2").length;
      const winner =
        p1 - p2 >= threshold ? "P1" : p2 - p1 >= threshold ? "P2" : null;
      if (winner) {
        return endGameWithWinner(
          nextState,
          [...nextEvents, evAdvantageWinTriggered({
            winner,
            threshold,
            P1living: p1,
            P2living: p2,
          })],
          winner,
          "unknown"
        );
      }
    }
  }

  return { state: nextState, events: nextEvents };
}

export function isMoonGameActive(state: GameState): boolean {
  const rule = getRuleState(state);
  return rule.selectedRuleId === "moon_game" && rule.setupComplete;
}

function activeMoonCrater(state: GameState): MoonGameState["crater"] {
  const crater = getRuleState(state).ruleData.moonGame?.crater ?? null;
  if (!crater) return null;
  return state.roundNumber < crater.expiresAtRoundStart ? crater : null;
}

function isInsideCrater(coord: Coord, crater: NonNullable<MoonGameState["crater"]>) {
  return chebyshev(coord, crater.center) <= crater.radius;
}

export function filterRuleDeclarationMoves(
  state: GameState,
  unit: UnitState,
  moves: Coord[]
): Coord[] {
  let result = moves;
  const crater = activeMoonCrater(state);
  if (crater && unit.position && isInsideCrater(unit.position, crater)) {
    result = result.filter((coord) => isInsideCrater(coord, crater));
  }
  return result;
}

function pathClearForMoonBonus(
  state: GameState,
  unit: UnitState,
  dir: Coord,
  steps: number
): Coord | null {
  if (!unit.position || steps <= 0) return null;
  let current = unit.position;
  for (let step = 1; step <= steps; step += 1) {
    current = addCoord(current, dir);
    if (!isInsideBoard(current, state.boardSize)) return null;
    const occupant = getUnitAt(state, current);
    if (step < steps && occupant && occupant.isAlive) return null;
    if (step === steps && occupant && occupant.isAlive) return null;
  }
  return current;
}

export function addMoonGameStraightBonusMoves(
  state: GameState,
  unit: UnitState,
  baseMoves: Coord[]
): Coord[] {
  if (!isMoonGameActive(state) || !unit.position) return baseMoves;
  const seen = new Set(baseMoves.map(coordKey));
  const result = [...baseMoves];
  for (const dir of ALL_DIRS) {
    let maxStep = 0;
    for (const move of baseMoves) {
      const dx = move.col - unit.position.col;
      const dy = move.row - unit.position.row;
      const step = Math.max(Math.abs(dx), Math.abs(dy));
      if (step === 0) continue;
      if (Math.sign(dx) === dir.col && Math.sign(dy) === dir.row) {
        maxStep = Math.max(maxStep, step);
      }
    }
    const bonus = pathClearForMoonBonus(state, unit, dir, maxStep + 1);
    if (!bonus) continue;
    const key = coordKey(bonus);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(bonus);
  }
  return filterRuleDeclarationMoves(state, unit, result);
}

export function addCourtGlobalMoveOptions(
  state: GameState,
  unit: UnitState,
  baseMoves: Coord[]
): Coord[] {
  if (!unit.courtGlobalMoveOnce || unit.courtGlobalMoveOnce.used) {
    return baseMoves;
  }
  const seen = new Set(baseMoves.map(coordKey));
  const result = [...baseMoves];
  for (const coord of emptyCells(state)) {
    const key = coordKey(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(coord);
  }
  return filterRuleDeclarationMoves(state, unit, result);
}

export function isCourtGlobalMoveDestination(
  state: GameState,
  unit: UnitState,
  to: Coord,
  normalLegalMoves: Coord[]
): boolean {
  if (!unit.courtGlobalMoveOnce || unit.courtGlobalMoveOnce.used) return false;
  if (normalLegalMoves.some((coord) => coordsEqual(coord, to))) return false;
  return !isCellOccupied(state, to) && isInsideBoard(to, state.boardSize);
}

export function markCourtGlobalMoveUsed(unit: UnitState): UnitState {
  if (!unit.courtGlobalMoveOnce) return unit;
  return {
    ...unit,
    courtGlobalMoveOnce: {
      ...unit.courtGlobalMoveOnce,
      used: true,
    },
  };
}

export function canEnterStealthByRuleDeclaration(
  state: GameState,
  unit: UnitState
): boolean {
  const moon = getRuleState(state).ruleData.moonGame;
  if (
    moon?.noStealthUntilRoundEnd &&
    moon.noStealthUntilRoundEnd >= state.roundNumber
  ) {
    return false;
  }
  if (
    unit.cannotStealthUntilRoundEnd !== undefined &&
    unit.cannotStealthUntilRoundEnd >= state.roundNumber
  ) {
    return false;
  }
  return true;
}

export function canAttackAcrossRuleDeclarationBoundary(
  state: GameState,
  attacker: UnitState,
  defender: UnitState,
  isAoE = false
): boolean {
  if (isAoE) return true;
  const crater = activeMoonCrater(state);
  if (!crater || !attacker.position || !defender.position) return true;
  return isInsideCrater(attacker.position, crater) === isInsideCrater(defender.position, crater);
}

export function getPureBloodRedirectOptions(
  state: GameState,
  kingId: string
): string[] {
  const rule = getRuleState(state);
  if (rule.selectedRuleId !== "chess_party") return [];
  const king = state.units[kingId];
  if (!king || !king.isAlive || !king.position) return [];
  const ownerKingId = rule.ruleData.chessParty?.kings[king.owner];
  if (ownerKingId !== king.id) return [];
  return Object.values(state.units)
    .filter(
      (unit) =>
        unit.id !== king.id &&
        unit.isAlive &&
        !!unit.position &&
        chebyshev(unit.position, king.position!) <= 1
    )
    .map((unit) => unit.id)
    .sort();
}

export function maybeRequestPureBloodRedirect(
  state: GameState,
  pending: PendingRoll,
  context: Record<string, unknown>,
  defenderId: string
): ApplyResult | null {
  if (context.pureBloodRedirected === true) return null;
  const options = getPureBloodRedirectOptions(state, defenderId);
  if (options.length === 0) return null;
  const defender = state.units[defenderId];
  if (!defender) return null;
  return replacePendingRoll(
    state,
    defender.owner,
    "pureBloodRedirectChoice",
    { ...context, options, kingId: defenderId, sourcePendingKind: pending.kind },
    defenderId
  );
}

export function resolvePureBloodRedirectChoice(
  state: GameState,
  pending: PendingRoll,
  choice: ResolveRollChoice | undefined
): { context: Record<string, unknown> } | null {
  if (pending.kind !== "pureBloodRedirectChoice") return null;
  if (!choice || typeof choice !== "object" || choice.type !== "ruleUnit") {
    return { context: { ...pending.context, pureBloodRedirected: true } };
  }
  const options = Array.isArray(pending.context.options)
    ? (pending.context.options as string[])
    : [];
  if (!options.includes(choice.unitId)) {
    return { context: { ...pending.context, pureBloodRedirected: true } };
  }
  void state;
  return {
    context: {
      ...pending.context,
      pureBloodRedirected: true,
      pureBloodRedirectTargetId: choice.unitId,
    },
  };
}

export function buildPureBloodRedirectEvent(
  kingId: string,
  redirectedToUnitId: string,
  damage: number
): GameEvent {
  return evPureBloodRedirected({ kingId, redirectedToUnitId, damage });
}
