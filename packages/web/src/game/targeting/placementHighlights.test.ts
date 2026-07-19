import assert from "node:assert/strict";
import test from "node:test";
import type { Coord, PendingRoll, PlayerView } from "rules";
import {
  getPendingChikatiloPlacementCoords,
  getProjectedPlacementCoords,
} from "../gameshell-content/placementTargets";

function coordKey(coord: Coord): string {
  return `${coord.col},${coord.row}`;
}

test("False Promise token placement UI consumes only own normal deployment cells", () => {
  const tokenId = "falseTrail-P1-assassin-4";
  const ownDeployment = Array.from({ length: 7 }, (_, index) => ({
    col: index + 1,
    row: 0,
  }));
  const view = {
    legal: {
      placementsByUnitId: { [tokenId]: ownDeployment },
      movesByUnitId: {},
      attackTargetsByUnitId: {},
    },
  } as unknown as PlayerView;

  const highlighted = getProjectedPlacementCoords(view, tokenId);
  assert.deepEqual(highlighted, ownDeployment);
  assert.equal(highlighted.some((coord) => coord.row === 8), false);
  assert.equal(
    highlighted.some((coord) => coord.col === 0 || coord.col === 8),
    false
  );
});

test("real Chikatilo placement UI consumes projected cells excluding both deployment lines", () => {
  const legalPositions: Coord[] = [];
  for (let col = 0; col < 9; col += 1) {
    for (let row = 1; row < 8; row += 1) {
      legalPositions.push({ col, row });
    }
  }
  const pendingRoll = {
    id: "roll-chikatilo-placement",
    player: "P1",
    kind: "chikatiloFalseTrailPlacement",
    context: { legalPositions },
  } as PendingRoll;

  const highlighted = getPendingChikatiloPlacementCoords(pendingRoll);
  const highlightedKeys = new Set(highlighted.map(coordKey));
  assert.equal(highlighted.length, 63);
  assert.equal(highlightedKeys.has("4,4"), true);
  assert.equal(highlighted.some((coord) => coord.row === 0), false);
  assert.equal(highlighted.some((coord) => coord.row === 8), false);
});
