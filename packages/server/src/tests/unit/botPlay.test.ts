import assert from "node:assert/strict";
import { test } from "node:test";
import { isDeepStrictEqual } from "node:util";
import { makePlayerView, SeededRNG, type GameState, type PlayerId } from "rules";
import { playBotMatch } from "../../bot/selfPlay";
import { decideBattle } from "../../bot/policy";
import { decideDraft, chooseBotFigureSet } from "../../bot/lobby";
import { BOT_DIFFICULTIES, BOT_PROFILES } from "../../bot/types";
import { GameActionSchema } from "../../schemas";
import { botIdentity, durableUserId, isBotUserId } from "../../bot/identity";

for (const difficulty of BOT_DIFFICULTIES)
  for (const gameMode of ["standard", "classic", "draft"] as const)
    test(`the ${difficulty} plays a ${gameMode} match to the end`, () => {
      for (const seed of [11, 29]) {
        const result = playBotMatch({ seed, gameMode, bots: { P1: difficulty, P2: difficulty } });
        assert.equal(result.stuck, undefined, `seed ${seed}: ${result.stuck}`);
        assert.equal(result.ended, true);
        assert.ok(result.winner, "someone won");
      }
    });

test("bots of different strength finish their matches against each other", () => {
  const result = playBotMatch({
    seed: 7,
    gameMode: "standard",
    bots: { P1: "apprentice", P2: "archmage" },
  });
  assert.equal(result.stuck, undefined);
  assert.equal(result.ended, true);
});

/** A mid-battle state in which the side to move cannot see some enemy figure. */
function stateWithHiddenEnemy(): { state: GameState; seat: PlayerId; hiddenId: string } {
  for (const seed of [3, 5, 8, 13, 21, 34, 55]) {
    let found: { state: GameState; seat: PlayerId; hiddenId: string } | null = null;
    playBotMatch({
      seed,
      gameMode: "classic",
      bots: { P1: "sorcerer", P2: "sorcerer" },
      maxCommands: 1500,
      trace: (_action, ok, room) => {
        const state = room.state;
        if (found || !ok || state.phase !== "battle" || state.pendingRoll || state.activeUnitId)
          return;
        const seat = state.currentPlayer;
        const view = makePlayerView(state, seat);
        const hidden = Object.values(state.units).find(
          (unit) => unit.owner !== seat && unit.isAlive && unit.position && !view.units[unit.id],
        );
        if (hidden) found = { state: structuredClone(state), seat, hiddenId: hidden.id };
      },
    });
    if (found) return found;
  }
  throw new Error("No hidden enemy appeared in the sampled matches");
}

test("the bot decides from its seat's view only: hidden enemies change nothing", () => {
  const { state, seat, hiddenId } = stateWithHiddenEnemy();
  const hidden = state.units[hiddenId];
  const occupied = new Set(
    Object.values(state.units)
      .filter((u) => u.position)
      .map((u) => `${u.position!.row},${u.position!.col}`),
  );
  let moved: GameState | null = null;
  for (let row = 0; row < state.boardSize && !moved; row++)
    for (let col = 0; col < state.boardSize && !moved; col++)
      if (!occupied.has(`${row},${col}`))
        moved = {
          ...state,
          units: { ...state.units, [hiddenId]: { ...hidden, position: { row, col }, hp: 1 } },
        };
  assert.ok(moved);
  const before = makePlayerView(state, seat);
  const after = makePlayerView(moved, seat);
  assert.ok(isDeepStrictEqual(before, after), "the projection hides the change");
  for (const difficulty of BOT_DIFFICULTIES) {
    const decide = (view: typeof before) =>
      decideBattle(view, seat, BOT_PROFILES[difficulty], new SeededRNG(99));
    assert.deepEqual(decide(after), decide(before), difficulty);
  }
});

test("the bot answers only its own decisions and turns", () => {
  const { state, seat } = stateWithHiddenEnemy();
  const other: PlayerId = seat === "P1" ? "P2" : "P1";
  const view = makePlayerView(state, other);
  assert.deepEqual(decideBattle(view, other, BOT_PROFILES.archmage, new SeededRNG(1)), []);
});

test("the bot's figure set and draft choices are legal ones", () => {
  const rng = new SeededRNG(4);
  for (const difficulty of BOT_DIFFICULTIES) {
    const set = chooseBotFigureSet(difficulty, rng);
    assert.ok(Object.values(set).every((heroId) => typeof heroId === "string"));
  }
  const draft = {
    mode: "safe-class-draft" as const,
    phase: "initiative" as const,
    stepIndex: 0,
    currentPlayer: "P2" as const,
    bannedHeroIds: [],
    picks: { P1: {}, P2: {} },
    history: [],
  };
  assert.deepEqual(decideDraft(draft, "P1", "archmage", rng), [], "not its turn");
  assert.deepEqual(decideDraft(draft, "P2", "archmage", rng), [
    { kind: "draftChoice", choice: { type: "roll" } },
  ]);
});

test("the bot's identity is never an account and is stored as no user", () => {
  const bot = botIdentity("archmage");
  assert.ok(isBotUserId(bot.userId));
  assert.equal(durableUserId(bot.userId), null);
  assert.equal(
    durableUserId("6f1b0c3e-4a3b-4d1e-9a7c-2b1f0e9d8c7a"),
    "6f1b0c3e-4a3b-4d1e-9a7c-2b1f0e9d8c7a",
  );
  assert.equal(durableUserId(null), null);
});

test("every command the bot sends is one a player's socket could send and the journal stores", () => {
  for (const gameMode of ["standard", "draft"] as const) {
    const sent: unknown[] = [];
    playBotMatch({
      seed: 41,
      gameMode,
      bots: { P1: "archmage", P2: "apprentice" },
      trace: (action, ok) => {
        if (ok) sent.push(action);
      },
    });
    assert.ok(sent.length > 50);
    for (const action of sent)
      assert.ok(GameActionSchema.safeParse(action).success, JSON.stringify(action));
  }
});
