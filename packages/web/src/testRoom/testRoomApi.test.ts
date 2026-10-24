import assert from "node:assert/strict";
import test from "node:test";
import {
  parseDiceQueue,
  isDebugInteger,
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
  assert.equal(parseDiceQueue("2.5,4"), null);
  assert.equal(parseDiceQueue("2,nope,4"), null);
  assert.deepEqual(parseDiceQueue(""), []);
  assert.equal(parseDiceQueue(Array(101).fill("1").join(",")), null);
});

test("sandbox number fields reject fractional, nonfinite and out-of-range values", () => {
  for (const value of [-1, 8.5, 9, NaN, Infinity]) assert.equal(isDebugInteger(value, 8), false);
  for (const value of [0, 4, 8]) assert.equal(isDebugInteger(value, 8), true);
});
