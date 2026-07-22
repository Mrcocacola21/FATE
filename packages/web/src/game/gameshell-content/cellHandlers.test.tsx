import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView, UnitState } from "rules";
import { Board } from "../../components/Board";
import { buildActionPreview } from "../targeting/buildActionPreview";
import { buildPreviewCellMap } from "../targeting/previewTypes";
import { createCellClickHandler } from "./cellHandlers";
import { getSelectableAttackTargetsAtCell } from "./helpers";

function unit(overrides: Partial<UnitState> & Pick<UnitState, "id" | "owner" | "position">) {
  return {
    class: "knight",
    hp: 5,
    attack: 2,
    isAlive: true,
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    turn: { moveUsed: false, attackUsed: false, actionUsed: false, stealthUsed: false },
    charges: {},
    cooldowns: {},
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    ...overrides,
  } as UnitState;
}

function sharedCellView(extraEnemies = 0): {
  view: PlayerView;
  attacker: UnitState;
  hiddenAlly: UnitState;
  enemies: UnitState[];
} {
  const attacker = unit({ id: "attacker", owner: "P1", position: { col: 3, row: 3 } });
  const hiddenAlly = unit({
    id: "hidden-ally",
    owner: "P1",
    class: "assassin",
    position: { col: 4, row: 4 },
    isStealthed: true,
  });
  const enemies = [
    unit({ id: "visible-enemy", owner: "P2", position: { col: 4, row: 4 } }),
    ...Array.from({ length: extraEnemies }, (_, index) =>
      unit({
        id: `visible-enemy-${index + 2}`,
        owner: "P2",
        position: { col: 4, row: 4 },
      }),
    ),
  ];
  const units = Object.fromEntries(
    [attacker, hiddenAlly, ...enemies].map((candidate) => [candidate.id, candidate]),
  );
  const legalTargetIds = enemies.map((enemy) => enemy.id);
  return {
    attacker,
    hiddenAlly,
    enemies,
    view: {
      boardSize: 9,
      phase: "battle",
      currentPlayer: "P1",
      activeUnitId: attacker.id,
      turnNumber: 1,
      units,
      pendingRoll: null,
      pendingMove: null,
      pendingAoEPreview: null,
      pendingCombatQueueCount: 0,
      lastKnownPositions: {},
      abilitiesByUnitId: {},
      legal: {
        placementsByUnitId: {},
        movesByUnitId: {},
        attackTargetsByUnitId: { [attacker.id]: legalTargetIds },
      },
    } as PlayerView,
  };
}

test("basic attack click selects the legal enemy above a hidden ally", () => {
  const { view, attacker, enemies } = sharedCellView();
  const sent: unknown[] = [];
  const handler = createCellClickHandler({
    view,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    actionMode: "attack",
    selectedUnitId: attacker.id,
    legalAttackTargets: [enemies[0].id],
    papyrusLongBoneAttackTargetIds: [],
    zoroAttackTargetIds: [],
    setZoroAttackTargetIds: () => undefined,
    sendGameAction: (action: unknown) => sent.push(action),
    sendAction: () => undefined,
  } as never);

  handler(4, 4);

  assert.deepEqual(sent, [
    { type: "attack", attackerId: attacker.id, defenderId: enemies[0].id },
  ]);
});

test("shared-cell target resolution excludes hidden allies and requires a choice for enemies", () => {
  const { view, attacker, hiddenAlly, enemies } = sharedCellView(1);
  const legalIds = enemies.map((enemy) => enemy.id);
  assert.deepEqual(
    getSelectableAttackTargetsAtCell(view, 4, 4, legalIds).map((target) => target.id),
    legalIds,
  );
  assert.equal(
    getSelectableAttackTargetsAtCell(view, 4, 4, legalIds).some(
      (target) => target.id === hiddenAlly.id,
    ),
    false,
  );

  const sent: unknown[] = [];
  const handler = createCellClickHandler({
    view,
    playerId: "P1",
    joined: true,
    isSpectator: false,
    hasBlockingRoll: false,
    boardSelectionPending: false,
    actionMode: "attack",
    selectedUnitId: attacker.id,
    legalAttackTargets: legalIds,
    papyrusLongBoneAttackTargetIds: [],
    zoroAttackTargetIds: [],
    setZoroAttackTargetIds: () => undefined,
    sendGameAction: (action: unknown) => sent.push(action),
    sendAction: () => undefined,
  } as never);

  handler(4, 4);
  assert.equal(sent.length, 0, "ambiguous cell click must wait for the target picker");
  handler(4, 4, enemies[1].id);
  assert.deepEqual(sent, [
    { type: "attack", attackerId: attacker.id, defenderId: enemies[1].id },
  ]);
});

test("basic attack preview marks the shared cell and board renders the legal enemy token", () => {
  const { view, attacker, hiddenAlly, enemies } = sharedCellView();
  const preview = buildActionPreview({
    gameView: view,
    viewerPlayerId: "P1",
    sourceUnitId: attacker.id,
    actionMode: "attack",
  });
  assert.equal(buildPreviewCellMap(preview).get("4,4")?.kinds.includes("validTarget"), true);

  const markup = renderToStaticMarkup(
    <Board
      view={view}
      playerId="P1"
      selectedUnitId={attacker.id}
      highlightedCells={{ "4,4": "attack" }}
      boardPreview={preview}
      preferredUnitIds={[enemies[0].id]}
      showCoordinates={false}
      onSelectUnit={() => undefined}
      onCellClick={() => undefined}
    />,
  );
  assert.match(markup, new RegExp(`data-unit-id="${enemies[0].id}"`));
  assert.doesNotMatch(markup, new RegExp(`data-unit-id="${hiddenAlly.id}"`));
});
