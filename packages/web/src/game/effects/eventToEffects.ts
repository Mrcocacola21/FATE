import type { Coord, GameEvent, PlayerView } from "rules";
import {
  isCoord,
  linePath,
  squareArea,
  uniqueCoords,
  visibleUnitCoord,
} from "./boardEffects";
import type {
  BoardEffect,
  VisibleUnitPositions,
} from "./types";

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
  return coord
    ? [{ kind: "floatingText", coord, label, tone, durationMs: 950 }]
    : [];
}

function floatingValue(
  coord: Coord | null,
  text: string,
  tone: Extract<BoardEffect, { kind: "floatingText" }>["tone"],
): BoardEffect[] {
  return coord
    ? [{ kind: "floatingText", coord, text, tone, durationMs: 950 }]
    : [];
}

function effectForAttack(
  event: Extract<GameEvent, { type: "attackResolved" }>,
  context: EventEffectContext,
): BoardEffect[] {
  const attacker = visibleUnitCoord(event.attackerId, context.view, context.previousPositions);
  const defender = visibleUnitCoord(event.defenderId, context.view, context.previousPositions);
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
  } else if (attacker) {
    effects.push({ kind: "cellPulse", cells: [attacker], tone: "warning", durationMs: 500 });
  }

  if (event.hit === true) {
    effects.push(...unitFlash(event.defenderId, "hit", context));
    if (defender && typeof event.damage === "number" && event.damage > 0) {
      effects.push(...floatingValue(defender, `-${event.damage}`, "damage"));
    } else {
      effects.push(...floatingLabel(defender, "blocked", "miss"));
    }
  } else if (event.hit === false) {
    effects.push(...unitFlash(event.defenderId, "defend", context));
    effects.push(...floatingLabel(defender, "miss", "miss"));
  }

  return effects;
}

function effectForAoe(
  event: Extract<GameEvent, { type: "aoeResolved" }>,
  context: EventEffectContext,
): BoardEffect[] {
  if (!isCoord(event.center)) return unitFlash(event.sourceUnitId, "buff", context);
  const source = visibleUnitCoord(
    event.sourceUnitId ?? event.casterId,
    context.view,
    context.previousPositions,
  );
  const radius = typeof event.radius === "number" ? Math.max(0, event.radius) : 0;
  const line = radius === 0 && source ? linePath(source, event.center) : null;
  const cells =
    line && line.length > 1
      ? line
      : squareArea(event.center, radius, context.view.boardSize ?? 9);
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
  effects.push(...unitFlash(event.sourceUnitId, "buff", context, 650));

  const damagedIds = new Set(
    Array.isArray(event.damagedUnitIds) ? event.damagedUnitIds : [],
  );
  const affectedIds = Array.isArray(event.affectedUnitIds)
    ? event.affectedUnitIds
    : [];
  for (const unitId of affectedIds) {
    const coord = visibleUnitCoord(unitId, context.view, context.previousPositions);
    effects.push(
      ...unitFlash(unitId, damagedIds.has(unitId) ? "hit" : "defend", context, 750),
    );
    const damage = event.damageByUnitId?.[unitId];
    if (damagedIds.has(unitId) && typeof damage === "number" && damage > 0) {
      effects.push(...floatingValue(coord, `-${damage}`, "damage"));
    }
  }
  return effects;
}

export function effectsFromGameEvent(
  event: GameEvent,
  context: EventEffectContext,
): BoardEffect[] {
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
      return effectForAttack(event, context);
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
    case "unitHealed": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return [
        ...unitFlash(event.unitId, "heal", context),
        ...(coord && typeof event.amount === "number"
          ? floatingValue(coord, `+${event.amount}`, "heal")
          : []),
      ];
    }
    case "unitDied": {
      const coord = visibleUnitCoord(event.unitId, context.view, context.previousPositions);
      return [
        ...(coord
          ? [{ kind: "cellPulse", cells: [coord], tone: "warning", durationMs: 1000 } as BoardEffect]
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
    case "berserkerDefenseChosen": {
      const coord = visibleUnitCoord(
        event.defenderId,
        context.view,
        context.previousPositions,
      );
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
          ? floatingValue(
              coord,
              `${event.delta > 0 ? "+" : ""}${event.delta}`,
              "status",
            )
          : []),
      ];
    }
    case "papyrusUnbelieverActivated":
      return unitFlash(event.papyrusId, "buff", context);
    case "sansUnbelieverActivated":
      return unitFlash(event.sansId, "buff", context);
    case "papyrusBoneApplied":
      return [
        ...unitFlash(event.targetId, "debuff", context),
        ...floatingLabel(
          visibleUnitCoord(event.targetId, context.view, context.previousPositions),
          "status",
          "status",
        ),
      ];
    case "papyrusBonePunished":
    case "sansBoneFieldPunished": {
      const coord = visibleUnitCoord(event.targetId, context.view, context.previousPositions);
      return [
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
      return unitFlash(event.unitId, "debuff", context);
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
              visibleUnitCoord(
                event.actorUnitId,
                context.view,
                context.previousPositions,
              ),
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
  events: GameEvent[],
  context: EventEffectContext,
): BoardEffect[] {
  let sequenceDelay = 0;
  const effects: BoardEffect[] = [];
  for (const event of events) {
    const mapped = effectsFromGameEvent(event, context).map((effect) => ({
      ...effect,
      delayMs: (effect.delayMs ?? 0) + sequenceDelay,
    }));
    effects.push(...mapped);
    if (mapped.length > 0) {
      sequenceDelay = Math.min(sequenceDelay + 90, 540);
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
