import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { Match, MatchAction, MatchSnapshot, Prisma } from "@prisma/client";
import {
  getLegalPlacements,
  getLegalMovesForUnit,
  getLegalAttackTargets,
  getLegalIntents,
  type GameAction,
  type GameModeId,
  type PlayerId,
  type DraftState,
  type GameState,
  DRAFT_HERO_POOL,
  banDraftHero,
  pickDraftHero,
  createSafeClassDraftState,
  HERO_JEBE_ID,
} from "rules";
import { applyGameAction, createGameRoomWithId, type GameRoom } from "../store";
import { toAcceptedActionRecord } from "../persistence/acceptedAction";
import { serializeMatchSnapshot } from "../persistence/matchSnapshot";
import { captureReplaySetup } from "../replay/actionSetup";
import { rebuildLobbyArmiesForMode, rebuildDraftedArmies } from "../modes/roomModes";

export function snapshotRow(room: GameRoom): MatchSnapshot {
  const saved = serializeMatchSnapshot(room);
  return {
    ...saved,
    id: randomUUID(),
    createdAt: new Date(),
    state: saved.state as Prisma.JsonObject,
    rngState: saved.rngState as Prisma.JsonObject,
  };
}

/** Real accepted rules actions, including initiative dice and complete combat, no mocked rules. */
export function createReplayFixture(mode: GameModeId = "classic", finish = false, seed = 37) {
  const room = createGameRoomWithId(randomUUID(), {
    seed,
    gameMode: mode,
    hostSeat: "P2",
    hostConnId: "fixture-host",
    arenaId: "fixture-arena",
    publish: false,
  });
  room.matchId = randomUUID();
  const initialState = structuredClone(room.state);
  const match: Match = {
    id: room.matchId,
    roomId: room.id,
    status: "IN_PROGRESS",
    gameMode: mode,
    seed,
    initialConfig: {
      formatVersion: 1,
      rngAlgorithm: "lcg32-numerical-recipes-v1",
      gameMode: mode,
      hostSeat: "P2",
      hostOccupied: true,
      arenaId: "fixture-arena",
    },
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: new Date(),
    finishedAt: null,
    winnerUserId: null,
    winnerSeat: null,
    loserUserId: null,
    loserSeat: null,
    durationMs: null,
    turnCount: null,
    finishReason: null,
    finalRevision: null,
  };
  const actions: MatchAction[] = [];
  const currentState = (): GameState => room.state;
  const history = new Map<number, MatchSnapshot>();
  const remember = () => {
    const record = toAcceptedActionRecord(room, room.actionLog.at(-1)!)!;
    actions.push({
      ...record,
      id: randomUUID(),
      actionPayload: record.actionPayload as Prisma.JsonObject,
      events: record.events as Prisma.JsonArray,
    });
    history.set(room.revision, snapshotRow(room));
  };
  const act = (
    action: GameAction,
    player: PlayerId = "player" in action ? action.player : room.state.currentPlayer,
  ) => {
    const command = applyGameAction(room, action, player);
    assert(command.ok, `${action.type} rejected at ${room.revision}: ${JSON.stringify(command)}`);
    remember();
  };
  // Joining/figure selection have no revisions; setup on each accepted lobby action owns these inputs.
  room.state = { ...room.state, seats: { P1: true, P2: true } };
  act({ type: "setReady", player: "P1", ready: true });
  act({ type: "setReady", player: "P2", ready: true });
  if (mode === "standard") room.figureSets = { P1: { archer: HERO_JEBE_ID } };
  rebuildLobbyArmiesForMode(room);
  if (mode === "draft") {
    room.draftState = createSafeClassDraftState();
    const recordDraft = (action: {
      type: "draftStarted" | "draftBanHero" | "draftPickHero";
      player: PlayerId;
      heroId?: string;
    }) => {
      room.revision++;
      room.actionLog.push({
        action,
        playerId: action.player,
        at: Date.now(),
        events: [],
        revision: room.revision,
        replaySetup: captureReplaySetup(room.state, room.gameMode, room.draftState),
      });
      remember();
    };
    recordDraft({ type: "draftStarted", player: "P2" });
    while (room.draftState!.phase !== "complete") {
      const draft: DraftState = room.draftState!;
      const type = draft.phase === "ban" ? "draftBanHero" : "draftPickHero";
      let selected = false;
      for (const hero of DRAFT_HERO_POOL) {
        const result =
          type === "draftBanHero"
            ? banDraftHero(draft, draft.currentPlayer, hero.heroId)
            : pickDraftHero(draft, draft.currentPlayer, hero.heroId);
        if (!result.ok) continue;
        room.draftState = result.state;
        if (result.state.phase === "complete") rebuildDraftedArmies(room);
        recordDraft({ type, player: draft.currentPlayer, heroId: hero.heroId });
        selected = true;
        break;
      }
      assert(selected, "draft has a legal choice");
    }
    rebuildDraftedArmies(room);
  }
  act({ type: "startGame" }, "P2");
  while (room.state.pendingRoll) {
    const pending = room.state.pendingRoll;
    act({
      type: "resolvePendingRoll",
      player: pending.player,
      pendingRollId: pending.id,
      ...(pending.kind === "ruleDeclarationChoice"
        ? { choice: { type: "chooseRuleDeclaration" as const, ruleId: "normal_rule" as const } }
        : {}),
    });
  }
  while (mode !== "draft" && room.state.phase === "placement") {
    const entry = Object.values(room.state.units)
      .map((unit) => ({ unit, legal: getLegalPlacements(room.state, unit.id) }))
      .find((candidate) => candidate.legal.length > 0);
    assert(entry, "legal placement exists");
    act({ type: "placeUnit", unitId: entry.unit.id, position: entry.legal[0] });
    while (currentState().pendingRoll) {
      const p = currentState().pendingRoll!;
      act({ type: "resolvePendingRoll", player: p.player, pendingRollId: p.id });
    }
  }
  while (room.revision < 80) act({ type: "endTurn" });
  if (finish) {
    const attackedTurns = new Set<number>();
    // Greedy legal bot; attacks and deterministic movement exercise random combat continuation.
    while (room.state.phase !== "ended" && room.revision < 5000) {
      const state = room.state;
      if (state.pendingRoll) {
        act({
          type: "resolvePendingRoll",
          player: state.pendingRoll.player,
          pendingRollId: state.pendingRoll.id,
          choice: "roll",
        });
        continue;
      }
      if (state.currentPlayer === "P2") {
        act({ type: "endTurn" });
        continue;
      }
      if (!state.activeUnitId) {
        const id = state.turnQueue.length
          ? state.turnQueue[state.turnQueueIndex]
          : state.turnOrder[state.turnOrderIndex];
        act({ type: "unitStartTurn", unitId: id });
        continue;
      }
      const unit = state.units[state.activeUnitId!];
      assert(unit?.position);
      const intents = getLegalIntents(state, unit.owner);
      const targets = intents.canAttack ? getLegalAttackTargets(state, unit.id) : [];
      if (targets.length && !attackedTurns.has(state.turnNumber)) {
        attackedTurns.add(state.turnNumber);
        act({ type: "attack", attackerId: unit.id, defenderId: targets[0] });
        continue;
      }
      if (intents.canMove && !state.pendingMove) {
        act({ type: "requestMoveOptions", unitId: unit.id, mode: "normal" });
        continue;
      }
      const enemies = Object.values(state.units).filter(
        (u) => u.owner !== unit.owner && u.isAlive && u.position,
      );
      const distance = (pos: { col: number; row: number }) =>
        Math.min(
          ...enemies.map((e) =>
            Math.max(Math.abs(e.position!.row - pos.row), Math.abs(e.position!.col - pos.col)),
          ),
        );
      const moves = intents.canMove
        ? [...(state.pendingMove?.legalTo ?? getLegalMovesForUnit(state, unit.id))]
        : [];
      moves.sort((a, b) => distance(a) - distance(b));
      if (moves[0] && distance(moves[0]) < distance(unit.position)) {
        act({ type: "move", unitId: unit.id, to: moves[0] });
        continue;
      }
      act({ type: "endTurn" });
    }
    assert.equal(
      room.state.phase,
      "ended",
      `bot completes match at revision ${room.revision}: ${JSON.stringify(
        Object.values(room.state.units)
          .filter((u) => u.isAlive)
          .map((u) => ({ id: u.id, hp: u.hp, position: u.position })),
      )}`,
    );
    match.status = "FINISHED";
    match.finalRevision = room.revision;
    match.finishedAt = new Date();
    match.winnerSeat = room.state.gameOver?.winnerPlayerId ?? null;
  }
  return { room, match, actions, history, act, initialState };
}
