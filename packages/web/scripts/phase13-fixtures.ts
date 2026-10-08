import { writeFileSync } from "node:fs";
import {
  applyAction,
  makePlayerView,
  makeSpectatorView,
  projectEventsForRecipient,
  createEmptyGame,
  createDefaultArmy,
  attachArmy,
  type GameState,
  type GameAction,
  type GameEvent,
  type ResolveRollChoice,
} from "../../rules/src/index";
import {
  setUnit,
  toBattleState,
  initKnowledgeForOwners,
  makeRngSequence,
} from "../../rules/src/tests/helpers/testUtils";
import { requestHassanAssassinOrderSelection } from "../../rules/src/actions/heroes/hassan";

function fixture(heroId: string, cls: "assassin" | "rider" | "trickster") {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { [cls]: heroId })),
    createDefaultArmy("P2"),
  );
  const source = Object.values(state.units).find((u) => u.heroId === heroId)!;
  const targets = Object.values(state.units).filter((u) => u.owner === "P2");
  for (const unit of Object.values(state.units))
    state = setUnit(state, unit.id, { position: null });
  state = setUnit(state, source.id, { position: { col: 2, row: 2 } });
  state = setUnit(state, targets[0].id, { class: "knight", position: { col: 3, row: 3 }, hp: 10 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", source.id));
  return { state, source, targets };
}
function scenario(name: string, initial: GameState, selectedUnitId: string) {
  let state = initial;
  const wrap = (events: GameEvent[], revision = 0) =>
    Object.fromEntries(
      ["P1", "P2", "spectator"].map((recipient) => [
        recipient,
        {
          view:
            recipient === "spectator"
              ? makeSpectatorView(state)
              : makePlayerView(state, recipient as "P1" | "P2"),
          batch: revision
            ? {
                streamId: `phase13-${name}`,
                revision,
                events: projectEventsForRecipient(
                  state,
                  events,
                  recipient as "P1" | "P2" | "spectator",
                ).map((event, i) => ({ ...event, eventId: `${name}:${revision}:${i}` })),
              }
            : null,
        },
      ]),
    );
  const frames: ReturnType<typeof wrap>[] = [];
  const commands: GameAction[] = [];
  const baseline = wrap([]);
  const run = (action: GameAction, dice: number[] = []) => {
    const result = applyAction(
      state,
      action,
      dice.length
        ? makeRngSequence(dice)
        : {
            next() {
              throw new Error("Choice consumed RNG");
            },
          },
    );
    state = result.state;
    commands.push(action);
    frames.push(wrap(result.events, frames.length + 1));
    return result;
  };
  const choice = (value?: ResolveRollChoice, dice: number[] = []) => {
    const pending = state.pendingRoll!;
    return run(
      {
        type: "resolvePendingRoll",
        player: pending.player,
        pendingRollId: pending.id,
        choice: value,
      },
      dice,
    );
  };
  return {
    run,
    choice,
    get state() {
      return state;
    },
    replace(next: GameState) {
      state = next;
    },
    result: { baseline, frames, commands, selectedUnitId },
  };
}

const data: Record<string, ReturnType<typeof scenario>["result"]> = {};
{
  const f = fixture("jackRipper", "assassin");
  f.state = setUnit(f.state, f.source.id, { position: { col: 8, row: 8 } });
  f.state = setUnit(f.state, f.targets[0].id, { position: { col: 1, row: 0 } });
  f.state = {
    ...f.state,
    pendingRoll: {
      id: "place",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: f.source.id,
        abilityId: "jackRipperSnares",
        options: [{ col: 1, row: 1 }],
      },
    },
    jackTraps: [
      {
        id: "REMAINING_PRIVATE_SNARE",
        sourceUnitId: f.source.id,
        owner: "P1",
        position: { col: 7, row: 7 },
        isRevealed: false,
        triggeredTargetIds: [],
      },
    ],
  };
  const s = scenario("jack-snare", f.state, f.source.id);
  s.choice({ type: "chargedImpulseTarget", position: { col: 1, row: 1 } });
  s.replace(toBattleState(s.state, "P2", f.targets[0].id));
  s.run({ type: "move", unitId: f.targets[0].id, to: { col: 1, row: 1 } });
  data["jack-snare"] = s.result;
}
{
  const f = fixture("jackRipper", "assassin");
  f.state = setUnit(f.state, f.source.id, { position: { col: 8, row: 8 } });
  f.state = setUnit(f.state, f.targets[0].id, { position: { col: 1, row: 1 }, hp: 1 });
  f.state = setUnit(f.state, f.targets[1].id, { position: { col: 2, row: 1 }, hp: 5 });
  f.state = {
    ...f.state,
    jackTrapCounter: 5,
    jackTraps: [1, 3, 4, 5, 6].map((n, i) => ({
      id: `REMAINING_PRIVATE_SNARE-${i}`,
      sourceUnitId: f.source.id,
      owner: "P1",
      position: { col: n, row: n },
      isRevealed: false,
      triggeredTargetIds: [],
    })),
    pendingRoll: {
      id: "place",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: f.source.id,
        abilityId: "jackRipperSnares",
        options: [{ col: 0, row: 8 }],
      },
    },
  };
  const s = scenario("jack-cover", f.state, f.source.id);
  s.choice({ type: "chargedImpulseTarget", position: { col: 0, row: 8 } });
  s.choice({ type: "chargedImpulseTarget", position: { col: 1, row: 1 } }, [0, 0]);
  data["jack-cover"] = s.result;
}
{
  const f = fixture("hassan", "assassin");
  Object.values(f.state.units)
    .filter((u) => u.owner === "P1" && u.id !== f.source.id)
    .forEach((u, i) => {
      f.state = setUnit(f.state, u.id, { position: { col: i, row: 0 } });
    });
  f.state = requestHassanAssassinOrderSelection(f.state, "P1").state;
  const s = scenario("hassan-order", f.state, f.source.id);
  s.choice({
    type: "hassanAssassinOrderPick",
    unitIds: (f.state.pendingRoll!.context.eligibleUnitIds as string[]).slice(0, 2),
  });
  data["hassan-order"] = s.result;
}
{
  const f = fixture("chikatilo", "assassin"),
    s = scenario("chikatilo-mark", f.state, f.source.id);
  s.run({
    type: "useAbility",
    unitId: f.source.id,
    abilityId: "chikatiloAssassinMark",
    payload: { targetId: f.targets[0].id },
  });
  data["chikatilo-mark"] = s.result;
}
{
  const f = fixture("genghisKhan", "rider");
  f.state = setUnit(f.state, f.source.id, {
    position: { col: 0, row: 1 },
    charges: { ...f.source.charges, genghisKhanMongolCharge: 4 },
  });
  ["knight", "berserker", "assassin"].forEach((cls, i) => {
    const unit = Object.values(f.state.units).find((u) => u.owner === "P1" && u.class === cls)!;
    f.state = setUnit(f.state, unit.id, { position: { col: 1 + i * 2, row: 0 } });
    f.state = setUnit(f.state, f.targets[i].id, {
      class: "knight",
      position: { col: i * 2, row: 0 },
      hp: 30,
    });
  });
  const s = scenario("genghis", f.state, f.source.id);
  s.run({ type: "useAbility", unitId: f.source.id, abilityId: "genghisKhanMongolCharge" });
  s.run({ type: "move", unitId: f.source.id, to: { col: 5, row: 1 } });
  let actor = 0;
  while (s.state.pendingRoll?.kind === "reactionChoice") {
    const targets = s.state.pendingRoll.context.targetUnitIds as string[];
    s.choice(
      actor++ === 1
        ? { type: "resolveReactionChoice", choice: "pass" }
        : { type: "resolveReactionChoice", choice: "attack", targetId: targets[0] },
    );
    if (s.state.pendingRoll?.kind === "attack_attackerRoll") {
      s.choice(undefined, [0.99, 0.8]);
      s.choice(undefined, [0, 0.2]);
    }
    if (actor > 3) throw new Error("Unexpected reaction count");
  }
  if (actor !== 3) throw new Error(`Expected three reactors, got ${actor}`);
  data.genghis = s.result;
}
{
  const f = fixture("lechy", "trickster");
  f.state = setUnit(f.state, f.source.id, { charges: { ...f.source.charges, lechyStorm: 5 } });
  const s = scenario("lechy-storm", f.state, f.source.id);
  s.run({ type: "useAbility", unitId: f.source.id, abilityId: "lechyStorm" }, [0.8]);
  if (s.state.pendingRoll) s.choice(undefined, [0.8]);
  data["lechy-storm"] = s.result;
}
if (!process.argv[2]) throw new Error("Expected output JSON path");
writeFileSync(process.argv[2], JSON.stringify(data));
