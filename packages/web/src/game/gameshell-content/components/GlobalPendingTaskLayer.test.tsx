import assert from "node:assert/strict";
import { gameShellFixture, type GameShellFixture } from "../../testHelpers/gameShellFixture";
import type { OpponentPendingPresentation, PendingRoll } from "rules";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import test from "node:test";
import { isValidElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { setLanguage } from "../../../i18n";
import { GameShellPendingRoll } from "./GameShellPendingRoll";
import {
  CollapsedPendingRollChip,
  GlobalPendingTaskLayer,
  isPendingRollCollapsed,
  nextPendingRollCollapseState,
} from "./GlobalPendingTaskLayer";
import { CurrentTaskPanel } from "./CurrentTaskPanel";
import { OpponentDecisionStatus } from "./OpponentDecisionStatus";
import { ReactionChoicePanel } from "./ReactionChoicePanel";

const reactionPending: PendingRoll = {
  id: "reaction-one", kind: "reactionChoice", player: "P1",
  context: { source: "tralala", reactorUnitId: "Berserker", targetUnitIds: ["Enemy"] },
};

test("reaction owner sees Attack and Pass and sends an explicit choice", () => {
  setLanguage("en", null);
  const sent: unknown[] = [];
  const vm = makeVm({ pendingRoll: reactionPending, pendingMeta: reactionPending, sendAction: (action: unknown) => sent.push(action) });
  const markup = renderToStaticMarkup(<GlobalPendingTaskLayer vm={vm} />);
  assert.match(markup, /Reaction opportunity/);
  assert.match(markup, /Berserker can attack Enemy/);
  assert.match(markup, />Attack</);
  assert.match(markup, />Pass</);
  assert.doesNotMatch(markup, />Roll 1d6</);
  const renderer = create(<GlobalPendingTaskLayer vm={vm} />);
  const panel = renderer.root.findByType(ReactionChoicePanel);
  const buttons = panel.findAllByType("button");
  act(() => buttons[0].props.onClick());
  act(() => buttons[1].props.onClick());
  assert.deepEqual(sent, [
    { type: "resolvePendingRoll", pendingRollId: reactionPending.id, choice: { type: "resolveReactionChoice", choice: "attack", targetId: "Enemy" } },
    { type: "resolvePendingRoll", pendingRollId: reactionPending.id, choice: { type: "resolveReactionChoice", choice: "pass" } },
  ]);
  renderer.unmount();
});

test("reaction opponent sees only a waiting status", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(<GlobalPendingTaskLayer vm={makeVm({
    pendingRoll: null, pendingMeta: reactionPending, playerId: "P2",
    view: { pendingDecision: { type: "opponentResolvingDecision", ownerPlayerId: "P1", viewerCanRespond: false,
      opponentStatus: { key: "reaction", title: "Reaction opportunity", message: "Opponent is deciding whether to make a reaction attack." } } },
  })} />);
  assert.match(markup, /Opponent is deciding whether to make a reaction attack/);
  assert.doesNotMatch(markup, /<button|role="dialog"|reaction-choice-panel/);
});

test("reaction prompt supports target selection and Ukrainian copy", () => {
  setLanguage("uk", null);
  const markup = renderToStaticMarkup(<ReactionChoicePanel context={{ ...reactionPending.context, targetUnitIds: ["Enemy", "Other enemy"] }} onResolve={() => undefined} />);
  assert.match(markup, /Можливість реакції/);
  assert.equal((markup.match(/>Атакувати</g) ?? []).length, 2);
  assert.match(markup, />Пропустити</);
  setLanguage("en", null);
});

const initiativePending: PendingRoll = {
  id: "initiative-p1",
  kind: "initiativeRoll",
  player: "P1",
  context: { step: "P1" },
  presentation: {
    title: "Initiative Roll",
    reason: "Determine who takes the first turn.",
    rollKind: "ability",
    diceLabel: "1d6",
    requestedPlayerId: "P1",
    requestedPlayerLabel: "Player 1",
  },
};

function makeVm(overrides: GameShellFixture = {}) {
  return gameShellFixture({
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
  });
}

test("global pending task layer renders the initial initiative action above layouts", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(<GlobalPendingTaskLayer vm={makeVm()} />);

  assert.match(markup, /data-testid="pending-roll-overlay"/);
  assert.match(markup, /data-layer="pending-task"/);
  assert.match(markup, /Roll initiative/);
  assert.match(markup, />Roll 1d6</);
  assert.match(markup, />Collapse</);
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

  assert.match(markup, /data-testid="opponent-decision-status"/);
  assert.match(markup, /Opponent is making a decision/);
  assert.match(markup, /Waiting for opponent\.\.\./);
  assert.doesNotMatch(markup, /<button|role="dialog"|aria-modal|modal-backdrop|fixed inset-0/);
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

  assert.deepEqual(sent, [{ type: "resolvePendingRoll", pendingRollId: "initiative-p1" }]);
});

test("private setup statuses render public explanations without interactive controls or secret metadata", () => {
  setLanguage("en", null);
  const cases = [
    ["vladStakes", "Vlad is preparing the battlefield", "hidden stakes", "Field of Stakes"],
    ["jackSnares", "Jack is preparing traps", "hidden snares", "Snares"],
    [
      "hassanStealth",
      "Hassan is using an ability",
      "choosing targets for a stealth effect",
      "Assassin Order",
    ],
  ] as const;
  for (const [key, title, message, abilityName] of cases) {
    const vm = makeVm({
      // Even stale owner UI data cannot override the authoritative waiting projection.
      pendingRoll: { ...initiativePending, context: { selectedCells: [{ col: 3, row: 4 }] } },
      pendingMeta: {
        ...initiativePending,
        presentation: { ...initiativePending.presentation!, reason: "SECRET TARGET C3" },
      },
      playerId: "P2",
      view: {
        phase: "battle",
        pendingDecision: {
          type: "opponentResolvingDecision",
          ownerPlayerId: "P1",
          viewerCanRespond: false,
          opponentStatus: { key, title, message, abilityName, hiddenInformation: true },
        },
      },
    });
    const markup = renderToStaticMarkup(<GlobalPendingTaskLayer vm={vm} />);
    assert.match(markup, new RegExp(title));
    assert.match(markup, new RegExp(message));
    assert.match(markup, new RegExp(abilityName));
    assert.match(markup, /Waiting for opponent\.\.\./);
    assert.match(markup, /animate-spin/);
    assert.doesNotMatch(
      markup,
      /<button|role="dialog"|aria-modal|modal-backdrop|SECRET TARGET|selectedCells|\(3,4\)/,
    );
    assert.equal(
      renderToStaticMarkup(<CurrentTaskPanel vm={vm} compact />),
      "",
      "only one persistent status is shown",
    );
  }
});

test("waiting status persists across choice steps and disappears on resolution", () => {
  setLanguage("en", null);
  const vm = makeVm({
    pendingRoll: null,
    playerId: "P2",
    view: {
      phase: "battle",
      pendingDecision: {
        type: "opponentResolvingDecision",
        ownerPlayerId: "P1",
        viewerCanRespond: false,
        opponentStatus: {
          key: "jackSnares",
          title: "Jack is preparing traps",
          message: "hidden snares",
          abilityName: "Snares",
        },
      },
    },
  });
  let renderer: ReturnType<typeof create>;
  act(() => {
    renderer = create(<GlobalPendingTaskLayer vm={vm} />);
  });
  const status = renderer!.root.findByProps({ "data-testid": "opponent-decision-status" });
  act(() => {
    renderer!.update(
      <GlobalPendingTaskLayer
        vm={{ ...vm, pendingMeta: { ...vm.pendingMeta!, id: "step-two" } }}
      />,
    );
  });
  assert.equal(renderer!.root.findByProps({ "data-testid": "opponent-decision-status" }), status);
  assert.equal(renderer!.root.findAllByType("button").length, 0);
  act(() => {
    renderer!.update(
      <GlobalPendingTaskLayer
        vm={{ ...vm, pendingMeta: null, view: { ...vm.view!, pendingDecision: null } }}
      />,
    );
  });
  assert.equal(renderer!.toJSON(), null);
  act(() => {
    renderer!.unmount();
  });
});

test("hidden and generic statuses have safe localized copy and action feedback", () => {
  setLanguage("en", null);
  const generic = renderToStaticMarkup(<OpponentDecisionStatus attemptedAction />);
  assert.match(generic, /Opponent is making a decision/);
  assert.match(generic, /Waiting for your opponent to finish their decision/);
  const presentation: OpponentPendingPresentation = {
    key: "hidden",
    title: "Opponent is making a decision",
    message: "hidden battlefield effect",
    hiddenInformation: true,
  };
  const hidden = renderToStaticMarkup(<OpponentDecisionStatus presentation={presentation} />);
  assert.match(hidden, /resolving a hidden battlefield effect/);
  assert.doesNotMatch(hidden, /Vlad|Jack|Hassan|Field of Stakes|<button/);
  setLanguage("uk", null);
  const localized = renderToStaticMarkup(<OpponentDecisionStatus presentation={presentation} />);
  assert.match(localized, /Очікування суперника/);
  assert.match(localized, /прихований ефект/);
  setLanguage("en", null);
});

test("pending roll card renders structured purpose, units, dice, and outcomes", () => {
  setLanguage("en", null);
  const attackPending: PendingRoll = {
    id: "attack-1",
    kind: "attack_defenderRoll",
    player: "P1",
    context: { attackerDice: [5, 3] },
    presentation: {
      title: "Defense Roll",
      reason: "Hassan attacks Duolingo.",
      rollKind: "defense",
      actorUnitId: "duolingo",
      actorName: "Duolingo",
      sourceUnitId: "hassan",
      sourceName: "Hassan",
      targetUnitId: "duolingo",
      targetName: "Duolingo",
      diceLabel: "2d6",
      successRule: "Roll higher than 8",
      successText: "Block or avoid the attack.",
      failureText: "Take 2 damage.",
      opponentRollTotal: 8,
      comparedAgainst: "Hassan's attack roll 8",
      requestedPlayerId: "P1",
    },
  };
  const markup = renderToStaticMarkup(
    <GlobalPendingTaskLayer
      vm={makeVm({
        pendingRoll: attackPending,
        pendingMeta: attackPending,
        view: { phase: "battle", units: {}, initiative: { P1: 8, P2: 4 } },
      })}
    />,
  );

  assert.match(markup, /Defense Roll/);
  assert.match(markup, /You are rolling for Duolingo/);
  assert.match(markup, /Hassan attacks Duolingo/);
  assert.match(markup, /Hassan&#x27;s attack roll 8/);
  assert.match(markup, /Block or avoid the attack/);
  assert.match(markup, /Take 2 damage/);
  assert.match(markup, />Roll 2d6</);
});

test("controlled attack context explicitly explains who the player controls", () => {
  const controlledPending: PendingRoll = {
    ...initiativePending,
    id: "controlled-roll",
    kind: "attack_attackerRoll",
    presentation: {
      ...initiativePending.presentation!,
      title: "Attack Roll",
      reason: "Duolingo attacks Zoro.",
      rollKind: "attack",
      actorName: "Duolingo",
      sourceName: "Duolingo",
      targetName: "Zoro",
      diceLabel: "2d6",
      isControlledRoll: true,
    },
  };
  const markup = renderToStaticMarkup(
    <GlobalPendingTaskLayer
      vm={makeVm({ pendingRoll: controlledPending, pendingMeta: controlledPending })}
    />,
  );
  assert.match(markup, /You are rolling for controlled Duolingo/);
});

test("collapsed chip keeps roll and open actions accessible without a board overlay", () => {
  setLanguage("en", null);
  const markup = renderToStaticMarkup(
    <CollapsedPendingRollChip
      pending={initiativePending}
      active
      onOpen={() => undefined}
      onRoll={() => undefined}
    />,
  );
  assert.match(markup, /data-testid="pending-roll-collapsed"/);
  assert.match(markup, /pointer-events-none/);
  assert.match(markup, /pointer-events-auto/);
  assert.match(markup, />Roll</);
  assert.match(markup, />Open</);
  assert.doesNotMatch(markup, /fixed inset-0/);
});

test("collapse preference stays with one roll id and clears on open or resolution", () => {
  const collapsed = nextPendingRollCollapseState(null, {
    type: "collapse",
    rollId: "roll-a",
  });
  assert.equal(isPendingRollCollapsed(collapsed, "roll-a"), true);
  assert.equal(
    isPendingRollCollapsed(collapsed, "roll-b"),
    false,
    "a new pending roll must default to expanded",
  );
  assert.equal(nextPendingRollCollapseState(collapsed, { type: "open" }), null);
  assert.equal(nextPendingRollCollapseState(collapsed, { type: "resolved" }), null);
});

test("minimal legacy pending roll uses the safe fallback card", () => {
  setLanguage("en", null);
  const minimalPending: PendingRoll = {
    id: "old-roll",
    kind: "attack_attackerRoll",
    player: "P1",
    context: {},
  };
  const markup = renderToStaticMarkup(
    <GlobalPendingTaskLayer
      vm={makeVm({ pendingRoll: minimalPending, pendingMeta: minimalPending })}
    />,
  );
  assert.match(markup, /Roll required/);
  assert.match(markup, /Roll dice to continue resolving the current effect/);
  assert.match(markup, />Roll 1d6</);
});

test("transformed Papyrus hit opens a large per-target bone popup", () => {
  setLanguage("en", null);
  const pending: PendingRoll = {
    id: "papyrus-bone-1",
    kind: "papyrusBoneChoice",
    player: "P1",
    context: {
      papyrusUnitId: "papyrus",
      targetUnitId: "duolingo",
      targetIds: ["duolingo", "zoro"],
      currentTargetIndex: 0,
      targetIndex: 1,
      targetCount: 2,
      availableBones: ["blue", "orange"],
    },
  };
  const markup = renderToStaticMarkup(
    <GlobalPendingTaskLayer
      vm={makeVm({
        pendingRoll: pending,
        pendingMeta: pending,
        view: {
          phase: "battle",
          units: {
            papyrus: { id: "papyrus", figureId: "Papyrus" },
            duolingo: { id: "duolingo", figureId: "Duolingo" },
          },
          initiative: { P1: 8, P2: 4, winner: "P1" },
        },
      })}
    />,
  );

  assert.match(markup, /data-testid="papyrus-bone-choice"/);
  assert.match(markup, /data-target-unit-id="duolingo"/);
  assert.match(markup, /Target 1 of 2: Duolingo/);
  assert.match(markup, />Blue Bone</);
  assert.match(markup, />Orange Bone</);
  assert.match(markup, /min-h-12/, "mobile buttons should remain touch-sized");
  assert.doesNotMatch(markup, />Roll dice</);
});

test("Madness of the Knight is a board direction task and never renders a roll action", () => {
  setLanguage("en", null);
  const pending: PendingRoll = {
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
  assert.match(waitingMarkup, /Waiting for your opponent to finish resolving an ability/);
  assert.doesNotMatch(waitingMarkup, /<button|role="dialog"/);
  assert.doesNotMatch(waitingMarkup, /Waiting for opponent to roll/);
});

test("gameplay layer tokens keep pending tasks above sheets, navigation, and task bars", () => {
  const styles = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
  const boardUi = readFileSync(new URL("../hooks/useGameShellBoardUi.ts", import.meta.url), "utf8");
  const boardColumn = readFileSync(new URL("./GameShellBoardColumn.tsx", import.meta.url), "utf8");
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
  assert.match(styles, /\.pending-roll-chip-layer\s*\{[^}]*z-index:/s);
  assert.match(styles, /\.pending-roll-chip\s*\{[^}]*max-w-/s);
  assert.match(styles, /\.pending-roll-chip__open\s*\{[^}]*min-h-10/s);
  assert.doesNotMatch(
    boardUi,
    /boardDisabled\s*=[\s\S]{0,160}hasBlockingRoll/,
    "pending rolls must not disable board inspection",
  );
  assert.match(
    boardColumn,
    /allowAnyUnitSelection=\{vm\.canControlTestRoom \|\| vm\.hasBlockingRoll\}/,
    "visible enemy units should remain inspectable while a roll blocks actions",
  );
});
