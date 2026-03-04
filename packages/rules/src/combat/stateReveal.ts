import type { Coord, GameEvent, GameState, UnitState } from "../model";
import type { ResolveAttackParams } from "./types";

export function revealStealthedDefenderIfIgnored(
  state: GameState,
  params: ResolveAttackParams,
  attackerAfter: UnitState,
  defenderAfter: UnitState,
  units: Record<string, UnitState>,
  events: GameEvent[]
): {
  state: GameState;
  defenderAfter: UnitState;
  units: Record<string, UnitState>;
  events: GameEvent[];
  revealedDefenderPos: Coord | null;
} {
  let revealedDefenderPos: Coord | null = null;

  if (defenderAfter.isStealthed && params.ignoreStealth) {
    const shouldReveal =
      params.revealStealthedAllies || attackerAfter.owner !== defenderAfter.owner;
    if (shouldReveal) {
      defenderAfter = {
        ...defenderAfter,
        isStealthed: false,
        stealthTurnsLeft: 0,
      };
      revealedDefenderPos = defenderAfter.position ?? null;

      const attackerOwner = attackerAfter.owner;
      const nextKnowledge = {
        ...state.knowledge,
        [attackerOwner]: {
          ...(state.knowledge?.[attackerOwner] ?? {}),
          [defenderAfter.id]: true,
        },
      };

      const nextState: GameState = {
        ...state,
        units: { ...units, [defenderAfter.id]: defenderAfter },
        knowledge: nextKnowledge,
      };

      events.push({
        type: "stealthRevealed",
        unitId: defenderAfter.id,
        reason: params.revealReason ?? "attacked",
        revealerId: attackerAfter.id,
      });

      units[defenderAfter.id] = defenderAfter;
      state = nextState;
    }
  }

  return {
    state,
    defenderAfter,
    units,
    events,
    revealedDefenderPos,
  };
}
