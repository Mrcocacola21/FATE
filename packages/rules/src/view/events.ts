import type { GameEvent, GameState, PlayerId, ProjectedGameEvent } from "../model";
import { canPlayerKnowUnitExactPosition } from "../visibility";
import { copyEventPayload } from "./eventPayload";
import { EVENT_VISIBILITY } from "../model/events/visibility";
import { HERO_VLAD_TEPES_ID } from "../heroes";

export type EventRecipient = PlayerId | "spectator";

/** A notice carries no unit, ability, position, or hidden target count. */
function redactedEvent(): ProjectedGameEvent {
  return { type: "eventRedacted" };
}

function isUnitVisibleToRecipient(
  state: GameState,
  unitId: string,
  recipient: EventRecipient,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (!unit.isAlive)
    return (recipient !== "spectator" && unit.owner === recipient) || !unit.isStealthed;
  if (recipient === "spectator") return !unit.isStealthed;
  return canPlayerKnowUnitExactPosition(state, recipient, unitId);
}

function unitOwner(state: GameState, unitId: string): PlayerId | null {
  return state.units[unitId]?.owner ?? null;
}

function projectEventForRecipient(
  state: GameState,
  event: GameEvent,
  recipient: EventRecipient,
): ProjectedGameEvent[] {
  const filterVisibleUnitIds = (ids: string[]): string[] =>
    ids.filter((unitId) => isUnitVisibleToRecipient(state, unitId, recipient));
  const filterVisibleDamageByUnitId = (
    damageByUnitId: Record<string, number> | undefined,
  ): Record<string, number> | undefined => {
    if (!damageByUnitId) return damageByUnitId;
    return Object.fromEntries(
      Object.entries(damageByUnitId).filter(([unitId]) =>
        isUnitVisibleToRecipient(state, unitId, recipient),
      ),
    );
  };

  switch (event.type) {
    case "unitPlaced":
      if (canKnowMovement(event, state, event.unitId, recipient))
        return [event];
      return [redactedEvent()];
    case "unitMoved":
      return canKnowMovement(event, state, event.unitId, recipient) ? [{
        ...event,
        provenance: event.provenance.kind === "ability" && !event[EVENT_VISIBILITY]?.abilityRecipients?.includes(recipient)
          ? { kind: "ability", ...(event.provenance.movementKind ? { movementKind: event.provenance.movementKind } : {}) } : event.provenance,
      }] : [];
    case "rollResolved":
      if (!event[EVENT_VISIBILITY]?.recipients.includes(recipient)) return [];
      if (event.rollKind === "searchStealth") {
        const { rollIndex: _privateDrawIndex, ...visible } = event;
        return [visible];
      }
      return [event];
    case "snarePlaced":
      return recipient === event.owner ? [event] : [];
    case "snareTriggered":
      return canKnowMovement(event, state, event.unitId, recipient) ? [event] : [];

    case "hiddenCollisionResolved": {
      const owner = unitOwner(state, event.displacedUnitId);
      if (recipient !== "spectator" && recipient === owner) return [event];
      if (canKnowMovement(event, state, event.displacedUnitId, recipient)) return [event];
      return [redactedEvent()];
    }
    case "stealthEntered":
      return recipient === unitOwner(state, event.unitId) ? [event] : [];
    case "searchStealth": {
      const owner = unitOwner(state, event.unitId);
      if (recipient !== "spectator" && owner === recipient)
        return [
          {
            ...event,
            rolls: event.rolls?.filter((roll) =>
              isUnitVisibleToRecipient(state, roll.targetId, recipient),
            ),
          },
        ];
      return isUnitVisibleToRecipient(state, event.unitId, recipient)
        ? [{ type: event.type, unitId: event.unitId, mode: event.mode }]
        : [];
    }
    case "abilityUsed": {
      const owner = unitOwner(state, event.unitId);
      if (recipient !== "spectator" && owner === recipient) return [event];
      // A visible caster does not make a private selection/mark public. Also
      // suppress its occurrence, timing and audio signature on other clients.
      if (
        ["hassanAssasinOrder", "hassanTrueEnemy", "chikatiloAssassinMark"].includes(event.abilityId)
      )
        return [];
      return isUnitVisibleToRecipient(state, event.unitId, recipient) ? [event] : [redactedEvent()];
    }
    case "chikatiloMarkApplied":
      return recipient !== "spectator" && recipient === event.ownerPlayerId
        ? [event]
        : [redactedEvent()];
    case "stealthRevealed":
      if (isUnitVisibleToRecipient(state, event.unitId, recipient))
        return [
          {
            ...event,
            revealerId:
              event.revealerId && isUnitVisibleToRecipient(state, event.revealerId, recipient)
                ? event.revealerId
                : undefined,
          },
        ];
      return [redactedEvent()];
    case "rollRequested":
    case "pendingRollUnhandled":
      return recipient === event.player ? [event] : [];
    case "moveOptionsGenerated": {
      const owner = unitOwner(state, event.unitId);
      if (recipient !== "spectator" && owner === recipient) return [event];
      return [];
    }
    case "stakesPlaced": {
      if (recipient !== "spectator" && recipient === event.owner) return [event];
      const source = Object.values(state.units).find(
        (unit) => unit.owner === event.owner && unit.isAlive && unit.heroId === HERO_VLAD_TEPES_ID,
      );
      return [
        {
          type: "hiddenSetupCompleted",
          owner: event.owner,
          ability:
            source && isUnitVisibleToRecipient(state, source.id, recipient)
              ? "vladStakes"
              : "hidden",
        },
      ];
    }
    case "hiddenSetupCompleted":
      return [event];
    case "intimidateTriggered": {
      const defenderOwner = unitOwner(state, event.defenderId);
      return recipient !== "spectator" && recipient === defenderOwner ? [event] : [];
    }
    case "intimidateResolved":
      if (canKnowMovement(event, state, event.attackerId, recipient)) return [event];
      return [redactedEvent()];
    case "courtEffectApplied": {
      const projected = { ...event };
      if (projected.unitId && !isUnitVisibleToRecipient(state, projected.unitId, recipient)) {
        delete projected.unitId;
        delete projected.abilityId;
      }
      if (projected.targetId && !isUnitVisibleToRecipient(state, projected.targetId, recipient)) {
        delete projected.targetId;
      }
      // Stasis return and forced reposition coordinates require event-time authorization.
      if (recipient !== event.player) delete projected.position;
      return [projected];
    }
    case "pureBloodRedirected":
      if (
        isUnitVisibleToRecipient(state, event.kingId, recipient) &&
        isUnitVisibleToRecipient(state, event.redirectedToUnitId, recipient)
      ) {
        return [event];
      }
      return [redactedEvent()];
    case "moonEffectApplied": {
      const filterUnitIds = (ids: string[] | undefined): string[] | undefined => {
        if (!ids) return ids;
        return ids.filter((unitId) => isUnitVisibleToRecipient(state, unitId, recipient));
      };
      return [
        {
          ...event,
          affectedUnitIds: filterUnitIds(event.affectedUnitIds),
          damagedUnitIds: filterUnitIds(event.damagedUnitIds),
          swappedUnitIds: filterUnitIds(event.swappedUnitIds),
        },
      ];
    }
    case "aoeResolved":
      return [
        {
          ...event,
          sourceCell: event[EVENT_VISIBILITY]?.sourceCellRecipients?.includes(recipient)
            ? event.sourceCell : undefined,
          abilityId: isUnitVisibleToRecipient(state, event.sourceUnitId, recipient)
            ? event.abilityId
            : undefined,
          sourceUnitId: isUnitVisibleToRecipient(state, event.sourceUnitId, recipient)
            ? event.sourceUnitId
            : undefined,
          casterId:
            event.casterId && isUnitVisibleToRecipient(state, event.casterId, recipient)
              ? event.casterId
              : undefined,
          affectedUnitIds: filterVisibleUnitIds(event.affectedUnitIds),
          revealedUnitIds: filterVisibleUnitIds(event.revealedUnitIds),
          damagedUnitIds: filterVisibleUnitIds(event.damagedUnitIds),
          damageByUnitId: filterVisibleDamageByUnitId(event.damageByUnitId),
          rollsByUnitId: filterVisibleDamageByUnitId(event.rollsByUnitId),
        },
      ];
    case "carpetStrikeCenter":
      return [
        {
          ...event,
          unitId: isUnitVisibleToRecipient(state, event.unitId, recipient)
            ? event.unitId
            : undefined,
        },
      ];
    case "carpetStrikeAttackRolled":
      return [
        {
          ...event,
          unitId: isUnitVisibleToRecipient(state, event.unitId, recipient)
            ? event.unitId
            : undefined,
          affectedUnitIds: filterVisibleUnitIds(event.affectedUnitIds),
        },
      ];
    case "lechyStormRollResult":
      return isUnitVisibleToRecipient(state, event.unitId, recipient) ? [event] : [redactedEvent()];
    case "asgoreSoulParadeResolved":
      return event.asgoreId && !isUnitVisibleToRecipient(state, event.asgoreId, recipient)
        ? [{ ...event, asgoreId: undefined }]
        : [event];
    case "unitHealed": {
      if (!isUnitVisibleToRecipient(state, event.unitId, recipient)) return [];
      // sourceAbilityId is an ability reference, not a unit reference. Its
      // cause still needs the same event-time authorization as correlation.
      const projected = { ...event };
      if (!event[EVENT_VISIBILITY]?.abilityRecipients?.includes(recipient))
        delete projected.sourceAbilityId;
      return [projected];
    }
    case "lechyStormStarted":
      return event.sourceUnitId && !isUnitVisibleToRecipient(state, event.sourceUnitId, recipient)
        ? [{ ...event, sourceUnitId: undefined }]
        : [event];
    case "friskHugsApplied":
      return isUnitVisibleToRecipient(state, event.friskId, recipient) &&
        isUnitVisibleToRecipient(state, event.targetId, recipient)
        ? [event]
        : [];
    case "lokiChickenApplied":
      return isUnitVisibleToRecipient(state, event.lokiId, recipient) &&
        isUnitVisibleToRecipient(state, event.targetId, recipient)
        ? [event]
        : [];
    case "lokiChickenGroupApplied": {
      if (event.lokiId && !isUnitVisibleToRecipient(state, event.lokiId, recipient)) {
        return [];
      }
      const targetIds = filterVisibleUnitIds(event.targetIds);
      if (targetIds.length === 0) return [];
      return [
        {
          ...event,
          targetIds,
        },
      ];
    }
    case "controlledAttackDeclared":
      return recipient === unitOwner(state, event.controllerUnitId) &&
        isUnitVisibleToRecipient(state, event.controllerUnitId, recipient) &&
        isUnitVisibleToRecipient(state, event.controlledUnitId, recipient) &&
        isUnitVisibleToRecipient(state, event.targetId, recipient)
        ? [event]
        : [];
    case "unitTransformed":
      return isUnitVisibleToRecipient(state, event.unitId, recipient) ? [event] : [redactedEvent()];
    case "riverBoatmanGranted":
      return isUnitVisibleToRecipient(state, event.riverId, recipient) ? [event] : [];
    case "riverBoatPickup":
    case "riverBoatDisembarked":
    case "riverBoatResolved":
      return canKnowMovement(event, state, event.riverId, recipient) &&
        canKnowMovement(event, state, event.passengerId, recipient)
        ? [event]
        : [];
    case "riverBoatDisembarkFailed":
      return isUnitVisibleToRecipient(state, event.riverId, recipient) &&
        isUnitVisibleToRecipient(state, event.passengerId, recipient)
        ? [event]
        : [];
    case "riverTraLaLaResolved": {
      if (
        !canKnowMovement(event, state, event.riverId, recipient) ||
        !canKnowMovement(event, state, event.targetId, recipient)
      ) {
        return [];
      }
      return [
        {
          ...event,
          touchedAttackerIds: filterVisibleUnitIds(event.touchedAttackerIds),
        },
      ];
    }
    case "reactionOpportunity": {
      if (recipient !== unitOwner(state, event.reactorUnitId)) return [];
      const targetUnitIds = filterVisibleUnitIds(event.targetUnitIds);
      return targetUnitIds.length ? [{ ...event, targetUnitIds }] : [];
    }
    case "reactionChoiceResolved":
      return isUnitVisibleToRecipient(state, event.reactorUnitId, recipient) &&
        (!event.targetUnitId || isUnitVisibleToRecipient(state, event.targetUnitId, recipient))
        ? [event]
        : [];
    case "reactionMovementResumed":
      return isUnitVisibleToRecipient(state, event.controllerUnitId, recipient) ? [event] : [];
    case "reactionMovementEnded":
      return canKnowMovement(event, state, event.controllerUnitId, recipient) ? [event] : [];
    case "attackResolved": {
      if (!isUnitVisibleToRecipient(state, event.defenderId, recipient)) return [];
      return [
        {
          ...event,
          attackerId: isUnitVisibleToRecipient(state, event.attackerId, recipient)
            ? event.attackerId
            : undefined,
          sourceCell: event[EVENT_VISIBILITY]?.sourceCellRecipients?.includes(recipient)
            ? event.sourceCell : undefined,
          targetCell: event[EVENT_VISIBILITY]?.targetCellRecipients?.includes(recipient)
            ? event.targetCell : undefined,
        },
      ];
    }
    case "unitDied":
      return isUnitVisibleToRecipient(state, event.unitId, recipient)
        ? [
            {
              ...event,
              deathCell: event[EVENT_VISIBILITY]?.deathCellRecipients?.includes(recipient)
                ? event.deathCell : undefined,
              killerId:
                event.killerId === null
                  ? null
                  : isUnitVisibleToRecipient(state, event.killerId, recipient)
                    ? event.killerId
                    : undefined,
            },
          ]
        : [];
    case "stakeTriggered": {
      if (!isUnitVisibleToRecipient(state, event.unitId, recipient)) return [];
      return [
        {
          type: "stakeTriggered",
          markerPos: event.markerPos,
          unitId: event.unitId,
          damage: event.damage,
          stopped: event.stopped,
        },
      ];
    }
    case "chargesUpdated":
      return recipient === unitOwner(state, event.unitId) ? [event] : [];
    case "combatVisualBatchReady":
      // Only opaque delivery/chain scalars; no unit references or gameplay payload.
      return [event];
    case "turnStarted":
    case "roundStarted":
    case "initiativeRollRequested":
    case "initiativeRolled":
    case "initiativeResolved":
    case "placementStarted":
    case "ruleDeclarationSelected":
    case "ruleDeclarationSetupCompleted":
    case "courtRolesAssigned":
    case "courtRolesSwapped":
    case "courtRollResult":
    case "chessKingSelected":
    case "chessKingDeathResolved":
    case "gameDraw":
    case "moonRollResult":
    case "advantageThresholdDeclared":
    case "advantageWinTriggered":
    case "berserkerDefenseChosen":
    case "damageBonusApplied":
    case "bunkerEntered":
    case "bunkerEnterFailed":
    case "bunkerExited":
    case "forestActivated":
    case "carpetStrikeTriggered":
    case "moveBlocked":
    case "arenaChosen":
    case "battleStarted":
    case "gameEnded":
    case "mettatonRatingChanged":
    case "papyrusUnbelieverActivated":
    case "papyrusBoneApplied":
    case "papyrusBonePunished":
    case "sansUnbelieverActivated":
    case "sansBadassJokeApplied":
    case "sansMoveDenied":
    case "sansBoneFieldActivated":
    case "sansBoneFieldApplied":
    case "sansBoneFieldPunished":
      // Explicitly copied public scalars, with authorization for every unit reference.
      return hasOnlyVisibleUnitReferences(state, event, recipient) ? [event] : [];
    case "sansLastAttackApplied":
    case "sansLastAttackTick":
    case "sansLastAttackRemoved":
      return hasOnlyVisibleUnitReferences(state, event, recipient)
        ? [
            {
              ...event,
              targetCell: event[EVENT_VISIBILITY]?.targetCellRecipients?.includes(recipient)
                ? event.targetCell
                : undefined,
            },
          ]
        : [];
    default: {
      const unclassified: never = event;
      void unclassified;
      return [];
    }
  }
}

export function projectEventsForRecipient(
  state: GameState,
  events: GameEvent[],
  recipient: EventRecipient,
): ProjectedGameEvent[] {
  return events.flatMap((event) => {
    const payload = copyEventPayload(event);
    if (!payload) return [];
    for (const [key, value] of Object.entries(payload)) {
      if (value === undefined) Reflect.deleteProperty(payload, key);
    }
    if (event[EVENT_VISIBILITY]) payload[EVENT_VISIBILITY] = event[EVENT_VISIBILITY];
    return projectEventForRecipient(state, payload, recipient).map((projected) => {
      if ((projected.type === "abilityUsed" || projected.type === "asgoreSoulParadeResolved") &&
          !event[EVENT_VISIBILITY]?.sourceCellRecipients?.includes(recipient))
        delete projected.sourceCell;
      if (!event[EVENT_VISIBILITY]?.abilityRecipients?.includes(recipient)) {
        if ("abilityUseId" in projected) delete projected.abilityUseId;
        if (event.abilityUseId && projected.type !== "abilityUsed")
          Reflect.deleteProperty(projected, "abilityId");
        if (projected.type === "attackResolved" || projected.type === "rollResolved" || projected.type === "unitMoved" || projected.type === "intimidateResolved")
          delete projected.abilityId;
      }
      if (EVENT_VISIBILITY in projected) delete projected[EVENT_VISIBILITY];
      for (const [key, value] of Object.entries(projected)) {
        if (value === undefined) Reflect.deleteProperty(projected, key);
      }
      if (projected.type === "combatVisualBatchReady") return projected;
      if (
        event.chainId === undefined &&
        event.visualBatchId === undefined &&
        event.isChainComplete === undefined &&
        event.deferVisuals === undefined
      ) {
        return projected;
      }
      return {
        ...projected,
        ...(event.chainId !== undefined ? { chainId: event.chainId } : {}),
        ...(event.visualBatchId !== undefined ? { visualBatchId: event.visualBatchId } : {}),
        ...(event.isChainComplete !== undefined ? { isChainComplete: event.isChainComplete } : {}),
        ...(event.deferVisuals !== undefined ? { deferVisuals: event.deferVisuals } : {}),
      };
    });
  });
}

/** No event-time fact: historical positional payloads are conservatively owner-only. */
function canKnowMovement(
  event: GameEvent,
  state: GameState,
  unitId: string,
  recipient: EventRecipient,
): boolean {
  const fact = event[EVENT_VISIBILITY];
  return fact ? fact.recipients.includes(recipient) : recipient === unitOwner(state, unitId);
}

function hasOnlyVisibleUnitReferences(
  state: GameState,
  event: GameEvent,
  recipient: EventRecipient,
): boolean {
  return Object.entries(event).every(
    ([key, value]) =>
      !(
        key.endsWith("Id") &&
        key !== "abilityId" &&
        key !== "abilityUseId" &&
        key !== "chainId" &&
        key !== "visualBatchId" &&
        key !== "arenaId" &&
        key !== "ruleId" &&
        key !== "effectId" &&
        key !== "rollId" &&
        key !== "soulId"
      ) ||
      typeof value !== "string" ||
      isUnitVisibleToRecipient(state, value, recipient),
  );
}
