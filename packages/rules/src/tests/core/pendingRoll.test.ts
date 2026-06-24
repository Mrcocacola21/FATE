import {
  ALL_ROLL_KINDS,
  assert,
  CORE_PENDING_ROLL_KINDS,
  createEmptyGame,
  GameState,
  HERO_PENDING_ROLL_KINDS,
  pendingRollActions,
  PlayerId,
  RollKind,
  SeededRNG,
} from "../helpers/testUtils";
export function testPendingRollActionsExportsStable() {
  const expected = ["applyResolvePendingRoll"];
  const exported = Object.keys(pendingRollActions);
  for (const name of expected) {
    assert(
      exported.includes(name),
      `pendingRollActions missing export: ${name}`
    );
    assert.strictEqual(
      typeof (pendingRollActions as any)[name],
      "function",
      `pendingRollActions export ${name} should be a function`
    );
  }

  console.log("pendingRollActions_exports_stable passed");
}


export function testPendingRollResolverCoverage() {
  const handled = new Set<string>([
    ...CORE_PENDING_ROLL_KINDS,
    ...HERO_PENDING_ROLL_KINDS,
  ]);
  const duplicates = [
    ...CORE_PENDING_ROLL_KINDS,
    ...HERO_PENDING_ROLL_KINDS,
  ].filter((kind, index, all) => all.indexOf(kind) !== index);

  assert.deepStrictEqual(duplicates, [], "pending roll resolver kinds should be unique");
  for (const kind of ALL_ROLL_KINDS) {
    assert(handled.has(kind), `pending roll kind is missing resolver coverage: ${kind}`);
  }

  console.log("pending_roll_resolver_coverage passed");
}


export function testUnknownPendingRollKindDoesNotClear() {
  const pendingRoll = {
    id: "roll-unknown",
    player: "P1" as PlayerId,
    kind: "__unknownRollKind" as RollKind,
    context: {},
  };
  const state: GameState = {
    ...createEmptyGame(),
    pendingRoll,
  };

  const result = pendingRollActions.applyResolvePendingRoll(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pendingRoll.id,
      player: "P1",
    },
    new SeededRNG(1)
  );

  assert.strictEqual(
    result.state.pendingRoll,
    pendingRoll,
    "unknown pending roll kind must not be cleared"
  );
  assert(
    result.events.some(
      (event) =>
        event.type === "pendingRollUnhandled" &&
        event.rollId === pendingRoll.id &&
        event.kind === pendingRoll.kind
    ),
    "unknown pending roll kind should emit diagnostic event"
  );

  console.log("unknown_pending_roll_kind_does_not_clear passed");
}
