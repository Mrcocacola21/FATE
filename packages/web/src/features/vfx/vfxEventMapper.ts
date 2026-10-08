import type { ProjectedGameEvent, PlayerView } from "rules";
import { ABILITY_VLAD_INTIMIDATE } from "../../rulesHints";
import { heroAoeEffect, heroCueId } from "../../game/effects/heroPresentation";
import {
  REMAINING_CASTS,
  REMAINING_AREAS,
  remainingStatusSignature,
  chargeReadyAbilities,
  remainingHitAccent,
} from "../../game/effects/remainingHeroPresentation";
import { GASTER_TIMING, isGasterResolution } from "../../game/effects/sansPresentation";
import { FIREBALL_TIMING, isFireballResolution } from "../../game/effects/asgorePresentation";
import {
  isCoord,
  linePath,
  previousVisibleUnitCoord,
  radiusCellsToOverlay,
  visibleUnitCoord,
} from "./vfxGeometry";
import type { BoardVfxRequest, VfxEffectId, VfxMapperContext } from "./vfxTypes";
import type { CombatPresentationCue } from "../../game/effects/combatPlayback";
import {
  riverStage,
  riverMovementCue,
  transportCueVfx,
  type TransportPresentationCue,
} from "../../game/effects/riverPresentation";
import {
  confirmedMovement,
  movementCueVfx,
  type MovementPresentationCue,
} from "../../game/effects/movementPresentation";

const ABILITY_GUTS_BERSERK_MODE = "gutsBerserkMode";

function requestId(
  context: VfxMapperContext,
  event: ProjectedGameEvent,
  effectId: VfxEffectId,
  suffix = "0",
): string {
  return `${context.presentationId ?? context.revision}:${context.eventIndex}:${event.type}:${effectId}:${suffix}`;
}

function cellRequest(
  context: VfxMapperContext,
  event: ProjectedGameEvent,
  effectId: VfxEffectId,
  sourceCell: NonNullable<BoardVfxRequest["sourceCell"]> | null,
  suffix?: string,
  overrides: Partial<BoardVfxRequest> = {},
): BoardVfxRequest[] {
  if (!sourceCell) return [];
  return [
    {
      id: requestId(context, event, effectId, suffix),
      effectId,
      placement: "cell",
      sourceCell,
      ...overrides,
    },
  ];
}

function unitRequest(
  context: VfxMapperContext,
  event: ProjectedGameEvent,
  effectId: VfxEffectId,
  unitId: unknown,
  suffix?: string,
  overrides: Partial<BoardVfxRequest> = {},
): BoardVfxRequest[] {
  if (typeof unitId !== "string") return [];
  const coord = visibleUnitCoord(context.view, unitId);
  if (!coord) return [];
  return [
    {
      id: requestId(context, event, effectId, suffix ?? unitId),
      effectId,
      placement: "unit",
      unitId,
      sourceCell: coord,
      ...overrides,
    },
  ];
}

function unitOrPreviousRequest(
  context: VfxMapperContext,
  event: ProjectedGameEvent,
  effectId: VfxEffectId,
  unitId: unknown,
  suffix?: string,
  overrides: Partial<BoardVfxRequest> = {},
): BoardVfxRequest[] {
  if (typeof unitId !== "string") return [];
  const coord = previousVisibleUnitCoord(context.view, context.previousPositions, unitId);
  if (!coord) return [];
  return [
    {
      id: requestId(context, event, effectId, suffix ?? unitId),
      effectId,
      placement: "unit",
      unitId,
      sourceCell: coord,
      ...overrides,
    },
  ];
}

function mapAbilityUsed(
  event: Extract<ProjectedGameEvent, { type: "abilityUsed" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const signature = REMAINING_CASTS[event.abilityId];
  if (signature && event.abilityUseId)
    return cellRequest(
      context,
      event,
      signature.vfx,
      isCoord(event.sourceCell) ? event.sourceCell : null,
      undefined,
      {
        id: heroCueId(
          context.streamId ?? context.presentationId ?? context.revision,
          event,
          "cast",
        ),
        anchorMode: "event",
        scaleCells: 1,
      },
    );
  if (event.abilityId === "asgoreFireball" && event.abilityUseId)
    return cellRequest(
      context,
      event,
      "fireballCast",
      isCoord(event.sourceCell) ? event.sourceCell : null,
      undefined,
      {
        anchorMode: "event",
        id: heroCueId(
          context.streamId ?? context.presentationId ?? context.revision,
          event,
          "cast",
        ),
      },
    );
  return [];
}

function fireballRequests(
  event: Extract<ProjectedGameEvent, { type: "attackResolved" }>,
  context: VfxMapperContext,
  impactMs: number,
): BoardVfxRequest[] {
  const namespace = context.streamId ?? context.presentationId ?? context.revision;
  const requests: BoardVfxRequest[] = [];
  if (isCoord(event.sourceCell) && isCoord(event.targetCell))
    requests.push({
      id: heroCueId(namespace, event, "travel"),
      effectId: "fireball",
      placement: "projectile",
      anchorMode: "event",
      sourceCell: { ...event.sourceCell },
      targetCell: { ...event.targetCell },
      durationMs: FIREBALL_TIMING.travelMs,
      delayMs: Math.max(0, impactMs - FIREBALL_TIMING.travelMs),
    });
  if (isCoord(event.targetCell))
    requests.push({
      id: heroCueId(namespace, event, event.hit ? "impact" : "miss"),
      effectId: event.hit ? "fireballImpact" : "combatMiss",
      placement: "cell",
      anchorMode: "event",
      sourceCell: { ...event.targetCell },
      delayMs: impactMs,
    });
  return requests;
}

function remainingHitRequests(
  event: ProjectedGameEvent,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const effectId = remainingHitAccent(event);
  if (!effectId || event.type !== "attackResolved") return [];
  return cellRequest(
    context,
    event,
    effectId,
    isCoord(event.targetCell) ? event.targetCell : null,
    undefined,
    {
      id: heroCueId(
        context.streamId ?? context.presentationId ?? context.revision,
        event,
        "confirmedHitAccent",
      ),
      anchorMode: "event",
      scaleCells: 0.75,
      durationMs: 400,
    },
  );
}

function mapAoeResolved(
  event: Extract<ProjectedGameEvent, { type: "aoeResolved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  if (!isCoord(event.center) || typeof event.radius !== "number") return [];
  const signature = event.abilityId && REMAINING_AREAS[event.abilityId];
  if (signature) {
    const cell = signature.square
      ? event.center
      : isCoord(event.sourceCell)
        ? event.sourceCell
        : null;
    return cellRequest(context, event, signature.vfx, cell, undefined, {
      id: heroCueId(context.streamId ?? context.presentationId ?? context.revision, event, "area"),
      anchorMode: "event",
      ...(signature.square
        ? {
            placement: "area",
            cells: radiusCellsToOverlay(event.center, event.radius, context.view.boardSize ?? 9),
            widthCells: 2 * event.radius + 1,
            heightCells: 2 * event.radius + 1,
          }
        : { scaleCells: 0.85 }),
    });
  }
  if (isGasterResolution(event)) {
    // Never infer the source from a token or its last known position. The
    // selected point determines direction; canonical ray rendering owns length.
    if (
      !isCoord(event.sourceCell) ||
      !linePath(event.sourceCell, event.center) ||
      (event.sourceCell.col === event.center.col && event.sourceCell.row === event.center.row)
    )
      return [];
    const namespace = context.streamId ?? context.presentationId ?? context.revision;
    return [
      {
        id: heroCueId(namespace, event, "gasterSummon"),
        effectId: "gasterCannon",
        placement: "cell",
        anchorMode: "event",
        sourceCell: { ...event.sourceCell },
        targetCell: { ...event.center },
        delayMs: GASTER_TIMING.summonMs,
      },
      {
        id: heroCueId(namespace, event, "gasterFire"),
        effectId: "gasterBeam",
        placement: "ray",
        anchorMode: "event",
        sourceCell: { ...event.sourceCell },
        targetCell: { ...event.center },
        rayToEdge: true,
        delayMs: GASTER_TIMING.fireMs,
      },
    ];
  }
  const cells = radiusCellsToOverlay(event.center, event.radius, context.view.boardSize ?? 9);
  const heroEffect = heroAoeEffect(event.abilityId);
  if (heroEffect)
    return [
      {
        id: heroCueId(
          context.streamId ?? context.presentationId ?? context.revision,
          event,
          heroEffect,
        ),
        effectId: heroEffect,
        placement: "area",
        sourceCell: { ...event.center },
        anchorMode: "event",
        cells,
        widthCells: event.radius * 2 + 1,
        heightCells: event.radius * 2 + 1,
      },
    ];
  if (event.abilityId === ABILITY_GUTS_BERSERK_MODE) {
    return [
      {
        id: requestId(context, event, "berserkAoE"),
        effectId: "berserkAoE",
        placement: "area",
        sourceCell: event.center,
        cells,
        widthCells: event.radius * 2 + 1,
        heightCells: event.radius * 2 + 1,
        durationMs: 850,
      },
    ];
  }
  return [];
}

function mapSearchStealth(
  event: Extract<ProjectedGameEvent, { type: "searchStealth" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const effects = unitRequest(context, event, "searchReveal", event.unitId, "searcher");
  if (Array.isArray(event.rolls)) {
    event.rolls.forEach((roll, index) => {
      if (!roll.success) return;
      effects.push(
        ...unitRequest(context, event, "hiddenReveal", roll.targetId, `revealed-${index}`),
      );
    });
  }
  return effects;
}

function mapUnitMoved(
  event: Extract<ProjectedGameEvent, { type: "unitMoved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  if (!isCoord(event.from) || !isCoord(event.to)) return [];
  const movement = confirmedMovement(event);
  return movement?.mode === "teleport"
    ? movementCueVfx({
        ...movement,
        kind: "movement",
        id: requestId(context, event, "portal"),
        eventIndex: context.eventIndex,
        atMs: 0,
        durationMs: 220,
      })
    : [];
}

export function mapGameEventToVfx(
  event: ProjectedGameEvent,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const signature = remainingStatusSignature(event);
  if (event.type === "lechyStormRollResult")
    return unitOrPreviousRequest(context, event, "storm", event.unitId, "stormTick", {
      anchorMode: "event",
      ...(context.view.units[event.unitId]?.isAlive === false ? { unitId: undefined } : {}),
    });
  if (signature)
    return unitRequest(context, event, signature.vfx, signature.unitId, signature.stage, {
      anchorMode: "event",
      scaleCells: 0.85,
      id: `${context.streamId ?? context.presentationId ?? context.revision}:${"eventId" in event ? event.eventId : context.eventIndex}:${signature.stage}`,
    });
  if (event.type === "lokiChickenGroupApplied")
    return event.targetIds.flatMap((unitId, index) =>
      unitRequest(context, event, "lokiChicken", unitId, `chicken-${index}`, {
        anchorMode: "event",
        scaleCells: 0.8,
      }),
    );
  // A public decoy is a different unit. Never connect it to the real Assassin.
  if (event.type === "unitPlaced" && context.view.units[event.unitId]?.heroId === "falseTrailToken")
    return cellRequest(context, event, "falseTrailSetup", event.position, "decoy", {
      anchorMode: "event",
    });
  const stage = riverStage(event);
  const movement = confirmedMovement(event);
  const transport = stage
    ? { ...stage, atMs: 0 }
    : movement
      ? riverMovementCue(event, {
          ...movement,
          kind: "movement",
          id: "preview",
          eventIndex: context.eventIndex,
          atMs: 0,
          durationMs: 160,
        })
      : null;
  if (transport && "abilityUseId" in event && event.abilityUseId)
    return transportCueVfx({
      ...transport,
      abilityUseId: event.abilityUseId,
      eventIndex: context.eventIndex,
      id: requestId(context, event, "boat", "transport"),
    });
  switch (event.type) {
    case "chargesUpdated": {
      const ready = chargeReadyAbilities(event, context.view);
      return ready.length
        ? cellRequest(
            context,
            event,
            "statusSmall",
            visibleUnitCoord(context.view, event.unitId),
            "ready",
            { scaleCells: 0.65, opacity: 0.45, anchorMode: "event" },
          )
        : [];
    }
    case "sansLastAttackApplied":
    case "sansLastAttackTick":
    case "sansLastAttackRemoved":
      return cellRequest(
        context,
        event,
        event.type === "sansLastAttackApplied"
          ? "sansCurseApply"
          : event.type === "sansLastAttackTick"
            ? "sansCurseTick"
            : "sansCurseRemove",
        isCoord(event.targetCell) ? event.targetCell : null,
        undefined,
        { anchorMode: "event" },
      );
    case "attackResolved":
      if (isFireballResolution(event))
        return fireballRequests(event, context, FIREBALL_TIMING.travelMs);
      return cellRequest(
        context,
        event,
        event.hit ? "combatHit" : "combatMiss",
        isCoord(event.targetCell) ? event.targetCell : null,
      );
    case "unitDied":
      return cellRequest(
        context,
        event,
        "unitDeath",
        isCoord(event.deathCell) ? event.deathCell : null,
      );
    case "abilityUsed":
      return mapAbilityUsed(event, context);
    case "searchStealth":
      return mapSearchStealth(event, context);
    case "stealthRevealed":
      return unitRequest(context, event, "hiddenReveal", event.unitId);
    case "chikatiloMarkApplied":
      return unitRequest(context, event, "markApply", event.targetId, "target");
    case "lechyStormStarted":
      return event.sourceUnitId
        ? unitRequest(context, event, "storm", event.sourceUnitId, "start")
        : [];
    case "asgoreSoulParadeResolved":
      return cellRequest(
        context,
        event,
        "soulParade",
        isCoord(event.sourceCell) ? event.sourceCell : null,
        event.soulId,
        {
          anchorMode: "event",
          id: `${context.streamId ?? context.presentationId ?? context.revision}:${"eventId" in event ? event.eventId : context.eventIndex}:soulReveal`,
        },
      );
    case "aoeResolved":
      return mapAoeResolved(event, context);
    case "unitTransformed":
      return unitRequest(
        context,
        event,
        event.reason === "mettatonThreshold" ? "stageSpark" : "transformation",
        event.unitId,
        event.reason,
      );
    case "lokiChickenApplied":
      return unitRequest(context, event, "chicken", event.targetId, "target");
    case "riverBoatResolved":
    case "riverTraLaLaResolved":
      return []; // Completion never reconstructs or replays a route.
    case "unitMoved":
      return mapUnitMoved(event, context);
    case "bunkerEntered":
      return unitRequest(context, event, "shield", event.unitId, "bunker");
    case "bunkerExited":
      return unitRequest(context, event, "bunkerStatus", event.unitId, "exit", {
        durationMs: 250,
        opacity: 0.35,
      });
    case "intimidateResolved":
      return event.abilityId === ABILITY_VLAD_INTIMIDATE
        ? cellRequest(context, event, "vladGaze", event.from, "stare", {
            id: heroCueId(
              context.streamId ?? context.presentationId ?? context.revision,
              event,
              "stare",
            ),
            scaleCells: 0.6,
          })
        : [];
    case "berserkerDefenseChosen":
      return unitRequest(context, event, "shield", event.defenderId, event.choice);
    default:
      return [];
  }
}

export function mapEventBatchToVfx(params: {
  events: ProjectedGameEvent[];
  view: PlayerView;
  previousPositions: VfxMapperContext["previousPositions"];
  revision: number;
  presentationId?: string;
  streamId?: string;
  eventDelaysMs?: readonly number[];
  combatCues?: readonly CombatPresentationCue[];
  movementCues?: readonly MovementPresentationCue[];
  transportCues?: readonly TransportPresentationCue[];
}): BoardVfxRequest[] {
  const effects: BoardVfxRequest[] = [];
  params.events.forEach((event, eventIndex) => {
    if (
      params.transportCues &&
      (riverStage(event) ||
        (event.type === "unitMoved" &&
          (event.provenance.kind === "boat" || event.provenance.kind === "tralala")))
    )
      return;
    if (isFireballResolution(event)) {
      const impactMs =
        params.combatCues?.find(
          (cue) => cue.eventIndex === eventIndex && (cue.kind === "hit" || cue.kind === "miss"),
        )?.atMs ?? (params.eventDelaysMs?.[eventIndex] ?? 0) + FIREBALL_TIMING.travelMs;
      effects.push(
        ...fireballRequests(event, { ...params, events: params.events, eventIndex }, impactMs),
      );
      return;
    }
    if (
      params.movementCues &&
      ((event.type === "unitMoved" && confirmedMovement(event)) || event.type === "stealthRevealed")
    )
      return;
    if (event.type === "attackResolved") {
      const impactMs =
        params.combatCues?.find((cue) => cue.eventIndex === eventIndex && cue.kind === "hit")
          ?.atMs ??
        params.eventDelaysMs?.[eventIndex] ??
        0;
      effects.push(
        ...remainingHitRequests(event, { ...params, eventIndex }).map((request) => ({
          ...request,
          delayMs: impactMs,
        })),
      );
    }
    if (params.combatCues && (event.type === "attackResolved" || event.type === "unitDied")) return;
    const baseDelay = params.eventDelaysMs?.[eventIndex] ?? 0;
    effects.push(
      ...mapGameEventToVfx(event, {
        view: params.view,
        previousPositions: params.previousPositions,
        revision: params.revision,
        presentationId: params.presentationId,
        streamId: params.streamId,
        events: params.events,
        eventIndex,
      }).map((request) => ({
        ...request,
        delayMs: (request.delayMs ?? 0) + baseDelay,
      })),
    );
  });
  for (const cue of params.transportCues ?? []) effects.push(...transportCueVfx(cue));
  for (const cue of params.combatCues ?? []) {
    if (cue.kind === "roll" || cue.kind === "heal" || !cue.cell) continue;
    if (params.events[cue.eventIndex]?.type === "sansLastAttackTick") continue;
    if (
      (cue.kind === "hit" || cue.kind === "miss") &&
      isFireballResolution(params.events[cue.eventIndex])
    )
      continue;
    effects.push({
      id: `${cue.id}:vfx`,
      effectId:
        cue.kind === "miss" ? "combatMiss" : cue.kind === "death" ? "unitDeath" : "combatHit",
      placement: "cell",
      sourceCell: { ...cue.cell },
      anchorMode: "event",
      delayMs: cue.atMs,
      durationMs: cue.durationMs,
    });
  }
  for (const cue of params.movementCues ?? []) effects.push(...movementCueVfx(cue));
  const seen = new Set<string>();
  return effects.filter((effect) => !seen.has(effect.id) && Boolean(seen.add(effect.id)));
}
