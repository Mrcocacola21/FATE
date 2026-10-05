import assert from "node:assert/strict";
import test from "node:test";
import {
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  HERO_SANS_ID,
  makePlayerView,
  type GameAction,
} from "rules";
import { createGameRoom, applyGameAction } from "../store";
import { isActionAllowedByPlayer } from "../permissions";
import { ClientMessageSchema } from "../schemas";
import { gameStateV1Schema } from "../persistence/snapshotStateV1";

function pendingRoom() {
  const room = createGameRoom({ seed: 17 });
  let state = attachArmy(createEmptyGame(), createDefaultArmy("P1", { trickster: HERO_SANS_ID }));
  state = attachArmy(state, createDefaultArmy("P2"));
  const sans = Object.values(state.units).find((unit) => unit.heroId === HERO_SANS_ID)!;
  const enemies = Object.values(state.units).filter((unit) => unit.owner === "P2");
  room.state = {
    ...state,
    phase: "battle",
    currentPlayer: "P2",
    units: {
      ...state.units,
      [sans.id]: {
        ...sans,
        hp: 0,
        position: { col: 4, row: 4 },
        sansUnbelieverUnlocked: true,
        sansPendingDeath: { killerId: enemies[0].id },
      },
    },
    pendingRoll: {
      id: "last-attack",
      player: "P1",
      kind: "selectLastAttackTarget",
      context: {
        sourceUnitId: sans.id,
        playerId: "P1",
        legalTargetIds: enemies.map((unit) => unit.id),
        resumePendingRoll: null,
      },
    },
  };
  return { room, sans, enemy: enemies[0] };
}

test("Last Attack accepts the authenticated owner on the enemy's turn and publishes the curse", () => {
  const { room, sans, enemy } = pendingRoom();
  const action: GameAction = {
    type: "resolvePendingRoll",
    pendingRollId: "last-attack",
    player: "P1",
    choice: { type: "sansLastAttackTarget", targetId: enemy.id },
  };
  assert(ClientMessageSchema.safeParse({ type: "action", action }).success);
  assert(isActionAllowedByPlayer(room.state, action, "P1"));
  assert(!isActionAllowedByPlayer(room.state, action, "P2"));
  const revision = room.revision;
  applyGameAction(room, action, "P2");
  assert.equal(room.revision, revision, "Forged player field must not authorize the enemy");
  applyGameAction(room, action, "P1");
  assert.equal(room.revision, revision + 1);
  assert.equal(room.state.units[enemy.id].sansLastAttackCurseSourceId, sans.id);
  assert.equal(room.state.units[sans.id].isAlive, false);
  assert.equal(room.state.pendingRoll, null);
  assert.equal(
    makePlayerView(room.state, "P2").units[enemy.id].sansLastAttackCurseSourceId,
    sans.id,
  );
});

test("Last Attack pending death, suspended rolls, and tick guard survive snapshot validation", () => {
  const { room, sans, enemy } = pendingRoom();
  room.state.pendingRoll!.context.resumePendingRoll = {
    id: "suspended",
    kind: "attack_defenderRoll",
    player: "P2",
    context: { attackerId: enemy.id },
  };
  room.state.units[enemy.id] = {
    ...room.state.units[enemy.id],
    sansLastAttackCurseSourceId: sans.id,
    sansLastAttackLastTickTurnNumber: 3,
  };
  const restored = gameStateV1Schema.parse(
    JSON.parse(
      JSON.stringify({
        ...room.state,
        units: Object.values(room.state.units),
      }),
    ),
  );
  assert.equal(restored.pendingRoll?.kind, "selectLastAttackTarget");
  assert.deepEqual(
    restored.pendingRoll?.context.resumePendingRoll,
    room.state.pendingRoll?.context.resumePendingRoll,
  );
  assert.deepEqual(restored.units[sans.id].sansPendingDeath, { killerId: enemy.id });
  assert.equal(restored.units[enemy.id].sansLastAttackLastTickTurnNumber, 3);
});
