import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ABILITY_KAISER_DORA,
  ABILITY_KAISER_CARPET_STRIKE,
  ABILITY_VLAD_FOREST,
  ABILITY_VLAD_INTIMIDATE,
  HERO_VLAD_TEPES_ID,
  HERO_UNDYNE_ID,
  applyAction,
  makePlayerView,
  projectEventsForRecipient,
  type ApplyResult,
  type GameState,
  type GameEvent,
  type ResolveRollChoice,
  type PlayerView,
} from "rules";
import { evIntimidateResolved } from "../../../../rules/src/core/events/combatEvents/tacticalEvents";
import {
  setupKaiserState,
  setupVladState,
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeRngSequence,
} from "../../../../rules/src/tests/helpers/testUtils";
import { buildCombatVisualPlaybackPlan } from "./combatPlayback";
import {
  advanceVisualResolution,
  createVisualResolutionState,
  snapshotVisualHp,
  snapshotVisualUnits,
} from "./visualResolution";
import { mapEventBatchToVfx } from "../../features/vfx/vfxEventMapper";
import { mapEventBatchToSfx } from "../../features/sfx/sfxEventMapper";
import { buildActionPreview } from "../targeting/buildActionPreview";
import { buildPendingPreview } from "../targeting/buildPendingPreview";
import { selectBoardPreview } from "../targeting/selectBoardPreview";
import { buildPreviewCellMap } from "../targeting/previewTypes";
import { createCellClickHandler, createCellHoverHandler } from "../gameshell-content/cellHandlers";
import { getDoraTargetCenters } from "../gameshell-content/helpers";
import { PresentationSession } from "./presentationSession";
import { enqueueBoardVfx, simplifyVfxForReducedMotion } from "../../features/vfx/vfxQueue";
import { VfxLayer } from "../../features/vfx/VfxLayer";
import { Board } from "../../components/Board";
import { CombatRollFeedback } from "./CombatRollFeedback";
import { SfxPlaybackSession } from "../../features/sfx/sfxPlaybackSession";
import type { BoardEventBatch, PresentationEvent } from "./types";
import type { Translate } from "../../i18n";

const center = { col: 4, row: 6 };
const abilities = [ABILITY_KAISER_DORA, ABILITY_KAISER_CARPET_STRIKE, ABILITY_VLAD_FOREST] as const;
const effects = ["doraImpact", "carpetImpact", "forestEruption"] as const;
function respond(state: GameState, values: number[], choice?: ResolveRollChoice): ApplyResult {
  const pending = state.pendingRoll!;
  assert(pending);
  return applyAction(
    state,
    { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id, choice },
    makeRngSequence(values),
  );
}
function fixture(
  abilityId: (typeof abilities)[number],
  empty = false,
  ally = false,
  hidden = false,
  hp = 5,
) {
  const initial = abilityId === ABILITY_VLAD_FOREST ? setupVladState() : setupKaiserState();
  const caster = "vlad" in initial ? initial.vlad : initial.kaiser;
  let state = setUnit(initial.state, caster.id, {
    position: { col: 1, row: abilityId === ABILITY_KAISER_DORA ? 6 : 1 },
    ownTurnsStarted: 1,
    charges: { ...caster.charges, [abilityId]: abilityId === ABILITY_KAISER_DORA ? 2 : 3 },
  });
  const targets = Object.values(state.units).filter(
    (u) => u.owner === "P2" && ["archer", "knight", "spearman"].includes(u.class),
  );
  if (ally)
    targets[1] = Object.values(state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  if (!empty)
    targets.forEach((u, i) => {
      state = setUnit(state, u.id, {
        position: { col: 3 + i, row: i === 0 ? 5 : 6 },
        hp,
        isStealthed: hidden && i === 0,
      });
    });
  state = initKnowledgeForOwners(toBattleState(state, "P1", caster.id));
  if (abilityId !== ABILITY_KAISER_DORA)
    state = {
      ...state,
      activeUnitId: null,
      turnQueue: [caster.id],
      turnQueueIndex: 0,
      turnOrder: [caster.id],
      turnOrderIndex: 0,
      stakeMarkers:
        abilityId === ABILITY_VLAD_FOREST
          ? Array.from({ length: 9 }, (_, i) => ({
              id: `secret-${i}`,
              owner: "P1" as const,
              position: { col: i % 3, row: Math.floor(i / 3) },
              createdAt: i,
              isRevealed: false,
            }))
          : [],
    };
  return { state, casterId: caster.id, targets: empty ? [] : targets.map((u) => u.id) };
}
function resolveAoe(
  abilityId: (typeof abilities)[number],
  options: {
    empty?: boolean;
    miss?: boolean;
    ally?: boolean;
    hidden?: boolean;
    hp?: number;
    warlord?: boolean;
  } = {},
) {
  const setup = fixture(abilityId, options.empty, options.ally, options.hidden, options.hp);
  if (options.warlord) {
    const support = Object.values(setup.state.units).find(
      (u) => u.owner === "P1" && u.class === "spearman",
    )!;
    setup.state = setUnit(setup.state, support.id, {
      heroId: HERO_VLAD_TEPES_ID,
      position: { col: 1, row: 2 },
    });
  }
  let result =
    abilityId === ABILITY_KAISER_DORA
      ? applyAction(
          setup.state,
          { type: "useAbility", unitId: setup.casterId, abilityId, payload: { center } },
          makeRngSequence([]),
        )
      : applyAction(
          setup.state,
          { type: "unitStartTurn", unitId: setup.casterId },
          makeRngSequence([]),
        );
  const stages = [result];
  if (abilityId !== ABILITY_KAISER_DORA) {
    result =
      abilityId === ABILITY_KAISER_CARPET_STRIKE
        ? respond(result.state, [0.49, 0.7])
        : respond(result.state, [], { type: "forestTarget", center });
    stages.push(result);
  }
  let iterations = 0;
  while (result.state.pendingRoll) {
    assert(++iterations < 12);
    const kind = result.state.pendingRoll.kind;
    assert(
      kind.endsWith("_attackerRoll") ||
        kind.endsWith("_defenderRoll") ||
        kind === "kaiserCarpetStrikeAttack",
      kind,
    );
    result = respond(
      result.state,
      kind.endsWith("_defenderRoll") ? (options.miss ? [0.99, 0.99] : [0.01, 0.2]) : [0.8, 0.5],
    );
    stages.push(result);
  }
  return { ...setup, stages, after: result.state, events: stages.flatMap((stage) => stage.events) };
}
function batch(
  events: GameEvent[] | PresentationEvent[],
  view: PlayerView,
  revision = 1,
): BoardEventBatch {
  return {
    streamId: "pack",
    revision,
    view,
    events: events.map((event, i) => ({
      ...event,
      eventId: `E${revision}-${i}`,
    })) as PresentationEvent[],
  };
}
function plan(
  events: GameEvent[] | PresentationEvent[],
  before: GameState,
  after: GameState,
  reducedMotion = false,
) {
  const view = makePlayerView(after, "P1");
  return buildCombatVisualPlaybackPlan({
    batch: batch(events, view),
    startingHpByUnitId: snapshotVisualHp(makePlayerView(before, "P1")),
    startingUnitsByUnitId: snapshotVisualUnits(makePlayerView(before, "P1")),
    finalView: view,
    reducedMotion,
  });
}
function vfx(b: BoardEventBatch) {
  return mapEventBatchToVfx({ ...b, view: b.view!, previousPositions: {} });
}
function sounds(b: BoardEventBatch) {
  return mapEventBatchToSfx({ ...b, view: b.view! });
}

test("Dora legal empty centers, ally passthrough, first enemy and hover are decision UI only", () => {
  const f = fixture(ABILITY_KAISER_DORA, true);
  const ally = Object.values(f.state.units).find((u) => u.owner === "P1" && u.class === "knight")!;
  const enemy = Object.values(f.state.units).find((u) => u.owner === "P2" && u.class === "knight")!;
  const state = setUnit(setUnit(f.state, ally.id, { position: { col: 2, row: 6 } }), enemy.id, {
    position: { col: 6, row: 6 },
  });
  const view = makePlayerView(state, "P1");
  const centers = getDoraTargetCenters(view, f.casterId);
  assert(centers.some((c) => c.col === 6 && c.row === 6));
  assert(!centers.some((c) => c.col === 7 && c.row === 6));
  const preview = buildActionPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: f.casterId,
    actionMode: "dora",
    targetingCell: center,
  });
  assert(preview?.kind === "compound");
  const area = preview.layers.find((layer) => layer.kind === "area");
  assert(area?.kind === "area");
  assert.equal(area.areaCells.length, 9);
  const hover: unknown[] = [];
  createCellHoverHandler({
    actionMode: "dora",
    doraTargetKeys: new Set(centers.map((c) => `${c.col},${c.row}`)),
    setDoraPreviewCenter: (c: unknown) => hover.push(c),
  } as never)(center);
  assert.deepEqual(hover, [center]);
  assert.deepEqual(vfx(batch([], view)), []);
  assert.deepEqual(sounds(batch([], view)), []);
  const sent: unknown[] = [];
  createCellClickHandler({
    view,
    selectedUnitId: f.casterId,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    actionMode: "dora",
    doraTargetKeys: new Set(centers.map((c) => `${c.col},${c.row}`)),
    sendGameAction: (a: unknown) => sent.push(a),
    setActionMode: () => {},
  } as never)(4, 6);
  assert.equal(sent.length, 1);
});

for (const [i, abilityId] of abilities.entries()) {
  test(`${abilityId}: empty resolution has one signature and no fabricated combat`, () => {
    const f = resolveAoe(abilityId, { empty: true });
    const p = plan(projectEventsForRecipient(f.after, f.events, "P1"), f.state, f.after);
    assert.equal(vfx(p.batch).filter((e) => e.effectId === effects[i]).length, 1);
    assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, 0);
    assert.equal(p.batch.combatCues!.filter((c) => c.kind !== "roll").length, 0);
    assert.equal(
      p.batch.combatCues!.filter((c) => c.kind === "roll").length,
      abilityId === ABILITY_KAISER_CARPET_STRIKE ? 2 : 0,
    );
  });
  for (const miss of [true, false])
    test(`${abilityId}: three targets, shared dice, one area, authoritative outcomes (${miss ? "miss" : "hit"})`, () => {
      const f = resolveAoe(abilityId, { miss, ally: abilityId === ABILITY_KAISER_CARPET_STRIKE });
      for (const reduced of [false, true]) {
        const p = plan(
          projectEventsForRecipient(f.after, f.events, "P1"),
          f.state,
          f.after,
          reduced,
        );
        const rolls = p.batch.combatCues!.filter((c) => c.kind === "roll");
        assert.equal(
          rolls.filter(
            (c) =>
              c.roll.rollKind.endsWith("_attackerRoll") ||
              c.roll.rollKind === "kaiserCarpetStrikeAttack",
          ).length,
          1,
        );
        assert.equal(rolls.filter((c) => c.roll.rollKind.endsWith("_defenderRoll")).length, 3);
        assert.equal(
          p.batch.combatCues!.filter((c) => c.kind === (miss ? "miss" : "hit")).length,
          3,
        );
        const impacts = vfx(p.batch).filter((e) => e.effectId === effects[i]);
        assert.equal(impacts.length, 1);
        const hp = p.queue.filter((q) => q.type === "damageHpTween");
        assert.equal(hp.length, miss ? 0 : 3);
        assert(hp.every((q) => q.startsAtMs > impacts[0].delayMs!));
        assert(
          impacts[0].delayMs! >
            rolls.find(
              (c) =>
                c.roll.rollKind.endsWith("_attackerRoll") ||
                c.roll.rollKind === "kaiserCarpetStrikeAttack",
            )!.atMs,
        );
        assert.equal(
          sounds(p.batch).filter((s) => s.key.startsWith("hero.") && !s.key.endsWith("launch"))
            .length,
          1,
        );
        assert.equal(
          sounds(p.batch).filter((s) => s.key === "common.combat.diceRoll").length,
          abilityId === ABILITY_KAISER_CARPET_STRIKE ? 5 : 4,
        );
        if (!miss && abilityId === ABILITY_KAISER_CARPET_STRIKE)
          assert(hp.every((q) => q.damage.amount === 1));
        if (!miss && abilityId === ABILITY_VLAD_FOREST)
          assert(f.targets.every((id) => f.after.units[id].movementDisabledNextTurn));
      }
    });
}

test("Carpet center stays authoritative, 2d9 has one dice display, pending area is a telegraph and reveal is reused", () => {
  const f = resolveAoe(ABILITY_KAISER_CARPET_STRIKE, { hidden: true, ally: true });
  assert.equal(f.stages[0].state.pendingRoll?.kind, "kaiserCarpetStrikeCenter");
  const waiting = makePlayerView(f.stages[0].state, "P1");
  assert.equal(buildPendingPreview(waiting, { col: 8, row: 0 }), null);
  const confirmed = makePlayerView(f.stages[1].state, "P1");
  assert.deepEqual(confirmed.pendingAoEPreview?.center, center);
  const preview = buildPendingPreview(confirmed, { col: 0, row: 0 });
  assert(preview?.kind === "area");
  assert.equal(preview.areaCells.length, 25);
  assert.equal(
    vfx(batch(f.stages[1].events, confirmed)).filter((e) => e.effectId === "carpetImpact").length,
    0,
  );
  const p = plan(projectEventsForRecipient(f.after, f.events, "P1"), f.state, f.after);
  assert.equal(p.batch.movementCues!.filter((c) => c.kind === "reveal").length, 1);
  assert.equal(vfx(p.batch).filter((e) => e.effectId === "hiddenReveal").length, 1);
  const roll = p.batch.combatCues!.find(
    (c) => c.kind === "roll" && c.roll.rollKind === "kaiserCarpetStrikeCenter",
  );
  assert(roll?.kind === "roll");
  const html = renderToStaticMarkup(
    createElement(CombatRollFeedback, { cue: roll, t: ((key: string) => key) as Translate }),
  );
  assert.match(html, /2d9/);
  assert.match(html, /pending.context.centerRoll/);
});

test("Carpet presentation keeps authoritative fixed damage with nearby Vlad Warlord", () => {
  const f = resolveAoe(ABILITY_KAISER_CARPET_STRIKE, { warlord: true, ally: true });
  const p = plan(projectEventsForRecipient(f.after, f.events, "P1"), f.state, f.after);
  const damage = p.queue.filter((q) => q.type === "damageHpTween");
  assert.equal(damage.length, 3);
  assert(damage.every((q) => q.damage.amount === 1 && q.damage.previousHp - q.damage.nextHp === 1));
});

test("Forest activation skips placements and never guesses its center or exposes consumed stakes", () => {
  const f = resolveAoe(ABILITY_VLAD_FOREST);
  const activated = f.stages[0];
  assert.equal(activated.state.stakeMarkers.length, 0);
  assert(!activated.events.some((e) => e.type === "stakesPlaced"));
  assert.equal(activated.state.pendingRoll?.kind, "vladForestTarget");
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(activated.state, activated.events, recipient);
    assert(!JSON.stringify(projected).includes("secret-"));
    assert(!JSON.stringify(projected).includes('"position"'));
    const b = batch(projected, makePlayerView(activated.state, recipient === "P1" ? "P1" : "P2"));
    assert(!vfx(b).some((e) => e.effectId === "forestEruption"));
    assert.deepEqual(sounds(b), []);
  }
  const view = makePlayerView(activated.state, "P1");
  const preview = buildPendingPreview(view, center);
  assert(preview?.kind === "compound");
  assert.equal(preview.layers[0].kind === "multiStep" && preview.layers[0].cells.length, 81);
  const waiting = makePlayerView(f.stages[1].state, "P2");
  const telegraph = selectBoardPreview({
    gameView: waiting,
    viewerPlayerId: "P2",
    selectedUnitId: null,
    actionMode: null,
    hoverActionMode: null,
    allowActionHoverPreview: false,
    hoveredAbilityId: null,
  });
  assert(telegraph?.kind === "area");
});

test("Field of Stakes has owner-only placement art/audio; safe notices have no signature", () => {
  const f = fixture(ABILITY_VLAD_FOREST, true);
  const placement: GameEvent = {
    type: "stakesPlaced",
    owner: "P1",
    positions: [{ col: 1, row: 2 }, { col: 7, row: 8 }, center],
    hiddenFromOpponent: true,
  };
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const b = batch(
      projectEventsForRecipient(f.state, [placement], recipient),
      makePlayerView(f.state, "P1"),
    );
    const p = buildCombatVisualPlaybackPlan({
      batch: b,
      startingHpByUnitId: {},
      startingUnitsByUnitId: {},
      finalView: b.view!,
      reducedMotion: false,
    });
    assert.equal(
      vfx(p.batch).filter((e) => e.effectId === "stakePlace").length,
      recipient === "P1" ? 3 : 0,
    );
    assert.equal(sounds(p.batch).length, recipient === "P1" ? 1 : 0);
    if (recipient !== "P1") assert(!JSON.stringify(b.events).includes('"positions"'));
  }
});

test("Bunker success/exit are one-shots, failure is silent, active hydration is state art only", () => {
  const f = fixture(ABILITY_KAISER_DORA, true);
  const opened = applyAction(
    f.state,
    { type: "enterStealth", unitId: f.casterId },
    makeRngSequence([]),
  );
  for (const success of [true, false]) {
    const result = respond(opened.state, [success ? 0.8 : 0.01]);
    const view = makePlayerView(result.state, "P1");
    const b = batch(projectEventsForRecipient(result.state, result.events, "P1"), view);
    assert.equal(sounds(b).length, success ? 1 : 0);
    assert.equal(vfx(b).filter((e) => e.effectId === "shield").length, success ? 1 : 0);
    assert.equal(Boolean(view.units[f.casterId].bunker?.active), success);
    const html = renderToStaticMarkup(
      createElement(Board, {
        view,
        playerId: "P1",
        interactionMode: "replay",
        highlightedCells: {},
        onCellClick: () => {},
      } as never),
    );
    assert.equal(html.includes('data-bunker-state="active"'), success);
    assert.deepEqual(sounds(batch([], view)), []);
    assert.deepEqual(vfx(batch([], view)), []);
  }
  const view = makePlayerView(f.state, "P1");
  const exit = batch([{ type: "bunkerExited", unitId: f.casterId, reason: "timerExpired" }], view);
  assert.equal(sounds(exit).length, 1);
  assert.equal(vfx(exit)[0].effectId, "bunkerStatus");
});

test("Stare prompt waits, resolution shares forced movement, hidden source identity stays private", () => {
  const initial = setupVladState();
  let state = initKnowledgeForOwners(
    toBattleState(
      setUnit(
        setUnit(initial.state, initial.vlad.id, { position: { col: 4, row: 4 } }),
        initial.enemy.id,
        { position: { col: 4, row: 6 } },
      ),
      "P2",
      initial.enemy.id,
    ),
  );
  let result = applyAction(
    state,
    { type: "attack", attackerId: initial.enemy.id, defenderId: initial.vlad.id },
    makeRngSequence([]),
  );
  result = respond(result.state, [0.01, 0.01]);
  result = respond(result.state, [0.99, 0.99]);
  const prompt = batch(
    projectEventsForRecipient(result.state, result.events, "P1"),
    makePlayerView(result.state, "P1"),
  );
  assert.equal(result.state.pendingRoll?.kind, "vladIntimidateChoice");
  assert(!vfx(prompt).some((e) => e.effectId === "vladGaze"));
  assert(!sounds(prompt).some((s) => s.key.endsWith("intimidatingStare")));
  const options = result.state.pendingRoll!.context.options as { col: number; row: number }[];
  const pushed = respond(result.state, [], { type: "intimidatePush", to: options[0] });
  const projected = projectEventsForRecipient(pushed.state, pushed.events, "P2");
  assert(
    projected.some(
      (e) => e.type === "intimidateResolved" && e.abilityId === ABILITY_VLAD_INTIMIDATE,
    ),
  );
  const p = plan(projected, result.state, pushed.state);
  assert.equal(p.batch.movementCues!.filter((c) => c.kind === "movement").length, 1);
  assert.equal(vfx(p.batch).filter((e) => e.effectId === "vladGaze").length, 1);
  assert.equal(sounds(p.batch).filter((s) => s.key.endsWith("intimidatingStare")).length, 1);
  const hidden = setUnit(state, initial.vlad.id, { isStealthed: true });
  const hiddenEvent = evIntimidateResolved(hidden, {
    attackerId: initial.enemy.id,
    defenderId: initial.vlad.id,
    from: initial.enemy.position ?? { col: 4, row: 6 },
    to: { col: 3, row: 6 },
  });
  const redactedSource = projectEventsForRecipient(hidden, [hiddenEvent], "P2")[0];
  assert(redactedSource.type === "intimidateResolved");
  assert.equal(redactedSource.abilityId, undefined);
  assert.equal(pushed.state.units[initial.enemy.id].turn.moveUsed, false);
  const moveView = makePlayerView(pushed.state, "P2");
  const moves = moveView.legal!.movesByUnitId[initial.enemy.id];
  assert(moves.length > 0);
  const preview = buildActionPreview({
    gameView: moveView,
    viewerPlayerId: "P2",
    sourceUnitId: initial.enemy.id,
    actionMode: "move",
  });
  assert(preview?.kind === "movement");
  assert.equal(preview.reachableCells.length, moves.length);
  const sentMoves: unknown[] = [];
  createCellClickHandler({
    view: moveView,
    selectedUnitId: initial.enemy.id,
    playerId: "P2",
    joined: true,
    isSpectator: false,
    actionMode: "move",
    legalMoveCoords: moves,
    sendGameAction: (action: unknown) => sentMoves.push(action),
    setMoveOptions: () => {},
    setActionMode: () => {},
  } as never)(moves[0].col, moves[0].row);
  assert.equal(sentMoves.length, 1);
  const moved = applyAction(
    pushed.state,
    { type: "move", unitId: initial.enemy.id, to: moves[0] },
    makeRngSequence([]),
  );
  assert.notEqual(moved.state, pushed.state);
});

test("Undyne shared displacement stays generic without selecting Vlad's signature", () => {
  const f = setupVladState();
  const state = initKnowledgeForOwners(
    setUnit(
      setUnit(f.state, f.vlad.id, { heroId: HERO_UNDYNE_ID, position: { col: 4, row: 4 } }),
      f.enemy.id,
      { position: { col: 4, row: 6 } },
    ),
  );
  const event = evIntimidateResolved(state, {
    attackerId: f.enemy.id,
    defenderId: f.vlad.id,
    from: { col: 4, row: 6 },
    to: { col: 3, row: 6 },
  });
  const p = plan(projectEventsForRecipient(state, [event], "P2"), state, state);
  assert.equal(p.batch.movementCues!.filter((c) => c.kind === "movement").length, 1);
  assert.equal(vfx(p.batch).filter((e) => e.effectId === "vladGaze").length, 0);
  assert.equal(sounds(p.batch).length, 0);
});

test("actual live AoE chains release every shared/defender roll once and cast precedes impact", () => {
  for (const ability of abilities) {
    const f = resolveAoe(ability);
    let resolution = createVisualResolutionState({
      batch: null,
      view: makePlayerView(f.state, "P1"),
      enabled: true,
    });
    const delivered: BoardEventBatch[] = [];
    f.stages.forEach((stage, i) => {
      const view = makePlayerView(stage.state, "P1");
      resolution = advanceVisualResolution(resolution, {
        batch: batch(projectEventsForRecipient(stage.state, stage.events, "P1"), view, i + 1),
        view,
        enabled: true,
      });
      if (resolution.visualBatch) delivered.push(resolution.visualBatch);
    });
    const rolls = delivered.flatMap((b) => b.events).filter((e) => e.type === "rollResolved");
    assert.equal(rolls.length, ability === ABILITY_KAISER_CARPET_STRIKE ? 5 : 4);
    assert.equal(new Set(rolls.map((e) => e.rollId)).size, rolls.length);
    assert(delivered[0].events.some((e) => e.type === "abilityUsed"));
    assert(!delivered[0].events.some((e) => e.type === "aoeResolved"));
    assert.equal(
      delivered.flatMap((b) => b.events).filter((e) => e.type === "aoeResolved").length,
      1,
    );
  }
});

test("signature identity dedupes event/use rebroadcasts, distinct casts work, reconnect discards history", () => {
  const f = resolveAoe(ABILITY_KAISER_DORA);
  const view = makePlayerView(f.after, "P1");
  const aggregate = projectEventsForRecipient(f.after, f.events, "P1").find(
    (e) => e.type === "aoeResolved",
  )!;
  const b = batch([aggregate, { ...aggregate, eventId: "rebroadcast" }], view);
  assert.equal(vfx(b).filter((e) => e.effectId === "doraImpact").length, 1);
  assert.equal(sounds(b).length, 1);
  const played: unknown[] = [];
  const audio = new SfxPlaybackSession({
    play: (cue) => {
      played.push(cue);
      return true;
    },
    stopGameplay: () => {},
    isMuted: () => false,
    getVolume: () => 1,
  });
  audio.schedule(b, view);
  audio.schedule({ ...b, revision: 2 }, view);
  assert.equal(played.length, 1);
  const next = batch([{ ...aggregate, abilityUseId: "another-use" }], view, 3);
  audio.schedule(next, view);
  assert.equal(played.length, 2);
  audio.reset();
  const ingress = new PresentationSession();
  ingress.begin({ roomId: "r", recipient: "P1" });
  assert.deepEqual(
    ingress.snapshot({ roomId: "r", recipient: "P1", streamId: "pack", revision: 2, view }),
    [],
  );
  assert.deepEqual(ingress.receive(b as never, { roomId: "r", recipient: "P1" }, view), []);
  assert.equal(
    ingress.receive(next as never, { roomId: "r", recipient: "P1" }, view)[0].events.length,
    1,
  );
});

test("each pack area retains full clipped geometry and paired/static readability at asymmetric edges in P1/P2", () => {
  for (const effect of effects)
    for (const flipped of [false, true])
      for (const reducedMotion of [false, true])
        for (const cell of [
          { col: 0, row: 2 },
          { col: 0, row: 0 },
        ]) {
          const incoming = [
            {
              id: `edge-${effect}`,
              effectId: effect,
              placement: "area" as const,
              sourceCell: cell,
            },
          ];
          const queued = enqueueBoardVfx({
            current: [],
            incoming: reducedMotion ? simplifyVfxForReducedMotion(incoming) : incoming,
            now: Date.now(),
          });
          const html = renderToStaticMarkup(
            createElement(VfxLayer, {
              effects: queued,
              view: { units: {} } as PlayerView,
              boardSize: 9,
              cellSize: 40,
              isFlipped: flipped,
              reducedMotion,
            }),
          );
          assert.match(html, /overflow-hidden/);
          assert.match(html, new RegExp(`width:${effect === "carpetImpact" ? 200 : 120}px`));
          assert.equal((html.match(/data-vfx-frames=/g) ?? []).length, 2);
        }
});

test("AoE death stays generic and follows damage; final unitDied alone owns removal", () => {
  for (const ability of abilities) {
    const f = resolveAoe(ability, { hp: 1 });
    const p = plan(projectEventsForRecipient(f.after, f.events, "P1"), f.state, f.after);
    assert.equal(p.queue.filter((q) => q.type === "damageHpTween").length, 3);
    const deaths = p.queue.filter((q) => q.type === "death");
    assert.equal(deaths.length, 3);
    for (const death of deaths) {
      const damage = p.queue.find(
        (q) => q.type === "damageHpTween" && q.damage.targetUnitId === death.death.unitId,
      )!;
      assert(death.startsAtMs > damage.endsAtMs);
    }
  }
});
