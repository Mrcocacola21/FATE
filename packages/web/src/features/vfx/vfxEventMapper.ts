import type { ProjectedGameEvent, PlayerView } from "rules";
import {
  isCoord,
  linePath,
  previousVisibleUnitCoord,
  radiusCellsToOverlay,
  visibleUnitCoord,
} from "./vfxGeometry";
import type { BoardVfxRequest, VfxEffectId, VfxMapperContext } from "./vfxTypes";
import type { CombatPresentationCue } from "../../game/effects/combatPlayback";

const ABILITY_CHIKATILO_ASSASSIN_MARK = "chikatiloAssassinMark";
const ABILITY_ASGORE_FIRE_PARADE = "asgoreFireParade";
const ABILITY_GUTS_ARBALET = "gutsArbalet";
const ABILITY_GUTS_CANNON = "gutsCannon";
const ABILITY_GUTS_BERSERK_MODE = "gutsBerserkMode";
const ABILITY_GROZNY_INVADE_TIME = "groznyInvadeTime";
const ABILITY_JACK_COVERING_TRACKS = "jackRipperCoveringTracks";

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

function previousOrCurrentUnitCell(view: PlayerView, context: VfxMapperContext, unitId: unknown) {
  if (typeof unitId === "string" && view.units[unitId] && context.previousPositions[unitId]) {
    return { ...context.previousPositions[unitId] };
  }
  return previousVisibleUnitCoord(view, context.previousPositions, unitId);
}

function previousAbilityUsedForUnit(
  context: VfxMapperContext,
  unitId: string,
  abilityId: string,
): boolean {
  return context.events
    .slice(0, context.eventIndex)
    .some(
      (event) =>
        event.type === "abilityUsed" && event.unitId === unitId && event.abilityId === abilityId,
    );
}

function mapAbilityUsed(
  event: Extract<ProjectedGameEvent, { type: "abilityUsed" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  if (event.abilityId === ABILITY_GUTS_ARBALET || event.abilityId === ABILITY_GUTS_CANNON) {
    return unitRequest(context, event, "muzzle", event.unitId);
  }
  if (event.abilityId === ABILITY_GROZNY_INVADE_TIME) {
    return unitRequest(context, event, "phantasm", event.unitId, "source");
  }
  if (event.abilityId === ABILITY_CHIKATILO_ASSASSIN_MARK) {
    return unitRequest(context, event, "markApply", event.unitId, "source", {
      scaleCells: 1.2,
      opacity: 0.45,
    });
  }
  return [];
}

function mapAoeResolved(
  event: Extract<ProjectedGameEvent, { type: "aoeResolved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  if (!isCoord(event.center) || typeof event.radius !== "number") return [];
  const cells = radiusCellsToOverlay(event.center, event.radius, context.view.boardSize ?? 9);
  if (event.abilityId === ABILITY_JACK_COVERING_TRACKS) {
    return cellRequest(context, event, "snareExplosion", event.center, "center", {
      durationMs: 520,
      scaleCells: 0.9,
      opacity: 0.58,
    });
  }
  if (event.abilityId === ABILITY_ASGORE_FIRE_PARADE) {
    return [
      {
        id: requestId(context, event, "fireParade"),
        effectId: "fireParade",
        placement: "area",
        sourceCell: event.center,
        cells,
        widthCells: event.radius * 2 + 1,
        heightCells: event.radius * 2 + 1,
        durationMs: 900,
        opacity: 0.32,
      },
    ];
  }
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

function mapRiverBoat(
  event: Extract<ProjectedGameEvent, { type: "riverBoatResolved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const effects: BoardVfxRequest[] = [];
  if (!isCoord(event.riverDestination) || !isCoord(event.dropDestination)) return effects;
  const riverStart = previousOrCurrentUnitCell(context.view, context, event.riverId);
  const passengerStart = previousOrCurrentUnitCell(context.view, context, event.passengerId);
  effects.push(...cellRequest(context, event, "boat", riverStart, "river-start"));
  effects.push(...cellRequest(context, event, "boat", event.riverDestination, "river-end"));
  effects.push(
    ...cellRequest(context, event, "boat", passengerStart, "passenger-start", {
      delayMs: 80,
      scaleCells: 1.15,
    }),
  );
  effects.push(
    ...cellRequest(context, event, "boat", event.dropDestination, "passenger-drop", {
      delayMs: 120,
      scaleCells: 1.15,
    }),
  );
  if (riverStart) {
    const path = linePath(riverStart, event.riverDestination) ?? [
      riverStart,
      event.riverDestination,
    ];
    if (path.length > 1) {
      effects.push({
        id: requestId(context, event, "tralala", "river-path"),
        effectId: "tralala",
        placement: "path",
        path,
        durationMs: 760,
        opacity: 0.38,
      });
    }
  }
  return effects;
}

function mapRiverTraLaLa(
  event: Extract<ProjectedGameEvent, { type: "riverTraLaLaResolved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const effects: BoardVfxRequest[] = [];
  if (!isCoord(event.riverDestination) || !isCoord(event.dropDestination)) return effects;
  const riverStart = previousOrCurrentUnitCell(context.view, context, event.riverId);
  const targetStart = previousOrCurrentUnitCell(context.view, context, event.targetId);
  effects.push(
    ...cellRequest(context, event, "portal", targetStart, "target-start", {
      scaleCells: 1.15,
    }),
  );
  effects.push(
    ...cellRequest(context, event, "portal", event.dropDestination, "target-drop", {
      delayMs: 120,
      scaleCells: 1.15,
    }),
  );
  effects.push(...cellRequest(context, event, "boat", event.riverDestination, "river-end"));
  if (riverStart) {
    const path = linePath(riverStart, event.riverDestination) ?? [
      riverStart,
      event.riverDestination,
    ];
    if (path.length > 1) {
      effects.push({
        id: requestId(context, event, "tralala", "path"),
        effectId: "tralala",
        placement: "path",
        path,
        durationMs: 900,
      });
    }
  }
  return effects;
}

function mapUnitMoved(
  event: Extract<ProjectedGameEvent, { type: "unitMoved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  if (!isCoord(event.from) || !isCoord(event.to)) return [];
  if (!previousAbilityUsedForUnit(context, event.unitId, ABILITY_GROZNY_INVADE_TIME)) {
    return [];
  }
  return [
    {
      id: requestId(context, event, "phantasm", "from"),
      effectId: "phantasm",
      placement: "cell",
      sourceCell: event.from,
    },
    {
      id: requestId(context, event, "phantasm", "to"),
      effectId: "phantasm",
      placement: "cell",
      sourceCell: event.to,
      delayMs: 90,
    },
    {
      id: requestId(context, event, "phantasmTrace", "line"),
      effectId: "phantasmTrace",
      placement: "line",
      sourceCell: event.from,
      targetCell: event.to,
      durationMs: 420,
    },
  ];
}

export function mapGameEventToVfx(
  event: ProjectedGameEvent,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  switch (event.type) {
    case "attackResolved":
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
    case "lechyStormRollResult":
      return unitOrPreviousRequest(context, event, "storm", event.unitId, "roll");
    case "asgoreSoulParadeResolved":
      return event.asgoreId
        ? unitRequest(context, event, "soulParade", event.asgoreId, event.soulId)
        : [];
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
    case "lokiChickenGroupApplied":
      return Array.isArray(event.targetIds)
        ? event.targetIds.flatMap((targetId, index) =>
            unitRequest(context, event, "chicken", targetId, `target-${index}`),
          )
        : [];
    case "riverBoatResolved":
      return mapRiverBoat(event, context);
    case "riverTraLaLaResolved":
      return mapRiverTraLaLa(event, context);
    case "unitMoved":
      return mapUnitMoved(event, context);
    case "bunkerEntered":
      return unitRequest(context, event, "shield", event.unitId, "bunker");
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
  eventDelaysMs?: readonly number[];
  combatCues?: readonly CombatPresentationCue[];
}): BoardVfxRequest[] {
  const effects: BoardVfxRequest[] = [];
  params.events.forEach((event, eventIndex) => {
    if (params.combatCues && (event.type === "attackResolved" || event.type === "unitDied")) return;
    const baseDelay = params.eventDelaysMs?.[eventIndex] ?? 0;
    effects.push(
      ...mapGameEventToVfx(event, {
        view: params.view,
        previousPositions: params.previousPositions,
        revision: params.revision,
        presentationId: params.presentationId,
        events: params.events,
        eventIndex,
      }).map((request) => ({
        ...request,
        delayMs: (request.delayMs ?? 0) + baseDelay,
      })),
    );
  });
  for (const cue of params.combatCues ?? []) {
    if (cue.kind === "roll" || cue.kind === "heal" || !cue.cell) continue;
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
  return effects;
}
