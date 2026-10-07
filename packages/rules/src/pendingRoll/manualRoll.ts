import type { DiceRoll, GameEvent, GameState, PendingRoll } from "../model";
import { EVENT_VISIBILITY, movementVisibility } from "../model/events/visibility";
import type { RNG } from "../rng";
import { rollDie } from "../rng";

type Evidence = {
  dice: number[];
  sides: number;
  unitId?: string;
  recipients?: readonly ("P1" | "P2" | "spectator")[];
};
interface ManualRollRNG extends RNG {
  recordManualRoll?(evidence: Evidence): void;
}

/** Records only explicit manual draws, never incidental hazard/reaction RNG. */
export function rollManualDice(rng: RNG, count: number, sides = 6, unitId?: string): number[] {
  const dice = Array.from({ length: count }, () => rollDie(rng, sides));
  recordManualResult(rng, dice, sides, unitId);
  return dice;
}

export function recordManualResult(
  rng: RNG,
  dice: number[],
  sides: number,
  unitId?: string,
  recipients?: Evidence["recipients"],
): void {
  (rng as ManualRollRNG).recordManualRoll?.({ dice: [...dice], sides, unitId, recipients });
}

export function rollManualD6(rng: RNG, unitId?: string): number {
  return rollManualDice(rng, 1, 6, unitId)[0]!;
}

export function rollManual2D6(rng: RNG): DiceRoll {
  const dice = rollManualDice(rng, 2);
  return { dice, sum: dice[0]! + dice[1]!, isDouble: dice[0] === dice[1] };
}

function rollerUnitId(pending: PendingRoll): string | undefined {
  const ctx = pending.context;
  // A saved pre-contextual-UI roll need not have presentation metadata.
  if (pending.presentation?.actorUnitId) return pending.presentation.actorUnitId;
  if (pending.kind.includes("defenderRoll")) {
    const targets = ctx.targetsQueue;
    const index = typeof ctx.currentTargetIndex === "number" ? ctx.currentTargetIndex : 0;
    const target = Array.isArray(targets) ? targets[index] : ctx.defenderId;
    if (typeof target === "string") return target;
  }
  const keys = pending.kind.includes("attackerRoll")
    ? ["attackerId", "casterId"]
    : ["unitId", "casterId", "asgoreId", "friskId", "lokiId"];
  for (const key of keys) if (typeof ctx[key] === "string") return ctx[key] as string;
  return undefined;
}

/** Local accounting around one validated pending resolution; no new transport. */
export function manualRollRecorder(state: GameState, pending: PendingRoll, source: RNG) {
  const events: GameEvent[] = [];
  const rng: ManualRollRNG = {
    next: () => source.next(),
    recordManualRoll: ({ dice, sides, unitId, recipients: explicitRecipients }) => {
      const roller = unitId ?? rollerUnitId(pending);
      const unit = roller ? state.units[roller] : undefined;
      const ownerOnly =
        pending.kind === "enterStealth" ||
        pending.kind === "searchStealth" ||
        pending.kind === "lokiLaughtChoice";
      const recipients =
        explicitRecipients ??
        (ownerOnly
          ? [pending.player]
          : unit?.position
            ? movementVisibility(state, unit.id, unit.position).recipients
            : roller
              ? [pending.player]
              : (["P1", "P2", "spectator"] as const));
      events.push({
        type: "rollResolved",
        rollId: pending.id,
        rollKind: pending.kind,
        rollerPlayerId: pending.player,
        ...(roller ? { unitId: roller } : {}),
        rollIndex: events.length,
        dice: [...dice],
        sides,
        total: dice.reduce((sum, value) => sum + value, 0),
        ...(pending.abilityId ? { abilityId: pending.abilityId } : {}),
        ...(pending.abilityUseId ? { abilityUseId: pending.abilityUseId } : {}),
        ...(pending.chainId ? { chainId: pending.chainId } : {}),
        [EVENT_VISIBILITY]: {
          recipients,
          abilityRecipients: pending.abilitySourceRecipients,
        },
      });
    },
  };
  return { rng, events };
}
