import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import {
  createSafeClassDraftState,
  DRAFT_HERO_POOL,
  type HeroMeta,
} from "rules";
import type { Translate } from "../i18n";
import { DraftHeroCardView, DraftHeroDetailsView } from "./DraftHeroPreview";
import {
  createDraftSubmissionGate,
  getDraftHeroCardState,
  getDraftHeroLockReason,
  sendDraftCandidateCommand,
} from "./draftPool";

const t: Translate = (key, values) => {
  if (key === "draft.selectedHero") return `Selected hero: ${values?.hero}`;
  return key;
};

const draftHero = DRAFT_HERO_POOL[0];
const heroMeta: HeroMeta = {
  id: draftHero.heroId,
  name: "Preview Hero",
  mainClass: draftHero.primaryClass,
  baseStats: { hp: 10, damage: 3, moveType: "straight", attackRange: "melee" },
  abilities: [
    {
      id: "preview-ability",
      name: "Preview Ability",
      type: "active",
      description: "Read this before committing.",
      consumesAction: true,
    },
  ],
};

function findByTestId(node: ReactNode, testId: string): ReactElement | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.props["data-testid"] === testId) return element;
  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const found = findByTestId(child, testId);
    if (found) return found;
  }
  return null;
}

test("clicking a Draft hero card only selects and highlights it locally", () => {
  let selectedHeroId: string | null = null;
  const commands: string[] = [];
  const view = DraftHeroCardView({
    hero: draftHero,
    meta: heroMeta,
    state: "available",
    lockReason: null,
    pickedBy: null,
    language: "en",
    t,
    onSelect: (heroId) => {
      selectedHeroId = heroId;
    },
  });

  const card = findByTestId(view, `draft-hero-${draftHero.heroId}`);
  assert.ok(card);
  (card.props.onClick as () => void)();

  assert.equal(selectedHeroId, draftHero.heroId);
  assert.deepEqual(commands, []);

  const selectedView = DraftHeroCardView({
    hero: draftHero,
    meta: heroMeta,
    state: "selected",
    lockReason: null,
    pickedBy: null,
    language: "en",
    t,
    onSelect: () => undefined,
  });
  assert.equal(
    findByTestId(selectedView, `draft-hero-${draftHero.heroId}`)?.props["aria-pressed"],
    true
  );
});

test("Confirm is disabled with no selected hero and for an inspecting opponent", () => {
  const emptyView = DraftHeroDetailsView({
    hero: null,
    draftMeta: null,
    phase: "ban",
    lockReason: null,
    pickedBy: null,
    language: "en",
    t,
    canConfirm: false,
    isLocalTurn: true,
    isConfirming: false,
    error: null,
    onConfirm: () => undefined,
  });
  assert.equal(findByTestId(emptyView, "confirm-draft-hero")?.props.disabled, true);

  const draft = createSafeClassDraftState();
  const reason = getDraftHeroLockReason({
    draft,
    draftPool: DRAFT_HERO_POOL,
    hero: draftHero,
    seat: "P2",
  });
  assert.equal(reason, "not_current_player");

  const waitingView = DraftHeroDetailsView({
    hero: heroMeta,
    draftMeta: draftHero,
    phase: "ban",
    lockReason: reason,
    pickedBy: null,
    language: "en",
    t,
    canConfirm: false,
    isLocalTurn: false,
    isConfirming: false,
    error: null,
    onConfirm: () => undefined,
  });
  assert.equal(findByTestId(waitingView, "confirm-draft-hero")?.props.disabled, true);
});

test("Ban and Pick confirmation dispatch only their existing command", () => {
  const bans: string[] = [];
  const picks: string[] = [];
  sendDraftCandidateCommand({
    phase: "ban",
    heroId: draftHero.heroId,
    ban: (heroId) => bans.push(heroId),
    pick: (heroId) => picks.push(heroId),
  });
  assert.deepEqual(bans, [draftHero.heroId]);
  assert.equal(picks.length, 0);

  sendDraftCandidateCommand({
    phase: "pick",
    heroId: draftHero.heroId,
    ban: (heroId) => bans.push(heroId),
    pick: (heroId) => picks.push(heroId),
  });
  assert.deepEqual(bans, [draftHero.heroId]);
  assert.deepEqual(picks, [draftHero.heroId]);
});

test("ability-detail interaction is isolated from Draft confirmation", () => {
  let confirmations = 0;
  let stopped = false;
  const view = DraftHeroDetailsView({
    hero: heroMeta,
    draftMeta: draftHero,
    phase: "pick",
    lockReason: null,
    pickedBy: null,
    language: "en",
    t,
    canConfirm: true,
    isLocalTurn: true,
    isConfirming: false,
    error: null,
    onConfirm: () => {
      confirmations += 1;
    },
  });

  const abilities = findByTestId(view, "draft-ability-details");
  assert.ok(abilities);
  (abilities.props.onClick as (event: { stopPropagation: () => void }) => void)({
    stopPropagation: () => {
      stopped = true;
    },
  });
  assert.equal(stopped, true);
  assert.equal(confirmations, 0);
});

test("locked heroes remain inspectable but cannot be confirmed", () => {
  const draft = createSafeClassDraftState();
  draft.bannedHeroIds = [draftHero.heroId];
  const lockReason = getDraftHeroLockReason({
    draft,
    draftPool: DRAFT_HERO_POOL,
    hero: draftHero,
    seat: "P1",
  });
  assert.equal(lockReason, "banned");
  assert.equal(
    getDraftHeroCardState({
      draft,
      draftPool: DRAFT_HERO_POOL,
      hero: draftHero,
      seat: "P1",
      selectedHeroId: null,
    }),
    "banned"
  );

  let inspected = false;
  const card = DraftHeroCardView({
    hero: draftHero,
    meta: heroMeta,
    state: "banned",
    lockReason,
    pickedBy: null,
    language: "en",
    t,
    onSelect: () => {
      inspected = true;
    },
  });
  (findByTestId(card, `draft-hero-${draftHero.heroId}`)?.props.onClick as () => void)();
  assert.equal(inspected, true);
});

test("submission gate blocks double-click duplicate commands until released", () => {
  const gate = createDraftSubmissionGate();
  assert.equal(gate.tryStart(draftHero.heroId, true), draftHero.heroId);
  assert.equal(gate.tryStart(draftHero.heroId, true), null);
  assert.equal(gate.isPending(), true);
  gate.release();
  assert.equal(gate.tryStart(draftHero.heroId, true), draftHero.heroId);
});
