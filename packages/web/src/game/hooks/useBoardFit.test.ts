import assert from "node:assert/strict";
import test from "node:test";
import {
  BOARD_DEFAULT_MAX_CELL_SIZE,
  BOARD_MIN_CELL_SIZE,
  calculateBoardFitMetrics,
  clampBoardZoom,
} from "./useBoardFit";

test("board fit uses the smaller available axis", () => {
  const metrics = calculateBoardFitMetrics({
    boardSize: 9,
    containerWidth: 1200,
    containerHeight: 620,
  });

  assert.equal(metrics.cellSize, 64);
  assert.equal(metrics.totalPixelSize, 614);
});

test("board fit keeps desktop cells readable without exceeding default max", () => {
  const metrics = calculateBoardFitMetrics({
    boardSize: 9,
    containerWidth: 1600,
    containerHeight: 1000,
  });

  assert.equal(metrics.cellSize, BOARD_DEFAULT_MAX_CELL_SIZE);
  assert.equal(metrics.labelSize, 53);
});

test("board fit can compact on very small stages", () => {
  const metrics = calculateBoardFitMetrics({
    boardSize: 9,
    containerWidth: 360,
    containerHeight: 360,
  });

  assert.ok(metrics.cellSize < BOARD_MIN_CELL_SIZE);
  assert.equal(metrics.totalPixelSize <= 360, true);
});

test("board zoom is clamped to a board-only range", () => {
  assert.equal(clampBoardZoom(0.1), 0.75);
  assert.equal(clampBoardZoom(2), 1.35);
  assert.equal(clampBoardZoom(1.1), 1.1);
});
