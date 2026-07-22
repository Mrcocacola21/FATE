import type { Coord, PendingMove, PlayerView, UnitState } from "rules";
import { getMongolChargeInfluenceCells } from "../../../../rules/src/movement/mongolCharge";
import { ARTEMIS_MOON_INSIGHT_ID, JACK_SNARES_ID } from "../../rulesHints";
import type { BoardPreview, TargetRef } from "./previewTypes";
import { getDonMadnessRayCells } from "./donMadnessDirection";
import {
  buildArcherLinePreview,
  buildForcedAttackPreview,
  buildGutsBerserkChoicePreview,
  buildLineFromOptionsPreview,
} from "./buildAbilityPreview";
import {
  adjacentCells,
  boardSize,
  cellsInRadius,
  chebyshevDistance,
  coordKey,
  linePath,
  lineCellsToTargets,
  visiblePositionedUnits,
} from "./previewGeometry";
import { targetRefsFromIds, visibleUnitTargets } from "./previewVisibility";

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function isCoord(value: unknown): value is Coord {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { col?: unknown }).col === "number" &&
    typeof (value as { row?: unknown }).row === "number"
  );
}

function coordList(value: unknown): Coord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isCoord).map((coord) => ({ col: coord.col, row: coord.row }));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniqueCoords(coords: Coord[]): Coord[] {
  const seen = new Set<string>();
  const result: Coord[] = [];
  for (const coord of coords) {
    const key = coordKey(coord);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(coord);
  }
  return result;
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
  return { kind: "compound", layers: present, labelKey };
}

function buildRadiusOptionsPreview({
  view,
  sourceUnitId,
  optionIds,
  radius,
  validLabelKey,
  includeEnemiesOnly = false,
}: {
  view: PlayerView;
  sourceUnitId: string;
  optionIds: string[];
  radius: number;
  validLabelKey: string;
  includeEnemiesOnly?: boolean;
}): BoardPreview | null {
  const source = sourceUnit(view, sourceUnitId);
  if (!source?.position) return null;
  const optionSet = new Set(optionIds);
  const cells = cellsInRadius(boardSize(view), source.position, radius, true);
  const invalidTargets = visibleUnitTargets(
    view,
    (unit) =>
      unit.id !== source.id &&
      !!unit.position &&
      chebyshevDistance(source.position!, unit.position) <= radius &&
      !optionSet.has(unit.id) &&
      (!includeEnemiesOnly || unit.owner !== source.owner),
    true,
  );
  return {
    kind: "radius",
    sourceCell: { ...source.position },
    cells,
    validTargets: targetRefsFromIds(view, optionIds),
    invalidTargets,
    labelKey: validLabelKey,
  };
}

export function buildMovementPreview({
  view,
  pendingMove,
  labelKey,
  targetingCell,
}: {
  view: PlayerView;
  pendingMove: Pick<PendingMove, "unitId" | "legalTo" | "mode">;
  labelKey?: string;
  targetingCell?: Coord | null;
}): BoardPreview | null {
  const unit = sourceUnit(view, pendingMove.unitId);
  if (!unit?.position) return null;
  const isMongolCharge = unit.genghisKhanMongolChargeActive === true;
  const hoveredDestination =
    targetingCell &&
    pendingMove.legalTo.some(
      (coord) => coord.col === targetingCell.col && coord.row === targetingCell.row,
    )
      ? targetingCell
      : null;
  const previewDestinations = hoveredDestination
    ? [hoveredDestination]
    : pendingMove.legalTo;
  const pathCells =
    pendingMove.mode === "rider" ||
    unit.class === "rider" ||
    unit.genghisKhanDiagonalMoveActive ||
    unit.genghisKhanDecreeMovePending
      ? lineCellsToTargets(unit.position, previewDestinations)
      : undefined;
  const movement: BoardPreview = {
    kind: "movement",
    sourceCell: { ...unit.position },
    reachableCells: pendingMove.legalTo.map((coord) => ({ ...coord })),
    pathCells,
    labelKey:
      labelKey ??
      (isMongolCharge
        ? "preview.labels.mongolChargePath"
        : unit.genghisKhanDiagonalMoveActive || unit.genghisKhanDecreeMovePending
        ? "preview.labels.diagonalDestinations"
        : "preview.labels.selectDestination"),
  };

  if (!isMongolCharge) return movement;

  const influenceCells = uniqueCoords(
    previewDestinations.flatMap((destination) => {
      const path = linePath(unit.position!, destination);
      return path
        ? getMongolChargeInfluenceCells(path, boardSize(view))
        : [];
    }),
  );
  const influenceKeys = new Set(influenceCells.map(coordKey));
  const affectedAllies = visiblePositionedUnits(view).filter(
    (candidate) =>
      candidate.id !== unit.id &&
      candidate.owner === unit.owner &&
      !!candidate.position &&
      !candidate.turn.attackUsed &&
      !candidate.turn.actionUsed &&
      influenceKeys.has(coordKey(candidate.position)),
  );
  const possibleTargetIds = uniqueStrings(
    affectedAllies.flatMap(
      (ally) => view.legal?.attackTargetsByUnitId[ally.id] ?? [],
    ),
  );

  return compactPreview(
    [
      {
        kind: "area",
        sourceCell: { ...unit.position },
        areaCells: influenceCells,
        affectedTargets: targetRefsFromIds(
          view,
          affectedAllies.map((ally) => ally.id),
        ),
        labelKey: "preview.labels.mongolChargeInfluence",
      },
      movement,
      possibleTargetIds.length > 0
        ? {
            kind: "multiStep",
            step: "mongolChargeAllyTargets",
            sourceCell: { ...unit.position },
            cells: [],
            validTargets: targetRefsFromIds(view, possibleTargetIds),
            labelKey: "preview.labels.mongolChargeTargets",
          }
        : null,
    ],
    "preview.labels.mongolChargeInfluence",
  );
}

function buildPickupPreview({
  view,
  sourceUnitId,
  optionIds,
  labelKey,
}: {
  view: PlayerView;
  sourceUnitId: string;
  optionIds: string[];
  labelKey: string;
}): BoardPreview | null {
  const source = sourceUnit(view, sourceUnitId);
  if (!source?.position) return null;
  return {
    kind: "pickupDrop",
    sourceCell: { ...source.position },
    pickupCells: adjacentCells(boardSize(view), source.position),
    validTargets: targetRefsFromIds(view, optionIds),
    labelKey,
  };
}

function buildDropPreview({
  view,
  sourceUnitId,
  sourceCell,
  dropCells,
  labelKey,
}: {
  view: PlayerView;
  sourceUnitId: string;
  sourceCell?: Coord;
  dropCells: Coord[];
  labelKey: string;
}): BoardPreview | null {
  const source = sourceUnit(view, sourceUnitId);
  return {
    kind: "pickupDrop",
    sourceCell: sourceCell
      ? { ...sourceCell }
      : source?.position
      ? { ...source.position }
      : undefined,
    dropCells,
    labelKey,
  };
}

function buildPendingAoEPreview(view: PlayerView): BoardPreview | null {
  const preview = view.pendingAoEPreview;
  if (!preview) return null;
  const source = sourceUnit(view, preview.casterId);
  const areaCells = cellsInRadius(boardSize(view), preview.center, preview.radius, true);
  const areaKeys = new Set(areaCells.map(coordKey));
  return {
    kind: "area",
    sourceCell: source?.position ? { ...source.position } : undefined,
    centerCell: { ...preview.center },
    areaCells,
    affectedTargets: visibleUnitTargets(
      view,
      (unit) => !!unit.position && areaKeys.has(coordKey(unit.position)),
    ),
    labelKey:
      preview.abilityId === "asgoreFireParade"
        ? "preview.labels.fireParadeArea"
        : "preview.labels.affectedArea",
  };
}

function touchedAlliesAlongLines(
  view: PlayerView,
  source: UnitState,
  destinations: Coord[],
): TargetRef[] {
  if (!source.position) return [];
  const touched = new Map<string, TargetRef>();
  for (const unit of visiblePositionedUnits(view)) {
    if (unit.id === source.id || unit.owner !== source.owner || !unit.position) continue;
    for (const destination of destinations) {
      const lineCells = lineCellsToTargets(source.position, [destination], true);
      if (lineCells.some((cell) => chebyshevDistance(cell, unit.position!) <= 1)) {
        const ref: TargetRef = {
          type: "unit",
          unitId: unit.id,
          cell: { ...unit.position },
        };
        touched.set(unit.id, ref);
        break;
      }
    }
  }
  return Array.from(touched.values());
}

function buildTraLaLaDestinationPreview({
  view,
  riverId,
  destinations,
}: {
  view: PlayerView;
  riverId: string;
  destinations: Coord[];
}): BoardPreview | null {
  const river = sourceUnit(view, riverId);
  if (!river?.position) return null;
  return {
    kind: "multiStep",
    step: "riverTraLaLaDestination",
    sourceCell: { ...river.position },
    cells: lineCellsToTargets(river.position, destinations),
    affectedTargets: touchedAlliesAlongLines(view, river, destinations),
    validTargets: [],
    cellKind: "validMove",
    labelKey: "preview.labels.selectStraightDestination",
  };
}

function buildLokiChoicePreview(view: PlayerView, context: Record<string, unknown>): BoardPreview | null {
  const lokiId = typeof context.lokiId === "string" ? context.lokiId : "";
  const loki = sourceUnit(view, lokiId);
  if (!loki?.position) return null;
  const chickenOptions = stringList(context.chickenOptions);
  const mindControlEnemyOptions = stringList(context.mindControlEnemyOptions);
  const spinCandidateIds = stringList(context.spinCandidateIds);
  const areaCells = cellsInRadius(boardSize(view), loki.position, 2, true);
  const areaKeys = new Set(areaCells.map(coordKey));
  return compactPreview(
    [
      {
        kind: "area",
        sourceCell: { ...loki.position },
        centerCell: { ...loki.position },
        areaCells,
        affectedTargets: visibleUnitTargets(
          view,
          (unit) =>
            unit.id !== loki.id &&
            !!unit.position &&
            areaKeys.has(coordKey(unit.position)),
        ),
        labelKey: "preview.labels.goodLokiJoke",
      },
      {
        kind: "radius",
        sourceCell: { ...loki.position },
        cells: areaCells,
        validTargets: targetRefsFromIds(view, [
          ...new Set([...chickenOptions, ...mindControlEnemyOptions, ...spinCandidateIds]),
        ]),
        labelKey: "preview.labels.lokiOptions",
      },
    ],
    "preview.labels.lokiOptions",
  );
}

function buildGroznyAllyPreview(view: PlayerView, context: Record<string, unknown>): BoardPreview | null {
  const optionIds = stringList(context.options);
  const targets = targetRefsFromIds(view, optionIds);
  if (targets.length === 0) return null;
  const groznyId = typeof context.groznyId === "string" ? context.groznyId : "";
  const source = sourceUnit(view, groznyId);
  return {
    kind: "multiStep",
    step: "groznyTyrantAlly",
    sourceCell: source?.position ? { ...source.position } : undefined,
    cells: targets.map((target) => ({ ...target.cell })),
    validTargets: targets,
    cellKind: "validTarget",
    labelKey: "preview.labels.tyrantAlly",
  };
}

function buildGroznyOptionsPreview(view: PlayerView, context: Record<string, unknown>): BoardPreview | null {
  const options = Array.isArray(context.options) ? context.options : [];
  const cells: Coord[] = [];
  const targetIds: string[] = [];
  const selectedTargetId = typeof context.targetId === "string" ? context.targetId : null;
  for (const option of options) {
    if (!option || typeof option !== "object") continue;
    const targetId = (option as { targetId?: unknown }).targetId;
    const position = (option as { position?: unknown }).position;
    if (typeof targetId === "string") {
      targetIds.push(targetId);
    }
    if (isCoord(position)) {
      cells.push({ col: position.col, row: position.row });
    }
  }
  const groznyId = typeof context.groznyId === "string" ? context.groznyId : "";
  const source = sourceUnit(view, groznyId);
  return {
    kind: "multiStep",
    step: "groznyTyrantAttackCell",
    sourceCell: source?.position ? { ...source.position } : undefined,
    cells: uniqueCoords(cells),
    validTargets: targetRefsFromIds(
      view,
      selectedTargetId ? [selectedTargetId] : uniqueStrings(targetIds),
    ),
    cellKind: "validMove",
    labelKey: "preview.labels.tyrantAttackCell",
  };
}

export function buildPendingPreview(
  view: PlayerView | null | undefined,
  targetingCell?: Coord | null,
): BoardPreview | null {
  if (!view) return null;
  const pending = view.pendingRoll;
  if (pending) {
    const context = (pending.context ?? {}) as Record<string, unknown>;
    switch (pending.kind) {
      case "papyrusBoneChoice": {
        const papyrusId =
          typeof context.papyrusUnitId === "string" ? context.papyrusUnitId : "";
        const targetId =
          typeof context.targetUnitId === "string" ? context.targetUnitId : "";
        const source = sourceUnit(view, papyrusId);
        const targets = targetRefsFromIds(view, targetId ? [targetId] : []);
        if (targets.length === 0) return null;
        return {
          kind: "multiStep",
          step: "papyrusBoneChoice",
          sourceCell: source?.position ? { ...source.position } : undefined,
          cells: targets.map((target) => ({ ...target.cell })),
          affectedTargets: targets,
          cellKind: "affected",
          labelKey: "preview.labels.papyrusBoneTarget",
        };
      }
      case "donMadDelusionDirection": {
        if (!isCoord(context.origin)) return null;
        const origin = { col: context.origin.col, row: context.origin.row };
        return {
          kind: "line",
          sourceCell: origin,
          lineCells: getDonMadnessRayCells(context, boardSize(view)),
          labelKey: "preview.labels.donMadnessDirection",
        };
      }
      case "chargedImpulseTargetChoice": {
        if (
          context.abilityId === JACK_SNARES_ID &&
          context.step === "coveringTracks"
        ) {
          const jackId = typeof context.unitId === "string" ? context.unitId : "";
          const jack = sourceUnit(view, jackId);
          const options = coordList(context.options);
          const optionKeys = new Set(options.map(coordKey));
          const selectedCenter = targetingCell && optionKeys.has(coordKey(targetingCell))
            ? targetingCell
            : null;
          const affectedIds = selectedCenter
            ? Object.values(view.units)
                .filter(
                  (unit) =>
                    unit.isAlive &&
                    !!unit.position &&
                    chebyshevDistance(selectedCenter, unit.position) <= 1,
                )
                .map((unit) => unit.id)
            : [];
          return compactPreview([
            {
              kind: "multiStep",
              step: "coveringTracks",
              sourceCell: jack?.position ? { ...jack.position } : undefined,
              cells: options,
              cellKind: "validTarget",
              labelKey: "preview.labels.affectedArea",
            },
            selectedCenter
              ? {
                  kind: "area",
                  centerCell: { ...selectedCenter },
                  areaCells: cellsInRadius(boardSize(view), selectedCenter, 1, true),
                  affectedTargets: targetRefsFromIds(view, affectedIds),
                  labelKey: "preview.labels.affectedArea",
                }
              : null,
          ]);
        }
        if (context.abilityId !== ARTEMIS_MOON_INSIGHT_ID) return null;
        const artemidaId = typeof context.unitId === "string" ? context.unitId : "";
        const artemida = sourceUnit(view, artemidaId);
        if (!artemida?.position) return null;
        const options = coordList(context.options);
        const optionKeys = new Set(options.map(coordKey));
        const selectedCenter = targetingCell && optionKeys.has(coordKey(targetingCell))
          ? targetingCell
          : null;
        return compactPreview([
          {
            kind: "line",
            sourceCell: { ...artemida.position },
            lineCells: options,
            labelKey: "preview.labels.archerLine",
          },
          selectedCenter ? {
            kind: "area",
            sourceCell: { ...artemida.position },
            centerCell: { ...selectedCenter },
            areaCells: cellsInRadius(boardSize(view), selectedCenter, 1, true),
            labelKey: "preview.labels.affectedArea",
          } : null,
        ]);
      }
      case "jebeKhansShooterTargetChoice": {
        const casterId = typeof context.casterId === "string" ? context.casterId : "";
        const selectedTargetIds = stringList(context.selectedTargetIds);
        const preview = buildLineFromOptionsPreview({
          gameView: view,
          sourceUnitId: casterId,
          optionIds: stringList(context.options),
          labelKey: "preview.labels.selectNextRicochetTarget",
        });
        if (!preview || preview.kind !== "line") return preview;
        return {
          ...preview,
          affectedTargets: targetRefsFromIds(view, selectedTargetIds),
        };
      }
      case "hassanTrueEnemyTargetChoice":
        return buildForcedAttackPreview({
          gameView: view,
          attackerId: typeof context.forcedAttackerId === "string" ? context.forcedAttackerId : "",
          optionIds: stringList(context.options),
          labelKey: "preview.labels.selectControlledAttackTarget",
        });
      case "mongolChargeAllyAttackTarget":
        return buildForcedAttackPreview({
          gameView: view,
          attackerId:
            typeof context.sourceUnitId === "string" ? context.sourceUnitId : "",
          optionIds: stringList(context.legalTargetIds ?? context.options),
          labelKey: "preview.labels.mongolChargeChooseTarget",
        });
      case "lokiMindControlTargetChoice":
        return buildForcedAttackPreview({
          gameView: view,
          attackerId: typeof context.controlledUnitId === "string" ? context.controlledUnitId : "",
          optionIds: stringList(context.options),
          labelKey: "preview.labels.selectControlledAttackTarget",
        });
      case "lokiMindControlEnemyChoice":
        {
          const lokiId = typeof context.lokiId === "string" ? context.lokiId : "";
          const source = sourceUnit(view, lokiId);
          const targets = targetRefsFromIds(view, stringList(context.options));
          return {
            kind: "multiStep",
            step: "lokiMindCaptureUnit",
            sourceCell: source?.position ? { ...source.position } : undefined,
            cells: targets.map((target) => ({ ...target.cell })),
            validTargets: targets,
            cellKind: "validTarget",
            labelKey: "preview.labels.selectControlledUnit",
          };
        }
      case "lokiChickenTargetChoice":
        return buildRadiusOptionsPreview({
          view,
          sourceUnitId: typeof context.lokiId === "string" ? context.lokiId : "",
          optionIds: stringList(context.options),
          radius: 2,
          validLabelKey: "preview.labels.selectTarget",
          includeEnemiesOnly: true,
        });
      case "lokiLaughtChoice":
        return buildLokiChoicePreview(view, context);
      case "gutsBerserkAttackChoice":
        return buildGutsBerserkChoicePreview({
          gameView: view,
          gutsId: typeof context.gutsId === "string" ? context.gutsId : "",
          singleTargetOptions: stringList(context.singleTargetOptions),
          aoeTargetIds: stringList(context.aoeTargetIds),
        });
      case "friskPacifismHugsTargetChoice":
        return buildRadiusOptionsPreview({
          view,
          sourceUnitId: typeof context.friskId === "string" ? context.friskId : "",
          optionIds: stringList(context.options),
          radius: 2,
          validLabelKey: "preview.labels.friskHugsTarget",
        });
      case "friskWarmWordsTargetChoice":
        return buildRadiusOptionsPreview({
          view,
          sourceUnitId: typeof context.friskId === "string" ? context.friskId : "",
          optionIds: stringList(context.options),
          radius: 2,
          validLabelKey: "preview.labels.friskWarmWordsTarget",
        });
      case "friskPrecisionStrikeTargetChoice":
        return buildRadiusOptionsPreview({
          view,
          sourceUnitId: typeof context.friskId === "string" ? context.friskId : "",
          optionIds: stringList(context.options),
          radius: 1,
          validLabelKey: "preview.labels.friskPrecisionStrikeTarget",
          includeEnemiesOnly: true,
        });
      case "asgoreSoulParadeJusticeTargetChoice":
        return buildArcherLinePreview({
          view,
          sourceUnitId: typeof context.asgoreId === "string" ? context.asgoreId : "",
          targetIds: stringList(context.options),
          labelKey: "preview.labels.asgoreJusticeTarget",
        });
      case "asgoreSoulParadePatienceTargetChoice":
      case "asgoreSoulParadePerseveranceTargetChoice":
        return buildRadiusOptionsPreview({
          view,
          sourceUnitId: typeof context.asgoreId === "string" ? context.asgoreId : "",
          optionIds: stringList(context.options),
          radius: 2,
          validLabelKey: "preview.labels.selectTarget",
          includeEnemiesOnly: true,
        });
      case "asgoreSoulParadeIntegrityDestination":
        return buildDropPreview({
          view,
          sourceUnitId: typeof context.asgoreId === "string" ? context.asgoreId : "",
          dropCells: coordList(context.options),
          labelKey: "preview.labels.selectDestination",
        });
      case "riverBoatCarryChoice":
        return buildPickupPreview({
          view,
          sourceUnitId: typeof context.riverId === "string" ? context.riverId : "",
          optionIds: stringList(context.options),
          labelKey: "preview.labels.selectPassenger",
        });
      case "riverBoatDestinationChoice":
        return buildMovementPreview({
          view,
          pendingMove: {
            unitId: typeof context.riverId === "string" ? context.riverId : "",
            legalTo: coordList(context.options),
            mode: "rider",
          },
          labelKey: "preview.labels.selectDestination",
        });
      case "riverBoatDropDestination":
        return buildDropPreview({
          view,
          sourceUnitId: typeof context.riverId === "string" ? context.riverId : "",
          sourceCell: isCoord(context.riverDestination)
            ? {
                col: context.riverDestination.col,
                row: context.riverDestination.row,
              }
            : undefined,
          dropCells: coordList(context.options),
          labelKey: "preview.labels.selectDropCell",
        });
      case "riverTraLaLaTargetChoice":
        return buildPickupPreview({
          view,
          sourceUnitId: typeof context.riverId === "string" ? context.riverId : "",
          optionIds: stringList(context.options),
          labelKey: "preview.labels.selectAdjacentTarget",
        });
      case "riverTraLaLaDestinationChoice":
        return buildTraLaLaDestinationPreview({
          view,
          riverId: typeof context.riverId === "string" ? context.riverId : "",
          destinations: coordList(context.options),
        });
      case "riverTraLaLaDropDestinationChoice":
        return buildDropPreview({
          view,
          sourceUnitId: typeof context.riverId === "string" ? context.riverId : "",
          sourceCell: isCoord(context.riverDestination)
            ? {
                col: context.riverDestination.col,
                row: context.riverDestination.row,
              }
            : undefined,
          dropCells: coordList(context.options),
          labelKey: "preview.labels.selectDropCell",
        });
      case "groznyTyrantOptionChoice":
        return null;
      case "groznyTyrantAllyChoice":
        return buildGroznyAllyPreview(view, context);
      case "groznyTyrantAttackCellChoice":
        return buildGroznyOptionsPreview(view, context);
      case "lechyGuideTravelerPlacement":
        return buildDropPreview({
          view,
          sourceUnitId: typeof context.lechyId === "string" ? context.lechyId : "",
          dropCells: coordList(context.legalPositions ?? context.legalCells ?? context.legalTargets ?? context.options),
          labelKey: "preview.labels.selectDestination",
        });
      default:
        break;
    }
  }

  if (view.pendingAoEPreview) {
    return buildPendingAoEPreview(view);
  }

  if (view.pendingMove) {
    return buildMovementPreview({
      view,
      pendingMove: view.pendingMove,
      targetingCell,
    });
  }

  return null;
}
