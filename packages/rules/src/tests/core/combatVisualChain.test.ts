import { createEmptyGame } from "../helpers/testUtils";
import { assert } from "../helpers/testUtils";
import {
  clearPendingRoll,
  finalizeCombatVisualChain,
  replacePendingRoll,
  requestRoll,
} from "../../core";
import type { GameEvent, GameState } from "../../model";
import { projectEventsForRecipient } from "../../view/events";
import { makePlayerView } from "../../view/player";
import { makeSpectatorView } from "../../view/spectator";

function queuedState(sourceAbilityId?: string): GameState {
  const state = createEmptyGame();
  return {
    ...state,
    pendingCombatQueue: [
      {
        attackerId: "attacker",
        defenderId: "target-a",
        sourceAbilityId,
        kind: "aoe",
      },
      {
        attackerId: "attacker",
        defenderId: "target-b",
        sourceAbilityId,
        kind: "aoe",
      },
    ],
  };
}

export function testCombatVisualChainIdsStayStableAcrossRelatedRolls() {
  const riderBase = {
    ...queuedState(),
    pendingCombatQueue: queuedState().pendingCombatQueue.map((entry) => ({
      ...entry,
      kind: "riderPath" as const,
    })),
  };
  const rider = requestRoll(riderBase, "P1", "riderPathAttack_attackerRoll", {
    queueKind: "riderPath",
    attackerId: "attacker",
    defenderId: "target-a",
  });
  const riderChainId = rider.state.pendingRoll?.chainId;
  assert(riderChainId, "Rider pass should create a visual chain id");
  assert(
    rider.state.pendingRoll?.chainSource === "riderPass",
    "Rider pass should expose its chain source to the rolling player",
  );
  const riderDefense = replacePendingRoll(rider.state, "P2", "riderPathAttack_defenderRoll", {
    queueKind: "riderPath",
    attackerId: "attacker",
    defenderId: "target-a",
  });
  assert(
    riderDefense.state.pendingRoll?.chainId === riderChainId,
    "all Rider attack and defense rolls should retain one chain id",
  );

  const elCid = requestRoll(createEmptyGame(), "P1", "elCidTisona_attackerRoll", {
    casterId: "el-cid",
    targetsQueue: ["target-a", "target-b"],
    currentTargetIndex: 0,
  });
  const elCidChainId = elCid.state.pendingRoll?.chainId;
  const elCidDefense = replacePendingRoll(elCid.state, "P2", "elCidTisona_defenderRoll", {
    casterId: "el-cid",
    targetsQueue: ["target-a", "target-b"],
    currentTargetIndex: 0,
  });
  assert(
    elCidChainId && elCidDefense.state.pendingRoll?.chainId === elCidChainId,
    "El Cid's full multi-target resolution should retain one chain id",
  );
  assert(
    elCid.state.pendingRoll?.chainSource === "elCidUltimate",
    "El Cid's chain should have the expected source",
  );

  const jack = requestRoll(queuedState("jackRipperDismemberment"), "P1", "attack_attackerRoll", {
    queueKind: "aoe",
    sourceAbilityId: "jackRipperDismemberment",
    attackerId: "jack",
    defenderId: "target-a",
  });
  assert(jack.state.pendingRoll?.chainId, "Jack's repeated attack should create a chain");
  assert(
    jack.state.pendingRoll?.chainSource === "jackRipperUltimate",
    "Jack's repeated phantasm attacks should be identified as one chain",
  );

  console.log("combat_visual_chain_ids_stay_stable_across_related_rolls passed");
}

export function testCombatVisualChainCompletesOnlyAfterNestedFollowups() {
  const started = requestRoll(queuedState(), "P1", "attack_attackerRoll", {
    queueKind: "aoe",
    attackerId: "attacker",
    defenderId: "target-a",
  });
  const chainId = started.state.pendingRoll?.chainId!;
  const attackEvent = {
    type: "attackResolved",
    attackerId: "attacker",
    defenderId: "target-a",
    attackerRoll: { dice: [6], sum: 6, isDouble: false },
    defenderRoll: { dice: [1], sum: 1, isDouble: false },
    hit: true,
    damage: 2,
    defenderHpAfter: 0,
  } as GameEvent;

  const nested = replacePendingRoll(
    {
      ...started.state,
      pendingCombatQueue: [],
      pendingAoE: null,
    },
    "P2",
    "donSorrowfulMoveChoice",
    { unitId: "target-a", options: [] },
  );
  const stillOpen = finalizeCombatVisualChain(nested.state, [attackEvent]);
  assert(
    stillOpen.events.every((event) => event.type !== "combatVisualBatchReady"),
    "a nested death/reaction follow-up must keep the parent chain open",
  );
  assert(
    stillOpen.events[0]?.deferVisuals === true && stillOpen.events[0]?.chainId === chainId,
    "nested follow-up events should remain deferred in the parent chain",
  );

  const finished = finalizeCombatVisualChain(clearPendingRoll(stillOpen.state), []);
  const marker = finished.events.find((event) => event.type === "combatVisualBatchReady");
  assert(marker?.chainId === chainId, "the final marker should close the same chain");
  assert(marker?.isChainComplete === true, "the final marker should be explicit");
  assert(
    finished.state.combatResolutionChain === null,
    "completed chains should be cleared from authoritative state",
  );

  const normal = requestRoll(createEmptyGame(), "P1", "attack_attackerRoll", {
    queueKind: "normal",
    attackerId: "attacker",
    defenderId: "target",
  });
  assert(
    !normal.state.pendingRoll?.chainId,
    "a normal single attack should keep its existing immediate final-roll behavior",
  );

  console.log("combat_visual_chain_completes_only_after_nested_followups passed");
}

export function testCombatVisualMetadataProjectionDoesNotLeakHiddenUnits() {
  const event = {
    type: "abilityUsed",
    unitId: "hidden-jack",
    abilityId: "jackRipperDismemberment",
    chainId: "combat-chain-7",
    visualBatchId: "combat-chain-7",
    deferVisuals: true,
    isChainComplete: false,
  } as GameEvent;
  const projected = projectEventsForRecipient(createEmptyGame(), [event], "P2");
  const serialized = JSON.stringify(projected);
  assert(!serialized.includes("hidden-jack"), "chain projection must not reveal hidden units");
  assert(
    projected[0]?.chainId === "combat-chain-7" && projected[0]?.deferVisuals === true,
    "safe opaque chain timing metadata should survive event redaction",
  );

  const internalState: GameState = {
    ...createEmptyGame(),
    combatResolutionChain: {
      chainId: "combat-chain-private",
      source: "jackRipperUltimate",
      pendingRollsRemaining: 4,
      isComplete: false,
    },
  };
  assert(
    !JSON.stringify(makePlayerView(internalState, "P2")).includes("jackRipperUltimate"),
    "player snapshots must omit the internal chain source",
  );
  assert(
    !JSON.stringify(makeSpectatorView(internalState)).includes("jackRipperUltimate"),
    "spectator snapshots must omit the internal chain source",
  );

  console.log("combat_visual_metadata_projection_does_not_leak_hidden_units passed");
}
