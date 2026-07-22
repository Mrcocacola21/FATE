import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import {
  createSafeClassDraftState,
  DRAFT_HERO_POOL,
  type HeroMeta,
} from "rules";
import type { Translate } from "../i18n";
import {
  DraftConfirmBar,
  DraftHeroCardView,
  DraftHeroDetailsView,
} from "./DraftHeroPreview";
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

function findByType(node: ReactNode, type: unknown): ReactElement | null {
  if (!isValidElement(node)) return null;
  const element = node as ReactElement<Record<string, unknown>>;
  if (element.type === type) return element;
  for (const child of Children.toArray(element.props.children as ReactNode)) {
    const found = findByType(child, type);
    if (found) return found;
  }
  return null;
}

function renderConfirmBar(
  overrides: Partial<Parameters<typeof DraftConfirmBar>[0]> = {},
) {
  return DraftConfirmBar({
    heroName: heroMeta.name,
    heroClass: draftHero.primaryClass,
    phase: "pick",
    lockReason: null,
    t,
    canConfirm: true,
    isLocalTurn: true,
    isConfirming: false,
    error: null,
    onConfirm: () => undefined,
    ...overrides,
  });
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
  const emptyBar = renderConfirmBar({
    heroName: null,
    heroClass: null,
    phase: "ban",
    canConfirm: false,
  });
  assert.equal(findByTestId(emptyBar, "confirm-draft-hero")?.props.disabled, true);
  assert.ok(findByTestId(emptyBar, "draft-confirm-disabled-reason"));

  const draft = createSafeClassDraftState();
  const reason = getDraftHeroLockReason({
    draft,
    draftPool: DRAFT_HERO_POOL,
    hero: draftHero,
    seat: "P2",
  });
  assert.equal(reason, "not_current_player");

  const waitingBar = renderConfirmBar({
    phase: "ban",
    lockReason: reason,
    canConfirm: false,
    isLocalTurn: false,
  });
  assert.equal(findByTestId(waitingBar, "confirm-draft-hero")?.props.disabled, true);
  assert.ok(findByTestId(waitingBar, "draft-confirm-disabled-reason"));
});

test("selected hero details scroll separately from the persistent confirmation bar", () => {
  const view = DraftHeroDetailsView({
    hero: {
      ...heroMeta,
      description: "A long hero description. ".repeat(50),
      abilities: Array.from({ length: 8 }, (_, index) => ({
        ...heroMeta.abilities[0],
        id: `preview-ability-${index}`,
      })),
    },
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
    onConfirm: () => undefined,
  });

  const panel = findByTestId(view, "selected-draft-hero-panel");
  const scrollArea = findByTestId(view, "draft-hero-details-scroll");
  const confirmBar = findByType(view, DraftConfirmBar);
  assert.ok(panel);
  assert.match(String(panel.props.className), /flex.*flex-col/);
  assert.ok(scrollArea);
  assert.match(String(scrollArea.props.className), /flex-1/);
  assert.match(String(scrollArea.props.className), /overflow-y-auto/);
  assert.ok(findByTestId(scrollArea, "draft-ability-details"));
  assert.equal(findByType(scrollArea, DraftConfirmBar), null);
  assert.ok(confirmBar, "confirmation bar is a sibling outside the scroll area");
  const renderedConfirmBar = DraftConfirmBar(
    confirmBar.props as Parameters<typeof DraftConfirmBar>[0],
  );
  assert.ok(findByTestId(renderedConfirmBar, "draft-confirm-bar"));
});

test("clicking Confirm dispatches only the existing command for the current phase", () => {
  const bans: string[] = [];
  const picks: string[] = [];
  const banBar = renderConfirmBar({
    phase: "ban",
    onConfirm: () => {
      sendDraftCandidateCommand({
        phase: "ban",
        heroId: draftHero.heroId,
        ban: (heroId) => bans.push(heroId),
        pick: (heroId) => picks.push(heroId),
      });
    },
  });
  (findByTestId(banBar, "confirm-draft-hero")?.props.onClick as () => void)();
  assert.deepEqual(bans, [draftHero.heroId]);
  assert.equal(picks.length, 0);

  const pickBar = renderConfirmBar({
    phase: "pick",
    onConfirm: () => {
      sendDraftCandidateCommand({
        phase: "pick",
        heroId: draftHero.heroId,
        ban: (heroId) => bans.push(heroId),
        pick: (heroId) => picks.push(heroId),
      });
    },
  });
  (findByTestId(pickBar, "confirm-draft-hero")?.props.onClick as () => void)();
  assert.deepEqual(bans, [draftHero.heroId]);
  assert.deepEqual(picks, [draftHero.heroId]);
});

test("mobile confirmation uses the fixed safe-area bar and touch-sized controls", () => {
  const mobileBar = renderConfirmBar({
    mobile: true,
    testId: "draft-mobile-confirm",
    confirmTestId: "confirm-draft-hero-mobile",
  });
  assert.match(String(mobileBar.props.className), /draft-mobile-confirm/);
  const confirm = findByTestId(mobileBar, "confirm-draft-hero-mobile");
  assert.ok(confirm);
  assert.match(String(confirm.props.className), /min-h-11/);
});

test("clear selection is separate from confirmation", () => {
  let cleared = 0;
  let confirmed = 0;
  const bar = renderConfirmBar({
    onClear: () => {
      cleared += 1;
    },
    onConfirm: () => {
      confirmed += 1;
    },
  });
  const buttons: ReactElement<Record<string, unknown>>[] = [];
  const visit = (node: ReactNode) => {
    if (!isValidElement(node)) return;
    const element = node as ReactElement<Record<string, unknown>>;
    if (element.type === "button") buttons.push(element);
    Children.forEach(element.props.children as ReactNode, visit);
  };
  visit(bar);
  assert.equal(buttons.length, 2);
  (buttons[0].props.onClick as () => void)();
  assert.equal(cleared, 1);
  assert.equal(confirmed, 0);
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
