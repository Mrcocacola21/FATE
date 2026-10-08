import type { Coord, ProjectedGameEvent, PlayerView, RollKind } from "rules";
import type { BoardEventBatch } from "./types";
import { sameAbilityResolution } from "./heroPresentation";
import {
  CURSE_APPLY_LEAD_MS,
  GASTER_TIMING,
  hasHeroAggregatePresentation,
  isGasterResolution,
} from "./sansPresentation";
import {
  confirmedMovement,
  movementCueFromEvent,
  movementSegmentDuration,
  type MovementPresentationCue,
  type MovementPresentationPlan,
} from "./movementPresentation";
import {
  snapshotVisualHp,
  snapshotVisualUnits,
  type VisualHpByUnitId,
  type VisualUnitsByUnitId,
} from "./visualResolution";

export type UnitVisualState =
  | "idle"
  | "attacking"
  | "takingDamage"
  | "healing"
  | "dying"
  | "removed";

export type UnitVisualStateByUnitId = Record<string, UnitVisualState>;

export type DamageVisualEvent = {
  type: "damage";
  targetUnitId: string;
  previousHp: number;
  nextHp: number;
  maxHp: number;
  amount: number;
  sourceUnitId?: string;
  abilityId?: string;
  chainId?: string;
  eventIndex: number;
  showDamageFlash?: boolean;
};

export type DeathVisualEvent = {
  type: "death";
  unitId: string;
  cause?: string;
  chainId?: string;
  eventIndex: number;
  cell?: Coord;
};

/** Classification uses authoritative roll purpose, never the dice or HP result. */
export function combatRollSide(kind: RollKind): "attack" | "defense" | null {
  if (kind.endsWith("_attackerRoll") || kind === "kaiserCarpetStrikeAttack") return "attack";
  if (kind.endsWith("_defenderRoll")) return "defense";
  return null;
}

export function isPresentedRoll(kind: RollKind): boolean {
  return Boolean(combatRollSide(kind)) || kind === "kaiserCarpetStrikeCenter";
}

export type CombatPresentationCue = {
  id: string;
  eventIndex: number;
  atMs: number;
  durationMs: number;
} & (
  | { kind: "roll"; roll: Extract<ProjectedGameEvent, { type: "rollResolved" }> }
  | {
      kind: "hit" | "miss" | "damage" | "heal" | "death";
      unitId: string;
      /** Only an authorized event-time anchor; no position-cache fallback. */
      cell?: Coord;
      amount?: number;
      hpAtMs?: number;
    }
);

type WithoutCueIdentity<T> = T extends unknown ? Omit<T, "id" | "eventIndex"> : never;

export type VisualPlaybackQueueItem =
  | {
      type: "movement";
      cue: Extract<MovementPresentationCue, { kind: "movement" }>;
      startsAtMs: number;
      endsAtMs: number;
    }
  | { type: "reveal"; unitId: string; cell: Coord; startsAtMs: number; endsAtMs: number }
  | { type: "snareStatus"; unitId: string; startsAtMs: number; endsAtMs: number }
  | {
      type: "attack";
      unitId: string;
      startsAtMs: number;
      endsAtMs: number;
    }
  | {
      type: "damageHpTween";
      damage: DamageVisualEvent;
      startsAtMs: number;
      endsAtMs: number;
    }
  | {
      type: "healHpTween";
      unitId: string;
      previousHp: number;
      nextHp: number;
      startsAtMs: number;
      endsAtMs: number;
    }
  | {
      type: "death";
      death: DeathVisualEvent;
      startsAtMs: number;
      endsAtMs: number;
    }
  | {
      type: "removeVisualUnit";
      unitId: string;
      startsAtMs: number;
      endsAtMs: number;
    };

export interface CombatVisualPlaybackPlan {
  /** Local React binding, checked before starting or restarting a queued plan. */
  playbackSessionKey?: string | null;
  movementPlan: MovementPresentationPlan;
  batch: BoardEventBatch;
  startingHpByUnitId: VisualHpByUnitId;
  startingUnitsByUnitId: VisualUnitsByUnitId;
  finalHpByUnitId: VisualHpByUnitId;
  finalUnitsByUnitId: VisualUnitsByUnitId;
  queue: VisualPlaybackQueueItem[];
  durationMs: number;
}

export interface CombatVisualPlaybackFrame {
  batch: BoardEventBatch;
  visualHpByUnitId: VisualHpByUnitId;
  visualUnitsByUnitId: VisualUnitsByUnitId;
  visualStateByUnitId: UnitVisualStateByUnitId;
  complete: boolean;
  roll: Extract<CombatPresentationCue, { kind: "roll" }> | null;
  visualMotionByUnitId: Record<string, { position: Coord; opacity: number; mode: string }>;
}

export function isGameplayProjectedUnit(view: PlayerView, unitId: string): boolean {
  const unit = view.units[unitId];
  return Boolean(unit?.isAlive && unit.position);
}

const NORMAL_TIMING = {
  rollMs: 650,
  outcomeMs: 300,
  attackLeadMs: 210,
  impactPauseMs: 65,
  hpBaseMs: 300,
  hpPerPointMs: 55,
  hpMaxMs: 620,
  deathPauseMs: 55,
  deathMs: 520,
  betweenHitsMs: 80,
};

const REDUCED_TIMING = {
  rollMs: 450,
  outcomeMs: 180,
  attackLeadMs: 70,
  impactPauseMs: 25,
  hpBaseMs: 130,
  hpPerPointMs: 20,
  hpMaxMs: 220,
  deathPauseMs: 20,
  deathMs: 180,
  betweenHitsMs: 30,
};

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function damageFromEvent(
  event: ProjectedGameEvent,
  eventIndex: number,
  runningHp: VisualHpByUnitId,
  startingUnits: VisualUnitsByUnitId,
): DamageVisualEvent | null {
  let targetUnitId: string | undefined;
  let sourceUnitId: string | undefined;
  let abilityId: string | undefined;
  let amount: number | undefined;
  let explicitPreviousHp: number | undefined;
  let explicitNextHp: number | undefined;
  let explicitMaxHp: number | undefined;

  if (event.type === "attackResolved") {
    if (!event.hit || event.damage <= 0) return null;
    targetUnitId = event.defenderId;
    sourceUnitId = event.attackerId;
    amount = event.damage;
    explicitPreviousHp = finiteNumber(event.previousHp);
    explicitNextHp = finiteNumber(event.nextHp) ?? event.defenderHpAfter;
    explicitMaxHp = finiteNumber(event.maxHp);
  } else if (
    event.type === "papyrusBonePunished" ||
    event.type === "sansBoneFieldPunished" ||
    event.type === "sansLastAttackTick" ||
    event.type === "lechyStormRollResult"
  ) {
    if (event.damage <= 0) return null;
    targetUnitId = event.type === "lechyStormRollResult" ? event.unitId : event.targetId;
    sourceUnitId = event.type === "papyrusBonePunished" ? event.papyrusId : undefined;
    amount = event.damage;
    explicitNextHp = event.hpAfter;
  } else if (event.type === "stakeTriggered") {
    if (event.damage <= 0) return null;
    targetUnitId = event.unitId;
    amount = event.damage;
  } else if (event.type === "hiddenCollisionResolved") {
    if (event.damage <= 0 || typeof event.displacedUnitId !== "string") return null;
    targetUnitId = event.displacedUnitId;
    amount = event.damage;
  } else {
    return null;
  }

  if (!targetUnitId || !amount) return null;
  const knownHp =
    finiteNumber(runningHp[targetUnitId]) ?? finiteNumber(startingUnits[targetUnitId]?.hp);
  const previousHp = explicitPreviousHp ?? knownHp ?? Math.max(0, (explicitNextHp ?? 0) + amount);
  const nextHp = Math.max(0, explicitNextHp ?? Math.max(0, previousHp - amount));
  const maxHp = Math.max(1, explicitMaxHp ?? previousHp, startingUnits[targetUnitId]?.hp ?? 0);

  return {
    type: "damage",
    targetUnitId,
    previousHp,
    nextHp,
    maxHp,
    amount,
    ...(sourceUnitId ? { sourceUnitId } : {}),
    ...(abilityId ? { abilityId } : {}),
    ...(event.chainId ? { chainId: event.chainId } : {}),
    eventIndex,
    ...(event.type === "attackResolved" ? { showDamageFlash: Boolean(event.targetCell) } : {}),
  };
}

function cloneView(view: PlayerView): {
  hp: VisualHpByUnitId;
  units: VisualUnitsByUnitId;
} {
  return {
    hp: snapshotVisualHp(view),
    units: snapshotVisualUnits(view),
  };
}

export function buildCombatVisualPlaybackPlan(params: {
  batch: BoardEventBatch;
  startingHpByUnitId: VisualHpByUnitId;
  startingUnitsByUnitId: VisualUnitsByUnitId;
  finalView: PlayerView;
  reducedMotion: boolean;
  /** Early rolls must not commit HP/removal belonging to a buffered chain. */
  holdResolvedState?: boolean;
}): CombatVisualPlaybackPlan {
  const timing = params.reducedMotion ? REDUCED_TIMING : NORMAL_TIMING;
  const finalSnapshot = cloneView(params.finalView);
  const playbackStartingUnits: VisualUnitsByUnitId = {
    ...params.startingUnitsByUnitId,
  };
  const playbackStartingHp = { ...params.startingHpByUnitId };
  const revealIds = new Set(
    params.batch.events
      .filter((event) => event.type === "stealthRevealed")
      .map((event) => event.unitId),
  );
  const snareIds = new Set(
    params.batch.events
      .filter((event) => event.type === "snareTriggered")
      .map((event) => event.unitId),
  );
  for (const [unitId, finalUnit] of Object.entries(finalSnapshot.units)) {
    const previousUnit = playbackStartingUnits[unitId];
    if (!previousUnit) {
      if (
        params.holdResolvedState &&
        !revealIds.has(unitId) &&
        !params.batch.events.some((event) => confirmedMovement(event)?.unitId === unitId)
      ) {
        // An ahead snapshot can contain a reveal still buffered by the shared
        // chain scheduler. Early manual dice do not authorize its presentation.
        delete finalSnapshot.units[unitId];
        delete finalSnapshot.hp[unitId];
        continue;
      }
      // A unit newly revealed by this projected batch may enter visually now.
      if (finalUnit.position) {
        const hazardDamage = params.batch.events.reduce(
          (sum, event) =>
            sum + (event.type === "stakeTriggered" && event.unitId === unitId ? event.damage : 0),
          0,
        );
        playbackStartingUnits[unitId] = {
          ...finalUnit,
          hp: finalUnit.hp + hazardDamage,
          position: revealIds.has(unitId) ? null : finalUnit.position,
        };
        playbackStartingHp[unitId] = finalUnit.hp + hazardDamage;
      }
      continue;
    }
    // Merge authorized persistent state while semantic movement, hazard status,
    // reveal and HP remain on their starting values until queued phases run.
    playbackStartingUnits[unitId] = {
      ...previousUnit,
      ...finalUnit,
      hp: previousUnit.hp,
      position: previousUnit.position,
      ...(revealIds.has(unitId) ? { isStealthed: previousUnit.isStealthed } : {}),
      ...(snareIds.has(unitId)
        ? { immobilizedUntilOwnTurnStart: previousUnit.immobilizedUntilOwnTurnStart }
        : {}),
    };
  }
  const runningHp = { ...playbackStartingHp };
  const queue: VisualPlaybackQueueItem[] = [];
  const eventDelaysMs = params.batch.events.map(() => 0);
  const combatCues: CombatPresentationCue[] = [];
  const movementCues: MovementPresentationCue[] = [];
  const movementCount = params.batch.events.filter((event) => confirmedMovement(event)).length;
  const segmentMs = movementSegmentDuration(movementCount, params.reducedMotion);
  // Start from the first authorized segment even if the snapshot has already advanced.
  const anchored = new Set<string>();
  for (const event of params.batch.events) {
    const movement = confirmedMovement(event);
    if (!movement || anchored.has(movement.unitId)) continue;
    anchored.add(movement.unitId);
    const unit = playbackStartingUnits[movement.unitId];
    if (unit) playbackStartingUnits[movement.unitId] = { ...unit, position: movement.from };
  }
  const scheduledDeaths = new Set<string>();
  const abilityBySourceUnitId = new Map<string, string>();
  const addCue = (eventIndex: number, cue: WithoutCueIdentity<CombatPresentationCue>) => {
    const event = params.batch.events[eventIndex];
    combatCues.push({
      ...cue,
      id: `${params.batch.streamId ?? params.batch.previewId ?? "preview"}:${event.eventId ?? `${params.batch.revision}:${eventIndex}`}:${cue.kind}:${"unitId" in cue ? cue.unitId : "roll"}`,
      eventIndex,
    } as CombatPresentationCue);
  };
  // Correlate within the actual AoE use/chain, not every attack on this unit.
  const ownsAoeTarget = (
    aoe: Extract<ProjectedGameEvent, { type: "aoeResolved" }>,
    targetId: string,
    aoeIndex: number,
  ) =>
    params.batch.events.some((event, index) => {
      if (event.type !== "attackResolved" || event.defenderId !== targetId) return false;
      if (aoe.abilityUseId && event.abilityUseId) return aoe.abilityUseId === event.abilityUseId;
      const aoeChain = aoe.chainId ?? aoe.visualBatchId;
      const attackChain = event.chainId ?? event.visualBatchId;
      if (aoeChain && attackChain) return aoeChain === attackChain;
      // Legacy batches have no correlation IDs: only the preceding aggregate
      // segment can own this target, never an unrelated later/earlier AoE.
      if (
        index >= aoeIndex ||
        params.batch.events
          .slice(index + 1, aoeIndex)
          .some((candidate) => candidate.type === "aoeResolved")
      )
        return false;
      return !aoe.sourceUnitId || event.attackerId === aoe.sourceUnitId;
    });

  const hpDuration = (from: number, to: number) =>
    Math.min(
      timing.hpMaxMs,
      timing.hpBaseMs + Math.max(0, Math.abs(from - to) - 1) * timing.hpPerPointMs,
    );
  const scheduleDamage = (damage: DamageVisualEvent, hpStart: number) => {
    const hpEnd = hpStart + hpDuration(damage.previousHp, damage.nextHp);
    queue.push({ type: "damageHpTween", damage, startsAtMs: hpStart, endsAtMs: hpEnd });
    runningHp[damage.targetUnitId] = damage.nextHp;
    return hpEnd;
  };

  let cursorMs = 0;
  // Completion authorizes the area art, but its start belongs before the first
  // correlated outcome. Keep event order intact for damage/death ownership.
  const aggregateStarts = new Map<number, number>();
  let signatureEndMs = 0;
  params.batch.events.forEach((event, eventIndex) => {
    if (event.type === "attackResolved") {
      params.batch.events.forEach((aggregate, aggregateIndex) => {
        if (
          aggregate.type !== "aoeResolved" ||
          !hasHeroAggregatePresentation(aggregate.abilityId) ||
          aggregateStarts.has(aggregateIndex)
        )
          return;
        const correlated = sameAbilityResolution(aggregate, event);
        const legacy =
          !aggregate.abilityUseId &&
          !event.abilityUseId &&
          !aggregate.chainId &&
          !event.chainId &&
          !aggregate.visualBatchId &&
          !event.visualBatchId &&
          aggregateIndex > eventIndex &&
          aggregate.sourceUnitId === event.attackerId &&
          aggregate.abilityId === event.abilityId &&
          !params.batch.events
            .slice(eventIndex + 1, aggregateIndex)
            .some((e) => e.type === "aoeResolved");
        if (correlated || legacy) {
          aggregateStarts.set(aggregateIndex, cursorMs);
          if (isGasterResolution(aggregate)) {
            signatureEndMs = Math.max(signatureEndMs, cursorMs + GASTER_TIMING.endMs);
            cursorMs += GASTER_TIMING.outcomesMs;
          }
        }
      });
    }
    eventDelaysMs[eventIndex] = aggregateStarts.get(eventIndex) ?? cursorMs;
    if (event.type === "sansLastAttackApplied") {
      // The accepted curse is introduced before final unitDied owns death.
      cursorMs += CURSE_APPLY_LEAD_MS;
      return;
    }
    const movementCue = movementCueFromEvent({
      event,
      events: params.batch.events,
      eventIndex,
      view: params.finalView,
      namespace: params.batch.streamId ?? params.batch.previewId ?? "preview",
      atMs: cursorMs,
      durationMs: confirmedMovement(event)
        ? confirmedMovement(event)?.mode === "teleport"
          ? params.reducedMotion
            ? 100
            : 220
          : segmentMs
        : params.reducedMotion
          ? 120
          : 260,
    });
    if (movementCue) {
      movementCues.push(movementCue);
      if (movementCue.kind === "movement") {
        queue.push({
          type: "movement",
          cue: movementCue,
          startsAtMs: cursorMs,
          endsAtMs: cursorMs + movementCue.durationMs,
        });
        cursorMs += movementCue.durationMs;
        return;
      }
      if (movementCue.kind === "reveal") {
        queue.push({
          type: "reveal",
          unitId: movementCue.unitId,
          cell: movementCue.cell,
          startsAtMs: cursorMs,
          endsAtMs: cursorMs + movementCue.durationMs,
        });
        cursorMs += params.reducedMotion ? 25 : 60;
        return;
      }
      if (movementCue.kind === "snareTrigger") {
        queue.push({
          type: "snareStatus",
          unitId: movementCue.unitId,
          startsAtMs: cursorMs,
          endsAtMs: cursorMs,
        });
        cursorMs += movementCue.durationMs;
        return;
      }
    }
    if (event.type === "rollResolved" && isPresentedRoll(event.rollKind)) {
      addCue(eventIndex, { kind: "roll", roll: event, atMs: cursorMs, durationMs: timing.rollMs });
      cursorMs += timing.rollMs;
      return;
    }
    if (event.type === "unitHealed") {
      if (event.amount <= 0) return;
      const previousHp = runningHp[event.unitId] ?? Math.max(0, event.hpAfter - event.amount);
      const hpStart = cursorMs + timing.impactPauseMs;
      const hpEnd = hpStart + hpDuration(previousHp, event.hpAfter);
      addCue(eventIndex, {
        kind: "heal",
        unitId: event.unitId,
        amount: event.amount,
        atMs: cursorMs,
        hpAtMs: hpStart,
        durationMs: hpEnd - cursorMs,
      });
      queue.push({
        type: "healHpTween",
        unitId: event.unitId,
        previousHp,
        nextHp: event.hpAfter,
        startsAtMs: hpStart,
        endsAtMs: hpEnd,
      });
      runningHp[event.unitId] = event.hpAfter;
      cursorMs = hpEnd + timing.betweenHitsMs;
      return;
    }
    if (event.type === "aoeResolved") {
      if (isGasterResolution(event) && !aggregateStarts.has(eventIndex)) {
        signatureEndMs = Math.max(signatureEndMs, cursorMs + GASTER_TIMING.endMs);
        cursorMs += GASTER_TIMING.outcomesMs;
      }
      // Aggregate geometry is one cue. Individual attacks own their target outcomes.
      const impact = cursorMs;
      let end = cursorMs;
      for (const [unitId, amount] of Object.entries(event.damageByUnitId ?? {})) {
        if (amount <= 0 || ownsAoeTarget(event, unitId, eventIndex)) continue;
        const previousHp = runningHp[unitId];
        // No exact baseline means no fabricated HP. Silent reconciliation remains available.
        if (previousHp === undefined) continue;
        const damage: DamageVisualEvent = {
          type: "damage",
          targetUnitId: unitId,
          previousHp,
          nextHp: Math.max(0, previousHp - amount),
          maxHp: Math.max(1, previousHp),
          amount,
          sourceUnitId: event.sourceUnitId,
          abilityId: event.abilityId,
          chainId: event.chainId,
          eventIndex,
          showDamageFlash: false,
        };
        const hpStart = impact + timing.impactPauseMs;
        addCue(eventIndex, {
          kind: "damage",
          unitId,
          amount,
          atMs: impact,
          hpAtMs: hpStart,
          durationMs: timing.outcomeMs,
        });
        end = Math.max(end, scheduleDamage(damage, hpStart));
      }
      cursorMs = Math.max(end, impact + timing.outcomeMs) + timing.betweenHitsMs;
      return;
    }
    if (
      event.type === "abilityUsed" &&
      typeof event.unitId === "string" &&
      typeof event.abilityId === "string"
    ) {
      abilityBySourceUnitId.set(event.unitId, event.abilityId);
    }
    const attackStart = cursorMs;
    const impact = attackStart + (event.type === "attackResolved" ? timing.attackLeadMs : 0);
    if (event.type === "attackResolved") {
      eventDelaysMs[eventIndex] = impact;
      addCue(eventIndex, {
        kind: event.hit ? "hit" : "miss",
        unitId: event.defenderId,
        ...(event.targetCell ? { cell: { ...event.targetCell } } : {}),
        ...(event.hit && event.damage > 0
          ? { amount: event.damage, hpAtMs: impact + timing.impactPauseMs }
          : {}),
        atMs: impact,
        durationMs: timing.outcomeMs,
      });
      if (event.attackerId)
        queue.push({
          type: "attack",
          unitId: event.attackerId,
          startsAtMs: attackStart,
          endsAtMs: impact + timing.impactPauseMs,
        });
    }
    const damage = damageFromEvent(event, eventIndex, runningHp, playbackStartingUnits);
    if (!damage) {
      if (event.type === "unitDied" && !scheduledDeaths.has(event.unitId)) {
        const death: DeathVisualEvent = {
          type: "death",
          unitId: event.unitId,
          cause: event.cause,
          chainId: event.chainId,
          eventIndex,
          ...(event.deathCell ? { cell: { ...event.deathCell } } : {}),
        };
        const deathStart = cursorMs + timing.deathPauseMs;
        eventDelaysMs[eventIndex] = deathStart;
        addCue(eventIndex, {
          kind: "death",
          unitId: event.unitId,
          ...(event.deathCell ? { cell: { ...event.deathCell } } : {}),
          atMs: deathStart,
          durationMs: timing.deathMs,
        });
        queue.push({
          type: "death",
          death,
          startsAtMs: deathStart,
          endsAtMs: deathStart + timing.deathMs,
        });
        queue.push({
          type: "removeVisualUnit",
          unitId: event.unitId,
          startsAtMs: deathStart + timing.deathMs,
          endsAtMs: deathStart + timing.deathMs,
        });
        scheduledDeaths.add(event.unitId);
        cursorMs = deathStart + timing.deathMs + timing.betweenHitsMs;
      } else if (event.type === "attackResolved") {
        cursorMs = impact + timing.outcomeMs + timing.betweenHitsMs;
      }
      return;
    }
    if (damage.sourceUnitId && !damage.abilityId) {
      damage.abilityId = abilityBySourceUnitId.get(damage.sourceUnitId);
    }

    if (
      event.type === "stakeTriggered" ||
      event.type === "hiddenCollisionResolved" ||
      event.type === "sansLastAttackTick"
    ) {
      const cell =
        event.type === "stakeTriggered"
          ? event.markerPos
          : event.type === "sansLastAttackTick"
            ? event.targetCell
            : event.from;
      addCue(eventIndex, {
        kind: "damage",
        unitId: damage.targetUnitId,
        cell,
        amount: damage.amount,
        atMs: impact,
        hpAtMs: impact + timing.impactPauseMs,
        durationMs: timing.outcomeMs,
      });
    }

    cursorMs = scheduleDamage(damage, impact + timing.impactPauseMs) + timing.betweenHitsMs;
  });

  if (params.holdResolvedState) {
    for (const [unitId, unit] of Object.entries(finalSnapshot.units)) {
      const previous = playbackStartingUnits[unitId];
      if (!previous) continue;
      finalSnapshot.hp[unitId] = runningHp[unitId];
      finalSnapshot.units[unitId] = {
        ...unit,
        hp: runningHp[unitId],
        position:
          [...movementCues]
            .reverse()
            .find(
              (cue): cue is Extract<MovementPresentationCue, { kind: "movement" }> =>
                cue.kind === "movement" && cue.unitId === unitId,
            )?.to ??
          movementCues.find(
            (cue): cue is Extract<MovementPresentationCue, { kind: "reveal" }> =>
              cue.kind === "reveal" && cue.unitId === unitId,
          )?.cell ??
          previous.position,
        isAlive: previous.isAlive,
      };
    }
  }

  return {
    movementPlan: { cues: movementCues },
    batch: {
      ...params.batch,
      eventDelaysMs,
      eventSfxDelaysMs: eventDelaysMs,
      combatCues,
      movementCues,
    },
    startingHpByUnitId: playbackStartingHp,
    startingUnitsByUnitId: playbackStartingUnits,
    finalHpByUnitId: finalSnapshot.hp,
    finalUnitsByUnitId: finalSnapshot.units,
    queue,
    durationMs: Math.max(1, cursorMs, signatureEndMs),
  };
}

function tweenHp(previousHp: number, nextHp: number, progress: number): number {
  if (progress <= 0) return previousHp;
  if (progress >= 1) return nextHp;
  const distance = nextHp - previousHp;
  return previousHp + Math.sign(distance) * Math.floor(progress * Math.abs(distance));
}

export function combatVisualPlaybackFrame(
  plan: CombatVisualPlaybackPlan,
  elapsedMs: number,
): CombatVisualPlaybackFrame {
  if (elapsedMs >= plan.durationMs) {
    return {
      batch: plan.batch,
      visualHpByUnitId: { ...plan.finalHpByUnitId },
      visualUnitsByUnitId: { ...plan.finalUnitsByUnitId },
      visualStateByUnitId: Object.fromEntries(
        Object.keys(plan.startingUnitsByUnitId)
          .filter((unitId) => !plan.finalUnitsByUnitId[unitId]?.position)
          .map((unitId) => [unitId, "removed" as const]),
      ),
      complete: true,
      roll: null,
      visualMotionByUnitId: {},
    };
  }

  const visualHpByUnitId = { ...plan.startingHpByUnitId };
  const visualMotionByUnitId: CombatVisualPlaybackFrame["visualMotionByUnitId"] = {};
  const visualUnitsByUnitId = { ...plan.startingUnitsByUnitId };
  const visualStateByUnitId: UnitVisualStateByUnitId = Object.fromEntries(
    Object.keys(visualUnitsByUnitId).map((unitId) => [unitId, "idle" as const]),
  );

  for (const item of plan.queue) {
    if (item.type === "snareStatus") {
      if (elapsedMs >= item.startsAtMs && visualUnitsByUnitId[item.unitId])
        visualUnitsByUnitId[item.unitId] = {
          ...visualUnitsByUnitId[item.unitId],
          immobilizedUntilOwnTurnStart: true,
        };
      continue;
    }
    if (item.type === "movement") {
      if (elapsedMs < item.startsAtMs) continue;
      const { cue } = item;
      const unit = visualUnitsByUnitId[cue.unitId];
      if (!unit) continue;
      const progress = Math.min(
        1,
        (elapsedMs - item.startsAtMs) / Math.max(1, item.endsAtMs - item.startsAtMs),
      );
      const teleport = cue.mode === "teleport";
      const position = teleport
        ? progress < 0.5
          ? cue.from
          : cue.to
        : {
            col: cue.from.col + (cue.to.col - cue.from.col) * progress,
            row: cue.from.row + (cue.to.row - cue.from.row) * progress,
          };
      visualUnitsByUnitId[cue.unitId] = {
        ...unit,
        position: progress >= 1 || (teleport && progress >= 0.5) ? cue.to : cue.from,
      };
      visualMotionByUnitId[cue.unitId] = {
        position,
        mode: cue.mode,
        opacity: teleport ? Math.abs(2 * progress - 1) : 1,
      };
      continue;
    }
    if (item.type === "reveal") {
      if (elapsedMs >= item.startsAtMs && visualUnitsByUnitId[item.unitId]) {
        visualUnitsByUnitId[item.unitId] = {
          ...visualUnitsByUnitId[item.unitId],
          position: item.cell,
          isStealthed: false,
        };
      }
      continue;
    }
    if (item.type === "healHpTween") {
      if (elapsedMs < item.startsAtMs) continue;
      const progress = Math.min(
        1,
        (elapsedMs - item.startsAtMs) / Math.max(1, item.endsAtMs - item.startsAtMs),
      );
      visualHpByUnitId[item.unitId] = tweenHp(item.previousHp, item.nextHp, progress);
      if (elapsedMs < item.endsAtMs) visualStateByUnitId[item.unitId] = "healing";
      continue;
    }
    if (item.type === "damageHpTween") {
      if (elapsedMs < item.startsAtMs) continue;
      const duration = Math.max(1, item.endsAtMs - item.startsAtMs);
      const progress = Math.min(1, (elapsedMs - item.startsAtMs) / duration);
      visualHpByUnitId[item.damage.targetUnitId] = tweenHp(
        item.damage.previousHp,
        item.damage.nextHp,
        progress,
      );
      if (elapsedMs < item.endsAtMs && item.damage.showDamageFlash !== false) {
        visualStateByUnitId[item.damage.targetUnitId] = "takingDamage";
      }
      continue;
    }
    if (item.type === "attack") {
      if (elapsedMs >= item.startsAtMs && elapsedMs < item.endsAtMs) {
        visualStateByUnitId[item.unitId] = "attacking";
      }
      continue;
    }
    if (item.type === "death") {
      if (elapsedMs >= item.startsAtMs && elapsedMs < item.endsAtMs && item.death.cell) {
        const unit = visualUnitsByUnitId[item.death.unitId];
        if (unit)
          visualUnitsByUnitId[item.death.unitId] = { ...unit, position: { ...item.death.cell } };
        visualStateByUnitId[item.death.unitId] = "dying";
      }
      continue;
    }
    if (elapsedMs >= item.startsAtMs) {
      delete visualUnitsByUnitId[item.unitId];
      visualStateByUnitId[item.unitId] = "removed";
    }
  }

  return {
    batch: plan.batch,
    visualHpByUnitId,
    visualUnitsByUnitId,
    visualStateByUnitId,
    complete: false,
    roll:
      plan.batch.combatCues?.find(
        (cue): cue is Extract<CombatPresentationCue, { kind: "roll" }> =>
          cue.kind === "roll" && elapsedMs >= cue.atMs && elapsedMs < cue.atMs + cue.durationMs,
      ) ?? null,
    visualMotionByUnitId,
  };
}
