import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setLanguage } from "../../../i18n";
import { GameShellPendingRoll } from "./GameShellPendingRoll";
import { GlobalPendingTaskLayer } from "./GlobalPendingTaskLayer";
import { CurrentTaskPanel } from "./CurrentTaskPanel";

const initiativePending = {
  id: "initiative-p1",
  kind: "initiativeRoll",
  player: "P1",
  context: { step: "P1" },
};

function makeVm(overrides: Record<string, unknown> = {}) {
  return {
    pendingRoll: initiativePending,
    pendingMeta: initiativePending,
    playerId: "P1",
    isSpectator: false,
    boardSelectionPending: false,
    view: {
      phase: "lobby",
      units: {},
      initiative: { P1: null, P2: null, winner: null },
    },
    lastActionResult: null,
    showAttackerRoll: false,
    attackerDice: [],
    tieBreakAttacker: [],
    isForestMoveCheck: false,
    isForestChoice: false,
    isDuelistChoice: false,
    isAsgoreBraveryDefenseChoice: false,
    isLokiLaughtChoice: false,
    isGutsBerserkAttackChoice: false,
    isFriskPacifismChoice: false,
    isFriskGenocideChoice: false,
    isFriskKeenEyeChoice: false,
    isFriskSubstitutionChoice: false,
    isFriskChildsCryChoice: false,
    isOdinMuninnDefenseChoice: false,
    isChikatiloRevealChoice: false,
    isChikatiloDecoyChoice: false,
    isBerserkerDefenseChoice: false,
    lokiLaughtCurrent: 0,
    lokiCanAgainSomeNonsense: false,
    lokiCanChicken: false,
    lokiCanMindControl: false,
    lokiCanSpinTheDrum: false,
    lokiCanGreatLokiJoke: false,
    lokiLaughtChickenOptions: [],
    lokiLaughtMindControlEnemyOptions: [],
    lokiLaughtSpinCandidateIds: [],
    friskPacifismPoints: 0,
    friskPacifismDisabled: false,
    friskPacifismHugsOptions: [],
    friskPacifismWarmWordsOptions: [],
    friskPacifismPowerOfFriendshipEnabled: false,
    friskGenocidePoints: 0,
    friskKeenEyeTargetIds: [],
    defenderFriskGenocidePoints: 0,
    defenderFriskPacifismPoints: 0,
    defenderBerserkCharges: 0,
    defenderMuninnCharges: 0,
    defenderAsgoreBraveryReady: false,
    decoyCharges: 0,
    duelistAttackerHp: 0,
    sendAction: () => undefined,
    ...overrides,
  };
}

test("global pending task layer renders the initial initiative action above layouts", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(<GlobalPendingTaskLayer vm={makeVm()} />);

  assert.match(markup, /data-testid="pending-roll-overlay"/);
  assert.match(markup, /data-layer="pending-task"/);
  assert.match(markup, /Roll initiative/);
  assert.match(markup, />Roll dice</);
});

test("global pending task layer shows the opponent waiting state", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(
    <GlobalPendingTaskLayer
      vm={makeVm({
        pendingRoll: null,
        playerId: "P2",
        view: {
          phase: "lobby",
          units: {},
          initiative: { P1: 8, P2: null, winner: null },
        },
      })}
    />,
  );

  assert.match(markup, /data-testid="pending-roll-waiting-overlay"/);
  assert.match(markup, /Waiting for opponent to roll\./);
  assert.match(markup, /P1 rolled: 8/);
  assert.doesNotMatch(markup, />Roll dice</);
});

test("initiative roll action preserves the resolvePendingRoll command payload", () => {
  const sent: unknown[] = [];
  const element = GameShellPendingRoll({
    vm: makeVm({ sendAction: (action: unknown) => sent.push(action) }),
  });

  assert.ok(isValidElement(element));
  const modal = element as ReactElement<{
    onResolvePendingRoll: (choice?: unknown) => void;
  }>;
  modal.props.onResolvePendingRoll();

  assert.deepEqual(sent, [
    { type: "resolvePendingRoll", pendingRollId: "initiative-p1" },
  ]);
});

test("Madness of the Knight is a board direction task and never renders a roll action", () => {
  setLanguage("en", null);
  const pending = {
    id: "don-madness",
    kind: "donMadDelusionDirection",
    player: "P1",
    context: {
      unitId: "don",
      origin: { col: 4, row: 4 },
      options: [{ col: 1, row: 0 }],
    },
  };
  const vm = makeVm({
    pendingRoll: pending,
    pendingMeta: pending,
    boardSelectionPending: true,
    pendingQueueCount: 0,
    view: { phase: "battle", units: {} },
  });

  const overlayMarkup = renderToStaticMarkup(<GlobalPendingTaskLayer vm={vm} />);
  const taskMarkup = renderToStaticMarkup(<CurrentTaskPanel vm={vm} compact />);
  assert.equal(overlayMarkup, "", "board direction choices must not open the dice modal");
  assert.match(taskMarkup, /Madness of the Knight/);
  assert.match(taskMarkup, /Choose a direction for Don Kihote&#x27;s final dash/);
  assert.doesNotMatch(taskMarkup, /Roll dice/);
  assert.doesNotMatch(taskMarkup, />Cancel</);

  const waitingMarkup = renderToStaticMarkup(
    <GlobalPendingTaskLayer
      vm={makeVm({
        pendingRoll: null,
        pendingMeta: pending,
        playerId: "P2",
        pendingForLocalPlayer: false,
        boardSelectionPending: false,
        view: { phase: "battle", units: {} },
      })}
    />,
  );
  assert.match(waitingMarkup, /Waiting for opponent to choose/);
  assert.doesNotMatch(waitingMarkup, /Waiting for opponent to roll/);
});

test("gameplay layer tokens keep pending tasks above sheets, navigation, and task bars", () => {
  const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
  const layer = (name: string) => {
    const match = styles.match(new RegExp(`--z-game-${name}:\\s*(\\d+)`));
    assert.ok(match, `${name} layer token should exist`);
    return Number(match[1]);
  };

  const pending = layer("pending-modal");
  assert.ok(pending > layer("bottom-nav"));
  assert.ok(pending > layer("bottom-sheet"));
  assert.ok(pending > layer("current-task"));
  assert.match(styles, /\.pending-choice button\s*\{[^}]*min-height:\s*44px/s);
});
