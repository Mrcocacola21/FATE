import type { GameEvent, PlayerView } from "rules";
import type { BoardEventBatch } from "./types";
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
};

export type DeathVisualEvent = {
  type: "death";
  unitId: string;
  cause?: string;
  chainId?: string;
  eventIndex: number;
};

export type VisualPlaybackQueueItem =
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
}

export function isGameplayProjectedUnit(
  view: PlayerView,
  unitId: string,
): boolean {
  const unit = view.units[unitId];
  return Boolean(unit?.isAlive && unit.position);
}

const NORMAL_TIMING = {
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
  event: GameEvent,
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
    targetUnitId =
      event.type === "lechyStormRollResult" ? event.unitId : event.targetId;
    sourceUnitId =
      event.type === "papyrusBonePunished" ? event.papyrusId : undefined;
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
    finiteNumber(runningHp[targetUnitId]) ??
    finiteNumber(startingUnits[targetUnitId]?.hp);
  const previousHp =
    explicitPreviousHp ??
    knownHp ??
    Math.max(0, (explicitNextHp ?? 0) + amount);
  const nextHp = Math.max(
    0,
    explicitNextHp ?? Math.max(0, previousHp - amount),
  );
  const maxHp = Math.max(
    1,
    explicitMaxHp ?? previousHp,
    startingUnits[targetUnitId]?.hp ?? 0,
  );

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
}): CombatVisualPlaybackPlan {
  const timing = params.reducedMotion ? REDUCED_TIMING : NORMAL_TIMING;
  const finalSnapshot = cloneView(params.finalView);
  const playbackStartingUnits: VisualUnitsByUnitId = {
    ...params.startingUnitsByUnitId,
  };
  const playbackStartingHp = { ...params.startingHpByUnitId };
  for (const [unitId, finalUnit] of Object.entries(finalSnapshot.units)) {
    const previousUnit = playbackStartingUnits[unitId];
    if (!previousUnit) {
      // A unit newly revealed by this projected batch may enter visually now.
      if (finalUnit.position) {
        playbackStartingUnits[unitId] = finalUnit;
        playbackStartingHp[unitId] = finalUnit.hp;
      }
      continue;
    }
    // Statuses from the authoritative projection (for example Jack's wrapped
    // overlay) are safe to render, while position/HP remain on the pre-hit
    // visual snapshot until their queued phases complete.
    playbackStartingUnits[unitId] = {
      ...previousUnit,
      ...finalUnit,
      hp: previousUnit.hp,
      position: previousUnit.position,
    };
  }
  const runningHp = { ...playbackStartingHp };
  const queue: VisualPlaybackQueueItem[] = [];
  const eventDelaysMs = params.batch.events.map(() => 0);
  const deathEventByUnitId = new Map<string, DeathVisualEvent>();
  const scheduledDeaths = new Set<string>();
  const abilityBySourceUnitId = new Map<string, string>();

  params.batch.events.forEach((event, eventIndex) => {
    if (event.type !== "unitDied" || typeof event.unitId !== "string") return;
    if (deathEventByUnitId.has(event.unitId)) return;
    deathEventByUnitId.set(event.unitId, {
      type: "death",
      unitId: event.unitId,
      cause: event.killerId ?? undefined,
      ...(event.chainId ? { chainId: event.chainId } : {}),
      eventIndex,
    });
  });

  let cursorMs = 0;
  params.batch.events.forEach((event, eventIndex) => {
    if (
      event.type === "abilityUsed" &&
      typeof event.unitId === "string" &&
      typeof event.abilityId === "string"
    ) {
      abilityBySourceUnitId.set(event.unitId, event.abilityId);
    }
    const damage = damageFromEvent(
      event,
      eventIndex,
      runningHp,
      playbackStartingUnits,
    );
    if (!damage) {
      if (event.type === "unitDied" && !scheduledDeaths.has(event.unitId)) {
        const death = deathEventByUnitId.get(event.unitId);
        if (!death) return;
        const deathStart = cursorMs + timing.deathPauseMs;
        eventDelaysMs[eventIndex] = deathStart;
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
      } else {
        eventDelaysMs[eventIndex] = cursorMs;
      }
      return;
    }
    if (damage.sourceUnitId && !damage.abilityId) {
      damage.abilityId = abilityBySourceUnitId.get(damage.sourceUnitId);
    }

    const attackStart = cursorMs;
    eventDelaysMs[eventIndex] = attackStart;
    if (damage.sourceUnitId && event.type === "attackResolved") {
      queue.push({
        type: "attack",
        unitId: damage.sourceUnitId,
        startsAtMs: attackStart,
        endsAtMs: attackStart + timing.attackLeadMs + timing.impactPauseMs,
      });
    }
    const hpStart =
      attackStart +
      (event.type === "attackResolved" ? timing.attackLeadMs : timing.impactPauseMs);
    const hpDuration = Math.min(
      timing.hpMaxMs,
      timing.hpBaseMs +
        Math.max(0, damage.previousHp - damage.nextHp - 1) * timing.hpPerPointMs,
    );
    const hpEnd = hpStart + hpDuration;
    queue.push({
      type: "damageHpTween",
      damage,
      startsAtMs: hpStart,
      endsAtMs: hpEnd,
    });
    runningHp[damage.targetUnitId] = damage.nextHp;
    cursorMs = hpEnd;

    const death = deathEventByUnitId.get(damage.targetUnitId);
    if (damage.nextHp <= 0 && death && !scheduledDeaths.has(damage.targetUnitId)) {
      const deathStart = hpEnd + timing.deathPauseMs;
      eventDelaysMs[death.eventIndex] = deathStart;
      queue.push({
        type: "death",
        death,
        startsAtMs: deathStart,
        endsAtMs: deathStart + timing.deathMs,
      });
      queue.push({
        type: "removeVisualUnit",
        unitId: damage.targetUnitId,
        startsAtMs: deathStart + timing.deathMs,
        endsAtMs: deathStart + timing.deathMs,
      });
      scheduledDeaths.add(damage.targetUnitId);
      cursorMs = deathStart + timing.deathMs;
    }
    cursorMs += timing.betweenHitsMs;
  });

  return {
    batch: {
      ...params.batch,
      eventDelaysMs,
    },
    startingHpByUnitId: playbackStartingHp,
    startingUnitsByUnitId: playbackStartingUnits,
    finalHpByUnitId: finalSnapshot.hp,
    finalUnitsByUnitId: finalSnapshot.units,
    queue,
    durationMs: Math.max(1, cursorMs),
  };
}

function tweenHp(previousHp: number, nextHp: number, progress: number): number {
  if (progress <= 0) return previousHp;
  if (progress >= 1) return nextHp;
  const distance = previousHp - nextHp;
  if (distance <= 0) return nextHp;
  return Math.max(nextHp, previousHp - Math.floor(progress * distance));
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
    };
  }

  const visualHpByUnitId = { ...plan.startingHpByUnitId };
  const visualUnitsByUnitId = { ...plan.startingUnitsByUnitId };
  const visualStateByUnitId: UnitVisualStateByUnitId = Object.fromEntries(
    Object.keys(visualUnitsByUnitId).map((unitId) => [unitId, "idle" as const]),
  );

  for (const item of plan.queue) {
    if (item.type === "damageHpTween") {
      if (elapsedMs < item.startsAtMs) continue;
      const duration = Math.max(1, item.endsAtMs - item.startsAtMs);
      const progress = Math.min(1, (elapsedMs - item.startsAtMs) / duration);
      visualHpByUnitId[item.damage.targetUnitId] = tweenHp(
        item.damage.previousHp,
        item.damage.nextHp,
        progress,
      );
      if (elapsedMs < item.endsAtMs) {
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
      if (elapsedMs >= item.startsAtMs && elapsedMs < item.endsAtMs) {
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
  };
}
