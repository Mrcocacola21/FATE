import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { PlayerView, ProjectedGameEvent } from "rules";
import { createEmptyGame, makePlayerView } from "../../../../rules/src/index";
import { Board } from "../../components/Board";
import { EventLog } from "../../components/EventLog";
import { HpBar } from "../../components/HpBar";
import { createPersistentStatusFixture } from "../../features/vfx/persistentStatusPreview";
import { setLanguage, translate } from "../../i18n";
import { formatEventMessage } from "../../i18n/eventMessages";
import { buildCombatVisualPlaybackPlan, combatVisualPlaybackFrame } from "./combatPlayback";
import { snapshotVisualHp, snapshotVisualUnits } from "./visualResolution";
import type { PresentationEvent } from "./types";

function enemyView(hp: number, hpBand: "high" | "medium" | "low" = "high") {
  return {
    boardSize: 9,
    units: {
      source: {
        id: "source",
        owner: "P1",
        class: "knight",
        hp: 8,
        isAlive: true,
        position: { col: 1, row: 2 },
      },
      enemy: {
        id: "enemy",
        owner: "P2",
        class: "spearman",
        hp,
        hpBand,
        isAlive: true,
        position: { col: 2, row: 2 },
      },
    },
  } as unknown as PlayerView;
}

function plan(before: PlayerView, after: PlayerView, events: PresentationEvent[]) {
  return buildCombatVisualPlaybackPlan({
    batch: { streamId: "stream", revision: 1, events, view: after },
    startingHpByUnitId: snapshotVisualHp(before),
    startingUnitsByUnitId: snapshotVisualUnits(before),
    finalView: after,
    reducedMotion: false,
  });
}

// What an enemy's attack result looks like after the server removed its exact HP.
const maskedHit = {
  type: "attackResolved",
  eventId: "hit",
  attackerId: "source",
  defenderId: "enemy",
  sourceCell: { col: 1, row: 2 },
  targetCell: { col: 2, row: 2 },
  attackerRoll: { dice: [5, 4], sum: 9, isDouble: false },
  defenderRoll: { dice: [1, 2], sum: 3, isDouble: false },
  hit: true,
  damage: 2,
} as PresentationEvent;

test("the band bar moves in steps and never prints a number", () => {
  const markup = (band: "high" | "medium" | "low") =>
    renderToStaticMarkup(<HpBar current={3} max={6} showText band={band} />);
  assert.match(markup("high"), /data-hp-band="high"/);
  assert.match(markup("high"), /width:100%/);
  assert.match(markup("medium"), /width:55%/);
  assert.match(markup("low"), /width:25%/);
  assert.match(markup("low"), /bg-rose-500/);
  assert.doesNotMatch(markup("medium"), /3\/6/);
  // Own figures keep the exact bar.
  assert.match(renderToStaticMarkup(<HpBar current={3} max={6} showText />), /3\/6/);
});

test("the board draws an enemy's band and an owner's exact HP from the real projection", () => {
  setLanguage("en", { setItem: () => undefined });
  const state = createPersistentStatusFixture(createEmptyGame());
  const ownUnit = Object.values(state.units).find((unit) => !unit.isStealthed)!;
  const viewer = ownUnit.owner;
  const markup = renderToStaticMarkup(
    <Board
      view={makePlayerView(state, viewer)}
      playerId={viewer}
      selectedUnitId={null}
      highlightedCells={{}}
      showCoordinates={false}
      onSelectUnit={() => undefined}
      onCellClick={() => undefined}
    />,
  );
  assert.match(markup, /data-hp-band="(high|medium|low)"/);
  assert.match(markup, />\d+\/\d+</, "the viewer's own figure still prints exact HP");
});

test("a masked hit still plays its damage and keeps the old band until the end", () => {
  const p = plan(enemyView(6, "high"), enemyView(3, "medium"), [maskedHit]);
  assert(p.batch.combatCues!.some((cue) => cue.kind === "damage" || cue.kind === "hit"));
  assert(p.queue.some((item) => item.type === "damageHpTween"));
  assert.equal(p.startingUnitsByUnitId.enemy.hpBand, "high", "no band change before the impact");
  const frame = combatVisualPlaybackFrame(p, 0);
  assert.equal(frame.visualUnitsByUnitId.enemy.hpBand, "high");
  assert.equal(p.finalUnitsByUnitId.enemy.hpBand, "medium", "the new band lands with the result");
  assert(Number.isFinite(p.finalHpByUnitId.enemy));
});

test("area damage without an attack event still shows when the band did not change", () => {
  const aggregate = {
    type: "aoeResolved",
    eventId: "aoe",
    abilityId: "vladForest",
    sourceUnitId: "source",
    sourceCell: { col: 1, row: 2 },
    center: { col: 2, row: 2 },
    radius: 1,
    affectedUnitIds: ["enemy"],
    revealedUnitIds: [],
    damagedUnitIds: ["enemy"],
    damageByUnitId: { enemy: 1 },
  } as PresentationEvent;
  const p = plan(enemyView(6, "high"), enemyView(6, "high"), [aggregate]);
  assert(
    p.queue.some((item) => item.type === "damageHpTween" && item.damage.targetUnitId === "enemy"),
    "unchanged stand-in HP must not hide the hit",
  );
});

test("a masked heal animates from the stand-in without producing NaN", () => {
  const heal = {
    type: "unitHealed",
    eventId: "heal",
    unitId: "enemy",
    amount: 2,
  } as PresentationEvent;
  const p = plan(enemyView(2, "low"), enemyView(3, "medium"), [heal]);
  const tween = p.queue.find((item) => item.type === "healHpTween");
  assert(tween?.type === "healHpTween");
  assert.equal(tween.previousHp, 2);
  assert.equal(tween.nextHp, 4);
  assert(tween.endsAtMs > tween.startsAtMs);
});

test("log lines drop the HP part when the viewer does not know it", () => {
  setLanguage("en", { setItem: () => undefined });
  const attackMarkup = (extra: object) =>
    renderToStaticMarkup(
      <EventLog events={[{ ...maskedHit, ...extra } as ProjectedGameEvent]} clientLog={[]} />,
    );
  assert.match(attackMarkup({}), /Hit - Damage 2/);
  assert.doesNotMatch(attackMarkup({}), /Defender HP/);
  assert.match(attackMarkup({ defenderHpAfter: 3 }), /Defender HP 3/);

  const heal = formatEventMessage(
    { type: "unitHealed", unitId: "enemy", amount: 2 } as ProjectedGameEvent,
    "en",
    translate,
  );
  assert.equal(heal, "Healed: enemy +2");
  const cost = formatEventMessage(
    {
      type: "heroSelfCost",
      unitId: "enemy",
      sourceAbilityId: "gutsBerserkMode",
      damage: 1,
    } as ProjectedGameEvent,
    "en",
    translate,
  );
  assert.match(cost, /enemy paid 1 HP for/);
  assert.doesNotMatch(cost, /undefined|\(HP/);
});
