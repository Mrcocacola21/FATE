import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectedGameEvent } from "rules";
import { setLanguage } from "../i18n";
import { MinimalEventLog } from "./EventLog";

const events = [
  { type: "turnStarted", unitId: "a" },
  {
    type: "attackResolved",
    attackerId: "a",
    defenderId: "b",
    attackerRoll: { dice: [5, 3], sum: 8 },
    defenderRoll: { dice: [2, 4], sum: 6 },
    hit: true,
    damage: 1,
  },
] as unknown as ProjectedGameEvent[];

test("minimal log shows filters, newest first, and dice as tiles", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(
    <MinimalEventLog events={events} clientLog={[]} playerId="P1" />,
  );
  for (const label of ["All", "Attacks", "Abilities", "Effects", "Mine"]) {
    assert.match(markup, new RegExp(`>${label}<`));
  }
  assert.equal(markup.match(/class="minimal-log__item"/g)?.length, 2);
  assert.ok(markup.indexOf('data-tone="attacks"') < markup.indexOf('data-tone="turn"'));
  assert.equal(markup.match(/class="minimal-log-die"/g)?.length, 4);
  assert.match(markup, />Hit</);
});

test("minimal log hides the Mine filter for spectators", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(
    <MinimalEventLog events={events} clientLog={[]} playerId={null} />,
  );
  assert.doesNotMatch(markup, />Mine</);
});

test("minimal log explains attacks decided by a double", () => {
  setLanguage("en", null);
  const attack = (extra: object) =>
    ({
      type: "attackResolved",
      attackerId: "a",
      defenderId: "b",
      attackerRoll: { dice: [3, 3], sum: 6 },
      defenderRoll: { dice: [6, 1], sum: 7 },
      damage: 1,
      ...extra,
    }) as unknown as ProjectedGameEvent;
  const render = (event: ProjectedGameEvent) =>
    renderToStaticMarkup(<MinimalEventLog events={[event]} clientLog={[]} playerId="P1" />);
  assert.match(render(attack({ hit: true, doubleAutoHit: true })), /Double: automatic hit/);
  assert.match(render(attack({ hit: false, spearmanEvaded: true })), /Double: automatic dodge/);
  assert.doesNotMatch(render(attack({ hit: false })), /Double:/);
});
