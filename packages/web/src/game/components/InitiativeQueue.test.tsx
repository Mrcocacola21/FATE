import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView, ProjectedUnitForRoster } from "rules";
import { setLanguage } from "../../i18n";
import { InitiativeQueue } from "./InitiativeQueue";

function rosterUnit(id: string, owner: "P1" | "P2", extra: Partial<ProjectedUnitForRoster> = {}): ProjectedUnitForRoster {
  return {
    id,
    owner,
    class: "knight",
    isAlive: true,
    isPlaced: true,
    isStealthed: false,
    hpVisibility: owner === "P1" ? "exact" : "hidden",
    hp: owner === "P1" ? 4 : undefined,
    maxHp: owner === "P1" ? 6 : undefined,
    ...extra,
  } as ProjectedUnitForRoster;
}

function queueView(): PlayerView {
  const roster = {
    a: rosterUnit("a", "P1"),
    b: rosterUnit("b", "P2"),
    c: rosterUnit("c", "P1"),
    d: rosterUnit("d", "P2"),
    e: rosterUnit("e", "P1"),
    dead: rosterUnit("dead", "P2", { isAlive: false }),
  };
  return {
    // "hidden" is absent from the roster projection, like an enemy the viewer cannot see.
    turnQueue: ["a", "b", "c", "hidden", "d", "e"],
    turnQueueIndex: 2,
    turnOrder: [],
    turnOrderIndex: 0,
    rosterUnits: roster,
    units: {},
  } as unknown as PlayerView;
}

test("initiative queue splits done, current, upcoming and defeated figures", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(
    <InitiativeQueue view={queueView()} playerId="P1" selectedUnitId={null} onSelectUnit={() => undefined} />,
  );
  // Two finished figures collapse into tokens, "c" is current, then four upcoming rows.
  assert.equal(markup.match(/initiative-queue__done-token/g)?.length, 2);
  assert.equal(markup.match(/class="initiative-queue__current"/g)?.length, 1);
  assert.equal(markup.match(/class="initiative-queue__row"/g)?.length, 3);
  assert.match(markup, /data-next="true"/);
  assert.match(markup, /\+2/);
  assert.equal(markup.match(/initiative-queue__defeated-token/g)?.length, 1);
  // Own HP is exact; the current P1 figure shows it, the hidden unit renders as "?".
  assert.match(markup, /4\/6/);
  assert.match(markup, />\?</);
});

test("initiative queue never shows enemy HP", () => {
  setLanguage("en", null);
  const view = queueView();
  (view as unknown as { turnQueueIndex: number }).turnQueueIndex = 1;
  const markup = renderToStaticMarkup(
    <InitiativeQueue view={view} playerId="P1" selectedUnitId={null} onSelectUnit={() => undefined} />,
  );
  const current = markup.slice(markup.indexOf("initiative-queue__current"), markup.indexOf("initiative-queue__list"));
  assert.doesNotMatch(current, /\d+\/\d+ HP/);
});
