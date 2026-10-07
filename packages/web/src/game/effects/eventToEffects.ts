import type { Coord, ProjectedGameEvent, PlayerView } from "rules";
import { isCoord, linePath, squareArea, uniqueCoords, visibleUnitCoord } from "./boardEffects";
import type { BoardEffect, VisibleUnitPositions } from "./types";
import type { CombatPresentationCue } from "./combatPlayback";

interface EventEffectContext {
  view: PlayerView;
  previousPositions: VisibleUnitPositions;
}

const MAJOR_ABILITY_IDS = new Set([
  "asgoreFireParade",
  "asgoreSoulParade",
  "elCidCompeadorKolada",
  "elCidCompeadorTisona",
  "falseTrailExplosion",
  "femtoDivineMove",
  "friskGenocide",
  "friskPacifism",
  "griffithFemtoRebirth",
  "gutsBerserkMode",
  "jebeHailOfArrows",
  "kaiserCarpetStrike",
  "kaiserDora",
  "kaiserEngineeringMiracle",
  "kaladinFifth",
  "lechyConfuseTerrain",
  "lechyGuideTraveler",
  "lechyStorm",
  "lokiLaught",
  "mettatonEx",
  "mettatonFinalChord",
  "mettatonLaser",
  "mettatonNeo",
  "mettatonPoppins",
  "odinSleipnir",
  "papyrusCoolGuy",
  "papyrusLongBone",
  "riverBoat",
  "riverBoatman",
  "riverTraLaLa",
  "sansBadassJoke",
  "sansBoneField",
  "sansGasterBlaster",
  "undyneEnergySpear",
  "undyneUndying",
  "vladForest",
]);

function unitFlash(
  unitId: unknown,
  tone: Extract<BoardEffect, { kind: "unitFlash" }>["tone"],
  context: EventEffectContext,
  durationMs = 700,
): BoardEffect[] {
  if (typeof unitId !== "string") return [];
  const coord = visibleUnitCoord(unitId, context.view, context.previousPositions);
  if (!coord) return [];
  return [{ kind: "unitFlash", unitId, coord, tone, durationMs }];
}

function floatingLabel(
  coord: Coord | null,
  label: Extract<BoardEffect, { kind: "floatingText" }>["label"],
  tone: Extract<BoardEffect, { kind: "floatingText" }>["tone"],
): BoardEffect[] {
  return coord ? [{ kind: "floatingText", coord, label, tone, durationMs: 950 }] : [];
}

function floatingValue(
  coord: Coord | null,
  text: string,
  tone: Extract<BoardEffect, { kind: "floatingText" }>["tone"],
): BoardEffect[] {
  return coord ? [{ kind: "floatingText", coord, text, tone, durationMs: 950 }] : [];
}

function boneApplicationEffects(
  unitId: string,
  boneType: "blue" | "orange",
  context: EventEffectContext,
): BoardEffect[] {
  const coord = visibleUnitCoord(unitId, context.view, context.previousPositions);
  if (!coord) return [];
  const tone = boneType === "blue" ? "boneBlue" : "boneOrange";
  return [
    { kind: "cellPulse", cells: [coord], tone, durationMs: 900 },
    ...unitFlash(unitId, "debuff", context, 800),
    ...floatingLabel(coord, boneType === "blue" ? "blueBone" : "orangeBone", tone),
  ];
}

function effectForAttack(
  event: Extract<ProjectedGameEvent, { type: "attackResolved" }>,
): BoardEffect[] {
  const attacker = isCoord(event.sourceCell) ? event.sourceCell : null;
  const defender = isCoord(event.targetCell) ? event.targetCell : null;
  const effects: BoardEffect[] = [];

  if (attacker && defender) {
    const distance = Math.max(
      Math.abs(attacker.col - defender.col),
      Math.abs(attacker.row - defender.row),
    );
    effects.push(
      distance > 1
        ? { kind: "beam", from: attacker, to: defender, tone: "attack", durationMs: 600 }
        : { kind: "cellPulse", cells: [defender], tone: "attack", durationMs: 550 },
    );
  } else if (defender) {
    effects.push({ kind: "cellPulse", cells: [defender], tone: "attack", durationMs: 550 });
  }

  if (event.hit === true) {
    effects.push(
      ...(defender ? [{ kind: "unitFlash", unitId: event.defenderId, coord: defender, tone: "hit", durationMs: 300 } as BoardEffect] : []),
    );
    if (defender && typeof event.damage === "number" && event.damage > 0) {
      effects.push(
        ...floatingValue(defender, `-${event.damage}`, "damage"),
      );
    }
  } else if (event.hit === false) {
    if (defender) effects.push({ kind: "unitFlash", unitId: event.defenderId, coord: defender, tone: "defend", durationMs: 300 });
    effects.push(...floatingLabel(defender, "miss", "miss"));
  }

  return effects;
}

function effectForAoe(
  event: Extract<ProjectedGameEvent, { type: "aoeResolved" }>,
  context: EventEffectContext,
): BoardEffect[] {
  if (!isCoord(event.center)) return [];
  const source = isCoord(event.sourceCell) ? event.sourceCell : null;
  const radius = typeof event.radius === "number" ? Math.max(0, event.radius) : 0;
  const line = radius === 0 && source ? linePath(source, event.center) : null;
  const cells =
    line && line.length > 1 ? line : squareArea(event.center, radius, context.view.boardSize ?? 9);
  const effects: BoardEffect[] = [
    {
      kind: "areaHighlight",
      cells,
      tone: radius > 0 ? "aoe" : "danger",
      durationMs: 1000,
    },
  ];

  if (line && line.length > 1 && source) {
    effects.push({
      kind: "beam",
      from: source,
      to: event.center,
      tone: "magic",
      durationMs: 750,
    });
  }
  if (source && event.sourceUnitId) {
    effects.push({ kind: "unitFlash", unitId: event.sourceUnitId, coord: source, tone: "buff", durationMs: 650 });
  }

  const damagedIds = new Set(Array.isArray(event.damagedUnitIds) ? event.damagedUnitIds : []);
  const affectedIds = Array.isArray(event.affectedUnitIds) ? event.affectedUnitIds : [];
  for (const unitId of affectedIds) {
    const coord = visibleUnitCoord(unitId, context.view, context.previousPositions);
    effects.push(...unitFlash(unitId, damagedIds.has(unitId) ? "hit" : "defend", context, 750));
    const damage = event.damageByUnitId?.[unitId];
    if (damagedIds.has(unitId) && typeof damage === "number" && damage > 0) {
      effects.push(...floatingValue(coord, `-${damage}`, "damage"));
    } else {
      effects.push(...floatingLabel(coord, "miss", "miss"));
    }
  }
  return effects;
}

export function effectsFromGameEvent(event: ProjectedGameEvent, context: EventEffectContext): BoardEffect[] {
  switch (event.type) {
    case "unitPlaced":
      return isCoord(event.position)
        ? [
            {
              kind: "cellPulse",
              cells: [event.position],
              tone: "move",
              durationMs: 650,
            },
          ]
        : [];
    case "attackResolved":
      return effectForAttack(event);
    case "aoeResolved":
      return effectForAoe(event, context);
    case "unitMoved": {
      if (!isCoord(event.from) || !isCoord(event.to)) return [];
      const path = linePath(event.from, event.to) ?? [event.from, event.to];
      const distance = Math.max(
        Math.abs(event.from.col - event.to.col),
        Math.abs(event.from.row - event.to.row),
      );
      return [
        {
          kind: "movementTrail",
          path,
          tone: distance > 4 || path.length === 2 ? "teleport" : "move",
          durationMs: 850,
        },
        { kind: "cellPulse", cells: [event.to], tone: "move", durationMs: 650 },
      ];
    }
    case "hiddenCollisionResolved": {
      if (
        typeof event.displacedUnitId !== "string" ||
        typeof event.damage !== "number" ||
        event.damage <= 0
      ) {
        return [];
      }
      const coord = visibleUnitCoord(
        event.displacedUnitId,
        context.view,
        context.previousPositions,
      );
      return [
        ...unitFlash(event.displacedUnitId, "hit", context),
        ...floatingValue(coord, `-${event.damage}`, "damage"),
      ];
    }
    case "intimidateResolved":
      if (!isCoord(event.from) || !isCoord(event.to)) return [];
      return [
        {
          kind: "movementTrail",
          path: [event.from, event.to],
          tone: "push",
          durationMs: 700,
        },
        { kind: "cellPulse", cells: [event.to], tone: "warning", durationMs: 650 },
      ];
    case "unitHealed":
      // This projection has no event-time heal cell. The plan drives HP and
      // the visible token's healing state without guessing a positional cue.
      return [];
    case "unitDied": {
      const coord = isCoord(event.deathCell) ? event.deathCell : null;
      return [
        ...(coord
          ? [
              {
                kind: "cellPulse",
                cells: [coord],
                tone: "warning",
                durationMs: 1000,
              } as BoardEffect,
            ]
          : []),
        ...floatingLabel(coord, "defeated", "status"),
      ];
    }
    case "stakeTriggered": {
      if (!isCoord(event.markerPos)) return unitFlash(event.unitId, "hit", context);
      return [
        {
          kind: "cellPulse",
          cells: [event.markerPos],
          tone: "warning",
          durationMs: 1000,
        },
        ...unitFlash(event.unitId, "hit", context),
        ...(typeof event.damage === "number" && event.damage > 0
          ? floatingValue(event.markerPos, `-${event.damage}`, "damage")
          : []),
      ];
    }
    case "stakesPlaced":
      return Array.isArray(event.positions)
        ? [
            {
              kind: "areaHighlight",
              cells: event.positions.filter(isCoord),
              tone: "danger",
              durationMs: 850,
            },
          ]
        : [];
    case "carpetStrikeTriggered":
      return [
        { kind: "boardPulse", tone: "danger", durationMs: 700 },
        ...unitFlash(event.unitId, "buff", context),
      ];
    case "carpetStrikeCenter": {
      if (!isCoord(event.center)) return unitFlash(event.unitId, "buff", context);
      return [
        {
          kind: "areaHighlight",
          cells: squareArea(event.center, 2, context.view.boardSize ?? 9),
          tone: "danger",
          durationMs: 1200,
        },
        {
          kind: "cellPulse",
          cells: [event.center],
          tone: "warning",
          durationMs: 1200,
        },
        ...unitFlash(event.unitId, "buff", context),
      ];
    }
    case "carpetStrikeAttackRolled": {
      if (!isCoord(event.center)) return unitFlash(event.unitId, "buff", context);
      const effects: BoardEffect[] = [
        {
          kind: "areaHighlight",
          cells: squareArea(event.center, 2, context.view.boardSize ?? 9),
          tone: "aoe",
          durationMs: 950,
        },
      ];
      if (Array.isArray(event.affectedUnitIds)) {
        for (const unitId of event.affectedUnitIds) {
          effects.push(...unitFlash(unitId, "defend", context, 650));
        }
      }
      return effects;
    }
    case "abilityUsed":
      return typeof event.abilityId === "string" &&
        typeof event.unitId === "string" &&
        MAJOR_ABILITY_IDS.has(event.abilityId)
        ? [
            ...unitFlash(event.unitId, "buff", context),
            ...floatingLabel(
              visibleUnitCoord(event.unitId, context.view, context.previousPositions),
              "ability",
              "status",
            ),
          ]
        : [];
    case "unitTransformed": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return [
        { kind: "boardPulse", tone: "magic", durationMs: 1000 },
        ...unitFlash(event.unitId, "buff", context),
        ...floatingLabel(coord, "status", "status"),
      ];
    }
    case "chikatiloMarkApplied":
      return typeof event.targetId === "string"
        ? [
            ...unitFlash(event.targetId, "debuff", context),
            ...floatingLabel(
              visibleUnitCoord(event.targetId, context.view, context.previousPositions),
              "status",
              "status",
            ),
          ]
        : [];
    case "lokiChickenGroupApplied":
      return Array.isArray(event.targetIds)
        ? event.targetIds.flatMap((targetId) => [
            ...unitFlash(targetId, "debuff", context),
            ...floatingLabel(
              visibleUnitCoord(targetId, context.view, context.previousPositions),
              "status",
              "status",
            ),
          ])
        : [];
    case "riverBoatmanGranted":
      return unitFlash(event.riverId, "buff", context);
    case "riverBoatResolved":
      return [
        ...unitFlash(event.riverId, "buff", context, 550),
        ...unitFlash(event.passengerId, "buff", context, 550),
      ];
    case "riverTraLaLaResolved":
      return [
        ...unitFlash(event.riverId, "buff", context, 550),
        ...unitFlash(event.targetId, "debuff", context, 700),
        ...(Array.isArray(event.touchedAttackerIds)
          ? event.touchedAttackerIds.flatMap((attackerId) =>
              unitFlash(attackerId, "buff", context, 500),
            )
          : []),
      ];
    case "berserkerDefenseChosen": {
      const coord = visibleUnitCoord(event.defenderId, context.view, context.previousPositions);
      return [
        ...unitFlash(event.defenderId, "defend", context),
        ...floatingLabel(coord, event.choice === "auto" ? "dodge" : "status", "miss"),
      ];
    }
    case "moveBlocked":
    case "sansMoveDenied": {
      const unitId = event.unitId;
      const coord = visibleUnitCoord(unitId, context.view, context.previousPositions);
      return [
        ...unitFlash(unitId, "debuff", context),
        ...floatingLabel(coord, "blocked", "status"),
      ];
    }
    case "stealthEntered": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return event.success === false
        ? floatingLabel(coord, "blocked", "miss")
        : [
            ...unitFlash(event.unitId, "buff", context),
            ...floatingLabel(coord, "status", "status"),
          ];
    }
    case "stealthRevealed": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return [
        ...unitFlash(event.unitId, "debuff", context),
        ...floatingLabel(coord, "revealed", "status"),
      ];
    }
    case "bunkerEntered":
      return unitFlash(event.unitId, "buff", context);
    case "bunkerEnterFailed":
      return [
        ...unitFlash(event.unitId, "debuff", context),
        ...floatingLabel(
          visibleUnitCoord(event.unitId, context.view, context.previousPositions),
          "blocked",
          "status",
        ),
      ];
    case "bunkerExited":
      return unitFlash(event.unitId, "debuff", context);
    case "damageBonusApplied":
      return unitFlash(event.unitId, "buff", context);
    case "mettatonRatingChanged": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return [
        ...unitFlash(event.unitId, event.delta >= 0 ? "buff" : "debuff", context),
        ...(event.delta !== 0
          ? floatingValue(coord, `${event.delta > 0 ? "+" : ""}${event.delta}`, "status")
          : []),
      ];
    }
    case "papyrusUnbelieverActivated":
      return unitFlash(event.papyrusId, "buff", context);
    case "sansUnbelieverActivated":
      return unitFlash(event.sansId, "buff", context);
    case "papyrusBoneApplied":
      return boneApplicationEffects(event.targetId, event.boneType, context);
    case "papyrusBonePunished":
    case "sansBoneFieldPunished": {
      const coord = visibleUnitCoord(event.targetId, context.view, context.previousPositions);
      const tone = event.boneType === "blue" ? "boneBlue" : "boneOrange";
      return [
        ...(coord
          ? [{ kind: "cellPulse", cells: [coord], tone, durationMs: 650 } as BoardEffect]
          : []),
        ...unitFlash(event.targetId, "hit", context),
        ...(typeof event.damage === "number"
          ? floatingValue(coord, `-${event.damage}`, "damage")
          : []),
      ];
    }
    case "sansBadassJokeApplied":
    case "sansLastAttackApplied":
      return [
        ...unitFlash(event.targetId, "debuff", context),
        ...floatingLabel(
          visibleUnitCoord(event.targetId, context.view, context.previousPositions),
          "status",
          "status",
        ),
      ];
    case "sansBoneFieldApplied":
      return boneApplicationEffects(event.unitId, event.boneType, context);
    case "sansBoneFieldActivated":
      return [
        { kind: "boardPulse", tone: "magic", durationMs: 900 },
        ...unitFlash(event.sansId, "buff", context),
      ];
    case "sansLastAttackTick": {
      const coord = visibleUnitCoord(event.targetId, context.view, context.previousPositions);
      return [
        ...unitFlash(event.targetId, "hit", context),
        ...(typeof event.damage === "number"
          ? floatingValue(coord, `-${event.damage}`, "damage")
          : []),
      ];
    }
    case "sansLastAttackRemoved":
      return unitFlash(event.targetId, "heal", context);
    case "lechyStormRollResult": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return [
        ...unitFlash(event.unitId, event.damage > 0 ? "hit" : "defend", context),
        ...(event.damage > 0 ? floatingValue(coord, `-${event.damage}`, "damage") : []),
      ];
    }
    case "forestActivated":
      return [
        { kind: "boardPulse", tone: "magic", durationMs: 1100 },
        ...unitFlash(event.vladId, "buff", context),
      ];
    case "arenaChosen":
      return [{ kind: "boardPulse", tone: "status", durationMs: 1000 }];
    case "gameEnded":
      return [{ kind: "boardPulse", tone: "magic", durationMs: 1400 }];
    case "rollRequested":
      return event.actorUnitId
        ? [
            ...unitFlash(event.actorUnitId, "buff", context, 450),
            ...floatingLabel(
              visibleUnitCoord(event.actorUnitId, context.view, context.previousPositions),
              "status",
              "status",
            ),
          ]
        : [];
    default:
      return [];
  }
}

export function effectsFromEventBatch(
  events: ProjectedGameEvent[],
  context: EventEffectContext,
  eventDelaysMs?: readonly number[],
  combatCues?: readonly CombatPresentationCue[],
): BoardEffect[] {
  let sequenceDelay = 0;
  const effects: BoardEffect[] = [];
  const attackTargetIds = new Set(
    events
      .filter(
        (event): event is Extract<ProjectedGameEvent, { type: "attackResolved" }> =>
          event.type === "attackResolved",
      )
      .map((event) => event.defenderId),
  );
  events.forEach((event, eventIndex) => {
    if (combatCues && ["attackResolved", "unitDied", "unitHealed"].includes(event.type)) return;
    if (combatCues && event.type === "aoeResolved") {
      effects.push(...effectForAoe({ ...event, affectedUnitIds: [], damagedUnitIds: [], damageByUnitId: {} }, context)
        .map(effect => ({ ...effect, delayMs: (effect.delayMs ?? 0) + (eventDelaysMs?.[eventIndex] ?? 0) })));
      return;
    }
    const eventEffects =
      event.type === "aoeResolved" && attackTargetIds.size > 0
        ? effectForAoe(
            {
              ...event,
              affectedUnitIds: event.affectedUnitIds.filter(
                (unitId) => !attackTargetIds.has(unitId),
              ),
              damagedUnitIds: event.damagedUnitIds.filter(
                (unitId) => !attackTargetIds.has(unitId),
              ),
              damageByUnitId: Object.fromEntries(
                Object.entries(event.damageByUnitId ?? {}).filter(
                  ([unitId]) => !attackTargetIds.has(unitId),
                ),
              ),
            },
            context,
          )
        : effectsFromGameEvent(event, context);
    const baseDelay = eventDelaysMs?.[eventIndex] ?? sequenceDelay;
    const mapped = eventEffects.map((effect) => ({
      ...effect,
      delayMs: (effect.delayMs ?? 0) + baseDelay,
    }));
    effects.push(...mapped);
    if (!eventDelaysMs && mapped.length > 0) {
      sequenceDelay = Math.min(sequenceDelay + 90, 540);
    }
  });

  for (const cue of combatCues ?? []) {
    if (cue.kind === "roll" || !cue.cell) continue;
    if (cue.kind === "death") {
      effects.push(...floatingLabel(cue.cell, "defeated", "status").map(effect => ({ ...effect, delayMs: cue.atMs })));
      continue;
    }
    effects.push({ kind: "unitFlash", unitId: cue.unitId, coord: cue.cell,
      tone: cue.kind === "miss" ? "defend" : cue.kind === "heal" ? "heal" : "hit",
      durationMs: cue.durationMs, delayMs: cue.atMs });
    if (cue.kind === "miss") {
      effects.push(...floatingLabel(cue.cell, "miss", "miss").map(effect => ({ ...effect, delayMs: cue.atMs })));
    } else if (cue.amount && cue.amount > 0) {
      effects.push(...floatingValue(cue.cell, `${cue.kind === "heal" ? "+" : "-"}${cue.amount}`, cue.kind === "heal" ? "heal" : "damage")
        .map(effect => ({ ...effect, delayMs: cue.hpAtMs ?? cue.atMs })));
    }
  }

  const seen = new Set<string>();
  return effects.filter((effect) => {
    if (effect.kind !== "cellPulse" && effect.kind !== "areaHighlight") return true;
    effect.cells = uniqueCoords(effect.cells);
    const key = `${effect.kind}:${effect.tone}:${effect.cells.map((cell) => `${cell.col},${cell.row}`).join("|")}:${effect.delayMs ?? 0}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
