import type { GameEvent, GameState, PlayerId } from "../model";
import { canPlayerKnowUnitExactPosition } from "../visibility";

export type EventRecipient = PlayerId | "spectator";

const PUBLIC_EVENT_TYPES = new Set<GameEvent["type"]>([
  "turnStarted",
  "roundStarted",
  "attackResolved",
  "unitDied",
  "initiativeRollRequested",
  "initiativeRolled",
  "initiativeResolved",
  "placementStarted",
  "berserkerDefenseChosen",
  "damageBonusApplied",
  "chargesUpdated",
  "bunkerEntered",
  "bunkerEnterFailed",
  "bunkerExited",
  "stakeTriggered",
  "forestActivated",
  "carpetStrikeTriggered",
  "carpetStrikeCenter",
  "carpetStrikeAttackRolled",
  "abilityUsed",
  "unitHealed",
  "aoeResolved",
  "moveBlocked",
  "arenaChosen",
  "battleStarted",
  "gameEnded",
  "mettatonRatingChanged",
  "papyrusUnbelieverActivated",
  "papyrusBoneApplied",
  "papyrusBonePunished",
  "sansUnbelieverActivated",
  "sansBadassJokeApplied",
  "sansMoveDenied",
  "sansBoneFieldActivated",
  "sansBoneFieldApplied",
  "sansBoneFieldPunished",
  "sansLastAttackApplied",
  "sansLastAttackTick",
  "sansLastAttackRemoved",
  "ruleDeclarationSelected",
  "ruleDeclarationSetupCompleted",
  "courtRolesAssigned",
  "courtRolesSwapped",
  "courtRollResult",
  "chessKingSelected",
  "chessKingDeathResolved",
  "gameDraw",
  "moonRollResult",
  "advantageThresholdDeclared",
  "advantageWinTriggered",
]);

function redactedEvent(type: GameEvent["type"]): GameEvent {
  return { type } as GameEvent;
}

function isUnitVisibleToRecipient(
  state: GameState,
  unitId: string,
  recipient: EventRecipient
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  if (!unit.isAlive) return true;
  if (recipient === "spectator") return !unit.isStealthed;
  return canPlayerKnowUnitExactPosition(state, recipient, unitId);
}

function unitOwner(state: GameState, unitId: string): PlayerId | null {
  return state.units[unitId]?.owner ?? null;
}

function projectEventForRecipient(
  state: GameState,
  event: GameEvent,
  recipient: EventRecipient
): GameEvent[] {
  const filterVisibleUnitIds = (ids: string[]): string[] =>
    ids.filter((unitId) => isUnitVisibleToRecipient(state, unitId, recipient));
  const filterVisibleDamageByUnitId = (
    damageByUnitId: Record<string, number> | undefined
  ): Record<string, number> | undefined => {
    if (!damageByUnitId) return damageByUnitId;
    return Object.fromEntries(
      Object.entries(damageByUnitId).filter(([unitId]) =>
        isUnitVisibleToRecipient(state, unitId, recipient)
      )
    );
  };

  switch (event.type) {
    case "unitPlaced":
      if (isUnitVisibleToRecipient(state, event.unitId, recipient)) return [event];
      return [{ type: event.type, unitId: event.unitId } as GameEvent];
    case "unitMoved":
      if (isUnitVisibleToRecipient(state, event.unitId, recipient)) return [event];
      return [{ type: event.type, unitId: event.unitId } as GameEvent];
    case "stealthEntered": {
      const owner = unitOwner(state, event.unitId);
      if (recipient !== "spectator" && owner === recipient) return [event];
      if (isUnitVisibleToRecipient(state, event.unitId, recipient)) {
        return [{ type: event.type, unitId: event.unitId } as GameEvent];
      }
      return [redactedEvent(event.type)];
    }
    case "searchStealth": {
      const owner = unitOwner(state, event.unitId);
      if (recipient !== "spectator" && owner === recipient) return [event];
      return [{ type: event.type, unitId: event.unitId, mode: event.mode } as GameEvent];
    }
    case "stealthRevealed":
      if (isUnitVisibleToRecipient(state, event.unitId, recipient)) return [event];
      return [redactedEvent(event.type)];
    case "rollRequested":
      if (recipient !== "spectator" && event.player === recipient) return [event];
      if (
        event.actorUnitId &&
        !isUnitVisibleToRecipient(state, event.actorUnitId, recipient)
      ) {
        return [
          {
            type: event.type,
            rollId: event.rollId,
            kind: event.kind,
            player: event.player,
          } as GameEvent,
        ];
      }
      return [event];
    case "pendingRollUnhandled":
      if (recipient !== "spectator" && event.player === recipient) return [event];
      return [
        {
          type: event.type,
          rollId: event.rollId,
          player: event.player,
          kind: "redacted",
        } as GameEvent,
      ];
    case "moveOptionsGenerated": {
      const owner = unitOwner(state, event.unitId);
      if (recipient !== "spectator" && owner === recipient) return [event];
      return [];
    }
    case "stakesPlaced":
      return recipient !== "spectator" && recipient === event.owner ? [event] : [];
    case "intimidateTriggered": {
      const defenderOwner = unitOwner(state, event.defenderId);
      return recipient !== "spectator" && recipient === defenderOwner ? [event] : [];
    }
    case "intimidateResolved":
      if (isUnitVisibleToRecipient(state, event.attackerId, recipient)) return [event];
      return [{ type: event.type, attackerId: event.attackerId } as GameEvent];
    case "courtEffectApplied": {
      const projected = { ...event };
      if (projected.unitId && !isUnitVisibleToRecipient(state, projected.unitId, recipient)) {
        delete projected.unitId;
      }
      if (projected.targetId && !isUnitVisibleToRecipient(state, projected.targetId, recipient)) {
        delete projected.targetId;
      }
      return [projected as GameEvent];
    }
    case "pureBloodRedirected":
      if (
        isUnitVisibleToRecipient(state, event.kingId, recipient) &&
        isUnitVisibleToRecipient(state, event.redirectedToUnitId, recipient)
      ) {
        return [event];
      }
      return [redactedEvent(event.type)];
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
        } as GameEvent,
      ];
    }
    case "aoeResolved":
      return [
        {
          ...event,
          affectedUnitIds: filterVisibleUnitIds(event.affectedUnitIds),
          revealedUnitIds: filterVisibleUnitIds(event.revealedUnitIds),
          damagedUnitIds: filterVisibleUnitIds(event.damagedUnitIds),
          damageByUnitId: filterVisibleDamageByUnitId(event.damageByUnitId),
        } as GameEvent,
      ];
    case "carpetStrikeAttackRolled":
      return [
        {
          ...event,
          affectedUnitIds: filterVisibleUnitIds(event.affectedUnitIds),
        } as GameEvent,
      ];
    case "lechyStormRollResult":
      return isUnitVisibleToRecipient(state, event.unitId, recipient)
        ? [event]
        : [redactedEvent(event.type)];
    default:
      return PUBLIC_EVENT_TYPES.has(event.type) ? [event] : [redactedEvent(event.type)];
  }
}

export function projectEventsForRecipient(
  state: GameState,
  events: GameEvent[],
  recipient: EventRecipient
): GameEvent[] {
  return events.flatMap((event) => projectEventForRecipient(state, event, recipient));
}
