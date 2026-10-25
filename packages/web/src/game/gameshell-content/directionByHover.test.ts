import assert from "node:assert/strict";
import test from "node:test";
import type { Coord, PlayerView } from "rules";
import { getBoardLinePreviewCells } from "../../components/Board";
import { createCellClickHandler } from "./cellHandlers";
import { axisTowards, countPreviewHits, getAreaPreviewCells } from "./helpers";

const anchor = { col: 4, row: 4 };

test("axis follows the pointer around the anchor", () => {
  assert.equal(axisTowards(anchor, { col: 8, row: 5 }, "col", true), "row");
  assert.equal(axisTowards(anchor, { col: 3, row: 0 }, "row", true), "col");
  assert.equal(axisTowards(anchor, { col: 6, row: 6 }, "row", true), "diagMain");
  assert.equal(axisTowards(anchor, { col: 2, row: 6 }, "row", true), "diagAnti");
  // Pointing at the anchor keeps the current axis.
  assert.equal(axisTowards(anchor, anchor, "diagAnti", true), "diagAnti");
  // Row/column-only abilities pick the dominant axis instead of a diagonal.
  assert.equal(axisTowards(anchor, { col: 6, row: 5 }, "row", false), "row");
  assert.equal(axisTowards(anchor, { col: 5, row: 7 }, "row", false), "col");
});

test("diagonal line previews stay on the board through the target", () => {
  const main = getBoardLinePreviewCells(9, { col: 2, row: 4 }, "diagMain");
  assert.ok(main.every((cell) => cell.col - cell.row === -2));
  assert.equal(main.length, 7);
  const anti = getBoardLinePreviewCells(9, { col: 2, row: 4 }, "diagAnti");
  assert.ok(anti.every((cell) => cell.col + cell.row === 6));
  assert.equal(anti.length, 7);
});

test("preview hit counts split visible figures into enemies and allies", () => {
  const view = {
    units: {
      a: { id: "a", owner: "P1", isAlive: true, position: { col: 4, row: 4 } },
      b: { id: "b", owner: "P2", isAlive: true, position: { col: 5, row: 5 } },
      c: { id: "c", owner: "P2", isAlive: false, position: { col: 3, row: 3 } },
      d: { id: "d", owner: "P2", isAlive: true, position: { col: 8, row: 8 } },
    },
  } as unknown as PlayerView;
  const cells = getAreaPreviewCells(9, anchor, 1);
  assert.equal(cells.length, 9);
  assert.deepEqual(countPreviewHits(view, cells, "P1"), { enemies: 1, allies: 1 });
  assert.equal(getAreaPreviewCells(9, { col: 0, row: 0 }, 1).length, 4);
});

test("Papyrus Cool Guy takes an anchor click, then fires along the pointed axis", () => {
  const papyrus = { id: "papyrus", owner: "P1", isAlive: true, position: { col: 1, row: 1 } };
  const view = { units: { papyrus }, boardSize: 9 } as unknown as PlayerView;
  const sent: unknown[] = [];
  let anchorCell: Coord | null = null;
  let mode: string | null = "papyrusCoolGuy";
  const handler = () =>
    createCellClickHandler({
      view,
      playerId: "P1",
      joined: true,
      isSpectator: false,
      hasBlockingRoll: false,
      boardSelectionPending: false,
      actionMode: "papyrusCoolGuy",
      selectedUnitId: papyrus.id,
      papyrusLineAxis: "row",
      directionByHover: true,
      lineAnchor: anchorCell,
      setLineAnchor: (value: Coord | null) => {
        anchorCell = value;
      },
      setActionMode: (value: string | null) => {
        mode = value;
      },
      sendGameAction: (action: unknown) => sent.push(action),
    } as never);

  handler()(4, 4);
  assert.deepEqual(anchorCell, { col: 4, row: 4 });
  assert.deepEqual(sent, [], "the first click only places the anchor");

  handler()(6, 6);
  assert.equal(sent.length, 1);
  assert.deepEqual((sent[0] as { payload: unknown }).payload, {
    target: { col: 4, row: 4 },
    axis: "diagMain",
  });
  assert.equal(anchorCell, null);
  assert.equal(mode, null);
});
