import type {
  DraftLockReason,
  DraftState,
  HeroDraftMeta,
  PlayerId,
  UnitClass,
} from "rules";

export type DraftHeroCardState =
  | "available"
  | "selected"
  | "picked"
  | "banned"
  | "locked"
  | "not_draftable";

export type DraftHeroLockReason = DraftLockReason | "draft_complete";

/** Groups the authoritative pool received from the server without rebuilding eligibility. */
export function groupDraftPoolByClass(
  draftPool: readonly HeroDraftMeta[]
): Map<UnitClass, HeroDraftMeta[]> {
  const grouped = new Map<UnitClass, HeroDraftMeta[]>();
  for (const hero of draftPool) {
    const heroes = grouped.get(hero.primaryClass) ?? [];
    heroes.push(hero);
    grouped.set(hero.primaryClass, heroes);
  }
  return grouped;
}

export function getPickedHeroOwner(
  draft: DraftState,
  heroId: string
): PlayerId | null {
  for (const player of ["P1", "P2"] as const) {
    if (Object.values(draft.picks[player]).includes(heroId)) return player;
  }
  return null;
}

export function getDraftHeroLockReason(params: {
  draft: DraftState;
  draftPool: readonly HeroDraftMeta[];
  hero: HeroDraftMeta;
  seat: PlayerId | null;
}): DraftHeroLockReason | null {
  const { draft, draftPool, hero, seat } = params;
  if (!hero.implemented || !hero.draftEnabled || hero.isBase) {
    return "hero_not_draftable";
  }
  if (draft.phase === "complete") return "draft_complete";
  if (draft.bannedHeroIds.includes(hero.heroId)) return "banned";
  if (getPickedHeroOwner(draft, hero.heroId)) return "picked";
  if (!seat || seat !== draft.currentPlayer) return "not_current_player";
  if (draft.phase === "pick" && draft.picks[seat][hero.primaryClass]) {
    return "class_slot_already_filled";
  }
  if (draft.phase === "ban") {
    const bannedInClass = draft.bannedHeroIds.some((heroId) =>
      draftPool.some(
        (candidate) =>
          candidate.heroId === heroId && candidate.primaryClass === hero.primaryClass
      )
    );
    if (bannedInClass) return "max_bans_per_class_reached";

    const pickedIds = new Set([
      ...Object.values(draft.picks.P1),
      ...Object.values(draft.picks.P2),
    ]);
    const remainingInClass = draftPool.filter(
      (candidate) =>
        candidate.primaryClass === hero.primaryClass &&
        candidate.heroId !== hero.heroId &&
        !draft.bannedHeroIds.includes(candidate.heroId) &&
        !pickedIds.has(candidate.heroId)
    ).length;
    if (remainingInClass < 2) return "ban_would_break_class_pool";
  }
  return null;
}

export function getDraftHeroCardState(params: {
  draft: DraftState;
  draftPool: readonly HeroDraftMeta[];
  hero: HeroDraftMeta;
  seat: PlayerId | null;
  selectedHeroId: string | null;
}): DraftHeroCardState {
  const { draft, draftPool, hero, seat, selectedHeroId } = params;
  if (selectedHeroId === hero.heroId) return "selected";
  if (!hero.implemented || !hero.draftEnabled || hero.isBase) return "not_draftable";
  if (draft.bannedHeroIds.includes(hero.heroId)) return "banned";
  if (getPickedHeroOwner(draft, hero.heroId)) return "picked";
  return getDraftHeroLockReason({ draft, draftPool, hero, seat })
    ? "locked"
    : "available";
}

export type DraftSubmissionGate = {
  tryStart: (heroId: string | null, canConfirm: boolean) => string | null;
  release: () => void;
  isPending: () => boolean;
};

/** Synchronous guard so rapid clicks cannot enqueue duplicate draft commands. */
export function createDraftSubmissionGate(): DraftSubmissionGate {
  let pending = false;
  return {
    tryStart(heroId, canConfirm) {
      if (pending || !heroId || !canConfirm) return null;
      pending = true;
      return heroId;
    },
    release() {
      pending = false;
    },
    isPending() {
      return pending;
    },
  };
}

export function sendDraftCandidateCommand(params: {
  phase: DraftState["phase"];
  heroId: string;
  ban: (heroId: string) => void;
  pick: (heroId: string) => void;
}): boolean {
  const { phase, heroId, ban, pick } = params;
  if (phase === "ban") {
    ban(heroId);
    return true;
  }
  if (phase === "pick") {
    pick(heroId);
    return true;
  }
  return false;
}
