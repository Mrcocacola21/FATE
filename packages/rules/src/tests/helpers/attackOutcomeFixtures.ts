import { applyAction, attachArmy, createDefaultArmy, createEmptyGame, getHeroDefinition, type GameEvent, type GameState, type UnitState } from "../../index";
import { initKnowledgeForOwners, makeRngSequence, resolvePendingRollOnce, setUnit, toBattleState } from "./testUtils";

export interface AttackOutcomeFixture {
  id: string; before: GameState; after: GameState; events: GameEvent[]; sourceId: string; targetIds: string[]; rngCalls: number;
}
const heroes = ["artemida", "asgore", "chikatilo", "donKihote", "duolingo", "elCidCompeador", "femto", "frisk",
  "genghisKhan", "grand-kaiser", "griffith", "grozny", "guts", "hassan", "jackRipper", "jebe", "kaladin", "kaneki",
  "lechy", "loki", "luche", "mettaton", "odin", "papyrus", "riverPerson", "sans", "undyne", "vladTepes", "zoro"];

export function attackOutcomeFixtures(): AttackOutcomeFixture[] {
  const fixtures: AttackOutcomeFixture[] = [];
  const specs: { id: string; hero: string; flags: Partial<UnitState>; choice: "auto" | "roll" }[] = [
    ...heroes.map(hero => ({ id: `miss.${hero}`, hero, flags: {} as Partial<UnitState>, choice: "roll" as const })),
    { id: "berserker.guts", hero: "guts", flags: { charges: { berserkAutoDefense: 6 } }, choice: "auto" },
    { id: "spearman.luche", hero: "luche", flags: {}, choice: "roll" },
    { id: "muninn.odin", hero: "odin", flags: { charges: { odinMuninn: 6 } }, choice: "auto" },
    { id: "bravery.asgore", hero: "asgore", flags: { asgoreBraveryAutoDefenseReady: true }, choice: "auto" },
    { id: "cleanSoul.frisk", hero: "frisk", flags: { friskCleanSoulShield: true }, choice: "roll" },
    { id: "reduction.guts", hero: "guts", flags: { gutsBerserkModeActive: true }, choice: "roll" },
    { id: "reduction.undyne", hero: "undyne", flags: { undyneImmortalActive: true }, choice: "roll" },
    { id: "bunker.grand-kaiser", hero: "grand-kaiser", flags: { bunker: { active: true, ownTurnsInBunker: 0 } }, choice: "roll" },
  ];
  for (const spec of specs) {
    const hero = spec.hero === "femto" ? "griffith" : spec.hero;
    const slot = getHeroDefinition(hero)!.mainClass;
    let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1")), createDefaultArmy("P2", { [slot]: hero }));
    const source = Object.values(state.units).find(u => u.owner === "P1" && u.class === "knight")!;
    const target = Object.values(state.units).find(u => u.owner === "P2" && u.heroId === hero)!;
    state = setUnit(state, source.id, { position: { col: 3, row: 4 }, attack: 4 });
    state = setUnit(state, target.id, { heroId: spec.hero, position: { col: 4, row: 4 }, hp: 30,
      friskCleanSoulShield: false, charges: {}, ...spec.flags });
    state = initKnowledgeForOwners(toBattleState(state, "P1", source.id));
    const misses = spec.id.startsWith("miss.");
    const rolls = misses ? [.01, .2, .99, .8] : spec.id.startsWith("spearman.") ? [.99, .8, .4, .4] : [.99, .8, .01, .2];
    const sequence = makeRngSequence(Array.from({ length: 32 }, () => rolls).flat());
    let rngCalls = 0;
    const rng = { next: () => { rngCalls++; return sequence.next(); } };
    let result = applyAction(state, { type: "attack", attackerId: source.id, defenderId: target.id }, rng);
    const events = [...result.events];
    for (let step = 0; result.state.pendingRoll; step++) {
      if (step > 64) throw new Error(`${spec.id}: unresolved ${result.state.pendingRoll.kind}`);
      const pending = result.state.pendingRoll;
      result = pending.kind.endsWith("DefenseChoice") || pending.kind === "berserkerDefenseChoice"
        ? applyAction(result.state, { type: "resolvePendingRoll", player: pending.player, pendingRollId: pending.id, choice: spec.choice }, rng)
        : resolvePendingRollOnce(result.state, rng);
      events.push(...result.events);
    }
    fixtures.push({ id: `outcome.${spec.id}`, before: state, after: result.state, events, sourceId: source.id,
      targetIds: [target.id], rngCalls });
  }
  for (const hero of [undefined, "genghisKhan", "donKihote", "odin", "riverPerson", "mettaton", "grand-kaiser", "kaneki"]) {
    const slot = hero ? getHeroDefinition(hero)!.mainClass : "rider";
    let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", hero ? { [slot]: hero } : {})), createDefaultArmy("P2"));
    const source = Object.values(state.units).find(u => u.owner === "P1" && (hero ? u.heroId === hero : u.class === "rider"))!;
    const targets = Object.values(state.units).filter(u => u.owner === "P2").slice(0, 2);
    state = setUnit(state, source.id, { position: { col: 0, row: 4 }, attack: 1,
      mettatonExUnlocked: hero === "mettaton", mettatonNeoUnlocked: hero === "mettaton",
      transformed: hero === "grand-kaiser", kanekiCentipedeUnlocked: hero === "kaneki" });
    targets.forEach((unit, i) => { state = setUnit(state, unit.id, { position: { col: i * 2 + 2, row: 4 }, hp: 30 }); });
    state = initKnowledgeForOwners(toBattleState(state, "P1", source.id));
    const sequence = makeRngSequence([.99, .8, .01, .2, .01, .2, .99, .8]);
    let rngCalls = 0;
    const rng = { next: () => { rngCalls++; return sequence.next(); } };
    let result = applyAction(state, { type: "requestMoveOptions", unitId: source.id, mode: "rider" }, rng);
    const events = [...result.events];
    while (result.state.pendingRoll) { result = resolvePendingRollOnce(result.state, rng); events.push(...result.events); }
    result = applyAction(result.state, { type: "move", unitId: source.id, to: { col: 6, row: 4 } }, rng);
    events.push(...result.events);
    for (let step = 0; result.state.pendingRoll; step++) {
      if (step > 64) throw new Error(`${hero}: rider chain did not finish`);
      result = resolvePendingRollOnce(result.state, rng); events.push(...result.events);
    }
    fixtures.push({ id: `outcome.rider.${hero ?? "base"}`, before: state, after: result.state, events, sourceId: source.id,
      targetIds: targets.map(unit => unit.id), rngCalls });
  }
  return fixtures;
}
