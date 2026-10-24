import type { DiceRoll, GameEvent, GameState, PendingRoll, RollKind } from "../model";
import { EVENT_VISIBILITY, movementVisibility } from "../model/events/visibility";
import type { RNG } from "../rng";
import { rollDie } from "../rng";
import { breakSharedRollTie } from "../core/rolls/rollMath";

type Evidence = {
  dice: number[];
  sides: number;
  unitId?: string;
  recipients?: readonly ("P1" | "P2" | "spectator")[];
  /** A die thrown inside another player's pending roll (AoE tie-break) keeps its real thrower. */
  rollerPlayerId?: "P1" | "P2";
  rollKind?: RollKind;
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
    recordManualRoll: ({
      dice,
      sides,
      unitId,
      recipients: explicitRecipients,
      rollerPlayerId,
      rollKind,
    }) => {
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
        rollKind: rollKind ?? pending.kind,
        rollerPlayerId: rollerPlayerId ?? pending.player,
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

/**
 * Per-target AoE tie-break; both dice are recorded as visible manual rolls. The attacker's die
 * is thrown inside the defender's pending roll, so it is recorded as the attacker's own roll.
 */
export function rollSharedAoeTieBreak(
  rng: RNG,
  attackerDice: number[],
  defenderDice: number[],
  attacker: { id: string; owner: "P1" | "P2" },
  defenderId: string,
  attackerRollKind: RollKind,
): { tieBreakAttacker: number[]; tieBreakDefender: number[] } {
  return breakSharedRollTie(
    attackerDice,
    defenderDice,
    () => {
      const value = rollDie(rng, 6);
      (rng as ManualRollRNG).recordManualRoll?.({
        dice: [value],
        sides: 6,
        unitId: attacker.id,
        rollerPlayerId: attacker.owner,
        rollKind: attackerRollKind,
      });
      return value;
    },
    () => rollManualD6(rng, defenderId),
  );
}

/** The attacker roll kind paired with a shared-roll AoE defender roll kind. */
export function sharedAttackerRollKind(defenderKind: RollKind): RollKind {
  if (defenderKind === "carpetStrike_defenderRoll") return "kaiserCarpetStrikeAttack";
  return defenderKind.replace(/_defenderRoll$/, "_attackerRoll") as RollKind;
}
