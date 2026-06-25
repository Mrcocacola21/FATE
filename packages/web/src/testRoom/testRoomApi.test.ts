import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDiceQueue,
  shouldShowTestRoomPanel,
} from "./testRoomApi";

test("test room panel visibility is isolated", () => {
  assert.equal(shouldShowTestRoomPanel("normal", true), false);
  assert.equal(shouldShowTestRoomPanel("test", false), false);
  assert.equal(shouldShowTestRoomPanel("test", true), true);
});

test("dice queue accepts only capped d6 values", () => {
  assert.deepEqual(parseDiceQueue("6, 1 4"), [6, 1, 4]);
  assert.equal(parseDiceQueue("0,7"), null);
  assert.equal(parseDiceQueue(Array(101).fill("1").join(",")), null);
});
