import type { ProjectedGameEvent, PlayerView } from "rules";
import { ABILITY_VLAD_INTIMIDATE } from "../../rulesHints";
import { heroAoeEffect, heroCueId, sameAbilityResolution } from "../../game/effects/heroPresentation";
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
  radiusCellsToOverlay,
  visibleUnitCoord,
} from "./vfxGeometry";
import type { BoardVfxRequest, VfxEffectId, VfxMapperContext } from "./vfxTypes";
import type { CombatPresentationCue } from "../../game/effects/combatPlayback";
import { basicExpansion, expansionOutcome, expansionAttack, expansionMovement, expansionTeleport, expansionViewAtEvent } from "./expansionPresentation";
import { isFinalPresentationDeath } from "../../game/effects/finalDeath";
import { attackOutcomeRequests, acceptedAutoDefense } from "./attackOutcome";
import { expansionEffect } from "./expansionRegistry";
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
  return `${context.streamId ?? context.presentationId ?? context.revision}:${"eventId" in event ? event.eventId : context.eventIndex}:${event.type}:${effectId}:${suffix}`;
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

function mapAbilityUsed(
  event: Extract<ProjectedGameEvent, { type: "abilityUsed" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const signature = REMAINING_CASTS[event.abilityId];
  if (signature?.vfxPhase === "resolution") return [];
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
  requests.push(...attackOutcomeRequests(event, context.view, heroCueId(namespace, event, "outcome"), impactMs,
    undefined, acceptedAutoDefense(context.events, context.eventIndex), "fireballImpact"));
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
  if (event.abilityId === "lokiLaught" && event.lokiStatusResult === "chicken") return [];
  const sweep = event.abilityId === "tricksterAoE" ? basicExpansion(context.view, event.sourceUnitId, "trickster_sweep") : undefined;
  if (sweep) return cellRequest(context, event, sweep, event.center, "sweep", {
    anchorMode: "event", placement: "area", widthCells: event.radius * 2 + 1, heightCells: event.radius * 2 + 1,
  });
  const signature = event.abilityId && REMAINING_AREAS[event.abilityId];
  if (signature) {
    const directed = [
      "elCidTisona",
      "papyrusLine",
      "undyneEnergy",
      "artemidaCrescent",
      "lucheRay",
      "mettatonLaser",
      "donMadness",
    ].includes(signature.vfx);
    let segments = directed ? event.effectSegments : undefined;
    if (event.abilityId === "mettatonFinalChord") {
      // Only resolved, recipient-authorized legs; blockers cannot be inferred.
      segments = context.events.flatMap((candidate) =>
        candidate.type === "attackResolved" &&
        candidate.abilityUseId === event.abilityUseId &&
        event.abilityUseId &&
        candidate.abilityId === event.abilityId &&
        isCoord(candidate.sourceCell) &&
        isCoord(candidate.targetCell)
          ? [{ from: candidate.sourceCell, to: candidate.targetCell }]
          : [],
      );
    }
    if (segments?.length && isCoord(event.sourceCell))
      return [
        {
          id: heroCueId(
            context.streamId ?? context.presentationId ?? context.revision,
            event,
            "area",
          ),
          effectId: signature.vfx,
          placement: "line",
          anchorMode: "event",
          sourceCell: { ...event.sourceCell },
          segments: segments.map(({ from, to }) => ({ from: { ...from }, to: { ...to } })),
          rayToEdge: false,
        },
      ];
    if (event.abilityId === "lucheDivineRay" && event.radius === 1 && isCoord(event.sourceCell))
      return cellRequest(context, event, signature.vfx, event.center, undefined, {
        id: heroCueId(
          context.streamId ?? context.presentationId ?? context.revision,
          event,
          "area",
        ),
        anchorMode: "event",
        placement: "area",
        widthCells: 3,
        heightCells: 3,
      });
    if (directed) return [];
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
        id: heroCueId(namespace, event, "gasterCharge"),
        effectId: "gasterCharge",
        placement: "cell",
        anchorMode: "event",
        sourceCell: { ...event.sourceCell },
        delayMs: GASTER_TIMING.chargeMs,
        durationMs: GASTER_TIMING.fireMs - GASTER_TIMING.chargeMs,
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

function attackSignatures(
  event: Extract<ProjectedGameEvent, { type: "attackResolved" }>,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  const requests: BoardVfxRequest[] = [];
  const attacker = event.attackerId ? context.view.units[event.attackerId] : undefined;
  const projectile: VfxEffectId | undefined =
    event.attackSignature === "friskPrecisionStrike"
      ? "friskPrecision"
      : event.abilityId === "jebeKhansShooter"
        ? "jebeRicochet"
        : event.attackSignature !== "riderPath" && attacker?.heroId === "odin" && event.hit && event.attackerRoll?.isDouble
          ? "odinGungnir"
          : undefined;
  if (projectile && isCoord(event.sourceCell) && isCoord(event.targetCell))
    requests.push({
      id: requestId(context, event, projectile),
      effectId: projectile,
      placement: "projectile",
      anchorMode: "event",
      sourceCell: { ...event.sourceCell },
      targetCell: { ...event.targetCell },
    });
  if (attacker?.heroId === "zoro" && (event.isBasicAttack || event.abilityId === "zoro3SwordStyle"))
    requests.push(
      ...cellRequest(
        context,
        event,
        "zoroSantoryu",
        isCoord(event.targetCell) ? event.targetCell : null,
        undefined,
        { anchorMode: "event", unitId: event.attackerId },
      ),
    );
  if (event.hit && event.damage > 0 && attacker?.heroId === "jackRipper" &&
    attacker.jackKnownHpByTarget?.[event.defenderId] !== undefined && isCoord(event.targetCell))
    requests.push(...cellRequest(context, event, "expansion.jackRipper.surgeon_insight", event.targetCell, "private-hp", {
      uiAnchor: "healthBar", unitId: event.defenderId, anchorMode: "followUnit", durationMs: 500,
    }));
  return requests;
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
  if (!movement || movement.mode !== "teleport") return [];
  const cue: MovementPresentationCue = {
        ...movement,
        kind: "movement",
        id: requestId(context, event, "portal"),
        eventIndex: context.eventIndex,
        atMs: 0,
        durationMs: 220,
      };
  return expansionTeleport(cue, event, context.view) ?? movementCueVfx(cue);
}

export function mapGameEventToVfx(
  event: ProjectedGameEvent,
  context: VfxMapperContext,
): BoardVfxRequest[] {
  if (
    event.type === "kanekiFormEntered" ||
    event.type === "friskOnePathUnlocked" ||
    event.type === "friskFriendshipWon" ||
    event.type === "lokiSpinCommitted" ||
    event.type === "bunkerEntered" ||
    event.type === "bunkerExited"
  ) {
    const signature = remainingStatusSignature(event);
    const effectId =
      event.type === "bunkerEntered"
        ? "bunkerEntry"
        : event.type === "bunkerExited"
          ? "bunkerExit"
          : signature!.vfx;
    return cellRequest(
      context,
      event,
      effectId,
      isCoord(event.sourceCell) ? event.sourceCell : null,
      undefined,
      {
        anchorMode: "event",
        id: `${context.streamId ?? context.revision}:${"eventId" in event ? event.eventId : context.eventIndex}:${effectId}`,
      },
    );
  }
  const signature = remainingStatusSignature(event);
  if (event.type === "lechyStormRollResult" || event.type === "papyrusBonePunished" || event.type === "sansBoneFieldPunished") {
    const effectId = expansionOutcome(event, context.view);
    return effectId ? cellRequest(context, event, effectId, event.targetCell ?? null, undefined, { anchorMode: "event" }) : [];
  }
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
    case "moonEffectApplied":
      return event.effectId === "lunarEclipse" && context.viewerPlayerId ? (event.affectedUnitIds ?? []).flatMap(unitId => {
        const unit = context.view.units[unitId];
        const effectId = basicExpansion(context.view, unitId, "stealth_enter");
        return unit?.owner === context.viewerPlayerId && unit.isStealthed && effectId
          ? unitRequest(context, event, effectId, unitId) : [];
      }) : [];
    case "groznyTyrantRewarded":
    case "forestMovementStopped":
      return cellRequest(context, event, event.type === "groznyTyrantRewarded" ? "expansion.grozny.tyrant_gain" : "expansion.lechy.forest_stop",
        event.sourceCell ?? null, undefined, { unitId: event.unitId, anchorMode: "event" });
    case "stealthEntered": {
      const effectId = event.success === false ? undefined : basicExpansion(context.view, event.unitId, "stealth_enter");
      return effectId ? unitRequest(context, event, effectId, event.unitId) : [];
    }
    case "heroSelfCost": {
      const effectId = expansionOutcome(event, context.view);
      return effectId ? cellRequest(context, event, effectId, event.sourceCell ?? null, undefined, { anchorMode: "event" }) : [];
    }
    case "lokiGreatJokeCommitted":
      return cellRequest(context, event, "expansion.loki.great_joke", event.sourceCell ?? null,
        undefined, { anchorMode: "event", placement: "area", widthCells: event.radius * 2 + 1, heightCells: event.radius * 2 + 1 });
    case "duolingoBerserkerUnlocked":
    case "riverStormWard":
      return cellRequest(context, event, event.type === "riverStormWard" ? "expansion.riverPerson.storm_ward" : "expansion.duolingo.berserker_unlock",
        event.sourceCell ?? null, undefined, { unitId: event.unitId, anchorMode: "event" });
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
      return [
        ...expansionAttack(event, undefined, context.view, requestId(context, event, "combatHit")),
        ...attackSignatures(event, context),
        ...attackOutcomeRequests(event, context.view, requestId(context, event, "combatHit"), 0,
          undefined, acceptedAutoDefense(context.events, context.eventIndex)),
      ];
    case "unitDied":
      if (!isFinalPresentationDeath(context.events, context.eventIndex, context.view)) return [];
      return cellRequest(
        context,
        event,
        expansionOutcome(event, context.view) ?? "unitDeath",
        isCoord(event.deathCell) ? event.deathCell : null,
      );
    case "abilityUsed":
      return mapAbilityUsed(event, context);
    case "unitPlaced": {
      const effectId = basicExpansion(context.view, event.unitId, "deploy");
      return effectId ? cellRequest(context, event, effectId, event.position, undefined,
        { unitId: event.unitId, anchorMode: "event" }) : [];
    }
    case "searchStealth":
      return mapSearchStealth(event, context);
    case "stealthRevealed":
      return event.revealSignature === "friskKeenEye"
        ? cellRequest(
            context,
            event,
            "friskKeenEye",
            isCoord(event.targetCell) ? event.targetCell : null,
            undefined,
            { anchorMode: "event" },
          )
        : unitRequest(context, event, basicExpansion(context.view, event.unitId, "stealth_reveal") ?? "hiddenReveal", event.unitId);
    case "chikatiloMarkApplied":
      return unitRequest(context, event, "markApply", event.targetId, "target");
    case "lechyStormStarted":
      return event.sourceUnitId
        ? unitRequest(context, event, "storm", event.sourceUnitId, "start")
        : [];
    case "asgoreSoulParadeResolved": {
      const result = expansionEffect("asgore", `soul_${event.soulId}`);
      return [...cellRequest(
        context,
        event,
        "soulParade",
        isCoord(event.sourceCell) ? event.sourceCell : null,
        event.soulId,
        {
          anchorMode: "event",
          id: `${context.streamId ?? context.presentationId ?? context.revision}:${"eventId" in event ? event.eventId : context.eventIndex}:soulReveal`,
        },
      ), ...(result ? cellRequest(context, event, result,
        isCoord(event.sourceCell) ? event.sourceCell : null, "soul-result", { anchorMode: "event", scaleCells: 0.9 }) : [])];
    }
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
      // Only the accepted charge-based defense is complete at choice time.
      // Choosing dice leaves a manual roll pending; attackResolved owns its outcome.
      return event.choice === "auto"
        ? unitRequest(context, event, basicExpansion(context.view, event.defenderId, "auto_defense") ?? "shield", event.defenderId, event.choice)
        : [];
    default:
      return [];
  }
}

export function mapEventBatchToVfx(params: {
  viewerPlayerId?: VfxMapperContext["viewerPlayerId"];
  events: ProjectedGameEvent[];
  view: PlayerView;
  previousPositions: VfxMapperContext["previousPositions"];
  revision: number;
  presentationId?: string;
  streamId?: string;
  eventDelaysMs?: readonly number[];
  eventBuildupMs?: readonly number[];
  combatCues?: readonly CombatPresentationCue[];
  movementCues?: readonly MovementPresentationCue[];
  transportCues?: readonly TransportPresentationCue[];
}): BoardVfxRequest[] {
  const effects: BoardVfxRequest[] = [];
  params.events.forEach((event, eventIndex) => {
    const eventView = expansionViewAtEvent(params.view, params.events, eventIndex);
    if (event.type === "abilityUsed" && event.abilityId === "odinMuninn" && params.events.slice(eventIndex + 1).some(next =>
      next.type === "attackResolved" && next.defenderId === event.unitId && next.preventedBy === "odinMuninn")) return;
    if (event.type === "berserkerDefenseChosen" && event.choice === "auto") {
      const outcome = params.events.findIndex((candidate, index) => index > eventIndex && candidate.type === "attackResolved" &&
        candidate.defenderId === event.defenderId && (sameAbilityResolution(event, candidate) || acceptedAutoDefense(params.events, index)));
      // Correlated AoE defense uses its authorized outcome anchor and shared time.
      // A normal Roll choice never enters this branch or creates a shield.
      if (outcome >= 0) {
        // The corresponding outcome owns this protection, including legacy streams.
        return;
      }
      if (params.events.some(candidate => candidate.type === "aoeResolved" &&
        sameAbilityResolution(event, candidate))) return;
    }
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
      ((event.type === "unitMoved" && confirmedMovement(event)) ||
        (event.type === "stealthRevealed" && !event.revealSignature))
    )
      return;
    if (event.type === "attackResolved") {
      if (params.combatCues) {
        const cue = params.combatCues.find(
          (cue) => cue.eventIndex === eventIndex && (cue.kind === "hit" || cue.kind === "miss"),
        );
        effects.push(...expansionAttack(event, cue, eventView,
          `${params.streamId ?? params.presentationId ?? params.revision}:${"eventId" in event ? event.eventId : eventIndex}:basic`));
        effects.push(
          ...attackSignatures(event, { ...params, eventIndex }).map((request) => ({
            ...request,
            ...(request.placement === "projectile" && cue && "attackAtMs" in cue && cue.attackAtMs !== undefined
              ? {durationMs: Math.max(1, cue.atMs - cue.attackAtMs)} : {}),
            delayMs:
              request.uiAnchor || request.effectId === "friskCry" || request.effectId === "friskSubstitution" || request.effectId === "expansion.frisk.clean_soul_break"
                ? (cue?.atMs ?? params.eventDelaysMs?.[eventIndex] ?? 0)
                : ((cue && "attackAtMs" in cue ? cue.attackAtMs : undefined) ??
                  params.eventDelaysMs?.[eventIndex] ??
                  0),
          })),
        );
      }
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
    if (params.combatCues && (event.type === "attackResolved" || event.type === "unitDied" || event.type === "heroSelfCost" ||
      event.type === "lechyStormRollResult" || event.type === "papyrusBonePunished" || event.type === "sansBoneFieldPunished")) return;
    const baseDelay = params.eventDelaysMs?.[eventIndex] ?? 0;
    if (event.type === "aoeResolved" && event.abilityId && params.combatCues) {
      const lead = params.eventBuildupMs?.[eventIndex] ?? 0;
      if (lead > 0 && event.abilityId === "kaiserCarpetStrike")
        effects.push(...cellRequest({ ...params, eventIndex }, event, "expansion.grand-kaiser.carpet_approach", event.center,
          "approach", { anchorMode: "event", placement: "area", widthCells: event.radius * 2 + 1, heightCells: event.radius * 2 + 1,
            delayMs: baseDelay - lead, durationMs: lead }));
      if (lead > 0 && event.abilityId === "kaiserDora" && event.sourceCell)
        effects.push(...cellRequest({ ...params, eventIndex }, event, "expansion.grand-kaiser.dora_launch", event.sourceCell,
          "launch", { anchorMode: "event", targetCell: event.center, delayMs: baseDelay - lead, durationMs: lead }));
    }
    effects.push(
      ...mapGameEventToVfx(event, {
        view: eventView,
        viewerPlayerId: params.viewerPlayerId,
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
    const event = params.events[cue.eventIndex];
    if ((cue.kind === "hit" || cue.kind === "miss") && event?.type === "attackResolved") {
      effects.push(...attackOutcomeRequests(event, expansionViewAtEvent(params.view, params.events, cue.eventIndex),
        `${cue.id}:vfx`, cue.atMs, cue.durationMs, acceptedAutoDefense(params.events, cue.eventIndex)));
      continue;
    }
    effects.push({
      id: `${cue.id}:vfx`,
      effectId:
        expansionOutcome(params.events[cue.eventIndex], expansionViewAtEvent(params.view, params.events, cue.eventIndex)) ??
        (cue.kind === "miss" ? "combatMiss" : cue.kind === "death" ? "unitDeath" : "combatHit"),
      placement: "cell",
      sourceCell: { ...cue.cell },
      anchorMode: "event",
      delayMs: cue.atMs,
      durationMs: cue.durationMs,
    });
  }
  for (const cue of params.movementCues ?? []) {
    const eventView = expansionViewAtEvent(params.view, params.events, cue.eventIndex);
    const requests = expansionTeleport(cue, params.events[cue.eventIndex], eventView) ?? movementCueVfx(cue);
    effects.push(...requests.map(request => cue.kind === "reveal" && request.effectId === "hiddenReveal"
      ? { ...request, effectId: basicExpansion(params.view, cue.unitId, "stealth_reveal") ?? request.effectId } : request),
      ...expansionMovement(cue, eventView, !params.movementCues?.some(next =>
        cue.kind === "movement" && next.kind === "movement" && next.unitId === cue.unitId &&
        (next.mode === "normal" || next.mode === "rider") && next.atMs >= cue.atMs + cue.durationMs &&
        next.atMs <= cue.atMs + cue.durationMs + 1 &&
        next.from.col === cue.to.col && next.from.row === cue.to.row)));
  }
  const seen = new Set<string>();
  return effects.filter((effect) => !seen.has(effect.id) && Boolean(seen.add(effect.id)));
}
