import type { Coord, MoveMode, PlayerId, PlayerView } from "rules";
import type { ActionMode } from "../../store";
import {
  ASGORE_FIRE_PARADE_ID,
  ASGORE_FIREBALL_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  ARTEMIS_MOON_INSIGHT_ID,
  ARTEMIS_SILVER_SICKLE_ID,
  DON_SORROWFUL_ID,
  DON_WINDMILLS_ID,
  DUOLINGO_PUSH_NOTIFICATION_ID,
  GROZNY_INVADE_TIME_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JACK_HOLY_MOTHER_ID,
  JACK_SNARES_ID,
  JEBE_KHANS_SHOOTER_ID,
  LECHY_GUIDE_TRAVELER_ID,
  LUCHE_DIVINE_RAY_ID,
  ODIN_SLEIPNIR_ID,
  ZORO_ONI_GIRI_ID,
} from "../../rulesHints";
import type { BoardPreview } from "./previewTypes";
import { buildAbilityPreview } from "./buildAbilityPreview";
import { buildMovementPreview } from "./buildPendingPreview";
import { attackRangeCells, openCells } from "./previewGeometry";
import { targetRefsFromIds } from "./previewVisibility";

export interface PreviewMoveOptions {
  unitId: string;
  legalTo: Coord[];
  mode?: MoveMode;
}

export interface BuildActionPreviewArgs {
  gameView: PlayerView | null | undefined;
  viewerPlayerId: PlayerId | null | undefined;
  sourceUnitId: string | null | undefined;
  actionMode: ActionMode;
  moveOptions?: PreviewMoveOptions | null;
  pendingMoveForSelected?: PreviewMoveOptions | null;
  targetingCell?: Coord | null;
}

function abilityIdForPreviewActionMode(actionMode: Exclude<ActionMode, null>): string | null {
  switch (actionMode) {
    case "assassinMark":
      return CHIKATILO_ASSASSIN_MARK_ID;
    case "guideTraveler":
      return LECHY_GUIDE_TRAVELER_ID;
    case "jebeKhansShooter":
      return JEBE_KHANS_SHOOTER_ID;
    case "asgoreFireball":
      return ASGORE_FIREBALL_ID;
    case "asgoreFireParade":
      return ASGORE_FIRE_PARADE_ID;
    case "hassanTrueEnemy":
      return HASSAN_TRUE_ENEMY_ID;
    case "gutsArbalet":
      return GUTS_ARBALET_ID;
    case "gutsCannon":
      return GUTS_CANNON_ID;
    case "invadeTime":
      return GROZNY_INVADE_TIME_ID;
    case "odinSleipnir":
      return ODIN_SLEIPNIR_ID;
    case "duolingoPush":
      return DUOLINGO_PUSH_NOTIFICATION_ID;
    case "lucheLightRay":
      return LUCHE_DIVINE_RAY_ID;
    case "zoroOniGiri":
      return ZORO_ONI_GIRI_ID;
    case "donReaction":
      return DON_SORROWFUL_ID;
    case "donWindmills":
      return DON_WINDMILLS_ID;
    case "jackTrap":
      return JACK_SNARES_ID;
    case "jackHolyMother":
      return JACK_HOLY_MOTHER_ID;
    case "artemisMoonInsight":
      return ARTEMIS_MOON_INSIGHT_ID;
    case "artemisSilverSickle":
      return ARTEMIS_SILVER_SICKLE_ID;
    default:
      return null;
  }
}

function buildBasicAttackPreview(
  gameView: PlayerView,
  sourceUnitId: string,
): BoardPreview | null {
  const source = gameView.units[sourceUnitId];
  if (!source?.position) return null;
  const targetIds = gameView.legal?.attackTargetsByUnitId[sourceUnitId] ?? [];
  return {
    kind: "multiStep",
    step: "basicAttack",
    sourceCell: { ...source.position },
    cells: attackRangeCells(gameView, sourceUnitId),
    validTargets: targetRefsFromIds(gameView, targetIds),
    cellKind: source.class === "archer" ? "line" : "area",
    labelKey: "preview.labels.selectTarget",
  };
}

export function buildActionPreview({
  gameView,
  viewerPlayerId,
  sourceUnitId,
  actionMode,
  moveOptions,
  pendingMoveForSelected,
  targetingCell,
}: BuildActionPreviewArgs): BoardPreview | null {
  if (!gameView || !sourceUnitId || !actionMode) return null;
  const source = gameView.units[sourceUnitId];
  if (!source?.position) return null;

  if (actionMode === "move") {
    const pending =
      pendingMoveForSelected && pendingMoveForSelected.unitId === sourceUnitId
        ? pendingMoveForSelected
        : moveOptions && moveOptions.unitId === sourceUnitId
          ? moveOptions
          : null;
    const legalTo = pending?.legalTo ?? gameView.legal?.movesByUnitId[sourceUnitId] ?? [];
    return buildMovementPreview({
      view: gameView,
      pendingMove: {
        unitId: sourceUnitId,
        legalTo,
        mode: pending?.mode,
      },
      labelKey: "preview.labels.selectDestination",
    });
  }

  if (actionMode === "attack") {
    return buildBasicAttackPreview(gameView, sourceUnitId);
  }

  if (actionMode === "invadeTime" || actionMode === "odinSleipnir") {
    return {
      kind: "movement",
      sourceCell: { ...source.position },
      reachableCells: openCells(gameView),
      labelKey: "preview.labels.selectDestination",
    };
  }

  const abilityId = abilityIdForPreviewActionMode(actionMode);
  if (!abilityId) return null;
  return buildAbilityPreview({
    gameView,
    viewerPlayerId,
    sourceUnitId,
    abilityId,
    targetingStep: actionMode,
    targetingCell,
  });
}
