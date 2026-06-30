import {
  ABILITY_PAPYRUS_COOL_GUY,
  ABILITY_SANS_GASTER_BLASTER,
  ABILITY_UNDYNE_ENERGY_SPEAR,
  AUTO_TRIGGERED_IMPULSE_IDS,
  HERO_PAPYRUS_ID,
  applyAction,
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  getImpulseAbilityIds,
  initKnowledgeForOwners,
  makeRngSequence,
  resolveAllPendingRollsWithEvents,
  setUnit,
  setupMettatonState,
  setupSansState,
  setupUndyneState,
} from "../helpers/testUtils";

function prepareTurnStart(
  state: ReturnType<typeof createEmptyGame>,
  unitId: string
) {
  return {
    ...state,
    phase: "battle" as const,
    currentPlayer: state.units[unitId].owner,
    activeUnitId: null,
    turnQueue: [unitId],
    turnQueueIndex: 0,
    turnOrder: [unitId],
    turnOrderIndex: 0,
  };
}

export function testImpulseMetadataAllAutoManaged() {
  assert.deepStrictEqual(
    [...AUTO_TRIGGERED_IMPULSE_IDS].sort(),
    getImpulseAbilityIds(),
    "every ability marked Impulse must have an automatic trigger path"
  );
  console.log("impulse_metadata_all_auto_managed passed");
}

export function testChargedLineImpulsesCreateForcedPendingAtTurnStart() {
  {
    let { state, sans } = setupSansState();
    state = setUnit(state, sans.id, {
      position: { col: 4, row: 4 },
      charges: {
        ...sans.charges,
        [ABILITY_SANS_GASTER_BLASTER]: 1,
      },
    });
    state = initKnowledgeForOwners(prepareTurnStart(state, sans.id));
    const started = applyAction(
      state,
      { type: "unitStartTurn", unitId: sans.id } as any,
      makeRngSequence([])
    );
    assert(
      started.state.pendingRoll?.kind === "chargedImpulseTargetChoice",
      "Gaster Blaster should force a line choice when its charge reaches 2"
    );
    const pending = started.state.pendingRoll!;
    const resolved = applyAction(
      started.state,
      {
        type: "resolvePendingRoll",
        pendingRollId: pending.id,
        player: pending.player,
        choice: {
          type: "chargedImpulseTarget",
          position: { col: 4, row: 6 },
        },
      } as any,
      makeRngSequence([])
    );
    assert(
      resolved.state.units[sans.id].charges[ABILITY_SANS_GASTER_BLASTER] === 0,
      "forced Gaster Blaster choice should spend its charges"
    );
  }

  {
    let { state, undyne } = setupUndyneState();
    state = setUnit(state, undyne.id, {
      position: { col: 4, row: 4 },
      charges: {
        ...undyne.charges,
        [ABILITY_UNDYNE_ENERGY_SPEAR]: 1,
      },
    });
    state = initKnowledgeForOwners(prepareTurnStart(state, undyne.id));
    const started = applyAction(
      state,
      { type: "unitStartTurn", unitId: undyne.id } as any,
      makeRngSequence([])
    );
    assert(
      started.state.pendingRoll?.kind === "chargedImpulseTargetChoice",
      "Energy Spear should force a line choice when its charge reaches 2"
    );
  }

  {
    let state = createEmptyGame();
    state = attachArmy(
      state,
      createDefaultArmy("P1", { spearman: HERO_PAPYRUS_ID })
    );
    state = attachArmy(state, createDefaultArmy("P2"));
    const papyrus = Object.values(state.units).find(
      (unit) => unit.owner === "P1" && unit.heroId === HERO_PAPYRUS_ID
    )!;
    state = setUnit(state, papyrus.id, {
      position: { col: 4, row: 4 },
      charges: {
        ...papyrus.charges,
        [ABILITY_PAPYRUS_COOL_GUY]: 4,
      },
    });
    state = initKnowledgeForOwners(prepareTurnStart(state, papyrus.id));
    const started = applyAction(
      state,
      { type: "unitStartTurn", unitId: papyrus.id } as any,
      makeRngSequence([])
    );
    assert(
      started.state.pendingRoll?.kind === "chargedImpulseTargetChoice",
      "Cool Guy should force a line choice when its charge reaches 5"
    );
  }

  console.log("charged_line_impulses_create_forced_pending_at_turn_start passed");
}

export function testEventDrivenImpulsesAutoTrigger() {
  {
    let { state, sans } = setupSansState();
    state = setUnit(state, sans.id, {
      position: { col: 4, row: 4 },
      sansUnbelieverUnlocked: true,
      sansBoneFieldActivated: false,
    });
    state = initKnowledgeForOwners(prepareTurnStart(state, sans.id));
    const started = applyAction(
      state,
      { type: "unitStartTurn", unitId: sans.id } as any,
      makeRngSequence([0.99])
    );
    assert(
      started.state.arenaId === "boneField" &&
        started.state.units[sans.id].sansBoneFieldActivated === true,
      "Bone Field should auto-trigger once on Sans's turn after Unbeliever"
    );
  }

  {
    let { state, mettaton, enemy } = setupMettatonState();
    state = setUnit(state, mettaton.id, {
      position: { col: 4, row: 4 },
      mettatonRating: 4,
    });
    state = setUnit(state, enemy.id, { position: { col: 4, row: 5 } });
    state = initKnowledgeForOwners({
      ...state,
      phase: "battle",
      currentPlayer: "P1",
      activeUnitId: mettaton.id,
      turnQueue: [mettaton.id],
      turnQueueIndex: 0,
      turnOrder: [mettaton.id],
      turnOrderIndex: 0,
    });
    const attack = applyAction(
      state,
      {
        type: "attack",
        attackerId: mettaton.id,
        defenderId: enemy.id,
      } as any,
      makeRngSequence([0.99, 0.99, 0.01, 0.01])
    );
    const resolved = resolveAllPendingRollsWithEvents(
      attack.state,
      makeRngSequence([0.99, 0.99, 0.01, 0.01])
    );
    assert(
      resolved.state.units[mettaton.id].mettatonExUnlocked !== true &&
        resolved.state.units[mettaton.id].mettatonRating === 6,
      "Mettaton EX should wait until turn start after a rating gain crosses 5"
    );

    const started = applyAction(
      prepareTurnStart(resolved.state, mettaton.id),
      { type: "unitStartTurn", unitId: mettaton.id } as any,
      makeRngSequence([])
    );
    assert(
      started.state.units[mettaton.id].mettatonExUnlocked === true &&
        started.state.units[mettaton.id].mettatonRating === 6,
      "Mettaton EX should unlock at turn start without spending Rating"
    );
  }

  console.log("event_driven_impulses_auto_trigger passed");
}
