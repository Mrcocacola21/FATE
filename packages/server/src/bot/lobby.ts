import {
  DRAFT_HERO_POOL,
  HERO_CATALOG,
  RULE_DECLARATION_IDS,
  banDraftHero,
  pickDraftHero,
  type DraftState,
  type HeroSelection,
  type PlayerId,
  type UnitClass,
} from "rules";
import type { BotCommand, BotDifficulty, BotRandom } from "./types";

const shuffle = <T>(items: readonly T[], rng: BotRandom): T[] =>
  items
    .map((item) => ({ item, key: rng.next() }))
    .sort((a, b) => a.key - b.key)
    .map(({ item }) => item);

/**
 * The bot's figure set for Standard: one hero per class it fills. The apprentice leaves some
 * classes to the plain figures; stronger bots field a hero everywhere they can.
 */
export function chooseBotFigureSet(difficulty: BotDifficulty, rng: BotRandom): HeroSelection {
  const selection: HeroSelection = {};
  const byClass = new Map<UnitClass, string[]>();
  for (const hero of HERO_CATALOG) {
    if (!hero.implemented || !hero.figureSetEnabled || !hero.standardEnabled) continue;
    byClass.set(hero.mainClass, [...(byClass.get(hero.mainClass) ?? []), hero.id]);
  }
  for (const [unitClass, heroes] of byClass) {
    if (difficulty === "apprentice" && rng.next() < 0.5) continue;
    selection[unitClass] = heroes[Math.floor(rng.next() * heroes.length)];
  }
  return selection;
}

/** The bot's turn in a Safe Class Draft, with the choices it would try in order. */
export function decideDraft(
  draft: DraftState,
  seat: PlayerId,
  difficulty: BotDifficulty,
  rng: BotRandom,
): BotCommand[] {
  if (draft.phase === "complete" || draft.currentPlayer !== seat) return [];
  switch (draft.phase) {
    case "initiative":
      return [{ kind: "draftChoice", choice: { type: "roll" } }];
    case "right":
      return shuffle(["draft", "field"] as const, rng).map((right) => ({
        kind: "draftChoice",
        choice: { type: "chooseRight", right },
      }));
    case "draftSide":
      return shuffle(["first", "last"] as const, rng).map((side) => ({
        kind: "draftChoice",
        choice: { type: "chooseDraftSide", side },
      }));
    case "fieldSide":
      return shuffle(["placeFirst", "chooseRule"] as const, rng).map((side) => ({
        kind: "draftChoice",
        choice: { type: "chooseFieldSide", side },
      }));
    case "rule": {
      // Every bot names the plain rule: the special rules are a duel of wits it does not play.
      void difficulty;
      const rules = ["normal_rule", ...RULE_DECLARATION_IDS];
      return rules.map((ruleId) => ({
        kind: "draftChoice",
        choice: { type: "chooseRule", ruleId: ruleId as (typeof RULE_DECLARATION_IDS)[number] },
      }));
    }
    case "ban":
    case "pick": {
      const kind = draft.phase === "ban" ? "draftBan" : "draftPick";
      const legal = shuffle(DRAFT_HERO_POOL, rng).filter(
        (hero) => (kind === "draftBan" ? banDraftHero : pickDraftHero)(draft, seat, hero.heroId).ok,
      );
      return legal.map((hero) => ({ kind, heroId: hero.heroId }));
    }
    default:
      return [];
  }
}
