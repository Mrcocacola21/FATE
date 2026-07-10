import assert from "node:assert/strict";
import test from "node:test";
import {
  cellToBoardPoint,
  cellsToBoundingBox,
  lineBetweenCellsToCssTransform,
  pathCellsToSegments,
  radiusCellsToOverlay,
} from "./vfxGeometry";

test("cellToBoardPoint centers a single cell", () => {
  assert.deepEqual(cellToBoardPoint({ col: 0, row: 0 }, 9, 10, false), {
    x: 5,
    y: 85,
  });
  assert.deepEqual(cellToBoardPoint({ col: 0, row: 0 }, 9, 10, true), {
    x: 85,
    y: 5,
  });
});

test("radius cells produce the expected bounding box", () => {
  const cells = radiusCellsToOverlay({ col: 4, row: 4 }, 1, 9);
  assert.equal(cells.length, 9);
  assert.deepEqual(cellsToBoundingBox(cells, 9, 10, false), {
    left: 30,
    top: 30,
    width: 30,
    height: 30,
  });
});

test("line geometry matches source and target cell centers", () => {
  const horizontal = lineBetweenCellsToCssTransform(
    { col: 1, row: 1 },
    { col: 4, row: 1 },
    9,
    10,
    false,
  );
  assert.equal(horizontal.left, 15);
  assert.equal(horizontal.top, 75);
  assert.equal(horizontal.width, 30);
  assert.equal(horizontal.angleDeg, 0);

  const diagonal = lineBetweenCellsToCssTransform(
    { col: 1, row: 1 },
    { col: 4, row: 4 },
    9,
    10,
    false,
  );
  assert.equal(Math.round(diagonal.width), 42);
  assert.equal(Math.round(diagonal.angleDeg), -45);
});

test("path cells split into adjacent render segments", () => {
  assert.deepEqual(
    pathCellsToSegments([
      { col: 1, row: 1 },
      { col: 2, row: 2 },
      { col: 3, row: 3 },
    ]),
    [
      { from: { col: 1, row: 1 }, to: { col: 2, row: 2 } },
      { from: { col: 2, row: 2 }, to: { col: 3, row: 3 } },
    ],
  );
});

test("board resize recalculates geometry from cell size", () => {
  assert.deepEqual(cellToBoardPoint({ col: 2, row: 2 }, 9, 20, false), {
    x: 50,
    y: 130,
  });
});

