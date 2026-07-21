import type { Coord, PlayerId, PlayerView, UnitState } from "rules";
import {
  ASGORE_FIREBALL_ID,
  ASGORE_FIRE_PARADE_ID,
  ARTEMIS_MOON_INSIGHT_ID,
  ARTEMIS_SILVER_SICKLE_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  DON_SORROWFUL_ID,
  DON_WINDMILLS_ID,
  DUOLINGO_PUSH_NOTIFICATION_ID,
  EL_CID_KOLADA_ID,
  GENGHIS_KHAN_KHANS_DECREE_ID,
  GROZNY_INVADE_TIME_ID,
  GROZNY_TYRANT_ID,
  GUTS_ARBALET_ID,
  GUTS_BERSERK_MODE_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JACK_HOLY_MOTHER_ID,
  JACK_SNARES_ID,
  JEBE_KHANS_SHOOTER_ID,
  LECHY_GUIDE_TRAVELER_ID,
  LUCHE_BURNING_SUN_ID,
  LUCHE_DIVINE_RAY_ID,
  LOKI_LAUGHT_ID,
  RIVER_PERSON_BOAT_ID,
  RIVER_PERSON_BOATMAN_ID,
  RIVER_PERSON_TRA_LA_LA_ID,
  KANEKI_REGENERATION_ID,
  TRICKSTER_AOE_ID,
  TRICKSTER_AOE_RADIUS,
  ZORO_ASURA_ID,
  ZORO_ONI_GIRI_ID,
  getProjectedAbilityTargetRange,
} from "../../rulesHints";
import type { BoardPreview, TargetRef } from "./previewTypes";
import {
  adjacentCells,
  archerLineCells,
  attackRangeCells,
  boardSize,
  cellsFromTargetIds,
  cellsInRadius,
  chebyshevDistance,
  coordKey,
  diagonalDestinations,
  firstVisibleArcherTargets,
  lineCellsToTargets,
  openCells,
  straightLineDestinations,
  visiblePositionedUnits,
} from "./previewGeometry";
import {
  targetCells,
  targetRefsFromIds,
  targetRefForUnit,
  visibleUnitTargets,
} from "./previewVisibility";

const GUIDE_TRAVELER_RADIUS = 2;
const LOKI_RADIUS = 2;
const FIRE_PARADE_RADIUS = TRICKSTER_AOE_RADIUS;
const GUTS_BERSERK_AOE_RADIUS = 1;
const EL_CID_KOLADA_RADIUS = 1;

export interface BuildAbilityPreviewArgs {
  gameView: PlayerView | null | undefined;
  viewerPlayerId: PlayerId | null | undefined;
  sourceUnitId: string | null | undefined;
  abilityId: string | null | undefined;
  targetingStep?: string | null;
}

function sourceUnit(view: PlayerView, sourceUnitId: string | null | undefined): UnitState | null {
  if (!sourceUnitId) return null;
  const unit = view.units[sourceUnitId];
  return unit?.isAlive && unit.position ? unit : null;
}

function compactPreview(layers: Array<BoardPreview | null | undefined>, labelKey?: string): BoardPreview | null {
  const present = layers.filter((layer): layer is BoardPreview => !!layer);
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];
  return {
    kind: "compound",
    layers: present,
    labelKey,
  };
}

function visibleTargetIdsInCells(
  view: PlayerView,
  cells: Coord[],
  predicate: (unit: UnitState) => boolean,
): string[] {
  const cellKeys = new Set(cells.map(coordKey));
  return visiblePositionedUnits(view)
    .filter((unit) => !!unit.position && cellKeys.has(coordKey(unit.position)) && predicate(unit))
    .map((unit) => unit.id);
}

function visibleAttackTargetIds(
  view: PlayerView,
  attackerId: string,
  allowFriendlyTarget = false,
): string[] {
  const attacker = view.units[attackerId];
  if (!attacker?.position) return [];
  const rangeCells = attackRangeCells(view, attackerId);
  return visibleTargetIdsInCells(
    view,
    rangeCells,
    (unit) =>
      unit.id !== attackerId &&
      (allowFriendlyTarget || unit.owner !== attacker.owner),
  );
}

function buildRadiusTargetPreview({
  view,
  source,
  radius,
  validPredicate,
  invalidPredicate,
  labelKey,
}: {
  view: PlayerView;
  source: UnitState;
  radius: number;
  validPredicate: (unit: UnitState) => boolean;
  invalidPredicate?: (unit: UnitState) => boolean;
  labelKey: string;
}): BoardPreview | null {
  if (!source.position) return null;
  const cells = cellsInRadius(boardSize(view), source.position, radius, true);
  const validTargets = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== source.id &&
      !!unit.position &&
      chebyshevDistance(source.position!, unit.position) <= radius &&
      validPredicate(unit),
  );
  const invalidTargets = invalidPredicate
    ? visibleUnitTargets(
        view,
        (unit) =>
          unit.id !== source.id &&
          !!unit.position &&
          chebyshevDistance(source.position!, unit.position) <= radius &&
          invalidPredicate(unit),
        true,
      )
    : undefined;
  return {
    kind: "radius",
    sourceCell: { ...source.position },
    cells,
    validTargets,
    invalidTargets,
    labelKey,
  };
}

export function buildArcherLinePreview({
  view,
  sourceUnitId,
  targetIds,
  labelKey,
}: {
  view: PlayerView;
  sourceUnitId: string;
  targetIds?: string[];
  labelKey: string;
}): BoardPreview | null {
  const source = sourceUnit(view, sourceUnitId);
  if (!source?.position) return null;
  const legalTargetIds =
    targetIds && targetIds.length > 0
      ? targetIds.filter((targetId) => !!view.units[targetId]?.position)
      : firstVisibleArcherTargets(view, sourceUnitId);
  const lineCells = archerLineCells(view, sourceUnitId);
  const legalSet = new Set(legalTargetIds);
  const invalidTargets = visibleUnitTargets(
    view,
    (unit) => unit.id !== sourceUnitId && !!unit.position && !legalSet.has(unit.id),
    true,
  );
  return {
    kind: "line",
    sourceCell: { ...source.position },
    lineCells,
    validTargets: targetRefsFromIds(view, legalTargetIds),
    invalidTargets,
    labelKey,
  };
}

function buildAreaPreview({
  view,
  source,
  radius,
  labelKey,
}: {
  view: PlayerView;
  source: UnitState;
  radius: number;
  labelKey: string;
}): BoardPreview | null {
  if (!source.position) return null;
  const areaCells = cellsInRadius(boardSize(view), source.position, radius, true);
  const areaKeys = new Set(areaCells.map(coordKey));
  const affectedTargets = visibleUnitTargets(
    view,
    (unit) => unit.id !== source.id && !!unit.position && areaKeys.has(coordKey(unit.position)),
  );
  return {
    kind: "area",
    sourceCell: { ...source.position },
    centerCell: { ...source.position },
    areaCells,
    affectedTargets,
    labelKey,
  };
}

function buildAttackPatternPreview({
  view,
  sourceUnitId,
  validTargetIds,
  labelKey,
  overrideClass,
  allowFriendlyTarget = false,
}: {
  view: PlayerView;
  sourceUnitId: string;
  validTargetIds?: string[];
  labelKey: string;
  overrideClass?: UnitState["class"];
  allowFriendlyTarget?: boolean;
}): BoardPreview | null {
  const source = sourceUnit(view, sourceUnitId);
  if (!source?.position) return null;
  const targetIds =
    validTargetIds && validTargetIds.length > 0
      ? validTargetIds
      : visibleAttackTargetIds(view, sourceUnitId, allowFriendlyTarget);
  const cells = attackRangeCells(view, sourceUnitId, overrideClass);
  const targetSet = new Set(targetIds);
  const rangeKeys = new Set(cells.map(coordKey));
  const invalidTargets = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== sourceUnitId &&
      !!unit.position &&
      rangeKeys.has(coordKey(unit.position)) &&
      !targetSet.has(unit.id),
    true,
  );
  return {
    kind: "multiStep",
    step: "attack",
    sourceCell: { ...source.position },
    cells,
    validTargets: targetRefsFromIds(view, targetIds),
    invalidTargets,
    cellKind: overrideClass === "archer" || source.class === "archer" ? "line" : "area",
    labelKey,
  };
}

function buildRiverBoatHover(view: PlayerView, river: UnitState): BoardPreview | null {
  if (!river.position) return null;
  const pickupCells = adjacentCells(boardSize(view), river.position);
  const pickupKeys = new Set(pickupCells.map(coordKey));
  const validTargets = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== river.id &&
      unit.owner === river.owner &&
      !!unit.position &&
      pickupKeys.has(coordKey(unit.position)),
  );
  return {
    kind: "pickupDrop",
    sourceCell: { ...river.position },
    pickupCells,
    validTargets,
    labelKey: "preview.labels.selectPassenger",
  };
}

function buildRiverTraLaLaHover(view: PlayerView, river: UnitState): BoardPreview | null {
  if (!river.position) return null;
  const targetCellsAroundRiver = adjacentCells(boardSize(view), river.position);
  const targetKeys = new Set(targetCellsAroundRiver.map(coordKey));
  const validTargets = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== river.id &&
      unit.owner !== river.owner &&
      !!unit.position &&
      targetKeys.has(coordKey(unit.position)),
  );
  const destinations = straightLineDestinations(view, river.position);
  const destinationLineCells = lineCellsToTargets(river.position, destinations);
  return compactPreview(
    [
      {
        kind: "pickupDrop",
        sourceCell: { ...river.position },
        pickupCells: targetCellsAroundRiver,
        validTargets,
        labelKey: "preview.labels.selectAdjacentTarget",
      },
      {
        kind: "movement",
        sourceCell: { ...river.position },
        reachableCells: destinations,
        pathCells: destinationLineCells,
        labelKey: "preview.labels.selectStraightDestination",
      },
    ],
    "preview.labels.tralala",
  );
}

function buildLokiHover(view: PlayerView, loki: UnitState): BoardPreview | null {
  if (!loki.position) return null;
  const areaCells = cellsInRadius(boardSize(view), loki.position, LOKI_RADIUS, true);
  const areaKeys = new Set(areaCells.map(coordKey));
  const enemiesInRange = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== loki.id &&
      unit.owner !== loki.owner &&
      !!unit.position &&
      areaKeys.has(coordKey(unit.position)),
  );
  const mindControlCandidates = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== loki.id &&
      unit.owner !== loki.owner &&
      !!unit.position &&
      areaKeys.has(coordKey(unit.position)) &&
      visibleAttackTargetIds(view, unit.id, true).length > 0,
  );
  const affectedTargets = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== loki.id &&
      !!unit.position &&
      areaKeys.has(coordKey(unit.position)),
  );

  return compactPreview(
    [
      {
        kind: "area",
        sourceCell: { ...loki.position },
        centerCell: { ...loki.position },
        areaCells,
        affectedTargets,
        labelKey: "preview.labels.goodLokiJoke",
      },
      {
        kind: "radius",
        sourceCell: { ...loki.position },
        cells: areaCells,
        validTargets: mindControlCandidates.length > 0 ? mindControlCandidates : enemiesInRange,
        invalidTargets:
          mindControlCandidates.length > 0
            ? enemiesInRange.filter(
                (target) =>
                  !mindControlCandidates.some((valid) => valid.unitId === target.unitId),
              ).map((target) => ({ ...target, disabled: true }))
            : undefined,
        labelKey: "preview.labels.selectControlledUnit",
      },
    ],
    "preview.labels.lokiOptions",
  );
}

function buildGutsBerserkHover(view: PlayerView, guts: UnitState): BoardPreview | null {
  if (!guts.position) return null;
  return compactPreview(
    [
      buildAttackPatternPreview({
        view,
        sourceUnitId: guts.id,
        validTargetIds: visibleAttackTargetIds(view, guts.id),
        overrideClass: "spearman",
        labelKey: "preview.labels.berserkSingleTarget",
      }),
      buildAreaPreview({
        view,
        source: guts,
        radius: GUTS_BERSERK_AOE_RADIUS,
        labelKey: "preview.labels.berserkArea",
      }),
    ],
    "preview.labels.berserkAttackMode",
  );
}

function buildGroznyHover(view: PlayerView, grozny: UnitState): BoardPreview | null {
  if (!grozny.position) return null;
  const cells = openCells(view);
  return {
    kind: "movement",
    sourceCell: { ...grozny.position },
    reachableCells: cells,
    labelKey: "preview.labels.tyrantAttackCell",
  };
}

function allVisibleEnemyIds(view: PlayerView, source: UnitState): string[] {
  return visiblePositionedUnits(view)
    .filter((unit) => unit.id !== source.id && unit.owner !== source.owner)
    .map((unit) => unit.id);
}

function uniqueCells(cells: Coord[]): Coord[] {
  const byKey = new Map<string, Coord>();
  for (const cell of cells) byKey.set(coordKey(cell), cell);
  return [...byKey.values()];
}

export function buildAbilityPreview({
  gameView,
  sourceUnitId,
  abilityId,
}: BuildAbilityPreviewArgs): BoardPreview | null {
  if (!gameView || !abilityId) return null;
  const source = sourceUnit(gameView, sourceUnitId);
  if (!source?.position) return null;

  switch (abilityId) {
    case CHIKATILO_ASSASSIN_MARK_ID: {
      const range = getProjectedAbilityTargetRange(gameView, source.id, abilityId);
      if (range === null) return null;
      return buildRadiusTargetPreview({
        view: gameView,
        source,
        radius: range,
        validPredicate: (unit) => unit.id !== source.id,
        labelKey: "preview.labels.selectAssassinMarkTarget",
      });
    }
    case LECHY_GUIDE_TRAVELER_ID:
      return buildRadiusTargetPreview({
        view: gameView,
        source,
        radius: GUIDE_TRAVELER_RADIUS,
        validPredicate: (unit) => unit.owner === source.owner,
        invalidPredicate: (unit) => unit.owner !== source.owner,
        labelKey: "preview.labels.selectAlly",
      });
    case ASGORE_FIREBALL_ID:
      return buildArcherLinePreview({
        view: gameView,
        sourceUnitId: source.id,
        labelKey: "preview.labels.archerLine",
      });
    case ASGORE_FIRE_PARADE_ID:
    case TRICKSTER_AOE_ID:
      return buildAreaPreview({
        view: gameView,
        source,
        radius: FIRE_PARADE_RADIUS,
        labelKey:
          abilityId === ASGORE_FIRE_PARADE_ID
            ? "preview.labels.fireParadeArea"
            : "preview.labels.affectedArea",
      });
    case EL_CID_KOLADA_ID:
      return buildAreaPreview({
        view: gameView,
        source,
        radius: EL_CID_KOLADA_RADIUS,
        labelKey: "preview.labels.koladaArea",
      });
    case GUTS_ARBALET_ID:
      return buildArcherLinePreview({
        view: gameView,
        sourceUnitId: source.id,
        labelKey: "preview.labels.handCrossbowLine",
      });
    case GUTS_CANNON_ID:
      return buildArcherLinePreview({
        view: gameView,
        sourceUnitId: source.id,
        labelKey: "preview.labels.handCannonLine",
      });
    case GUTS_BERSERK_MODE_ID:
      return buildGutsBerserkHover(gameView, source);
    case JEBE_KHANS_SHOOTER_ID:
      return buildArcherLinePreview({
        view: gameView,
        sourceUnitId: source.id,
        targetIds: gameView.legal?.attackTargetsByUnitId[source.id],
        labelKey: "preview.labels.khansShooterFirstTarget",
      });
    case HASSAN_TRUE_ENEMY_ID: {
      const candidates = visibleUnitTargets(
        gameView,
        (unit) =>
          unit.owner !== source.owner &&
          !!unit.position &&
          chebyshevDistance(source.position!, unit.position) <= 2 &&
          visibleAttackTargetIds(gameView, unit.id, true).length > 0,
      );
      const radiusCells = cellsInRadius(boardSize(gameView), source.position, 2, true);
      return {
        kind: "radius",
        sourceCell: { ...source.position },
        cells: radiusCells,
        validTargets: candidates,
        invalidTargets: visibleUnitTargets(
          gameView,
          (unit) =>
            unit.owner !== source.owner &&
            !!unit.position &&
            chebyshevDistance(source.position!, unit.position) <= 2 &&
            !candidates.some((candidate) => candidate.unitId === unit.id),
          true,
        ),
        labelKey: "preview.labels.selectControlledUnit",
      };
    }
    case LOKI_LAUGHT_ID:
      return buildLokiHover(gameView, source);
    case RIVER_PERSON_BOAT_ID:
      return buildRiverBoatHover(gameView, source);
    case RIVER_PERSON_BOATMAN_ID:
      return null;
    case RIVER_PERSON_TRA_LA_LA_ID:
      return buildRiverTraLaLaHover(gameView, source);
    case GENGHIS_KHAN_KHANS_DECREE_ID: {
      return {
        kind: "movement",
        sourceCell: { ...source.position },
        reachableCells: diagonalDestinations(gameView, source.position),
        labelKey: "preview.labels.diagonalDestinations",
      };
    }
    case GROZNY_TYRANT_ID:
    case GROZNY_INVADE_TIME_ID:
      return buildGroznyHover(gameView, source);
    case DUOLINGO_PUSH_NOTIFICATION_ID: {
      const targets = visibleUnitTargets(
        gameView,
        (unit) => unit.owner !== source.owner && unit.id !== source.id,
      );
      const destinations = uniqueCells(
        targets.flatMap((target) =>
          cellsInRadius(boardSize(gameView), target.cell, 2, false),
        ),
      ).filter((cell) => openCells(gameView).some((open) => coordKey(open) === coordKey(cell)));
      return compactPreview([
        {
          kind: "radius",
          sourceCell: { ...source.position },
          cells: [],
          validTargets: targets,
          labelKey: "preview.labels.selectTarget",
        },
        {
          kind: "movement",
          sourceCell: { ...source.position },
          reachableCells: destinations,
          labelKey: "preview.labels.selectDestination",
        },
      ]);
    }
    case LUCHE_DIVINE_RAY_ID:
      return {
        kind: "line",
        sourceCell: { ...source.position },
        lineCells: archerLineCells(gameView, source.id),
        affectedTargets: visibleUnitTargets(
          gameView,
          (unit) => unit.id !== source.id && unit.owner !== source.owner,
        ),
        labelKey: "preview.labels.archerLine",
      };
    case LUCHE_BURNING_SUN_ID:
    case ZORO_ASURA_ID:
      return buildAreaPreview({
        view: gameView,
        source,
        radius: 2,
        labelKey: "preview.labels.affectedArea",
      });
    case KANEKI_REGENERATION_ID:
      return {
        kind: "area",
        sourceCell: { ...source.position },
        centerCell: { ...source.position },
        areaCells: [{ ...source.position }],
        labelKey: "preview.labels.affectedArea",
      };
    case ZORO_ONI_GIRI_ID:
    case DON_WINDMILLS_ID: {
      const targetIds = allVisibleEnemyIds(gameView, source).filter((id) => {
        const target = gameView.units[id];
        if (!target?.position) return false;
        const dx = Math.abs(target.position.col - source.position!.col);
        const dy = Math.abs(target.position.row - source.position!.row);
        return dx === 0 || dy === 0 || dx === dy;
      });
      return {
        kind: "line",
        sourceCell: { ...source.position },
        lineCells: lineCellsToTargets(source.position, cellsFromTargetIds(gameView, targetIds)),
        validTargets: targetRefsFromIds(gameView, targetIds),
        labelKey: "preview.labels.selectTarget",
      };
    }
    case DON_SORROWFUL_ID:
      return {
        kind: "movement",
        sourceCell: { ...source.position },
        reachableCells: adjacentCells(boardSize(gameView), source.position).filter((cell) =>
          openCells(gameView).some((open) => coordKey(open) === coordKey(cell)),
        ),
        labelKey: "preview.labels.selectDestination",
      };
    case JACK_SNARES_ID:
      return {
        kind: "movement",
        sourceCell: { ...source.position },
        reachableCells: cellsInRadius(boardSize(gameView), source.position, boardSize(gameView), true),
        labelKey: "preview.labels.selectDestination",
      };
    case JACK_HOLY_MOTHER_ID: {
      const trapKeys = new Set(
        (gameView.jackTraps ?? [])
          .filter((trap) => trap.sourceUnitId === source.id)
          .map((trap) => coordKey(trap.position)),
      );
      const targetIds = allVisibleEnemyIds(gameView, source).filter((id) => {
        const position = gameView.units[id]?.position;
        return !!position && trapKeys.has(coordKey(position));
      });
      return {
        kind: "area",
        sourceCell: { ...source.position },
        areaCells: [...(gameView.jackTraps ?? [])]
          .filter((trap) => trap.sourceUnitId === source.id)
          .map((trap) => trap.position),
        validTargets: targetRefsFromIds(gameView, targetIds),
        labelKey: "preview.labels.selectTarget",
      };
    }
    case ARTEMIS_MOON_INSIGHT_ID: {
      const lineCells = archerLineCells(gameView, source.id);
      return compactPreview([
        {
          kind: "line",
          sourceCell: { ...source.position },
          lineCells,
          labelKey: "preview.labels.archerLine",
        },
        {
          kind: "area",
          sourceCell: { ...source.position },
          areaCells: uniqueCells(
            lineCells.flatMap((cell) => cellsInRadius(boardSize(gameView), cell, 1, true)),
          ),
          labelKey: "preview.labels.affectedArea",
        },
      ]);
    }
    case ARTEMIS_SILVER_SICKLE_ID: {
      const lineCells = archerLineCells(gameView, source.id);
      const affectedCells = uniqueCells(
        lineCells.flatMap((cell) => cellsInRadius(boardSize(gameView), cell, 1, true)),
      );
      return {
        kind: "area",
        sourceCell: { ...source.position },
        areaCells: affectedCells,
        affectedTargets: visibleUnitTargets(
          gameView,
          (unit) => !!unit.position && affectedCells.some((cell) => coordKey(cell) === coordKey(unit.position!)),
        ),
        labelKey: "preview.labels.affectedArea",
      };
    }
    default:
      return null;
  }
}

export function buildForcedAttackPreview({
  gameView,
  attackerId,
  optionIds,
  labelKey,
}: {
  gameView: PlayerView;
  attackerId: string;
  optionIds: string[];
  labelKey: string;
}): BoardPreview | null {
  const attacker = sourceUnit(gameView, attackerId);
  if (!attacker?.position) return null;
  const cells = attackRangeCells(gameView, attackerId);
  const lineTargets = targetCells(targetRefsFromIds(gameView, optionIds));
  const pathCells = lineCellsToTargets(attacker.position, lineTargets);
  return {
    kind: "multiStep",
    step: "forcedAttack",
    sourceCell: { ...attacker.position },
    cells: pathCells.length > 0 ? pathCells : cells,
    validTargets: targetRefsFromIds(gameView, optionIds),
    cellKind: attacker.class === "archer" ? "line" : "area",
    labelKey,
  };
}

export function buildGutsBerserkChoicePreview({
  gameView,
  gutsId,
  singleTargetOptions,
  aoeTargetIds,
}: {
  gameView: PlayerView;
  gutsId: string;
  singleTargetOptions: string[];
  aoeTargetIds: string[];
}): BoardPreview | null {
  const guts = sourceUnit(gameView, gutsId);
  if (!guts?.position) return null;
  return compactPreview(
    [
      buildAttackPatternPreview({
        view: gameView,
        sourceUnitId: guts.id,
        validTargetIds: singleTargetOptions,
        overrideClass: "spearman",
        labelKey: "preview.labels.berserkSingleTarget",
      }),
      {
        kind: "area",
        sourceCell: { ...guts.position },
        centerCell: { ...guts.position },
        areaCells: cellsInRadius(boardSize(gameView), guts.position, GUTS_BERSERK_AOE_RADIUS, true),
        affectedTargets: targetRefsFromIds(gameView, aoeTargetIds),
        labelKey: "preview.labels.berserkArea",
      },
    ],
    "preview.labels.berserkAttackMode",
  );
}

export function buildLineFromOptionsPreview({
  gameView,
  sourceUnitId,
  optionIds,
  labelKey,
}: {
  gameView: PlayerView;
  sourceUnitId: string;
  optionIds: string[];
  labelKey: string;
}): BoardPreview | null {
  const source = sourceUnit(gameView, sourceUnitId);
  if (!source?.position) return null;
  const optionCells = cellsFromTargetIds(gameView, optionIds);
  return {
    kind: "line",
    sourceCell: { ...source.position },
    lineCells: lineCellsToTargets(source.position, optionCells),
    validTargets: targetRefsFromIds(gameView, optionIds),
    labelKey,
  };
}

export function targetIdsFromRefs(refs: TargetRef[]): string[] {
  return refs.map((ref) => ref.unitId);
}
