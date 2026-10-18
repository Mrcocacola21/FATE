import type {
  ApplyResult,
  Coord,
  GameEvent,
  GameState,
  PapyrusLineAxis,
  UnitState,
} from "../../../model";
import { ABILITY_PAPYRUS_LONG_BONE } from "../../../abilities";
import { evAoeResolved, requestRoll } from "../../../core";
import type { TricksterAoEContext } from "../../../pendingRoll/types";
import { getUnitsOnPapyrusLine, getPapyrusLineCells } from "./helpers";
import { segmentFromCells } from "../../../core/events/combatEvents/presentationGeometry";

export function startPapyrusLineAttack(
  state: GameState,
  caster: UnitState,
  axis: PapyrusLineAxis,
  target: Coord,
  abilityId?: string
): ApplyResult {
  const affectedUnitIds = getUnitsOnPapyrusLine(state, caster.id, axis, target);
  const events: GameEvent[] = [];
  const effectSegments = segmentFromCells(getPapyrusLineCells(state.boardSize, axis, target));

  if (affectedUnitIds.length === 0) {
    events.push(
      evAoeResolved({
        sourceUnitId: caster.id,
        effectSegments,
        abilityId,
        casterId: caster.id,
        center: target,
        radius: 0,
        affectedUnitIds,
        revealedUnitIds: [],
        damagedUnitIds: [],
        damageByUnitId: {},
      })
    );
    return { state, events };
  }

  const queuedState: GameState = {
    ...state,
    pendingCombatQueue: [],
    pendingAoE: {
      effectSegments,
      casterId: caster.id,
      abilityId: abilityId ?? ABILITY_PAPYRUS_LONG_BONE,
      center: target,
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
    allowFriendlyTarget: true,
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
  return { state: requested.state, events: [...events, ...requested.events] };
}
