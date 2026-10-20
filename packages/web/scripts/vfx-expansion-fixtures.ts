import { writeFileSync } from "node:fs";
import {
  applyAction, attachArmy, createDefaultArmy, createEmptyGame, getHeroDefinition, makePlayerView,
  makeSpectatorView, projectEventsForRecipient, getLegalPlacements, type GameEvent, type GameState, type UnitState,
} from "../../rules/src/index";
import { initKnowledgeForOwners, makeRngSequence, resolveAllPendingRollsWithEvents, setUnit, toBattleState, toPlacementState } from "../../rules/src/tests/helpers/testUtils";
import { expansionSignalFixtures } from "../../rules/src/tests/core/expansionSignals.test";
import { applyGriffithFemtoRebirth } from "../../rules/src/actions/heroes/griffith";
import { addLokiChicken } from "../../rules/src/actions/heroes/loki";
import { BASIC_EXPANSION_HEROES } from "../src/features/vfx/expansionPresentation";
import { expansionAssets, type ExpansionEffectId } from "../src/features/vfx/expansionCatalog.generated";

const frames: Record<string, unknown> = {};
function add(id: string, before: GameState, after: GameState, events: GameEvent[], sourceId: string, expected: string[]) {
  frames[id] = { sourceId, expected, hiddenInReduced: expected.filter(id => id in expansionAssets && expansionAssets[id as ExpansionEffectId].geometry === "trail"),
    selectable: Boolean(before.units[sourceId]?.position), recipients: Object.fromEntries((["P1", "P2", "spectator"] as const).map(recipient => {
    const view = (state: GameState) => recipient === "spectator" ? makeSpectatorView(state) : makePlayerView(state, recipient);
    return [recipient, { before: view(before), after: view(after), expected: view(after).units[sourceId]?.position ? expected : [], events: projectEventsForRecipient(after, events, recipient)
      .map((e, index) => ({ ...e, eventId: `${id}:${recipient}:${index}` })) }];
  })) };
}
for (const f of expansionSignalFixtures()) {
  const hero = f.effectId.split(".")[1];
  const completed = f.state.pendingRoll ? resolveAllPendingRollsWithEvents(f.state, makeRngSequence([0.99, 0.8, 0.01, 0.2])) : { state: f.state, events: [] };
  add(f.effectId, f.before, completed.state, [...f.events, ...completed.events], Object.values(completed.state.units).find(u => u.heroId === hero)!.id, [f.effectId]);
}
for (const hero of BASIC_EXPANSION_HEROES) {
  const baseHero = hero === "femto" ? "griffith" : hero;
  const slot = getHeroDefinition(baseHero)!.mainClass;
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", { [slot]: baseHero })), createDefaultArmy("P2"));
  const source = Object.values(state.units).find(u => u.heroId === baseHero)!;
  const enemy = Object.values(state.units).find(u => u.owner === "P2" && u.class === "knight")!;
  if (hero !== "femto") {
    let before = toPlacementState(state, "P1");
    if (hero === "genghisKhan") {
      // Keep real neighboring tokens in the scene that exposed the oversized
      // commander ring; place them through the same authoritative action.
      const neighbors = Object.values(before.units).filter(u => u.owner === "P1" && u.id !== source.id).slice(0, 2);
      for (const [index, neighbor] of neighbors.entries()) {
        const cell = getLegalPlacements(before, neighbor.id).find(c => c.col === 3 + index * 2 && c.row === 0);
        if (!cell) throw new Error("Genghis neighbor has no legal placement");
        const placed = applyAction(before, { type: "placeUnit", unitId: neighbor.id, position: cell }, makeRngSequence([]));
        if (!placed.events.some(e => e.type === "unitPlaced")) throw new Error("Genghis neighbor placement refused");
        before = placed.state;
        if (before.currentPlayer === "P2") {
          const opponent = Object.values(before.units).find(u => u.owner === "P2" && !u.position)!;
          const position = getLegalPlacements(before, opponent.id)[0];
          before = applyAction(before, { type: "placeUnit", unitId: opponent.id, position }, makeRngSequence([])).state;
        }
      }
    }
    const token = Object.values(before.units).find(u => u.heroId === "falseTrailToken" && u.owner === "P1");
    if (hero === "chikatilo" && token) {
      before = applyAction(before, { type: "placeUnit", unitId: token.id, position: { col: 4, row: 0 } }, makeRngSequence([])).state;
    }
    const options = hero === "chikatilo" ? [{ col: 4, row: 4 }] : getLegalPlacements(before, source.id);
    const position = options.find(c => c.col === 4) ?? options[0];
    if (!position) throw new Error(`${hero}: no real deployment destination`);
    const deployed = applyAction(before, hero === "chikatilo" ? { type: "resolvePendingRoll", pendingRollId: before.pendingRoll!.id,
      player: before.pendingRoll!.player, choice: { type: "chikatiloPlace", position } } : { type: "placeUnit", unitId: source.id, position }, makeRngSequence([]));
    if (!deployed.events.some(e => e.type === "unitPlaced")) throw new Error(`${hero}: refused deployment`);
    add(`deploy.${hero}`, before, deployed.state, deployed.events, source.id, [`expansion.${hero}.deploy`]);
  }
  state = setUnit(state, source.id, { position: { col: 4, row: 4 }, isStealthed: false });
  state = setUnit(state, enemy.id, { position: { col: 8, row: 8 }, isStealthed: false });
  if (hero === "femto") state = setUnit(state, source.id, applyGriffithFemtoRebirth(state.units[source.id], state.units[source.id].position).unit);
  state = initKnowledgeForOwners(toBattleState(state, "P1", source.id));
  const trickster = state.units[source.id].class === "trickster";
  const forms: { suffix: string; role: string; flags: Partial<UnitState> }[] = [{ suffix: "", role: "move_trail", flags: {} }];
  if (hero === "guts") forms.push({ suffix: ".berserk", role: "berserk_move", flags: { gutsBerserkModeActive: true } });
  if (hero === "kaneki") forms.push({ suffix: ".centipede", role: "centipede_move", flags: { kanekiCentipedeUnlocked: true } });
  if (hero === "undyne") forms.push({ suffix: ".undying", role: "undying_move", flags: { undyneImmortalActive: true } });
  if (hero === "grand-kaiser") forms.push({ suffix: ".engineering", role: "engineering_move", flags: { transformed: true } });
  if (hero === "mettaton") forms.push({ suffix: ".ex", role: "ex_move", flags: { mettatonExUnlocked: true } },
    { suffix: ".neo", role: "neo_move", flags: { mettatonExUnlocked: true, mettatonNeoUnlocked: true } });
  for (const form of forms) for (const chicken of trickster ? [false, true] : [false]) {
    let before = setUnit(state, source.id, form.flags);
    if (chicken) {
      before = setUnit(before, enemy.id, { heroId: "loki", class: "trickster" });
      before = setUnit(before, source.id, addLokiChicken(before.units[source.id], enemy.id));
    }
    const requested = applyAction(before, { type: "requestMoveOptions", unitId: source.id, mode: "normal" }, makeRngSequence([]));
    const prepared = resolveAllPendingRollsWithEvents(requested.state, makeRngSequence([0.99]));
    const options = prepared.state.pendingMove?.legalTo ?? [];
    const destination = options.find(c => c.col === 5 && c.row === 4) ?? options[0];
    if (!destination) throw new Error(`${hero}: no confirmed move`);
    const moved = applyAction(prepared.state, { type: "move", unitId: source.id, to: destination }, makeRngSequence([]));
    add(`move.${hero}${form.suffix}${chicken ? ".chicken" : ""}`, prepared.state, moved.state, moved.events, source.id,
      trickster && !chicken ? ["portal"] : [`expansion.${hero}.${form.role}`, `expansion.${hero}.move_arrive`]);
  }
  // Every authored melee release, including the three melee form variants,
  // goes through an accepted rules attack rather than a preview-only request.
  for (const form of forms) {
    const role = form.suffix === ".berserk" ? "berserk_swing" : form.suffix === ".centipede" ? "centipede_attack"
      : form.suffix === ".undying" ? "undying_swing" : form.suffix ? undefined : "attack_swing";
    if (!role || !(`expansion.${hero}.${role}` in expansionAssets)) continue;
    for (const direction of hero === "guts" && !form.suffix ? ["east", "north", "southwest", "miss"] : ["east"]) {
    const target = direction === "north" ? { col: 4, row: 5 } : direction === "southwest" ? { col: 3, row: 3 } : { col: 5, row: 4 };
    const before = initKnowledgeForOwners(setUnit(setUnit(state, source.id, { ...form.flags, attack: 4 }),
      enemy.id, { position: target, heroId: "griffith", hp: 8, attack: 1 }));
    const rng = makeRngSequence(direction === "miss" ? [.01, .2, .99, .8] : [.99, .8, .01, .2]);
    const started = applyAction(before, { type: "attack", attackerId: source.id, defenderId: enemy.id }, rng);
    const chosen = started.state.pendingRoll?.kind === "gutsBerserkAttackChoice"
      ? applyAction(started.state, { type: "resolvePendingRoll", pendingRollId: started.state.pendingRoll.id,
        player: "P1", choice: { type: "gutsBerserkAttackMode", mode: "single", targetId: enemy.id } }, rng)
      : { state: started.state, events: [] };
    const resolved = resolveAllPendingRollsWithEvents(chosen.state, rng);
    const events = [...started.events, ...chosen.events, ...resolved.events];
    if (!events.some(event => event.type === "attackResolved" && event.attackerId === source.id))
      throw new Error(`${hero}${form.suffix}: basic swing attack refused`);
    add(`swing.${hero}${form.suffix}${direction === "east" ? "" : `.${direction}`}`, before, resolved.state, events, source.id, [`expansion.${hero}.${role}`]);
    }
  }
}
// Real short/long actions: the old one-cell-only fixtures missed full-board Rider
// and multi-cell Assassin movement. Include base pieces without new artwork.
for (const profile of ["base-rider", "base-assassin", "genghisKhan", "donKihote", "hassan", "jackRipper", "chikatilo"]) {
  const hero = profile.startsWith("base-") ? undefined : profile;
  const slot = hero ? getHeroDefinition(hero)!.mainClass : profile === "base-rider" ? "rider" : "assassin";
  let state = attachArmy(attachArmy(createEmptyGame(), createDefaultArmy("P1", hero ? { [slot]: hero } : {})), createDefaultArmy("P2"));
  const source = Object.values(state.units).find(u => u.owner === "P1" && (hero ? u.heroId === hero : u.class === slot))!;
  state = setUnit(state, source.id, { position: { col: 0, row: 4 }, isStealthed: false });
  const enemy = Object.values(state.units).find(u => u.owner === "P2")!;
  state = setUnit(state, enemy.id, { position: { col: 8, row: 8 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", source.id));
  const requested = applyAction(state, { type: "requestMoveOptions", unitId: source.id, mode: "normal" }, makeRngSequence([]));
  const before = resolveAllPendingRollsWithEvents(requested.state, makeRngSequence([.99])).state;
  const options = before.pendingMove!.legalTo.filter(c => c.row === 4 && c.col > 0).sort((a,b) => a.col - b.col);
  for (const length of ["short", "long"] as const) {
    const to = length === "short" ? options[0] : options[options.length - 1];
    if (!to || (length === "long" && to.col <= 1)) throw new Error(`${profile}: no real ${length} movement`);
    const moved = applyAction(before, { type: "move", unitId: source.id, to }, makeRngSequence([]));
    if (!moved.events.some(event => event.type === "unitMoved")) throw new Error(`${profile}: movement refused`);
    add(`longmove.${profile}.${length}`, before, moved.state, moved.events, source.id,
      hero ? [`expansion.${hero}.move_trail`, `expansion.${hero}.move_arrive`] : []);
  }
}
writeFileSync(process.argv[2], JSON.stringify(frames));
console.log(`Generated ${Object.keys(frames).length} rules-produced Board fixtures.`);
