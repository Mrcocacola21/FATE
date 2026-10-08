import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import type { MatchSnapshot } from "@prisma/client";
import {
  createEmptyGame,
  createDefaultArmy,
  attachArmy,
  HERO_RIVER_PERSON_ID,
  makePlayerView,
  makeSpectatorView,
  type GameState,
  type UnitState,
  type Coord,
  type ResolveRollChoice,
} from "rules";
import { applyGameAction, createGameRoomWithId, deleteGameRoom } from "../../store";
import { projectDeliveryEvents } from "../../eventDelivery";
import { serializeMatchSnapshot, deserializeMatchSnapshot } from "../../persistence/matchSnapshot";

function setUnit(state: GameState, id: string, patch: Partial<UnitState>): GameState {
  return { ...state, units: { ...state.units, [id]: { ...state.units[id], ...patch } } };
}

for (const drag of [false, true])
  test(`River ${drag ? "reaction" : "interrupted disembark"} persists operation identity and recipient-safe pending decisions`, () => {
    const game = createGameRoomWithId(randomUUID(), {
      seed: 37,
      hostConnId: "host",
      publish: false,
    });
    try {
      game.matchId = randomUUID();
      const armies = attachArmy(
        attachArmy(createEmptyGame(), createDefaultArmy("P1", { rider: HERO_RIVER_PERSON_ID })),
        createDefaultArmy("P2"),
      );
      const f = {
        state: armies,
        river: Object.values(armies.units).find(
          (u) => u.owner === "P1" && u.heroId === HERO_RIVER_PERSON_ID,
        )!,
      };
      let state = f.state;
      const passenger = Object.values(state.units).find(
        (u) => u.owner === (drag ? "P2" : "P1") && u.class === "assassin",
      )!;
      const reactor = Object.values(state.units).find(
        (u) => u.owner === "P1" && u.class === "berserker",
      )!;
      for (const unit of Object.values(state.units))
        state = setUnit(state, unit.id, { position: null });
      state = setUnit(state, f.river.id, {
        position: { col: 0, row: 0 },
        charges: { ...f.river.charges, riverTraLaLa: 4 },
      });
      state = setUnit(state, passenger.id, { position: { col: 1, row: 0 }, hp: 20 });
      if (drag) state = setUnit(state, reactor.id, { position: { col: 1, row: 2 } });
      const knowledge: GameState["knowledge"] = { P1: {}, P2: {} };
      for (const unit of Object.values(state.units)) knowledge[unit.owner][unit.id] = true;
      state = {
        ...state,
        phase: "battle",
        currentPlayer: "P1",
        activeUnitId: f.river.id,
        placementOrder: [f.river.id],
        turnQueue: [f.river.id],
        turnQueueIndex: 0,
        turnOrder: [f.river.id],
        turnOrderIndex: 0,
        knowledge,
      };
      if (!drag)
        state = {
          ...state,
          stakeMarkers: [
            {
              id: "hidden-stop",
              owner: "P2",
              position: { col: 0, row: 2 },
              createdAt: 1,
              isRevealed: false,
            },
          ],
        };
      game.state = state;
      const activated = applyGameAction(
        game,
        { type: "useAbility", unitId: f.river.id, abilityId: drag ? "riverTraLaLa" : "riverBoat" },
        "P1",
      );
      assert(activated.ok);
      const respond = (choice: ResolveRollChoice) => {
        const p = game.state.pendingRoll!;
        const result = applyGameAction(
          game,
          { type: "resolvePendingRoll", player: p.player, pendingRollId: p.id, choice },
          p.player,
        );
        assert(result.ok);
        return result;
      };
      respond({ type: "hassanTrueEnemyTarget", targetId: passenger.id });
      respond({ type: "forestMoveDestination", position: { col: 0, row: 5 } });
      const committed = respond({ type: "forestMoveDestination", position: { col: 1, row: 5 } });
      const use = committed.events.find((e) => e.type === "abilityUsed")!.abilityUseId;
      assert(use);
      assert.equal(game.state.pendingRoll?.abilityUseId, use);
      const saved = serializeMatchSnapshot(game);
      const restored = deserializeMatchSnapshot(JSON.parse(JSON.stringify(saved)) as MatchSnapshot);
      assert.deepEqual(
        restored.state.pendingRoll,
        JSON.parse(JSON.stringify(game.state.pendingRoll)),
      );
      assert.deepEqual(
        restored.state.pendingReactionMovement ?? null,
        JSON.parse(JSON.stringify(game.state.pendingReactionMovement ?? null)),
      );
      assert.equal(restored.state.pendingRoll?.abilityUseId, use);
      for (const recipient of ["P1", "P2", "spectator"] as const) {
        const delivered = projectDeliveryEvents(game.state, committed.events, recipient);
        assert(
          delivered.every((e) =>
            committed.events.some((original) => original.eventId === e.eventId),
          ),
        );
        assert.deepEqual(projectDeliveryEvents(game.state, committed.events, recipient), delivered);
        const view =
          recipient === "spectator"
            ? makeSpectatorView(restored.state)
            : makePlayerView(restored.state, recipient);
        if (recipient === "P1") assert.equal(view.pendingRoll?.id, restored.state.pendingRoll?.id);
        else {
          assert.equal(view.pendingRoll, null);
          assert.equal(view.pendingDecision?.viewerCanRespond, false);
          assert(!delivered.some((e) => e.type === "reactionOpportunity"));
          assert(!JSON.stringify(view).includes('"targetUnitIds"'));
        }
        assert(!JSON.stringify(view).includes('"pendingReactionMovement"'));
      }
      game.state = restored.state;
      const continued = respond(
        drag
          ? { type: "resolveReactionChoice", choice: "pass" }
          : {
              type: "forestMoveDestination",
              position: (restored.state.pendingRoll!.context.options as Coord[])[0],
            },
      );
      assert(
        !continued.events.some((e) => e.type === "abilityUsed" || e.type === "riverBoatPickup"),
      );
      assert(continued.events.some((e) => e.abilityUseId === use));
      assert.equal(game.state.pendingRoll, null);
    } finally {
      deleteGameRoom(game.id);
    }
  });
