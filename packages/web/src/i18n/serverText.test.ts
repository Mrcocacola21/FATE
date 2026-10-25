import assert from "node:assert/strict";
import test from "node:test";
import { translateForLanguage, type Translate } from ".";
import { localizeServerText } from "./displayMetadata";

test("legal-intent reason codes never reach the UI raw", () => {
  const t: Translate = (key, values) => translateForLanguage("en", key, values);
  for (const code of [
    "pendingRollBlocking",
    "notYourTurn",
    "noActiveUnit",
    "activeUnitNotOwned",
    "moveSlotUsed",
    "actionSlotUsed",
  ]) {
    const text = localizeServerText(code, t);
    assert.notEqual(text, code);
    assert.doesNotMatch(text, /^[a-z]+[A-Z]/);
  }
  assert.equal(localizeServerText("pendingRollBlocking", t), "Resolve the pending roll before acting.");
});
