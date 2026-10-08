import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import {
  createEmptyGame,
  makePlayerView,
  makeSpectatorView,
  type GameState,
  type PlayerView,
  type PlayerId,
  type DeliveredGameEvent,
  type UnitState,
} from "rules";
import { Board } from "../../components/Board";
import { BattleUnitSummary } from "../../game/components/RightPanel/sections/BattleUnitSummary";
import { getUnitTokenAsset } from "../../assets/unitVisuals";
import { translate } from "../../i18n";
import { sfxPlayer } from "../sfx/sfxPlayer";
import type { SoundCue } from "../sfx/sfxTypes";
import { PresentationSession } from "../../game/effects/presentationSession";
import type { BoardEventBatch } from "../../game/effects/types";
import {
  resolvePersistentStatuses,
  resolvePersistentGroundStatuses,
  resolveUnitStatuses,
  STATUS_VISUALS,
} from "./persistentStatuses";
import {
  createPersistentStatusFixture,
  createPersistentStatusPreview,
} from "./persistentStatusPreview";
import { UnitStatusVfx, StatusBadges } from "./UnitStatusVfx";
import { cellToBoardRect } from "./vfxGeometry";

function board(
  view: PlayerView,
  playerId: PlayerId | null = "P1",
  batch: BoardEventBatch | null = null,
  sessionKey = "match",
) {
  return (
    <Board
      view={view}
      playerId={playerId}
      selectedUnitId={null}
      highlightedCells={{}}
      visualEffectsEnabled
      eventBatch={batch}
      effectSessionKey={sessionKey}
      showCoordinates={false}
      onSelectUnit={() => undefined}
      onCellClick={() => undefined}
    />
  );
}
const fixture = () => createPersistentStatusFixture(createEmptyGame());
function patchUnit(state: GameState, id: string, patch: Partial<UnitState>): GameState {
  return { ...state, units: { ...state.units, [id]: { ...state.units[id], ...patch } } };
}

test("snapshot restores Bunker, curse, restrictions, both bone records and form token without one-shot VFX", () => {
  const view = makePlayerView(fixture(), "P1");
  const html = renderToStaticMarkup(board(view));
  for (const status of [
    "bunker",
    "curse",
    "movementDisabled",
    "immobilized",
    "stealth",
    "papyrusBlue",
    "sansOrange",
    "form",
    "mark",
  ])
    assert.ok(html.includes(`data-unit-status="${status}"`), status);
  assert.ok(html.includes(getUnitTokenAsset(view.units["status-form"]).src));
  assert.doesNotMatch(html, /data-vfx-cue=|data-vfx-effect=|unit-transforming|unit-bone-expiring/);
  assert.match(html, /data-unit-overlay="snared"/);
  assert.doesNotMatch(html, /hidden-source/);
});

test("owner, opponent and spectator use real projections for stealth, private marks, stakes and snares", () => {
  const state = fixture();
  const views = [
    makePlayerView(state, "P1"),
    makePlayerView(state, "P2"),
    makeSpectatorView(state),
  ];
  const owner = renderToStaticMarkup(board(views[0]));
  const enemy = renderToStaticMarkup(board(views[1], "P2"));
  const spectator = renderToStaticMarkup(board(views[2], null));
  assert.ok(views[0].units["status-stealth"]);
  assert.equal(views[1].units["status-stealth"], undefined);
  assert.equal(views[2].units["status-stealth"], undefined);
  assert.deepEqual(views[1].lastKnownPositions["status-stealth"], { col: 0, row: 0 });
  assert.match(owner, /data-status-unit="status-stealth"/);
  for (const html of [enemy, spectator]) {
    assert.doesNotMatch(
      html,
      /data-status-unit="status-stealth"|data-unit-status="stealth"|data-unit-status="mark"|data-board-marker="vlad_stake_hidden"|data-board-marker="jack_snare_hidden"/,
    );
    assert.match(html, /data-board-marker="vlad_stake"/);
  }
  assert.match(owner, /data-board-marker="vlad_stake_hidden"/);
  assert.match(owner, /data-board-marker="jack_snare_hidden"/);
  assert.equal(views[1].stakeMarkers.length, 1);
  assert.equal(views[1].jackTraps?.length, 0);
  assert.equal(views[2].jackTraps?.length, 0);
  assert.equal(views[1].units["status-bone"].chikatiloMarkStatus, undefined);
  assert.equal(views[2].units["status-bone"].chikatiloMarkStatus, undefined);
});

test("exactly tracked hidden target keeps only authorized mark, with no hidden condition aura", () => {
  let state = patchUnit(fixture(), "status-bone", {
    isStealthed: true,
    sansLastAttackCurseSourceId: "secret",
  });
  state = patchUnit(state, "status-marker", { chikatiloTrackedTargets: ["status-bone"] });
  const view = makePlayerView(state, "P1");
  const target = resolvePersistentStatuses(view, "P1").find(
    (item) => item.unitId === "status-bone",
  );
  assert.deepEqual(
    target?.statuses.map((status) => status.kind),
    ["trackedMark"],
  );
  assert.ok(view.units["status-bone"]?.position);
  const html = renderToStaticMarkup(board(view));
  assert.doesNotMatch(html, /data-unit-status="papyrusBlue"|data-unit-status="sansOrange"/);
});

test("movement-spent state is not movement-disabled and all current status kinds are typed and localized", () => {
  const base = fixture().units["status-form"];
  assert.deepEqual(
    resolveUnitStatuses(
      { ...base, gutsBerserkModeActive: false, turn: { ...base.turn, moveUsed: true } },
      "P1",
    ),
    [],
  );
  for (const visual of Object.values(STATUS_VISUALS))
    assert.notEqual(translate(visual.label), visual.label);
  const patches: Array<[Partial<UnitState>, string]> = [
    [{ sansMoveLockArmed: true }, "sansMoveLock"],
    [{ kaladinMoveLockSources: ["secret"] }, "kaladinMoveLock"],
    [{ lokiMoveLockSources: ["secret"] }, "lokiMoveLock"],
    [{ blindUntilOwnTurnStart: true }, "blind"],
    [{ friskCleanSoulShield: true }, "cleanSoul"],
    [{ asgoreBraveryAutoDefenseReady: true }, "autoDefense"],
    [{ friskPrecisionStrikeReady: true }, "precision"],
    [{ genghisKhanDiagonalMoveActive: true }, "diagonalMove"],
    [{ charges: { berserkAutoDefense: 1 } }, "berserkDefense"],
    [{ genghisKhanDecreeMovePending: true }, "decreeMove"],
    [{ genghisKhanMongolChargeActive: true }, "mongolCharge"],
    [{ riverBoatmanExtraMoves: 2 }, "boatmanMoves"],
    [{ riverBoatCarryAllyId: "private" }, "boatCarry"],
    [{ papyrusLongBoneMode: true }, "longBone"],
    [{ donSorrowfulReactionAvailable: true }, "sorrowReady"],
    [{ courtExtraFlexibleAction: { expiresAtRoundEnd: 1, used: false } }, "courtFlexible"],
    [{ courtGlobalMoveOnce: { expiresAtRoundEnd: 1, used: false } }, "courtGlobalMove"],
    [{ courtProceduralRestriction: { expiresAtRoundEnd: 1 } }, "courtRestriction"],
    [{ courtDamageCompensation: { expiresAtRoundEnd: 1, used: false } }, "courtCompensation"],
    [{ courtCosts: { expiresAtRoundEnd: 1, used: false } }, "courtCosts"],
    [{ cannotStealthUntilRoundEnd: 1 }, "stealthBlocked"],
    [
      { position: null, courtStasis: { expiresAtRoundEnd: 1, returnPosition: { col: 8, row: 8 } } },
      "stasis",
    ],
  ];
  for (const [patch, kind] of patches) {
    const statuses = resolveUnitStatuses({ ...base, gutsBerserkModeActive: false, ...patch }, "P1");
    assert.deepEqual(
      statuses.map((status) => status.kind),
      [kind],
    );
    assert.doesNotMatch(
      JSON.stringify(statuses),
      /secret|private|expiresAtRoundEnd|returnPosition/,
    );
  }
  assert.equal(
    resolveUnitStatuses(
      { ...base, gutsBerserkModeActive: false, courtCosts: { expiresAtRoundEnd: 1, used: true } },
      "P1",
    ).length,
    0,
  );
});

test("status IDs and mounted artwork survive identical snapshots, resizing and movement placement in either orientation", () => {
  const view = makePlayerView(fixture(), "P1");
  const render = (flipped = false, cellSize = 40, moving = false) => (
    <UnitStatusVfx
      view={{ ...view }}
      playerId="P1"
      visualUnits={view.units}
      motion={
        moving
          ? { "status-kaiser": { position: { col: 2.5, row: 5.5 }, opacity: 1, mode: "walk" } }
          : {}
      }
      boardSize={9}
      cellSize={cellSize}
      isFlipped={flipped}
      reducedMotion={flipped}
      t={translate}
    />
  );
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(render());
  });
  try {
    const anchor = renderer!.root.findByProps({ "data-status-unit": "status-kaiser" });
    const badge = renderer!.root.findByProps({ "data-status-id": "status-kaiser:bunker" });
    for (const [flipped, size, moving] of [
      [false, 40, false],
      [false, 32, true],
      [true, 56, true],
    ] as const) {
      act(() => renderer!.update(render(flipped, size, moving)));
      assert.equal(renderer!.root.findByProps({ "data-status-unit": "status-kaiser" }), anchor);
      assert.equal(renderer!.root.findByProps({ "data-status-id": "status-kaiser:bunker" }), badge);
      const position = moving ? { col: 2.5, row: 5.5 } : view.units["status-kaiser"].position!;
      const expected = cellToBoardRect(position, 9, size, flipped);
      assert.deepEqual(anchor.props.style, { ...expected, opacity: moving ? 1 : undefined });
    }
  } finally {
    act(() => renderer!.unmount());
  }
});

test("pre-death HP zero keeps statuses; final death, stasis and permission loss drop anchors immediately", () => {
  const state = fixture();
  const alive = makePlayerView(
    patchUnit(state, "status-cursed", { hp: 0, sansPendingDeath: { killerId: null } }),
    "P1",
  );
  assert.ok(resolvePersistentStatuses(alive, "P1").some((item) => item.unitId === "status-cursed"));
  for (const patch of [{ isAlive: false }, { position: null }] as Partial<UnitState>[]) {
    const view = makePlayerView(patchUnit(state, "status-cursed", patch), "P1");
    assert.equal(
      resolvePersistentStatuses(view, "P1").some((item) => item.unitId === "status-cursed"),
      false,
    );
  }
  const oldSelection = makePlayerView(state, "P1").units["status-stealth"];
  const summary = (view: PlayerView) =>
    renderToStaticMarkup(
      <BattleUnitSummary
        selectedUnit={oldSelection}
        selectedHeroName="Asgore"
        selectedMettatonRating={null}
        forestMarkers={[]}
        selectedInsideForest={false}
        stormActive={false}
        selectedStormExempt={false}
        moveRoll={null}
        economy={oldSelection.turn}
        abilityViews={[]}
        view={view}
        onHoverAbility={() => undefined}
      />,
    );
  assert.match(summary(makePlayerView(state, "P1")), /data-unit-status="patience"/);
  assert.doesNotMatch(summary(makeSpectatorView(state)), /data-unit-status=|data-action-bar-kind=/);
  const cleared = patchUnit(state, oldSelection.id, {
    asgorePatienceStealthActive: false,
    asgoreBraveryAutoDefenseReady: false,
  });
  assert.doesNotMatch(
    summary(makePlayerView(cleared, "P1")),
    /data-unit-status="patience"|data-unit-status="autoDefense"/,
  );
});

test("ground statuses restore silently and disappear with projected state; duplicate stakes expose no stack count", () => {
  for (const [mode, field] of [
    ["boneField", "sans_bone_field"],
    ["storm", "lechy_storm"],
  ] as const) {
    const html = renderToStaticMarkup(board(createPersistentStatusPreview(mode, "P1")));
    assert.ok(html.includes(`data-board-field="${field}"`));
    assert.doesNotMatch(html, /data-vfx-cue=/);
  }
  const cleared = renderToStaticMarkup(board(createPersistentStatusPreview("cleared", "P1")));
  assert.doesNotMatch(
    cleared,
    /data-status-unit=|data-board-field=|data-board-marker=|data-unit-overlay=/,
  );
  const state = fixture();
  state.stakeMarkers.push({ ...state.stakeMarkers[1], id: "another-public" });
  const spectator = makeSpectatorView(state);
  assert.equal(spectator.stakeMarkers.length, 1);
  assert.deepEqual(Object.keys(spectator.stakeMarkers[0]).sort(), ["isRevealed", "position"]);
});

test("Moon crater, global stealth restriction and Chess king use only projected rule state and round endpoints", () => {
  const base = fixture();
  const ruleData = {
    moonGame: {
      crater: { center: { col: 0, row: 0 }, radius: 1, expiresAtRoundStart: 3 },
      noStealthUntilRoundEnd: 2,
    },
  };
  const state = {
    ...base,
    roundNumber: 2,
    ruleDeclaration: { ...base.ruleDeclaration, selectedRuleId: "moon_game" as const, ruleData },
  };
  const view = makePlayerView(state, "P1");
  assert.deepEqual(
    resolvePersistentGroundStatuses(view).map((status) => status.cell),
    [
      { col: 0, row: 0 },
      { col: 0, row: 1 },
      { col: 1, row: 0 },
      { col: 1, row: 1 },
    ],
  );
  assert.ok(
    resolveUnitStatuses(view.units["status-kaiser"], "P1", view).some(
      (status) => status.kind === "stealthBlocked",
    ),
  );
  assert.equal(resolvePersistentGroundStatuses({ ...view, roundNumber: 3 }).length, 0);
  assert.equal(
    resolveUnitStatuses(view.units["status-kaiser"], "P1", { ...view, roundNumber: 3 }).some(
      (status) => status.kind === "stealthBlocked",
    ),
    false,
  );
  const html = renderToStaticMarkup(board(view, "P2"));
  assert.equal((html.match(/data-ground-status="crater"/g) ?? []).length, 4);
  assert.doesNotMatch(html, /data-vfx-cue=/);
  const chess = {
    ...view,
    ruleDeclaration: {
      ...view.ruleDeclaration,
      selectedRuleId: "chess_party" as const,
      ruleData: { chessParty: { kings: { P1: "status-kaiser", P2: null } } },
    },
  };
  assert.ok(
    resolvePersistentStatuses(chess, "P1")
      .find((item) => item.unitId === "status-kaiser")
      ?.statuses.some((status) => status.kind === "king"),
  );
});

test("large stacks keep accessible individual descriptions through compact overflow and full summary", () => {
  const statuses = Object.entries(STATUS_VISUALS).map(([kind, visual]) => ({
    id: `unit:${kind}`,
    kind: kind as keyof typeof STATUS_VISUALS,
    labelKey: visual.label,
  }));
  const compact = renderToStaticMarkup(
    <StatusBadges statuses={statuses} t={translate} maxBadges={3} />,
  );
  assert.equal((compact.match(/data-status-id=/g) ?? []).length, 3);
  const renderer = create(<StatusBadges statuses={statuses} t={translate} maxBadges={3} />);
  try {
    const badges = renderer.root.findAllByProps({ role: "img" });
    const overflow = badges[badges.length - 1];
    assert.equal(
      overflow.props["aria-label"],
      statuses
        .slice(3)
        .map((status) => translate(status.labelKey))
        .join(", "),
    );
  } finally {
    renderer.unmount();
  }
  const summary = renderToStaticMarkup(<StatusBadges statuses={statuses} t={translate} summary />);
  assert.equal((summary.match(/data-status-id=/g) ?? []).length, statuses.length);
});

test("Board restores silently, accepts same-revision entry once, then silently reconciles lifetime and role/stream resets", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout", "Date"], now: 1000 });
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      setTimeout,
      clearTimeout,
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (id: number) => frames.delete(id),
    },
  });
  const sounds: string[] = [];
  t.mock.method(sfxPlayer, "play", (cue: SoundCue) => {
    sounds.push(cue.key);
    return true;
  });
  t.mock.method(sfxPlayer, "stopGameplay", () => undefined);
  t.mock.method(sfxPlayer, "isMuted", () => false);
  t.mock.method(sfxPlayer, "getVolume", () => 1);
  const session = new PresentationSession();
  const binding = { roomId: "room", recipient: "P1" };
  let state = fixture();
  let view = makePlayerView(state, "P1");
  session.begin(binding);
  session.snapshot({ ...binding, streamId: "S", revision: 100, view });
  let renderer: ReactTestRenderer | undefined;
  const countStatus = (kind: string) =>
    renderer!.root.findAll((node) => node.props["data-unit-status"] === kind).length;
  const update = (batch: BoardEventBatch | null = null, role: PlayerId | null = "P1") =>
    act(() => renderer!.update(board(view, role, batch, session.key)));
  const finish = () =>
    act(() => {
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(performance.now() + 10000);
      }
      t.mock.timers.tick(2000);
    });
  const receive = (revision: number, events: DeliveredGameEvent[]) =>
    session.receive({ streamId: "S", revision, events }, binding, view)[0] ?? null;
  try {
    act(() => {
      renderer = create(board(view, "P1", null, session.key));
    });
    assert.equal(countStatus("bunker"), 1);
    assert.equal(countStatus("curse"), 1);
    assert.equal(sounds.length, 0);
    assert.equal(renderer!.root.findAll((node) => node.props["data-vfx-effect"]).length, 0);
    state = patchUnit(state, "status-kaiser", { bunker: { active: false, ownTurnsInBunker: 0 } });
    view = makePlayerView(state, "P1");
    update();
    assert.equal(countStatus("bunker"), 0);
    state = patchUnit(state, "status-kaiser", { bunker: { active: true, ownTurnsInBunker: 1 } });
    view = makePlayerView(state, "P1");
    session.snapshot({ ...binding, streamId: "S", revision: 101, view });
    update();
    assert.equal(countStatus("bunker"), 1);
    assert.equal(sounds.length, 0);
    const entry: DeliveredGameEvent = {
      type: "bunkerEntered",
      unitId: "status-kaiser",
      roll: 6,
      eventId: "entry",
    };
    const batch = receive(101, [entry]);
    assert.ok(batch);
    update(batch);
    assert.equal(sounds.filter((key) => key.endsWith("bunker.enter")).length, 1);
    const mounted = renderer!.root.findByProps({ "data-status-id": "status-kaiser:bunker" });
    update({ ...batch });
    assert.equal(sounds.filter((key) => key.endsWith("bunker.enter")).length, 1);
    assert.equal(renderer!.root.findByProps({ "data-status-id": "status-kaiser:bunker" }), mounted);
    assert.equal(receive(101, [entry]), null);
    finish();
    state = patchUnit(state, "status-kaiser", { bunker: { active: false, ownTurnsInBunker: 0 } });
    view = makePlayerView(state, "P1");
    update();
    assert.equal(countStatus("bunker"), 0);
    update(
      receive(102, [
        { type: "bunkerExited", unitId: "status-kaiser", reason: "timerExpired", eventId: "exit" },
      ]),
    );
    assert.equal(sounds.filter((key) => key.endsWith("bunker.exit")).length, 1);
    finish();
    const targetCell = state.units["status-cursed"].position!;
    update(
      receive(103, [
        {
          type: "sansLastAttackTick",
          targetId: "status-cursed",
          targetCell,
          damage: 1,
          hpAfter: 4,
          eventId: "tick",
        },
      ]),
    );
    assert.equal(sounds.filter((key) => key.endsWith("sansLastAttack.tick")).length, 1);
    assert.equal(sounds.filter((key) => key.endsWith("sansLastAttack.apply")).length, 0);
    finish();
    state = patchUnit(state, "status-cursed", { sansLastAttackCurseSourceId: undefined });
    view = makePlayerView(state, "P1");
    update();
    assert.equal(countStatus("curse"), 0);
    const beforeReset = sounds.length;
    for (const stream of ["S", "new-stream"]) {
      session.begin({ roomId: "other-room", recipient: "spectator" });
      view = makeSpectatorView(state);
      session.snapshot({
        roomId: "other-room",
        recipient: "spectator",
        streamId: stream,
        revision: 108,
        view,
      });
      update(null, null);
      finish();
      assert.equal(countStatus("stealth"), 0);
      assert.equal(countStatus("mark"), 0);
      assert.equal(sounds.length, beforeReset);
      assert.equal(renderer!.root.findAll((node) => node.props["data-vfx-effect"]).length, 0);
    }
  } finally {
    if (renderer) act(() => renderer!.unmount());
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
