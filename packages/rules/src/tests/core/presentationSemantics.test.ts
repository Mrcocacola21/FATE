import assert from "node:assert/strict";
import {
  applyActionRaw as applyAction,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  initKnowledgeForOwners,
  makeEmptyTurnEconomy,
  makeRngSequence,
  setUnit,
  setupAsgoreState,
  setupKaiserState,
  setupSansState,
  setupRiverPersonState,
  setupVladState,
  toBattleState,
} from "../helpers/testUtils";
import {
  ABILITY_ASGORE_FIREBALL,
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_KAISER_DORA,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_TRICKSTER_AOE,
  ABILITY_JACK_RIPPER_SNARES,
  ABILITY_RIVER_PERSON_BOAT,
  ABILITY_RIVER_PERSON_TRA_LA_LA,
  HERO_JACK_RIPPER_ID,
  ABILITY_VLAD_FOREST,
  ABILITY_KAISER_CARPET_STRIKE,
  getAbilityChargeCost,
  getAbilitySpec,
  makePlayerView,
  projectEventsForRecipient,
  setTurnEconomy,
  type GameEvent,
  type GameState,
  type ResolveRollChoice,
  type RNG,
} from "../../index";
import { correlateAbilityResult } from "../../core/abilityUse";
import { evUnitMoved } from "../../core";
import { applyNewBatchPostAction } from "../../actions/heroes/newBatchPost";
import { EVENT_VISIBILITY } from "../../model/events/visibility";

const noDice: RNG = {
  next() {
    throw new Error("Unexpected automatic RNG");
  },
};
function respond(state: GameState, dice: number[] = [], choice?: ResolveRollChoice) {
  const pending = state.pendingRoll;
  assert(pending);
  return applyAction(
    state,
    {
      type: "resolvePendingRoll",
      pendingRollId: pending.id,
      player: pending.player,
      choice,
    },
    dice.length ? makeRngSequence(dice) : noDice,
  );
}
function eventOf<T extends GameEvent["type"]>(events: GameEvent[], type: T) {
  const event = events.find(
    (event): event is Extract<GameEvent, { type: T }> => event.type === type,
  );
  assert(event, `Expected ${type}`);
  return event;
}
function baseFixture(attackerClass = "knight", defenderClass = "archer") {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1")),
    createDefaultArmy("P2"),
  );
  const attacker = Object.values(state.units).find(
    (unit) => unit.owner === "P1" && unit.class === attackerClass,
  )!;
  const defender = Object.values(state.units).find(
    (unit) => unit.owner === "P2" && unit.class === defenderClass,
  )!;
  state = setUnit(state, attacker.id, { position: { col: 4, row: 4 } });
  state = setUnit(state, defender.id, { position: { col: 5, row: 4 }, hp: 30 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", attacker.id));
  return { state, attackerId: attacker.id, defenderId: defender.id };
}

export function semanticFireballFixture() {
  const setup = setupAsgoreState();
  const target = Object.values(setup.state.units).find(
    (unit) => unit.owner === "P2" && unit.class === "archer",
  )!;
  let state = setUnit(setup.state, setup.asgore.id, {
    position: { col: 4, row: 4 },
    charges: {
      ...setup.asgore.charges,
      [ABILITY_ASGORE_FIREBALL]: getAbilityChargeCost(getAbilitySpec(ABILITY_ASGORE_FIREBALL)!),
    },
  });
  state = setUnit(state, target.id, { position: { col: 4, row: 7 }, hp: 30 });
  state = initKnowledgeForOwners(toBattleState(state, "P1", setup.asgore.id));
  const activated = applyAction(
    state,
    {
      type: "useAbility",
      unitId: setup.asgore.id,
      abilityId: ABILITY_ASGORE_FIREBALL,
      payload: { targetId: target.id },
    },
    noDice,
  );
  assert(activated.state.pendingRoll);
  return { before: state, activated, attackerId: setup.asgore.id, defenderId: target.id };
}

function testNormalAttackAndTieBreaks() {
  const setup = baseFixture();
  const declared = applyAction(
    setup.state,
    { type: "attack", attackerId: setup.attackerId, defenderId: setup.defenderId },
    noDice,
  );
  assert(!declared.events.some((event) => event.type === "rollResolved"));
  const firstId = declared.state.pendingRoll!.id;
  const attacker = respond(declared.state, [0.1, 0.2]);
  const roll = eventOf(attacker.events, "rollResolved");
  assert.equal(roll.rollId, firstId);
  assert.deepEqual(roll.dice, [1, 2]);
  assert.equal(roll.sides, 6);
  assert.equal(roll.total, 3);
  assert.equal(roll.unitId, setup.attackerId);
  assert.equal(attacker.events.filter((event) => event.type === "rollResolved").length, 1);
  const defender = respond(attacker.state, [0.1, 0.2]);
  assert.equal(eventOf(defender.events, "rollResolved").rollId, attacker.state.pendingRoll!.id);
  assert.equal(defender.state.pendingRoll!.context.stage, "tieBreak");
  const tieAttacker = respond(defender.state, [0.9]);
  const tieDefender = respond(tieAttacker.state, [0.1]);
  const rolls = [
    roll,
    eventOf(defender.events, "rollResolved"),
    eventOf(tieAttacker.events, "rollResolved"),
    eventOf(tieDefender.events, "rollResolved"),
  ];
  assert.equal(new Set(rolls.map((event) => event.rollId)).size, 4);
  assert.deepEqual(
    rolls.slice(2).map((event) => event.dice),
    [[6], [1]],
  );
  assert(rolls.every((event) => !event.abilityId && !event.abilityUseId));
  assert.equal(
    projectEventsForRecipient(attacker.state, attacker.events, "spectator").filter(
      (event) => event.type === "rollResolved",
    ).length,
    1,
  );
}

function testFireballAndFrozenAnchors() {
  const setup = semanticFireballFixture();
  const used = eventOf(setup.activated.events, "abilityUsed");
  assert(used.abilityUseId);
  assert.deepEqual(used.sourceCell, { col: 4, row: 4 });
  assert.equal(setup.activated.state.pendingRoll!.abilityUseId, used.abilityUseId);
  const attacker = respond(setup.activated.state, [0.8, 0.5]);
  const defender = respond(attacker.state, [0.01, 0.2]);
  const chain = [
    used,
    eventOf(attacker.events, "rollResolved"),
    eventOf(defender.events, "rollResolved"),
    eventOf(defender.events, "attackResolved"),
  ];
  for (const event of chain) {
    assert.equal(event.abilityUseId, used.abilityUseId);
    assert.equal(event.abilityId, ABILITY_ASGORE_FIREBALL);
    assert(!("eventId" in event), "delivery identities are owned outside deterministic rules");
  }
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(defender.state, chain, recipient);
    assert.equal(projected.length, 4);
    assert(
      projected.every(
        (event) => "abilityUseId" in event && event.abilityUseId === used.abilityUseId,
      ),
    );
  }
  const attack = eventOf(defender.events, "attackResolved");
  const oldCell = { col: 4, row: 4 };
  defender.state.units[setup.attackerId].position!.col = 2;
  assert.deepEqual(
    attack.sourceCell,
    oldCell,
    "event anchors must not share mutable state coordinates",
  );
  const moved = setUnit(defender.state, setup.attackerId, { position: { col: 3, row: 3 } });
  assert.deepEqual(
    eventOf(projectEventsForRecipient(moved, [attack], "P2") as GameEvent[], "attackResolved")
      .sourceCell,
    oldCell,
  );

  let normal = setUnit(defender.state, setup.attackerId, {
    ...setTurnEconomy(defender.state.units[setup.attackerId], makeEmptyTurnEconomy()),
    position: { col: 4, row: 4 },
  });
  normal = setUnit(normal, setup.defenderId, { position: { col: 4, row: 5 } });
  const declared = applyAction(
    normal,
    { type: "attack", attackerId: setup.attackerId, defenderId: setup.defenderId },
    noDice,
  );
  const normalAttacker = respond(declared.state, [0.8, 0.5]);
  const normalDefender = respond(normalAttacker.state, [0.01, 0.2]);
  assert(!eventOf(normalDefender.events, "attackResolved").abilityUseId);
  assert(!eventOf(normalDefender.events, "attackResolved").abilityId);
  const replay = semanticFireballFixture();
  assert.equal(eventOf(replay.activated.events, "abilityUsed").abilityUseId, used.abilityUseId);
}

function testSharedAoECorrelation() {
  for (const abilityId of [
    ABILITY_KAISER_DORA,
    ABILITY_SANS_GASTER_BLASTER,
    ABILITY_TRICKSTER_AOE,
  ]) {
    const setup = abilityId === ABILITY_KAISER_DORA ? setupKaiserState() : setupSansState();
    let state = setup.state;
    const caster = Object.values(state.units).find(
      (unit) =>
        unit.owner === "P1" &&
        (abilityId === ABILITY_KAISER_DORA ? unit.class === "archer" : unit.class === "trickster"),
    )!;
    const targets = Object.values(state.units).filter(
      (unit) => unit.owner === "P2" && (unit.class === "archer" || unit.class === "knight"),
    );
    state = setUnit(state, caster.id, {
      heroId: abilityId === ABILITY_TRICKSTER_AOE ? undefined : caster.heroId,
      position: { col: 4, row: 4 },
      charges: { ...caster.charges, [abilityId]: 10 },
    });
    for (let i = 0; i < targets.length; i++)
      state = setUnit(state, targets[i]!.id, {
        position:
          abilityId === ABILITY_KAISER_DORA ? { col: 4 + i, row: 6 } : { col: 4, row: 5 + i },
        hp: 30,
      });
    const selectedCell = { col: 4, row: abilityId === ABILITY_KAISER_DORA ? 6 : 5 };
    state = initKnowledgeForOwners(toBattleState(state, "P1", caster.id));
    const started = applyAction(
      state,
      {
        type: "useAbility",
        unitId: caster.id,
        abilityId,
        payload: { center: selectedCell, target: selectedCell },
      },
      noDice,
    );
    const use = eventOf(started.events, "abilityUsed").abilityUseId;
    assert(use);
    const attacker = respond(started.state, [0.8, 0.5]);
    assert.equal(attacker.events.filter((event) => event.type === "rollResolved").length, 1);
    const events = [...started.events, ...attacker.events];
    state = attacker.state;
    while (state.pendingRoll) {
      assert(state.pendingRoll.kind.includes("defenderRoll"));
      const resolved = respond(state, [0.01, 0.2]);
      events.push(...resolved.events);
      state = resolved.state;
    }
    const rolls = events.filter((event) => event.type === "rollResolved");
    assert.equal(rolls.filter((event) => event.rollerPlayerId === "P1").length, 1);
    assert.equal(rolls.filter((event) => event.rollerPlayerId === "P2").length, targets.length);
    assert.equal(events.filter((event) => event.type === "attackResolved").length, targets.length);
    for (const event of events.filter((event) =>
      ["rollResolved", "attackResolved", "aoeResolved"].includes(event.type),
    )) {
      assert.equal(event.abilityUseId, use);
      assert.equal(event.abilityId, abilityId);
    }
    const aoe = eventOf(events, "aoeResolved");
    assert.deepEqual(aoe.sourceCell, { col: 4, row: 4 });
    assert.deepEqual(
      aoe.center,
      abilityId === ABILITY_TRICKSTER_AOE ? { col: 4, row: 4 } : selectedCell,
    );
  }
}

function testAutoDodgeAndPrivateRolls() {
  const setup = baseFixture("knight", "berserker");
  const state = setUnit(setup.state, setup.defenderId, {
    charges: { [ABILITY_BERSERK_AUTO_DEFENSE]: 6 },
  });
  const declared = applyAction(
    state,
    { type: "attack", attackerId: setup.attackerId, defenderId: setup.defenderId },
    noDice,
  );
  const attacker = respond(declared.state, [0.8, 0.5]);
  assert.equal(attacker.state.pendingRoll!.kind, "berserkerDefenseChoice");
  const auto = respond(attacker.state, [], "auto");
  assert(!auto.events.some((event) => event.type === "rollResolved"));
  assert.equal(eventOf(auto.events, "attackResolved").hit, false);

  const stealth = baseFixture("assassin");
  const requested = applyAction(
    stealth.state,
    { type: "enterStealth", unitId: stealth.attackerId },
    noDice,
  );
  const rolled = respond(requested.state, [0.99]);
  assert.equal(eventOf(rolled.events, "rollResolved").total, 6);
  assert(
    projectEventsForRecipient(rolled.state, rolled.events, "P1").some(
      (event) => event.type === "rollResolved",
    ),
  );
  assert(
    !projectEventsForRecipient(rolled.state, rolled.events, "P2").some(
      (event) => event.type === "rollResolved",
    ),
  );
  assert(
    !projectEventsForRecipient(rolled.state, rolled.events, "spectator").some(
      (event) => event.type === "rollResolved",
    ),
  );
}

function testHiddenAnchorsAndDeath() {
  const setup = baseFixture("assassin");
  let state = setUnit(setup.state, setup.attackerId, { isStealthed: true });
  state = setUnit(state, setup.defenderId, { hp: 1 });
  const declared = applyAction(
    state,
    { type: "attack", attackerId: setup.attackerId, defenderId: setup.defenderId },
    noDice,
  );
  const attacker = respond(declared.state, [0.8, 0.5]);
  const defender = respond(attacker.state, [0.01, 0.2]);
  const attack = eventOf(defender.events, "attackResolved");
  assert.deepEqual(attack.sourceCell, { col: 4, row: 4 });
  assert.equal(defender.state.units[setup.defenderId].position, null);
  const death = eventOf(defender.events, "unitDied");
  assert.deepEqual(death.deathCell, { col: 5, row: 4 });
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(defender.state, defender.events, recipient);
    const visible = projected.find((event) => event.type === "attackResolved");
    assert(visible?.type === "attackResolved");
    assert(!("sourceCell" in visible));
    assert.deepEqual(visible.targetCell, { col: 5, row: 4 });
  }
}

function testMovementProvenance() {
  for (const [cls, to, kind] of [
    ["knight", { col: 4, row: 5 }, "normal"],
    ["rider", { col: 4, row: 7 }, "rider"],
    ["trickster", { col: 4, row: 5 }, "teleport"],
  ] as const) {
    let state = baseFixture(cls).state;
    const unitId = state.activeUnitId!;
    state = setUnit(state, "P2-archer-6", { position: { col: 8, row: 8 } });
    if (cls === "trickster") {
      const requested = applyAction(state, { type: "requestMoveOptions", unitId }, noDice);
      const rolled = respond(requested.state, [0.01]);
      assert.equal(eventOf(rolled.events, "rollResolved").rollKind, "moveTrickster");
      state = rolled.state;
    }
    const moved = applyAction(state, { type: "move", unitId, to }, noDice);
    assert.equal(eventOf(moved.events, "unitMoved").provenance.kind, kind);
  }
  const setup = baseFixture("rider");
  const long = evUnitMoved(setup.state, {
    unitId: setup.attackerId,
    from: { col: 4, row: 4 },
    to: { col: 4, row: 8 },
    provenance: { kind: "rider" },
  });
  assert.equal(long.provenance.kind, "rider", "distance never classifies teleport");
}

function testBoatAndTralalaReachedSteps() {
  for (const abilityId of [ABILITY_RIVER_PERSON_BOAT, ABILITY_RIVER_PERSON_TRA_LA_LA]) {
    const setup = setupRiverPersonState();
    const passenger = Object.values(setup.state.units).find(
      (unit) =>
        unit.owner === (abilityId === ABILITY_RIVER_PERSON_BOAT ? "P1" : "P2") &&
        unit.class === "assassin",
    )!;
    let state = setUnit(setup.state, setup.river.id, {
      position: { col: 0, row: 0 },
      charges: { ...setup.river.charges, [abilityId]: 10 },
    });
    state = setUnit(state, passenger.id, { position: { col: 1, row: 0 }, hp: 30 });
    state = initKnowledgeForOwners(toBattleState(state, "P1", setup.river.id));
    state = {
      ...state,
      stakeMarkers: [
        { id: "stop", owner: "P2", position: { col: 0, row: 2 }, createdAt: 0, isRevealed: false },
      ],
    };
    const opened = applyAction(
      state,
      { type: "useAbility", unitId: setup.river.id, abilityId },
      noDice,
    );
    assert(!opened.events.some((event) => event.type === "abilityUsed"));
    assert.equal(opened.state.abilityUseCounter, state.abilityUseCounter);
    const selected = respond(opened.state, [], {
      type: "hassanTrueEnemyTarget",
      targetId: passenger.id,
    });
    const planned = respond(selected.state, [], {
      type: "forestMoveDestination",
      position: { col: 0, row: 5 },
    });
    const committed = respond(planned.state, [], {
      type: "forestMoveDestination",
      position: { col: 1, row: 5 },
    });
    const use = eventOf(committed.events, "abilityUsed").abilityUseId;
    assert(use);
    const events = [...committed.events];
    state = committed.state;
    if (state.pendingRoll) {
      const dropped = respond(state, [], {
        type:
          abilityId === ABILITY_RIVER_PERSON_BOAT
            ? "forestMoveDestination"
            : "reactionDropDestination",
        position: { col: 1, row: 2 },
      });
      events.push(...dropped.events);
      state = dropped.state;
    }
    const moves = events.filter((event) => event.type === "unitMoved");
    assert(moves.length >= 2);
    for (const event of moves) {
      assert.equal(
        event.provenance.kind,
        abilityId === ABILITY_RIVER_PERSON_BOAT ? "boat" : "tralala",
      );
      assert.equal(event.abilityUseId, use);
      assert(event.to.row <= 2, "unreached route cells must never be emitted");
    }
    const final = events.find(
      (event) => event.type === "riverBoatResolved" || event.type === "riverTraLaLaResolved",
    );
    assert(final && final.abilityUseId === use);
    assert(
      !JSON.stringify(projectEventsForRecipient(state, events, "spectator")).includes('"path"'),
    );
  }
}

function testSnares() {
  let state = attachArmy(
    attachArmy(createEmptyGame(), createDefaultArmy("P1", { assassin: HERO_JACK_RIPPER_ID })),
    createDefaultArmy("P2"),
  );
  const jack = Object.values(state.units).find((unit) => unit.heroId === HERO_JACK_RIPPER_ID)!;
  state = setUnit(state, jack.id, { position: { col: 4, row: 4 } });
  state = initKnowledgeForOwners(toBattleState(state, "P1", jack.id));
  state = {
    ...state,
    pendingRoll: {
      id: "place",
      player: "P1",
      kind: "chargedImpulseTargetChoice",
      context: {
        unitId: jack.id,
        abilityId: ABILITY_JACK_RIPPER_SNARES,
        options: [{ col: 4, row: 5 }],
      },
    },
  };
  const placed = respond(state, [], { type: "chargedImpulseTarget", position: { col: 4, row: 5 } });
  const placement = eventOf(placed.events, "snarePlaced");
  assert(placement.abilityUseId);
  assert.deepEqual(placement.cell, { col: 4, row: 5 });
  assert(
    projectEventsForRecipient(placed.state, placed.events, "P1").some(
      (event) => event.type === "snarePlaced",
    ),
  );
  for (const recipient of ["P2", "spectator"] as const)
    assert(
      !projectEventsForRecipient(placed.state, placed.events, recipient).some(
        (event) => event.type === "snarePlaced",
      ),
    );
  const enemy = placed.state.units["P2-knight-7"]!;
  const cell = { col: 4, row: 5 };
  const trap = placed.state.jackTraps![0]!;
  let entered = setUnit(placed.state, enemy.id, { position: cell });
  entered = {
    ...entered,
    jackTraps: [
      ...entered.jackTraps!,
      { ...trap, id: "UNTRIGGERED_SECRET", position: { col: 8, row: 1 } },
    ],
  };
  const move = evUnitMoved(entered, {
    unitId: enemy.id,
    from: { col: 4, row: 6 },
    to: cell,
    provenance: { kind: "normal" },
  });
  const triggered = applyNewBatchPostAction(entered, entered, [move], noDice);
  assert.equal(triggered.events.filter((event) => event.type === "snareTriggered").length, 1);
  assert.deepEqual(eventOf(triggered.events, "snareTriggered").cell, cell);
  assert.equal(eventOf(triggered.events, "snareTriggered").unitId, enemy.id);
  assert(triggered.state.units[enemy.id].immobilizedUntilOwnTurnStart);
  const repeated = applyNewBatchPostAction(triggered.state, triggered.state, [move], noDice);
  assert(!repeated.events.some((event) => event.type === "snareTriggered"));
  for (const recipient of ["P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(triggered.state, triggered.events, recipient);
    assert(projected.some((event) => event.type === "snareTriggered"));
    assert(!JSON.stringify(projected).includes("UNTRIGGERED_SECRET"));
    assert(!JSON.stringify(projected).includes('"col":8,"row":1'));
  }
}

function testForestAndCarpetManualRolls() {
  for (const carpet of [false, true]) {
    const setup = carpet ? setupKaiserState() : setupVladState();
    const caster = Object.values(setup.state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId,
    )!;
    const abilityId = carpet ? ABILITY_KAISER_CARPET_STRIKE : ABILITY_VLAD_FOREST;
    let state = setUnit(setup.state, caster.id, {
      position: { col: 1, row: 1 },
      ownTurnsStarted: 1,
      charges: { ...caster.charges, [abilityId]: carpet ? 3 : 0 },
    });
    const targets = Object.values(state.units).filter(
      (unit) => unit.owner === "P2" && ["archer", "knight"].includes(unit.class),
    );
    targets.forEach((target, i) => {
      state = setUnit(state, target.id, { position: { col: 4 + i, row: 6 }, hp: 30 });
    });
    state = initKnowledgeForOwners(toBattleState(state, "P1", caster.id));
    state = {
      ...state,
      activeUnitId: null,
      turnQueue: [caster.id, ...targets.map((u) => u.id)],
      turnQueueIndex: 0,
      turnOrder: [caster.id, ...targets.map((u) => u.id)],
      turnOrderIndex: 0,
      stakeMarkers: carpet
        ? []
        : Array.from({ length: 9 }, (_, i) => ({
            id: "stake-" + i,
            owner: "P1" as const,
            position: { col: i % 3, row: Math.floor(i / 3) },
            createdAt: i,
            isRevealed: false,
          })),
    };
    const started = applyAction(state, { type: "unitStartTurn", unitId: caster.id }, noDice);
    const use = eventOf(started.events, "abilityUsed").abilityUseId;
    assert(use);
    const selected = carpet
      ? respond(started.state, [0.49, 0.7])
      : respond(started.state, [], { type: "forestTarget", center: { col: 4, row: 6 } });
    if (carpet) {
      const centerRoll = eventOf(selected.events, "rollResolved");
      assert.deepEqual(centerRoll.dice, [5, 7]);
      assert.equal(centerRoll.sides, 9);
      assert.equal(centerRoll.abilityUseId, use);
    } else assert(!selected.events.some((e) => e.type === "rollResolved"));
    const attack = respond(selected.state, [0.8, 0.5]);
    const events = [...started.events, ...selected.events, ...attack.events];
    state = attack.state;
    while (state.pendingRoll) {
      const next = respond(state, [0.01, 0.2]);
      events.push(...next.events);
      state = next.state;
    }
    assert.equal(
      events.filter((e) => e.type === "rollResolved" && e.rollKind.includes("attackerRoll")).length,
      carpet ? 0 : 1,
    );
    assert.equal(
      events.filter((e) => e.type === "rollResolved" && e.rollerPlayerId === "P2").length,
      2,
    );
    for (const e of events.filter((e) =>
      ["rollResolved", "attackResolved", "aoeResolved"].includes(e.type),
    )) {
      assert.equal(e.abilityUseId, use);
      assert.equal(e.abilityId, abilityId);
    }
  }
}

function testSearchPrivacyAndPendingOrigins() {
  const setup = baseFixture();
  let state = setup.state;
  const hidden = Object.values(state.units).filter(
    (u) => u.owner === "P2" && ["archer", "assassin"].includes(u.class),
  );
  hidden.forEach((u, i) => {
    state = setUnit(state, u.id, { position: { col: 3 + i, row: 4 }, isStealthed: true });
  });
  const requested = applyAction(
    state,
    { type: "searchStealth", unitId: setup.attackerId, mode: "action" },
    noDice,
  );
  const searched = respond(requested.state, [0.99, 0.2]);
  const rolls = searched.events.filter((e) => e.type === "rollResolved");
  assert.equal(rolls.length, 2);
  assert.deepEqual(
    rolls.map((e) => e.rollIndex),
    [0, 1],
  );
  assert(rolls.every((e) => e.unitId === setup.attackerId));
  for (const r of ["P2", "spectator"] as const)
    assert(
      !projectEventsForRecipient(searched.state, searched.events, r).some(
        (e) => e.type === "rollResolved",
      ),
    );
  const visibleRolls = projectEventsForRecipient(searched.state, searched.events, "P1").filter(
    (e) => e.type === "rollResolved",
  );
  assert.equal(visibleRolls.length, 1);
  assert(!("rollIndex" in visibleRolls[0]));
  const fire = semanticFireballFixture();
  const pending = fire.activated.state.pendingRoll!;
  pending.abilitySourceRecipients = ["P1"];
  pending.context.abilitySourceRecipients = ["P1"];
  const attack = respond(fire.activated.state, [0.8, 0.5]);
  const view = makePlayerView(attack.state, "P2").pendingRoll!;
  assert(!view.abilityUseId);
  assert(!view.abilityId);
  assert(!view.context.abilitySourceCell);
  assert(!view.context.abilityUseId);
}

function testNestedUseIsolationAndMovementPrivacy() {
  const setup = semanticFireballFixture();
  const attacker = respond(setup.activated.state, [0.8, 0.5]);
  const independent = correlateAbilityResult(attacker.state, {
    state: {
      ...attacker.state,
      pendingRoll: {
        id: "independent",
        player: "P1",
        kind: "asgoreSoulParadeRoll",
        context: { asgoreId: setup.attackerId },
      },
    },
    events: [],
  });
  assert(
    !independent.state.pendingRoll!.abilityUseId,
    "independent passive must not inherit Fireball",
  );
  const lineage = attacker.state.pendingRoll!;
  const priorAoE: GameState = { ...attacker.state, pendingAoE: {
    casterId: setup.attackerId, abilityId: lineage.abilityId!, abilityUseId: lineage.abilityUseId,
    abilitySourceUnitId: lineage.abilitySourceUnitId, center: { col: 4, row: 7 }, radius: 1,
    affectedUnitIds: [], revealedUnitIds: [], damagedUnitIds: [], damageByUnitId: {},
  } };
  const court = correlateAbilityResult(priorAoE, { state: { ...priorAoE,
    pendingRoll: { id: "court", player: "P1", kind: "courtAttackerRoll", context: {} } }, events: [] });
  assert(!court.state.pendingRoll!.abilityUseId, "independent public rule roll must not inherit AoE lineage");
  const trapAttack: GameEvent = {
    type: "attackResolved",
    attackerId: setup.attackerId,
    defenderId: setup.defenderId,
    sourceCell: { col: 4, row: 4 },
    targetCell: { col: 4, row: 7 },
    attackerRoll: { dice: [6, 5], sum: 11, isDouble: false },
    defenderRoll: { dice: [1, 2], sum: 3, isDouble: false },
    hit: true,
    damage: 1,
    defenderHpAfter: 29,
    abilityId: "falseTrailTrap",
  };
  const unrelated = correlateAbilityResult(attacker.state, {
    state: attacker.state,
    events: [trapAttack],
  });
  assert(!unrelated.events[0].abilityUseId);
  const autoSetup = baseFixture("assassin", "berserker");
  let state = setUnit(autoSetup.state, autoSetup.attackerId, { isStealthed: true });
  state = setUnit(state, autoSetup.defenderId, { charges: { [ABILITY_BERSERK_AUTO_DEFENSE]: 6 } });
  const declared = applyAction(
    state,
    { type: "attack", attackerId: autoSetup.attackerId, defenderId: autoSetup.defenderId },
    noDice,
  );
  const auto = respond(respond(declared.state, [0.8, 0.5]).state, [], "auto");
  for (const r of ["P2", "spectator"] as const) {
    const e = projectEventsForRecipient(auto.state, auto.events, r).find(
      (e) => e.type === "attackResolved",
    );
    assert(e && !("sourceCell" in e));
  }
  const move = evUnitMoved(autoSetup.state, {
    unitId: autoSetup.defenderId,
    from: { col: 5, row: 4 },
    to: { col: 5, row: 5 },
    provenance: { kind: "ability", abilityId: "HIDDEN_CAUSE" },
  });
  const projected = projectEventsForRecipient(autoSetup.state, [move], "spectator");
  assert(projected[0]?.type === "unitMoved");
  assert.deepEqual(projected[0].provenance, { kind: "ability" });
}

function testAsgoreSourceAnchorsAndHealingProjection() {
  const setup = semanticFireballFixture();
  const used = eventOf(setup.activated.events, "abilityUsed");
  const later = setUnit(setup.activated.state, setup.attackerId, { position: { col: 0, row: 0 } });
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = eventOf(projectEventsForRecipient(later, [used], recipient) as GameEvent[], "abilityUsed");
    assert.deepEqual(projected.sourceCell, { col: 4, row: 4 });
  }
  const privateUsed = { ...used, [EVENT_VISIBILITY]: { recipients: ["P1"] as const,
    sourceCellRecipients: ["P1"] as const, abilityRecipients: ["P1"] as const } };
  const soul: GameEvent = { type: "asgoreSoulParadeResolved", asgoreId: setup.attackerId,
    sourceCell: { col: 4, row: 4 }, roll: 2, soulId: "bravery", soulName: "Bravery", effectDescription: "Guard",
    [EVENT_VISIBILITY]: privateUsed[EVENT_VISIBILITY] };
  const heal: GameEvent = { type: "unitHealed", unitId: setup.attackerId, amount: 2, hpAfter: 7,
    sourceAbilityId: "asgoreSoulParade", abilityId: "asgoreSoulParade", abilityUseId: "U-heal",
    [EVENT_VISIBILITY]: privateUsed[EVENT_VISIBILITY] };
  for (const recipient of ["P1", "P2", "spectator"] as const) {
    const projected = projectEventsForRecipient(later, [privateUsed, soul, heal], recipient) as GameEvent[];
    const cast = eventOf(projected, "abilityUsed"), reveal = eventOf(projected, "asgoreSoulParadeResolved");
    assert.equal(Boolean(cast.sourceCell), recipient === "P1");
    assert.equal(Boolean(reveal.sourceCell), recipient === "P1");
    const healing = eventOf(projected, "unitHealed");
    assert.equal(healing.amount, 2, "visible HP healing must survive an ability-valued sourceAbilityId");
    assert.equal(healing.sourceAbilityId, recipient === "P1" ? "asgoreSoulParade" : undefined);
    assert.equal(healing.abilityUseId, recipient === "P1" ? "U-heal" : undefined);
  }
  const hidden = setUnit(later, setup.attackerId, { isStealthed: true });
  assert.deepEqual(projectEventsForRecipient(hidden, [heal], "spectator"), []);
}

export function testPresentationSemantics() {
  for (const test of [
    testNormalAttackAndTieBreaks,
    testFireballAndFrozenAnchors,
    testAsgoreSourceAnchorsAndHealingProjection,
    testSharedAoECorrelation,
    testAutoDodgeAndPrivateRolls,
    testHiddenAnchorsAndDeath,
    testMovementProvenance,
    testBoatAndTralalaReachedSteps,
    testSnares,
    testForestAndCarpetManualRolls,
    testSearchPrivacyAndPendingOrigins,
    testNestedUseIsolationAndMovementPrivacy,
  ]) {
    test();
    console.log(`${test.name} passed`);
  }
  const setup = semanticFireballFixture();
  const pending = setup.activated.state.pendingRoll!;
  const visible = makePlayerView(setup.activated.state, pending.player).pendingRoll!;
  assert(!("abilitySourceCell" in visible));
  assert(!("abilitySourceCell" in visible.context));
}
