import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { z } from "zod";
import type { Match, MatchAction } from "@prisma/client";
import {
  SeededRNG,
  getLegalPlacements,
  getLegalMovesForUnit,
  getLegalAttackTargets,
  getLegalIntents,
  DRAFT_HERO_POOL,
  banDraftHero,
  pickDraftHero,
  createSafeClassDraftState,
  HERO_JEBE_ID,
  type GameAction,
  type GameModeId,
  type GameState,
  type PlayerId,
  type SeededRngState,
  type DraftState,
  type ResolveRollChoice,
} from "rules";
import { createGameRoomWithId, applyGameAction, type GameRoom } from "../../src/store";
import { rebuildLobbyArmiesForMode, rebuildDraftedArmies } from "../../src/modes/roomModes";
import { toAcceptedActionRecord } from "../../src/persistence/acceptedAction";
import { normalizeSnapshotState } from "../../src/persistence/matchSnapshot";
import { captureReplaySetup, type ReplaySetup } from "../../src/replay/actionSetup";
import type { Config } from "./config";

export const POLICY_VERSION = "legal-movement-greedy-combat-v1";
const epoch = new Date("2000-01-01T00:00:00Z");
export interface Trace {
  id: string;
  seed: number;
  policySeed: number;
  mode: GameModeId;
  scenario: "controlled" | "natural";
  requestedActions: number;
  stoppedReason: "target_reached" | "game_completed";
  room: GameRoom;
  match: Match;
  actions: MatchAction[];
  states: GameState[];
  rngStates: SeededRngState[];
  setups: (ReplaySetup | null)[];
  identity: string;
  generationLatencyMs: number;
}

/** Benchmark trace equality covers gameplay meaning; delivery UUIDs are intentionally opaque. */
export function semanticEvents(events: MatchAction["events"]) {
  if (!Array.isArray(events)) return events;
  return events.map((event) => {
    if (!event || typeof event !== "object" || Array.isArray(event)) return event;
    const { eventId, ...meaning } = event;
    return meaning;
  });
}

/** Unpublished ephemeral room; never attaches lifecycle, persistence, ratings or sockets. */
export function generateTrace(
  mode: GameModeId,
  seed: number,
  target: number,
  scenario: Trace["scenario"],
): Trace {
  const started = performance.now();
  const id = `${mode}-${scenario}-seed-${seed}-actions-${target}`;
  const policySeed = (seed ^ 0x9e3779b9) >>> 0;
  const policyRng = new SeededRNG(policySeed);
  const choose = <T>(values: T[]): T => {
    if (!values.length) throw new Error("NO_LEGAL_ACTION");
    return values[Math.floor(policyRng.next() * values.length)];
  };
  const room = createGameRoomWithId(`bench-room-${id}`, {
    seed,
    gameMode: mode,
    hostSeat: "P2",
    hostConnId: "synthetic-host",
    arenaId: "benchmark-arena",
    publish: false,
  });
  room.matchId = `bench-match-${id}`;
  const match: Match = {
    id: room.matchId,
    roomId: room.id,
    status: "IN_PROGRESS",
    isRated: false,
    ratingProcessedAt: null,
    gameMode: mode,
    seed,
    initialConfig: {
      formatVersion: 1,
      rngAlgorithm: "lcg32-numerical-recipes-v1",
      gameMode: mode,
      hostSeat: "P2",
      hostOccupied: true,
      arenaId: "benchmark-arena",
    },
    createdById: null,
    createdAt: epoch,
    updatedAt: epoch,
    startedAt: epoch,
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
  const states: GameState[] = [],
    rngStates: SeededRngState[] = [],
    setups: (ReplaySetup | null)[] = [],
    actions: MatchAction[] = [];
  const rememberState = () => {
    states.push(structuredClone({ ...room.state, events: [] }));
    rngStates.push((room.rng as SeededRNG).exportState());
    setups.push(
      room.state.phase === "lobby" ? captureReplaySetup(room.state, mode, room.draftState) : null,
    );
  };
  rememberState();
  const rememberAction = () => {
    const entry = room.actionLog.at(-1)!;
    entry.at = epoch.getTime() + room.revision;
    const record = toAcceptedActionRecord(room, entry);
    if (!record) throw new Error("MISSING_ACCEPTED_ACTION");
    actions.push({
      ...record,
      id: `action-${room.revision}`,
      actionPayload: record.actionPayload as MatchAction["actionPayload"],
      events: record.events as MatchAction["events"],
    });
    // Presentation history is not read by rules and snapshot v1 deliberately omits it.
    room.state = { ...room.state, events: [] };
    rememberState();
  };
  const act = (
    action: GameAction,
    player: PlayerId = "player" in action ? action.player : room.state.currentPlayer,
  ) => {
    const previousRevision = room.revision;
    const result = applyGameAction(room, action, player);
    if (!result.ok || room.revision !== previousRevision + 1)
      throw new Error(
        `ILLEGAL_TRACE_ACTION:${action.type}:${previousRevision}:${room.state.pendingRoll?.kind ?? "none"}:${JSON.stringify(result)}`,
      );
    rememberAction();
  };
  const canContinue = () => room.revision < target && room.state.phase !== "ended";
  // Unrevisioned seat/figure configuration is carried by the production _replay setup.
  room.state = { ...room.state, seats: { P1: true, P2: true } };
  if (canContinue()) act({ type: "setReady", player: "P1", ready: true });
  if (canContinue()) act({ type: "setReady", player: "P2", ready: true });
  if (canContinue()) {
    if (mode === "standard")
      room.figureSets = { P1: { archer: HERO_JEBE_ID }, P2: { archer: HERO_JEBE_ID } };
    rebuildLobbyArmiesForMode(room);
  }
  if (mode === "draft" && canContinue()) {
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
        at: epoch.getTime(),
        events: [],
        revision: room.revision,
        replaySetup: captureReplaySetup(room.state, mode, room.draftState),
      });
      rememberAction();
    };
    recordDraft({ type: "draftStarted", player: "P2" });
    while (canContinue() && room.draftState!.phase !== "complete") {
      const draft: DraftState = room.draftState!;
      const type = draft.phase === "ban" ? "draftBanHero" : "draftPickHero";
      const candidates = DRAFT_HERO_POOL.map((hero) => ({
        heroId: hero.heroId,
        result:
          type === "draftBanHero"
            ? banDraftHero(draft, draft.currentPlayer, hero.heroId)
            : pickDraftHero(draft, draft.currentPlayer, hero.heroId),
      })).filter((entry) => entry.result.ok);
      // Stable pool ordering makes draft fixtures reproducible and avoids invoking hero abilities.
      const selected = candidates[0];
      if (!selected?.result.ok) throw new Error("NO_LEGAL_DRAFT_CHOICE");
      room.draftState = selected.result.state;
      if (room.draftState.phase === "complete") rebuildDraftedArmies(room);
      recordDraft({ type, player: draft.currentPlayer, heroId: selected.heroId });
    }
  }
  if (canContinue()) act({ type: "startGame" }, "P2");
  while (canContinue()) {
    const state = room.state;
    if (state.pendingRoll) {
      const pending = state.pendingRoll;
      let choice: ResolveRollChoice = "roll";
      if (pending.kind === "ruleDeclarationChoice")
        choice = { type: "chooseRuleDeclaration", ruleId: "normal_rule" };
      if (pending.kind === "hassanAssassinOrderSelection") {
        const eligible = pending.context.eligibleUnitIds;
        if (
          !Array.isArray(eligible) ||
          eligible.some((id) => typeof id !== "string") ||
          eligible.length < 2
        )
          throw new Error("NO_LEGAL_HASSAN_SELECTION");
        choice = { type: "hassanAssassinOrderPick", unitIds: eligible.slice(0, 2) as string[] };
      }
      if (pending.kind === "chargedImpulseTargetChoice") {
        const options = z
          .array(z.object({ col: z.number().int(), row: z.number().int() }))
          .nonempty()
          .parse(pending.context.options);
        choice = { type: "chargedImpulseTarget", position: choose(options) };
      }
      const asgoreChoices = {
        asgoreSoulParadeJusticeTargetChoice: "asgoreSoulParadeJusticeTarget",
        asgoreSoulParadePatienceTargetChoice: "asgoreSoulParadePatienceTarget",
        asgoreSoulParadePerseveranceTargetChoice: "asgoreSoulParadePerseveranceTarget",
      } as const;
      if (pending.kind in asgoreChoices) {
        const type = asgoreChoices[pending.kind as keyof typeof asgoreChoices];
        choice = {
          type,
          targetId: choose(z.array(z.string()).nonempty().parse(pending.context.options)),
        };
      }
      if (pending.kind === "asgoreSoulParadeIntegrityDestination") {
        choice = {
          type: "asgoreSoulParadeIntegrityDestination",
          position: choose(
            z
              .array(z.object({ col: z.number().int(), row: z.number().int() }))
              .nonempty()
              .parse(pending.context.options),
          ),
        };
      }
      if (pending.kind === "reactionChoice")
        choice = { type: "resolveReactionChoice", choice: "pass" };
      if (pending.kind === "donSorrowfulMoveChoice") choice = "skip";
      if (
        pending.kind === "donMadDelusionDirection" ||
        pending.kind === "donWindmillsRepositionChoice"
      ) {
        const position = choose(
          z
            .array(z.object({ col: z.number().int(), row: z.number().int() }))
            .nonempty()
            .parse(pending.context.options),
        );
        choice =
          pending.kind === "donMadDelusionDirection"
            ? { type: "donMadDelusionDirection", direction: position }
            : { type: "donWindmillsReposition", destination: position };
      }
      act({
        type: "resolvePendingRoll",
        player: pending.player,
        pendingRollId: pending.id,
        choice,
      });
      continue;
    }
    if (state.phase === "placement") {
      const candidates = Object.values(state.units).flatMap((unit) =>
        getLegalPlacements(state, unit.id).map((position) => ({ unitId: unit.id, position })),
      );
      const selected = choose(candidates);
      act({ type: "placeUnit", ...selected });
      continue;
    }
    if (!state.activeUnitId) {
      const unitId = state.turnQueue.length
        ? state.turnQueue[state.turnQueueIndex]
        : state.turnOrder[state.turnOrderIndex];
      if (!unitId) throw new Error("NO_ACTIVE_TURN_UNIT");
      act({ type: "unitStartTurn", unitId });
      continue;
    }
    const unit = state.units[state.activeUnitId];
    const intents = getLegalIntents(state, unit.owner);
    const targets =
      scenario === "natural" && intents.canAttack ? getLegalAttackTargets(state, unit.id) : [];
    if (targets.length) {
      act({ type: "attack", attackerId: unit.id, defenderId: choose(targets) });
      continue;
    }
    if (intents.canMove && !state.pendingMove) {
      act({ type: "requestMoveOptions", unitId: unit.id, mode: "normal" });
      continue;
    }
    const moves = intents.canMove
      ? [...(state.pendingMove?.legalTo ?? getLegalMovesForUnit(state, unit.id))]
      : [];
    if (moves.length) {
      if (scenario === "natural") {
        const enemies = Object.values(state.units).filter(
          (other) => other.owner !== unit.owner && other.isAlive && other.position,
        );
        const distance = (position: { row: number; col: number }) =>
          Math.min(
            ...enemies.map((enemy) =>
              Math.max(
                Math.abs(position.row - enemy.position!.row),
                Math.abs(position.col - enemy.position!.col),
              ),
            ),
          );
        moves.sort((a, b) => distance(a) - distance(b));
        if (unit.position && distance(moves[0]) >= distance(unit.position)) {
          act({ type: "endTurn" });
          continue;
        }
      }
      act({ type: "move", unitId: unit.id, to: scenario === "natural" ? moves[0] : choose(moves) });
      continue;
    }
    act({ type: "endTurn" });
  }
  if (room.state.phase === "ended") {
    match.status = "FINISHED";
    match.finalRevision = room.revision;
    match.finishedAt = epoch;
  }
  const identity = createHash("sha256")
    .update(
      JSON.stringify({
        seed,
        initialConfig: match.initialConfig,
        policySeed,
        policyVersion: POLICY_VERSION,
        actions: actions.map(({ revision, actorSeat, actionType, actionPayload, events }) => ({
          revision,
          actorSeat,
          actionType,
          actionPayload,
          events: semanticEvents(events),
        })),
        finalState: normalizeSnapshotState(room.state),
        rngState: rngStates.at(-1),
      }),
    )
    .digest("hex");
  return {
    id,
    seed,
    policySeed,
    mode,
    scenario,
    requestedActions: target,
    stoppedReason: room.state.phase === "ended" ? "game_completed" : "target_reached",
    room,
    match,
    actions,
    states,
    rngStates,
    setups,
    identity,
    generationLatencyMs: performance.now() - started,
  };
}

export function selectTargets(length: number, config: Config, seed: number): number[] {
  if (config.targets) {
    if (config.targets.some((target) => target > length))
      throw new Error(`TARGET_EXCEEDS_ACTUAL_TRACE_LENGTH:${length}`);
    return config.targets;
  }
  const targets = new Set([
    0,
    Math.min(1, length),
    ...[0.25, 0.5, 0.75, 1].map((ratio) => Math.floor(length * ratio)),
  ]);
  for (const interval of config.snapshotIntervals) {
    // Choose a boundary with a following action whenever possible, and include K-1 explicitly.
    const boundary = Math.floor(Math.max(0, length - 1) / interval) * interval;
    for (const revision of [interval - 1, boundary - 1, boundary, boundary + 1])
      if (revision >= 0 && revision <= length) targets.add(revision);
  }
  const rng = new SeededRNG((seed ^ 0x85ebca6b) >>> 0);
  for (let i = 0; i < config.randomTargets; i++) targets.add(Math.floor(rng.next() * (length + 1)));
  return [...targets].sort((a, b) => a - b);
}
