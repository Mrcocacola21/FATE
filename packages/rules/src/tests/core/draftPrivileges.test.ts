import {
  applyDraftChoice,
  applyDraftPrivilegesToGame,
  banDraftHero,
  createSafeClassDraftState,
  DRAFT_CLASSES,
  DRAFT_HERO_POOL,
  getDraftBanLockReason,
  getDraftOrder,
  pickDraftHero,
  replayDraftHistory,
  type DraftChoice,
  type DraftState,
} from "../..";
import type { PlayerId, UnitClass } from "../../model";
import type { RuleDeclarationId } from "../../ruleDeclarations/types";
import {
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  makeRngSequence,
} from "../helpers/testUtils";

function choose(state: DraftState, player: PlayerId, choice: DraftChoice): DraftState {
  const result = applyDraftChoice(state, player, choice);
  assert(result.ok, `expected ${player} ${choice.type} to be accepted`);
  return result.state;
}

/** P1 wins the roll, keeps the field right and chooses the rule; P2 takes the last pick. */
function preparedDraft(ruleId: RuleDeclarationId = "normal_rule"): DraftState {
  let draft = createSafeClassDraftState();
  draft = choose(draft, "P1", { type: "roll", dice: [6, 6] });
  draft = choose(draft, "P2", { type: "roll", dice: [1, 2] });
  draft = choose(draft, "P1", { type: "chooseRight", right: "field" });
  draft = choose(draft, "P1", { type: "chooseFieldSide", side: "chooseRule" });
  draft = choose(draft, "P2", { type: "chooseDraftSide", side: "last" });
  return choose(draft, "P1", { type: "chooseRule", ruleId });
}

export function testDraftPrivilegesSettleRightsSidesAndRuleBeforeBans() {
  let draft = createSafeClassDraftState();
  assert(draft.phase === "initiative" && draft.currentPlayer === "P1", "draft opens with P1 rolling");
  const early = applyDraftChoice(draft, "P2", { type: "roll", dice: [3, 3] });
  assert(!early.ok && early.reason === "not_current_player", "P2 rolls after P1");
  const loaded = applyDraftChoice(draft, "P1", { type: "roll", dice: [7, 1] });
  assert(!loaded.ok && loaded.reason === "invalid_draft_choice", "dice must be two d6 values");

  draft = choose(draft, "P1", { type: "roll", dice: [3, 4] });
  draft = choose(draft, "P2", { type: "roll", dice: [5, 2] });
  assert(draft.phase === "initiative", "a tie keeps the initiative phase");
  assert(
    draft.privileges?.rolls.P1 === null && draft.privileges.rolls.P2 === null,
    "a tie clears both rolls",
  );

  draft = choose(draft, "P1", { type: "roll", dice: [6, 6] });
  draft = choose(draft, "P2", { type: "roll", dice: [1, 2] });
  assert(draft.phase === "right" && draft.currentPlayer === "P1", "the higher roll chooses a right");
  const loserRight = applyDraftChoice(draft, "P2", { type: "chooseRight", right: "draft" });
  assert(!loserRight.ok, "only the roll winner chooses a right");

  draft = choose(draft, "P1", { type: "chooseRight", right: "field" });
  assert(draft.privileges?.fieldHolder === "P1" && draft.privileges.draftHolder === "P2", "rights split");
  assert(draft.phase === "fieldSide" && draft.currentPlayer === "P1", "the winner sets their side first");

  draft = choose(draft, "P1", { type: "chooseFieldSide", side: "chooseRule" });
  assert(draft.privileges?.placementFirst === "P2", "choosing the rule means placing second");
  assert(draft.phase === "draftSide" && draft.currentPlayer === "P2", "then the other holder answers");

  draft = choose(draft, "P2", { type: "chooseDraftSide", side: "last" });
  assert(draft.privileges?.firstPicker === "P1", "taking the last pick gives the first pick away");
  assert(draft.phase === "rule" && draft.currentPlayer === "P1", "the rule is chosen before the bans");

  draft = choose(draft, "P1", { type: "chooseRule", ruleId: "court" });
  assert(draft.phase === "ban" && draft.currentPlayer === "P1", "the first picker opens the bans");

  const order = getDraftOrder(draft);
  assert(
    order.map((step) => `${step.kind}:${step.player}`).join(",") ===
      [
        "ban:P1", "ban:P2", "ban:P2", "ban:P1",
        "pick:P1", "pick:P2", "pick:P2", "pick:P1", "pick:P1", "pick:P2",
        "ban:P1", "ban:P2",
        "pick:P2", "pick:P1", "pick:P1", "pick:P2", "pick:P2", "pick:P1", "pick:P1", "pick:P2",
      ].join(","),
    "bans in the middle split the snake",
  );
  assert(order.filter((step) => step.kind === "pick" && step.player === "P1").length === 7, "seven picks each");
  console.log("draft_privileges_settle_rights_sides_and_rule_before_bans passed");
}

function firstLegalBan(draft: DraftState): string | null {
  return DRAFT_HERO_POOL.find((hero) => getDraftBanLockReason(draft, hero.heroId) === null)?.heroId ?? null;
}

function firstLegalPick(draft: DraftState, player: PlayerId): string {
  const taken = new Set([
    ...draft.bannedHeroIds,
    ...Object.values(draft.picks.P1),
    ...Object.values(draft.picks.P2),
  ]);
  const unitClass = DRAFT_CLASSES.find((candidate) => !draft.picks[player][candidate]);
  assert(unitClass, `${player} should have an open class`);
  const hero = DRAFT_HERO_POOL.find(
    (candidate) => candidate.primaryClass === unitClass && !taken.has(candidate.heroId),
  );
  assert(hero, `${player} should have a legal ${unitClass}`);
  return hero.heroId;
}

function runDraft(draft: DraftState): DraftState {
  let guard = 0;
  while (draft.phase !== "complete") {
    assert(guard++ < 64, "draft should finish");
    const player = draft.currentPlayer;
    const result =
      draft.phase === "ban"
        ? banDraftHero(draft, player, firstLegalBan(draft) ?? "")
        : pickDraftHero(draft, player, firstLegalPick(draft, player));
    assert(result.ok, `${draft.phase} step ${draft.stepIndex} should be accepted`);
    draft = result.state;
  }
  return draft;
}

export function testDraftWithMiddleBansCompletesAndReplays() {
  const draft = runDraft(preparedDraft());
  for (const player of ["P1", "P2"] as const) {
    assert(
      DRAFT_CLASSES.every((unitClass) => !!draft.picks[player][unitClass]),
      `${player} should fill every class`,
    );
  }
  const bans = draft.history.filter((event) => event.type === "ban" || event.type === "banSkipped");
  assert(bans.length === 6, "four opening and two middle ban steps");
  const replayed = replayDraftHistory(draft.history);
  assert(JSON.stringify(replayed) === JSON.stringify(draft), "history replays to the same draft");
  console.log("draft_with_middle_bans_completes_and_replays passed");
}

function heroOf(unitClass: UnitClass, index: number): string {
  const hero = DRAFT_HERO_POOL.filter((candidate) => candidate.primaryClass === unitClass)[index];
  assert(hero, `missing ${unitClass} #${index}`);
  return hero.heroId;
}

export function testMiddleBanNeverForcesAPick() {
  let draft = preparedDraft();
  // Opening bans: knight, spearman, rider, archer (one hero each).
  for (const unitClass of ["knight", "spearman", "rider", "archer"] as const) {
    const result = banDraftHero(draft, draft.currentPlayer, heroOf(unitClass, 0));
    assert(result.ok, `opening ban ${unitClass}`);
    draft = result.state;
  }
  // Picks: both players take assassin and trickster; P1 also berserker, P2 a knight.
  const picks: Array<[PlayerId, string]> = [
    ["P1", heroOf("assassin", 0)],
    ["P2", heroOf("assassin", 1)],
    ["P2", heroOf("trickster", 0)],
    ["P1", heroOf("trickster", 1)],
    ["P1", heroOf("berserker", 0)],
    ["P2", heroOf("knight", 1)],
  ];
  for (const [player, heroId] of picks) {
    const result = pickDraftHero(draft, player, heroId);
    assert(result.ok, `pick ${heroId}`);
    draft = result.state;
  }
  assert(draft.phase === "ban" && draft.currentPlayer === "P1", "middle bans open with the first picker");

  assert(
    getDraftBanLockReason(draft, heroOf("assassin", 2)) === "ban_class_not_contested",
    "a class both players filled cannot be banned",
  );
  assert(
    getDraftBanLockReason(draft, heroOf("spearman", 1)) === "ban_would_force_pick",
    "a class with an opening ban keeps both players a choice",
  );
  assert(
    getDraftBanLockReason(draft, heroOf("berserker", 1)) === null,
    "the berserker P2 still needs can be contested",
  );

  const ban = banDraftHero(draft, "P1", heroOf("berserker", 1));
  assert(ban.ok, "middle ban accepted");
  draft = ban.state;
  assert(
    getDraftBanLockReason(draft, heroOf("berserker", 2)) === "max_bans_per_class_reached" ||
      getDraftBanLockReason(draft, heroOf("berserker", 2)) === "ban_would_force_pick",
    "a second middle ban cannot leave P2 a single berserker",
  );
  console.log("middle_ban_never_forces_a_pick passed");
}

function readyLobby() {
  const rng = makeRngSequence([]);
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1"));
  state = attachArmy(state, createDefaultArmy("P2"));
  state = applyAction(state, { type: "lobbyInit", host: "P1" }, rng).state;
  state = { ...state, seats: { P1: true, P2: true } };
  state = applyAction(state, { type: "setReady", player: "P1", ready: true }, rng).state;
  state = applyAction(state, { type: "setReady", player: "P2", ready: true }, rng).state;
  return state;
}

export function testDraftRuleAndPlacementCarryIntoTheMatch() {
  const draft = runDraft(preparedDraft("court"));
  const state = applyDraftPrivilegesToGame(readyLobby(), draft);
  const started = applyAction(state, { type: "startGame" }, makeRngSequence([])).state;
  assert(started.phase === "placement", "the match goes straight to placement");
  assert(started.currentPlayer === "P2" && started.placementFirstPlayer === "P2", "P2 places first");
  assert(started.ruleDeclaration.selectedRuleId === "court", "the drafted rule is active");
  assert(started.ruleDeclaration.chooserPlayer === "P1", "P1 chose the rule");
  assert(started.ruleDeclaration.setupComplete, "court needs no setup");
  assert(!started.pendingRoll, "no initiative roll after a draft");

  const chess = applyDraftPrivilegesToGame(readyLobby(), runDraft(preparedDraft("chess_party")));
  const chessStart = applyAction(chess, { type: "startGame" }, makeRngSequence([])).state;
  assert(
    chessStart.pendingRoll?.kind === "ruleDeclarationChessKingChoice",
    "a rule with setup asks for it once the armies exist",
  );
  console.log("draft_rule_and_placement_carry_into_the_match passed");
}
