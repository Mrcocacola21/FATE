import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import type { HeroMeta, PlayerId, PlayerView, UnitState } from "rules";
import { createEmptyGame, makePlayerView, makeSpectatorView } from "../../../rules/src/index";
import { Board } from "../components/Board";
import { createPersistentStatusFixture } from "../features/vfx/persistentStatusPreview";
import { setLanguage } from "../i18n";
import { InspectedUnitCard } from "./components/RightPanel/sections/InspectedUnitCard";
import { buildRightPanelViewModel } from "./components/RightPanel/rightPanelViewModel";
import type { RightPanelProps } from "./components/RightPanel/types";
import { selectUnitFromBattle } from "./gameshell-content/matchPanelModel";
import {
  canInspectUnit,
  getBoardClickOutcome,
  isUnitInspectionOpen,
  shouldReturnSelectionToActiveUnit,
} from "./unitInspection";

function unit(id: string, owner: "P1" | "P2", extra: Partial<UnitState> = {}): UnitState {
  return {
    id,
    owner,
    class: "assassin",
    heroId: "chikatilo",
    hp: 3,
    attack: 2,
    isAlive: true,
    isStealthed: false,
    position: { col: 4, row: 4 },
    charges: { someCounter: 2 },
    cooldowns: {},
    turn: {},
    ...extra,
  } as UnitState;
}

function battleView(units: UnitState[], extra: Partial<PlayerView> = {}): PlayerView {
  return {
    phase: "battle",
    boardSize: 9,
    units: Object.fromEntries(units.map((item) => [item.id, item])),
    rosterUnits: {},
    lastKnownPositions: {},
    abilitiesByUnitId: {},
    legal: { placementsByUnitId: {}, movesByUnitId: {}, attackTargetsByUnitId: {} },
    legalIntents: {},
    stakeMarkers: [],
    forestMarkers: [],
    arenaEffects: [],
    turnQueue: [],
    turnOrder: [],
    turnOrderIndex: 0,
    turnQueueIndex: 0,
    currentPlayer: "P1",
    activeUnitId: null,
    ...extra,
  } as unknown as PlayerView;
}

const ally = unit("ally", "P1", { position: { col: 1, row: 1 } });
const enemy = unit("enemy", "P2", { position: { col: 4, row: 4 } });
const hiddenEnemy = unit("hidden", "P2", { position: { col: 6, row: 6 }, isStealthed: true });

function panelProps(
  view: PlayerView,
  role: RightPanelProps["role"],
  selectedUnitId: string | null,
) {
  return {
    view,
    role,
    selectedUnitId,
    actionMode: null,
    targetingMode: null,
    placeUnitId: null,
    moveOptions: null,
    joined: true,
    pendingRoll: false,
    onHoverAbility: () => undefined,
    onHoverActionMode: () => undefined,
    onSelectUnit: () => undefined,
    onSetActionMode: () => undefined,
    onSetPlaceUnit: () => undefined,
    onMoveRequest: () => undefined,
    onSendAction: () => undefined,
    pendingLokiLaughtOption: null,
    onQueueLokiLaughtOption: () => undefined,
    papyrusLineAxis: "row",
    onSetPapyrusLineAxis: () => undefined,
  } as unknown as RightPanelProps;
}

function panel(view: PlayerView, role: RightPanelProps["role"], selectedUnitId: string | null) {
  return buildRightPanelViewModel(
    panelProps(view, role, selectedUnitId),
    ((key: string) => key) as never,
  );
}

function boardMarkup(view: PlayerView, props: Partial<ComponentProps<typeof Board>> = {}) {
  return renderToStaticMarkup(
    <Board
      view={view}
      playerId="P1"
      selectedUnitId={null}
      highlightedCells={{}}
      showCoordinates={false}
      onSelectUnit={() => undefined}
      onCellClick={() => undefined}
      {...props}
    />,
  );
}

function cellOf(markup: string, unitId: string): string {
  const match = markup.match(new RegExp(`<button[^>]*data-unit-id="${unitId}"[^>]*>`));
  assert.ok(match, `cell of ${unitId} should render`);
  return match[0];
}

const idleBoard = {
  phase: "battle" as const,
  joined: true,
  canControlTestRoom: false,
  actionMode: null,
  targetingMode: null,
  placeUnitId: null,
  moveOptions: null,
  boardSelectionPending: false,
};

test("only a visible living figure of another side can be read", () => {
  assert.equal(canInspectUnit(enemy, "P1"), true);
  assert.equal(canInspectUnit(ally, "P1"), false);
  assert.equal(canInspectUnit(hiddenEnemy, "P1"), false);
  assert.equal(canInspectUnit({ ...enemy, isAlive: false }, "P1"), false);
  assert.equal(canInspectUnit(null, "P1"), false);
  // A spectator owns nothing, so every projected figure is read-only for them.
  assert.equal(canInspectUnit(ally, null), true);
});

test("viewing is closed while any task is open on the board", () => {
  assert.equal(isUnitInspectionOpen(idleBoard), true);
  for (const change of [
    { actionMode: "attack" },
    { actionMode: "move" },
    { targetingMode: { sourceUnitId: "ally" } },
    { placeUnitId: "ally" },
    { moveOptions: { unitId: "ally", legalTo: [], modes: ["normal"] } },
    { boardSelectionPending: true },
    { phase: "placement" as const },
    { phase: "ended" as const },
    { joined: false },
    { canControlTestRoom: true },
  ]) {
    assert.equal(isUnitInspectionOpen({ ...idleBoard, ...change }), false, JSON.stringify(change));
  }
});

test("while targeting, a click on an enemy still reaches the cell handler", () => {
  // In a targeting mode the board has unit picks and viewing switched off.
  assert.equal(
    getBoardClickOutcome({ disabled: false, isInspectable: false, selectable: false }),
    "cell",
  );
  // Idle: the same enemy opens for viewing.
  assert.equal(
    getBoardClickOutcome({ disabled: false, isInspectable: true, selectable: false }),
    "selectUnit",
  );
  // Own figure: selection as before.
  assert.equal(
    getBoardClickOutcome({ disabled: false, isInspectable: false, selectable: true }),
    "selectUnit",
  );
  // A hidden enemy is neither selectable nor inspectable, so nothing opens.
  assert.equal(
    getBoardClickOutcome({ disabled: false, isInspectable: false, selectable: false }),
    "cell",
  );
  // A spectator's board stays inert everywhere except on figures they may read.
  assert.equal(
    getBoardClickOutcome({ disabled: true, isInspectable: false, selectable: false }),
    "none",
  );
  assert.equal(
    getBoardClickOutcome({ disabled: true, isInspectable: true, selectable: false }),
    "selectUnit",
  );
});

test("selection accepts a visible enemy, never a hidden one and never during targeting", () => {
  const view = battleView([ally, enemy, hiddenEnemy]);
  const run = (allowUnitInspection: boolean, unitId: string | null, canControlTestRoom = false) => {
    const selected: Array<string | null> = [];
    selectUnitFromBattle(
      {
        view,
        playerId: "P1",
        canControlTestRoom,
        allowUnitInspection,
        setSelectedUnit: (id: string | null) => selected.push(id),
        setActionMode: () => undefined,
      } as never,
      unitId,
    );
    return selected;
  };
  assert.deepEqual(run(true, enemy.id), [enemy.id]);
  assert.deepEqual(run(true, hiddenEnemy.id), []);
  assert.deepEqual(run(false, enemy.id), [], "targeting keeps the queue from dropping the mode");
  assert.deepEqual(run(true, "not-projected"), []);
  assert.deepEqual(run(false, ally.id), [ally.id], "own figures select as before");
  assert.deepEqual(run(false, null), [null]);
  assert.deepEqual(run(false, hiddenEnemy.id, true), [hiddenEnemy.id], "sandbox control is intact");
});

test("the board offers viewing only on visible enemies and only when it is open", () => {
  setLanguage("en", { setItem: () => undefined });
  const view = battleView([ally, enemy, hiddenEnemy]);
  const open = boardMarkup(view, { allowUnitInspection: true });
  assert.match(cellOf(open, enemy.id), /data-inspectable="true"/);
  assert.doesNotMatch(cellOf(open, ally.id), /data-inspectable/);
  assert.doesNotMatch(cellOf(open, hiddenEnemy.id), /data-inspectable/);

  const targeting = boardMarkup(view, { allowUnitInspection: false, allowUnitSelection: false });
  assert.doesNotMatch(cellOf(targeting, enemy.id), /data-inspectable/);
});

test("a spectator's disabled board enables only the cells of figures they may read", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = boardMarkup(battleView([ally, enemy]), {
    playerId: null,
    disabled: true,
    allowUnitInspection: true,
  });
  assert.doesNotMatch(cellOf(markup, enemy.id), /\sdisabled=""/);
  assert.doesNotMatch(cellOf(markup, ally.id), /\sdisabled=""/);
  assert.equal((markup.match(/<button[^>]*\sdisabled=""/g) ?? []).length, 9 * 9 - 2);
});

function clickCell(
  view: PlayerView,
  unitId: string,
  props: Partial<ComponentProps<typeof Board>> = {},
) {
  const calls: { selected: Array<string | null>; cells: string[] } = { selected: [], cells: [] };
  let renderer: ReactTestRenderer;
  act(() => {
    renderer = create(
      <Board
        view={view}
        playerId="P1"
        selectedUnitId={null}
        highlightedCells={{}}
        showCoordinates={false}
        onSelectUnit={(id) => calls.selected.push(id)}
        onCellClick={(col, row) => calls.cells.push(`${col},${row}`)}
        {...props}
      />,
    );
  });
  const cell = renderer!.root.findByProps({ "data-unit-id": unitId });
  act(() => (cell.props.onClick as () => void)());
  act(() => renderer!.unmount());
  return calls;
}

test("clicks on the real board: viewing when idle, the cell handler while targeting", () => {
  setLanguage("en", { setItem: () => undefined });
  const view = battleView([ally, enemy, hiddenEnemy]);

  assert.deepEqual(clickCell(view, enemy.id, { allowUnitInspection: true }), {
    selected: [enemy.id],
    cells: [],
  });
  assert.deepEqual(
    clickCell(view, enemy.id, { allowUnitInspection: false, allowUnitSelection: false }),
    { selected: [], cells: ["4,4"] },
    "an enemy picked as a target goes to the cell handler",
  );
  assert.deepEqual(clickCell(view, ally.id, { allowUnitInspection: true }), {
    selected: [ally.id],
    cells: [],
  });
  assert.deepEqual(
    clickCell(view, hiddenEnemy.id, { allowUnitInspection: true }),
    { selected: [], cells: ["6,6"] },
    "a hidden enemy never selects, it stays an ordinary cell",
  );
  assert.deepEqual(
    clickCell(view, enemy.id, { playerId: null, disabled: true, allowUnitInspection: true }),
    { selected: [enemy.id], cells: [] },
    "a spectator reads figures on an otherwise inert board",
  );
});

test("in the real projection a hidden enemy is absent or stays closed", () => {
  const state = createPersistentStatusFixture(createEmptyGame());
  const hidden = state.units["status-stealth"];
  const viewer: PlayerId = hidden.owner === "P1" ? "P2" : "P1";

  assert.equal(makePlayerView(state, viewer).units[hidden.id], undefined);
  assert.equal(makeSpectatorView(state).units[hidden.id], undefined);

  // Odin's raven sees it from the next cell: the figure stays projected but must not open.
  const scouted = {
    ...state,
    units: {
      ...state.units,
      raven: {
        ...hidden,
        id: "raven",
        owner: viewer,
        heroId: "odin",
        isStealthed: false,
        position: { col: hidden.position!.col + 1, row: hidden.position!.row },
      },
    },
  };
  const projected = makePlayerView(scouted, viewer).units[hidden.id];
  assert.ok(projected, "the scouted figure is in the projection");
  assert.equal(projected.isStealthed, true);
  assert.equal(canInspectUnit(projected, viewer), false);
});

test("the panel opens a read-only model for an enemy and keeps the full one for own figures", () => {
  const view = battleView([ally, enemy, hiddenEnemy]);
  const inspected = panel(view, "P1", enemy.id);
  assert.equal(inspected.inspectedUnit?.id, enemy.id);
  assert.equal(inspected.selectedUnit, null);
  assert.equal(inspected.canAct, false);
  assert.deepEqual(inspected.actionableAbilities, []);

  assert.equal(panel(view, "P1", hiddenEnemy.id).inspectedUnit, null, "hidden stays closed");
  assert.equal(panel(view, "P1", ally.id).inspectedUnit, null);
  assert.equal(panel(view, "P1", ally.id).selectedUnit?.id, ally.id);
  assert.equal(panel(view, "spectator", ally.id).inspectedUnit?.id, ally.id);
  assert.equal(
    panel(battleView([enemy], { phase: "placement" }), "P1", enemy.id).inspectedUnit,
    null,
  );
});

test("hover previews never start from a figure the viewer does not control", () => {
  const hovered: unknown[] = [];
  const props = panelProps(battleView([ally, enemy]), "P1", enemy.id);
  props.onHoverActionMode = (mode) => hovered.push(mode);
  buildRightPanelViewModel(props, ((key: string) => key) as never).onModePreview("attack");
  assert.deepEqual(hovered, []);
});

const heroMeta = {
  id: "chikatilo",
  name: "Chikatilo",
  mainClass: "assassin",
  baseStats: { hp: 5, damage: 2, moveType: "assassin", attackRange: "melee" },
  description: "",
  abilities: [
    {
      id: "chikatiloAssassinMark",
      name: "Assassin Mark",
      type: "active",
      description: "Mark a target.",
      consumesAction: true,
      consumesMove: false,
    },
  ],
} as unknown as HeroMeta;

function card(extra: Partial<ComponentProps<typeof InspectedUnitCard>> = {}) {
  return renderToStaticMarkup(
    <InspectedUnitCard
      unit={enemy}
      heroName="Chikatilo"
      view={battleView([ally, enemy])}
      isSpectator={false}
      metadata={heroMeta}
      loading={false}
      failed={false}
      onRetry={() => undefined}
      onClose={() => undefined}
      {...extra}
    />,
  );
}

test("the card marks the enemy, lists its abilities with runes and has no way to act", () => {
  setLanguage("uk", { setItem: () => undefined });
  const markup = card();
  assert.match(markup, /Ворог · лише перегляд/);
  assert.match(markup, /data-ability-kind="active"/);
  assert.match(markup, /grimoire-ability__rune/);
  assert.match(markup, /Chikatilo/);
  assert.equal((markup.match(/<button/g) ?? []).length, 1, "closing is the only control");
  assert.match(markup, /data-testid="inspect-close"/);
  assert.doesNotMatch(markup, /data-action-bar-kind|core-resource|action-menu/);
  setLanguage("en", { setItem: () => undefined });
});

test("the card shows the board's stepped HP bar and no live charges", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = card({ unit: { ...enemy, hpBand: "medium" } });
  assert.match(markup, /data-hp-band="medium"/);
  assert.match(markup, /Max HP: \d+/);
  assert.doesNotMatch(markup, /3\/\d+/, "exact current HP stays with the owner");
  assert.doesNotMatch(markup, /someCounter|Charges: 2/);
});

test("a spectator gets a neutral label, not the enemy one", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = card({ isSpectator: true });
  assert.match(markup, /View only/);
  assert.doesNotMatch(markup, /Enemy ·/);
});

test("the card handles loading, a failed hero list and a hero without abilities", () => {
  setLanguage("en", { setItem: () => undefined });
  assert.match(card({ metadata: undefined, loading: true }), /figure-skeleton/);
  assert.match(card({ metadata: undefined, failed: true }), /role="alert"/);
  const empty = card({ metadata: { ...heroMeta, abilities: [] } });
  assert.doesNotMatch(empty, /data-ability-kind/);
  assert.doesNotMatch(empty, /figure-skeleton|role="alert"/);
});

test("the False Trail token shows its rules without waiting for the hero list", () => {
  setLanguage("en", { setItem: () => undefined });
  const token = unit("token", "P2", { heroId: "falseTrailToken" });
  const markup = card({ unit: token, metadata: undefined, loading: true });
  assert.match(markup, /data-testid="false-trail-rules"/);
  assert.doesNotMatch(markup, /figure-skeleton/);
});

test("the acting figure takes the selection back unless an enemy is being read this turn", () => {
  const base = {
    activeUnit: ally,
    selectedUnit: enemy,
    selectedUnitId: enemy.id,
    viewerId: "P1" as const,
    previousActiveUnitId: ally.id,
  };
  assert.equal(shouldReturnSelectionToActiveUnit(base), false, "reading during the same turn");
  assert.equal(
    shouldReturnSelectionToActiveUnit({ ...base, previousActiveUnitId: null }),
    true,
    "a turn that just started takes the selection back",
  );
  assert.equal(
    shouldReturnSelectionToActiveUnit({ ...base, selectedUnit: null, selectedUnitId: null }),
    true,
    "closing the card returns to the acting figure",
  );
  const otherAlly = unit("other-ally", "P1");
  assert.equal(
    shouldReturnSelectionToActiveUnit({
      ...base,
      selectedUnit: otherAlly,
      selectedUnitId: otherAlly.id,
    }),
    true,
    "own figures still snap back as before",
  );
  assert.equal(
    shouldReturnSelectionToActiveUnit({
      ...base,
      selectedUnit: hiddenEnemy,
      selectedUnitId: hiddenEnemy.id,
    }),
    true,
  );
  assert.equal(
    shouldReturnSelectionToActiveUnit({
      ...base,
      activeUnit: enemy,
      selectedUnit: ally,
      selectedUnitId: ally.id,
    }),
    false,
    "the opponent's acting figure never pulls the selection",
  );
});
