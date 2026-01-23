// packages/rules/src/aoe.ts

import { GameEvent, GameState, Coord, UnitState } from "./model";
import { RNG } from "./rng";
import { chebyshev } from "./board";
import { revealStealthedInArea } from "./stealth";
import { resolveAttack } from "./combat";

export type AoEShape = "chebyshev";

export interface AoEParams {
  radius: number;
  shape?: AoEShape;
  revealHidden?: boolean;
  applyAttacks?: boolean;
  ignoreStealth?: boolean;
  targetFilter?: (unit: UnitState, caster: UnitState) => boolean;
  abilityId?: string;
}

function isInsideAoE(
  unit: UnitState,
  center: Coord,
  radius: number,
  shape: AoEShape
): boolean {
  if (!unit.position) return false;
  if (shape === "chebyshev") {
    return chebyshev(unit.position, center) <= radius;
  }
  return false;
}

export function resolveAoE(
  state: GameState,
  casterId: string,
  center: Coord,
  params: AoEParams,
  rng: RNG
): { nextState: GameState; events: GameEvent[] } {
  const caster = state.units[casterId];
  if (!caster || !caster.isAlive) {
    return { nextState: state, events: [] };
  }

  const shape: AoEShape = params.shape ?? "chebyshev";
  const radius = params.radius;
  const targetFilter =
    params.targetFilter ?? (() => true);

  let nextState: GameState = state;
  const events: GameEvent[] = [];
  let revealedUnitIds: string[] = [];

  if (params.revealHidden) {
    const res = revealStealthedInArea(
      nextState,
      center,
      radius,
      rng,
      (u) => targetFilter(u, caster)
    );
    nextState = res.state;
    events.push(...res.events);
    revealedUnitIds = res.events.flatMap((e) =>
      e.type === "stealthRevealed" && e.reason === "aoeHit" ? [e.unitId] : []
    );
  }

  const affectedUnitIds = Object.values(nextState.units)
    .filter((u) => {
      if (!u.isAlive || !u.position) return false;
      if (!isInsideAoE(u, center, radius, shape)) return false;
      return targetFilter(u, caster);
    })
    .map((u) => u.id);

  if (params.applyAttacks) {
    const ignoreStealth = params.ignoreStealth ?? true;
    for (const targetId of affectedUnitIds) {
      const target = nextState.units[targetId];
      if (!target || !target.isAlive || !target.position) continue;
      const res = resolveAttack(
        nextState,
        {
          attackerId: caster.id,
          defenderId: target.id,
          ignoreRange: true,
          ignoreStealth,
        },
        rng
      );
      nextState = res.nextState;
      events.push(...res.events);
    }
  }

  events.push({
    type: "aoeResolved",
    sourceUnitId: caster.id,
    abilityId: params.abilityId,
    casterId: caster.id,
    center,
    radius,
    affectedUnitIds,
    revealedUnitIds,
  });

  return { nextState, events };
}
