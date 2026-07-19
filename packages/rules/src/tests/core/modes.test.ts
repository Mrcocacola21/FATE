import {
  attachArmy,
  banDraftHero,
  createClassicArmy,
  createDefaultArmy,
  createDraftArmy,
  createEmptyGame,
  createSafeClassDraftState,
  DRAFT_CLASSES,
  DRAFT_HERO_POOL,
  GAME_MODES,
  getDraftableHeroes,
  getHeroDraftMeta,
  getPickOrder,
  HERO_ARTEMIDA_ID,
  HERO_CATALOG,
  HERO_DRAFT_META,
  HERO_DON_KIHOTE_ID,
  HERO_DUOLINGO_ID,
  HERO_JACK_RIPPER_ID,
  HERO_KANEKI_ID,
  HERO_LUCHE_ID,
  HERO_ZORO_ID,
  isGameModeId,
  pickDraftHero,
  SAFE_CLASS_DRAFT_POOL_VALIDATION,
  validateDraftPoolForMode,
  type DraftState,
} from "../..";
import type { PlayerId, UnitClass, UnitState } from "../../model";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function heroesByClass(unitClass: UnitClass): string[] {
  return DRAFT_HERO_POOL.filter((hero) => hero.primaryClass === unitClass).map(
    (hero) => hero.heroId
  );
}

function firstHero(unitClass: UnitClass): string {
  const heroId = heroesByClass(unitClass)[0];
  assert(heroId, `missing hero for ${unitClass}`);
  return heroId;
}

const STUB_HERO_IDS = [
  HERO_DUOLINGO_ID,
  HERO_LUCHE_ID,
  HERO_DON_KIHOTE_ID,
  HERO_KANEKI_ID,
  HERO_JACK_RIPPER_ID,
  HERO_ZORO_ID,
  HERO_ARTEMIDA_ID,
] as const;

const STUB_HERO_ID_VARIANTS = [
  "donQuixote",
  "don_quixote",
  "kanekiKen",
  "kaneki_ken",
  "jackTheRipper",
  "jack_the_ripper",
  "artemis",
] as const;

function unitsForPlayer(units: UnitState[], player: PlayerId): UnitState[] {
  return units.filter((unit) => unit.owner === player);
}

function expectFullClassRoster(units: UnitState[], message: string) {
  const classes = new Set(units.map((unit) => unit.class));
  assert(classes.size === DRAFT_CLASSES.length, `${message}: expected 7 classes`);
  for (const unitClass of DRAFT_CLASSES) {
    assert(classes.has(unitClass), `${message}: missing ${unitClass}`);
  }
}

export function testGameModeConfigsExposeExpectedModes() {
  assert(GAME_MODES.standard.usesPlayerFigureSets, "standard should use figure sets");
  assert(GAME_MODES.draft.usesDraft, "draft should use draft");
  assert(GAME_MODES.classic.usesOnlyBaseUnits, "classic should use base units");
  assert(isGameModeId("standard"), "standard should be a valid mode id");
  assert(!isGameModeId("unknown"), "unknown should not be a valid mode id");
  console.log("game_mode_configs_expose_expected_modes passed");
}

export function testClassicRosterCreationUsesOnlyBaseUnits() {
  const state = attachArmy(createEmptyGame(), createClassicArmy("P1"));
  const units = unitsForPlayer(Object.values(state.units), "P1");
  assert(units.length === 7, "classic roster should have 7 units");
  expectFullClassRoster(units, "classic roster");
  assert(
    units.every((unit) => !unit.heroId && !unit.figureId),
    "classic roster should not contain full hero ids or figure ids"
  );
  console.log("classic_roster_creation_uses_only_base_units passed");
}

export function testClassicRosterIgnoresCustomFigureSets() {
  const custom = createDefaultArmy("P1", {
    knight: firstHero("knight"),
    archer: firstHero("archer"),
  });
  assert(
    custom.some((unit) => !!unit.heroId),
    "control custom roster should include full heroes"
  );

  const classic = createClassicArmy("P1");
  assert(
    classic.every((unit) => !unit.heroId && !unit.figureId),
    "classic roster should ignore selected full heroes"
  );
  console.log("classic_roster_ignores_custom_figure_sets passed");
}

export function testDraftPoolExcludesBaseUnits() {
  assert(DRAFT_HERO_POOL.length > 0, "draft pool should not be empty");
  assert(
    DRAFT_HERO_POOL.every((hero) => hero.draftEnabled && !hero.isBase),
    "draft pool should only contain draft-enabled full heroes"
  );
  assert(
    HERO_DRAFT_META.some((hero) => hero.isBase && !hero.draftEnabled),
    "base units should be marked non-draftable"
  );
  assert(
    !DRAFT_HERO_POOL.some((hero) => hero.heroId.startsWith("base-")),
    "base units should not be in the draft pool"
  );
  console.log("draft_pool_excludes_base_units passed");
}

export function testDraftPoolRequiresExplicitImplementedEligibility() {
  const draftHeroIds = new Set(DRAFT_HERO_POOL.map((hero) => hero.heroId));
  for (const heroId of STUB_HERO_IDS) {
    const definition = HERO_CATALOG.find((hero) => hero.id === heroId);
    const draftMeta = getHeroDraftMeta(heroId);
    assert(definition, `missing catalog definition for stub ${heroId}`);
    assert(draftMeta, `missing draft metadata for stub ${heroId}`);
    assert(!definition.implemented, `${heroId} should be marked unimplemented`);
    assert(!definition.draftEnabled, `${heroId} should have draft disabled`);
    assert(!definition.standardEnabled, `${heroId} should have standard disabled`);
    assert(!definition.figureSetEnabled, `${heroId} should have figure set disabled`);
    assert(definition.reason === "stub", `${heroId} should have stub reason`);
    assert(!draftMeta.implemented, `${heroId} draft metadata should be unimplemented`);
    assert(!draftHeroIds.has(heroId), `${heroId} should not be in the draft pool`);
  }

  assert(
    DRAFT_HERO_POOL.every(
      (hero) =>
        hero.implemented === true &&
        hero.draftEnabled === true &&
        hero.isBase !== true &&
        DRAFT_CLASSES.includes(hero.primaryClass)
    ),
    "every draft hero should have complete explicit eligibility metadata"
  );

  const missingMetadataHero = {
    heroId: "missing-availability",
    primaryClass: "knight" as const,
    isBase: false,
  };
  assert(
    !getDraftableHeroes([...DRAFT_HERO_POOL, missingMetadataHero]).some(
      (hero) => hero.heroId === missingMetadataHero.heroId
    ),
    "heroes missing implementation/draft metadata must be excluded"
  );
  assert(
    !getDraftableHeroes([
      {
        heroId: "missing-base-marker",
        primaryClass: "knight",
        implemented: true,
        draftEnabled: true,
      },
    ]).length,
    "heroes missing the required base marker must be excluded"
  );
  console.log("draft_pool_requires_explicit_implemented_eligibility passed");
}

export function testSafeClassDraftPoolAvailabilityIsValidated() {
  assert(SAFE_CLASS_DRAFT_POOL_VALIDATION.ok, "current safe draft pool should be valid");
  if (SAFE_CLASS_DRAFT_POOL_VALIDATION.ok) {
    for (const unitClass of DRAFT_CLASSES) {
      assert(
        SAFE_CLASS_DRAFT_POOL_VALIDATION.counts[unitClass] >= 3,
        `${unitClass} should have three heroes before a possible class ban`
      );
    }
  }

  const invalidPool = DRAFT_HERO_POOL.filter(
    (hero) => hero.primaryClass !== "knight"
  );
  const invalid = validateDraftPoolForMode(
    { classes: DRAFT_CLASSES, picksRequiredPerClass: 2, maxBansPerClass: 1 },
    invalidPool
  );
  assert(!invalid.ok, "a class shortage should invalidate safe class draft");
  if (!invalid.ok) {
    assert(
      invalid.shortages.some((shortage) => shortage.primaryClass === "knight"),
      "validation should report the short class"
    );
  }
  console.log("safe_class_draft_pool_availability_is_validated passed");
}

export function testStubHeroesAreRejectedWithoutDraftMutation() {
  const banState = createSafeClassDraftState();
  const pickState: DraftState = {
    ...createSafeClassDraftState(),
    phase: "pick",
    currentPlayer: "P1",
  };
  for (const heroId of STUB_HERO_IDS) {
    const ban = banDraftHero(banState, "P1", heroId);
    assert(
      !ban.ok && ban.reason === "hero_not_draftable",
      `stub ban should be rejected for ${heroId}`
    );
    assert(ban.state === banState, `stub ban should not mutate state for ${heroId}`);

    const pick = pickDraftHero(pickState, "P1", heroId);
    assert(
      !pick.ok && pick.reason === "hero_not_draftable",
      `stub pick should be rejected for ${heroId}`
    );
    assert(pick.state === pickState, `stub pick should not mutate state for ${heroId}`);
  }
  for (const heroId of STUB_HERO_ID_VARIANTS) {
    const ban = banDraftHero(banState, "P1", heroId);
    const pick = pickDraftHero(pickState, "P1", heroId);
    assert(
      !ban.ok && ban.reason === "invalid_draft_hero" && ban.state === banState,
      `unknown stub spelling should be rejected without mutation for ${heroId}`
    );
    assert(
      !pick.ok && pick.reason === "invalid_draft_hero" && pick.state === pickState,
      `unknown stub spelling should be rejected without mutation for ${heroId}`
    );
  }
  console.log("stub_heroes_are_rejected_without_draft_mutation passed");
}

export function testStandardRosterRejectsStubFigureSets() {
  const army = createDefaultArmy("P1", {
    trickster: HERO_DUOLINGO_ID,
    spearman: HERO_LUCHE_ID,
    rider: HERO_DON_KIHOTE_ID,
    berserker: HERO_KANEKI_ID,
    assassin: HERO_JACK_RIPPER_ID,
    knight: HERO_ZORO_ID,
    archer: HERO_ARTEMIDA_ID,
  });
  assert(
    army.every((unit) => !unit.heroId && !unit.figureId),
    "forged standard figure sets must not create stub heroes or figures"
  );
  console.log("standard_roster_rejects_stub_figure_sets passed");
}

export function testDraftValidationRulesWork() {
  let draft = createSafeClassDraftState();
  assert(draft.currentPlayer === "P1", "first ban should be P1");

  const p2WrongBan = banDraftHero(draft, "P2", firstHero("knight"));
  assert(!p2WrongBan.ok && p2WrongBan.reason === "not_current_player", "wrong ban player blocked");

  const baseBan = banDraftHero(draft, "P1", "base-knight");
  assert(!baseBan.ok && baseBan.reason === "base_unit_not_allowed", "base ban blocked");

  const knightA = heroesByClass("knight")[0];
  const knightB = heroesByClass("knight")[1];
  const spearmanA = heroesByClass("spearman")[0];
  assert(knightA && knightB && spearmanA, "expected draft fixture heroes");

  const ban1 = banDraftHero(draft, "P1", knightA);
  assert(ban1.ok, "P1 ban should be accepted");
  draft = ban1.state;
  assert(draft.currentPlayer === "P2", "second ban should be P2");

  const secondKnightBan = banDraftHero(draft, "P2", knightB);
  assert(
    !secondKnightBan.ok &&
      secondKnightBan.reason === "max_bans_per_class_reached",
    "second class ban should be blocked"
  );

  const ban2 = banDraftHero(draft, "P2", spearmanA);
  assert(ban2.ok, "P2 ban should be accepted");
  draft = ban2.state;
  assert(draft.currentPlayer === "P2", "third ban should be P2");

  const pickDuringBan = pickDraftHero(draft, "P2", firstHero("rider"));
  assert(
    !pickDuringBan.ok && pickDuringBan.reason === "draft_phase_mismatch",
    "pick during ban should be blocked"
  );

  const riderA = firstHero("rider");
  const archerA = firstHero("archer");
  const ban3 = banDraftHero(draft, "P2", riderA);
  assert(ban3.ok, "third ban should be accepted");
  draft = ban3.state;
  const ban4 = banDraftHero(draft, "P1", archerA);
  assert(ban4.ok, "fourth ban should be accepted");
  draft = ban4.state;
  assert(draft.phase === "pick", "draft should move to pick phase after bans");
  assert(draft.currentPlayer === "P1", "first pick should be P1");

  const basePick = pickDraftHero(draft, "P1", "base-knight");
  assert(!basePick.ok && basePick.reason === "base_unit_not_allowed", "base pick blocked");

  const bannedPick = pickDraftHero(draft, "P1", knightA);
  assert(!bannedPick.ok && bannedPick.reason === "banned", "banned hero pick blocked");

  const knightC = heroesByClass("knight").find((heroId) => heroId !== knightA);
  assert(knightC, "expected unbanned knight");
  const pick1 = pickDraftHero(draft, "P1", knightC);
  assert(pick1.ok, "first pick accepted");
  draft = pick1.state;
  assert(draft.currentPlayer === "P2", "second pick should be P2");

  const pickedAgain = pickDraftHero(draft, "P2", knightC);
  assert(!pickedAgain.ok && pickedAgain.reason === "picked", "picked hero blocked");

  const wrongPlayer = pickDraftHero(draft, "P1", firstHero("assassin"));
  assert(!wrongPlayer.ok && wrongPlayer.reason === "not_current_player", "wrong pick player blocked");

  console.log("draft_validation_rules_work passed");
}

export function testDraftPickOrderIsSnake() {
  const order = getPickOrder().slice(0, 8).join(",");
  assert(order === "P1,P2,P2,P1,P1,P2,P2,P1", `unexpected pick order ${order}`);
  console.log("draft_pick_order_is_snake passed");
}

function advanceBan(
  state: DraftState,
  player: PlayerId,
  unitClass: UnitClass
): DraftState {
  const heroId = firstHero(unitClass);
  const result = banDraftHero(state, player, heroId);
  assert(result.ok, `expected ${player} to ban ${heroId}`);
  return result.state;
}

export function testDraftCompletionCreatesValidRosters() {
  let draft = createSafeClassDraftState();
  draft = advanceBan(draft, "P1", "knight");
  draft = advanceBan(draft, "P2", "spearman");
  draft = advanceBan(draft, "P2", "rider");
  draft = advanceBan(draft, "P1", "archer");

  const pickedByClass = new Set<string>(draft.bannedHeroIds);
  for (const player of getPickOrder()) {
    const unitClass = DRAFT_CLASSES.find((candidate) => !draft.picks[player][candidate]);
    assert(unitClass, `missing open class for ${player}`);
    const heroId = heroesByClass(unitClass).find((candidate) => {
      if (pickedByClass.has(candidate)) return false;
      const meta = getHeroDraftMeta(candidate);
      return meta?.primaryClass === unitClass && meta.draftEnabled && !meta.isBase;
    });
    assert(heroId, `missing pick fixture for ${player} ${unitClass}`);
    const result = pickDraftHero(draft, player, heroId);
    assert(result.ok, `expected ${player} to pick ${heroId}`);
    draft = result.state;
    pickedByClass.add(heroId);
  }

  assert(draft.phase === "complete", "draft should complete after 14 picks");
  const p1Army = createDraftArmy("P1", draft.picks.P1);
  const p2Army = createDraftArmy("P2", draft.picks.P2);
  expectFullClassRoster(p1Army, "P1 drafted roster");
  expectFullClassRoster(p2Army, "P2 drafted roster");
  assert(p1Army.every((unit) => !!unit.heroId), "P1 drafted roster should use full heroes");
  assert(p2Army.every((unit) => !!unit.heroId), "P2 drafted roster should use full heroes");
  console.log("draft_completion_creates_valid_rosters passed");
}
