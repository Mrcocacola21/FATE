import type {
  ApplyResult,
  Coord,
  GameAction,
  GameState,
  UnitState,
} from "../../../model";
import { evAoeResolved, requestRoll } from "../../../core";
import type { TricksterAoEContext } from "../../../pendingRoll/types";

export interface LinePayload {
  target?: Coord;
  line?: Coord;
  center?: Coord;
}

export function parseCoord(value: unknown): Coord | null {
  if (!value || typeof value !== "object") return null;
  const col = (value as { col?: unknown }).col;
  const row = (value as { row?: unknown }).row;
  if (typeof col !== "number" || typeof row !== "number") return null;
  return { col, row };
}

export function sortUnitIdsByReadingOrder(
  state: GameState,
  unitIds: string[]
): string[] {
  return [...unitIds].sort((a, b) => {
    const unitA = state.units[a];
    const unitB = state.units[b];
    const posA = unitA?.position;
    const posB = unitB?.position;
    if (!posA || !posB) return a.localeCompare(b);
    if (posA.row !== posB.row) return posA.row - posB.row;
    if (posA.col !== posB.col) return posA.col - posB.col;
    return a.localeCompare(b);
  });
}

export function getActionActorId(
  prevState: GameState,
  action: GameAction
): string | undefined {
  if (
    action.type === "move" ||
    action.type === "requestMoveOptions" ||
    action.type === "enterStealth" ||
    action.type === "searchStealth" ||
    action.type === "useAbility" ||
    action.type === "unitStartTurn"
  ) {
    return action.unitId;
  }
  if (action.type === "attack") {
    return action.attackerId;
  }
  if (action.type === "resolvePendingRoll") {
    const pending = prevState.pendingRoll;
    const unitId = pending?.context?.unitId;
    return typeof unitId === "string" ? unitId : undefined;
  }
  return undefined;
}

export function requestSansQueuedAttacks(
  state: GameState,
  caster: UnitState,
  abilityId: string,
  center: Coord,
  affectedUnitIds: string[],
  options?: {
    allowFriendlyTarget?: boolean;
  }
): ApplyResult {
  if (affectedUnitIds.length === 0) {
    return {
      state,
      events: [
        evAoeResolved({
          sourceUnitId: caster.id,
          abilityId,
          casterId: caster.id,
          center,
          radius: 0,
          affectedUnitIds: [],
          revealedUnitIds: [],
          damagedUnitIds: [],
          damageByUnitId: {},
        }),
      ],
    };
  }

  const queuedState: GameState = {
    ...state,
    pendingCombatQueue: [],
    pendingAoE: {
      casterId: caster.id,
      abilityId,
      center,
      radius: 0,
      affectedUnitIds,
      revealedUnitIds: [],
      damagedUnitIds: [],
      damageByUnitId: {},
    },
  };

  const ctx: TricksterAoEContext = {
    casterId: caster.id,
    targetsQueue: affectedUnitIds,
    currentTargetIndex: 0,
    allowFriendlyTarget: options?.allowFriendlyTarget ?? false,
    ignoreStealth: true,
    revealStealthedAllies: true,
    revealReason: "aoeHit",
  };

  const requested = requestRoll(
    queuedState,
    caster.owner,
    "tricksterAoE_attackerRoll",
    ctx,
    caster.id
  );

  return { state: requested.state, events: requested.events };
}
