import type { ActionMode } from "../store";
import {
  ASGORE_FIRE_PARADE_ID,
  ASGORE_FIREBALL_ID,
  CHIKATILO_ASSASSIN_MARK_ID,
  EL_CID_DEMON_DUELIST_ID,
  EL_CID_TISONA_ID,
  GROZNY_INVADE_TIME_ID,
  GUTS_ARBALET_ID,
  GUTS_CANNON_ID,
  HASSAN_TRUE_ENEMY_ID,
  JEBE_HAIL_OF_ARROWS_ID,
  JEBE_KHANS_SHOOTER_ID,
  KAISER_DORA_ID,
  KALADIN_FIFTH_ID,
  LECHY_GUIDE_TRAVELER_ID,
  METTATON_LASER_ID,
  METTATON_POPPINS_ID,
  ODIN_SLEIPNIR_ID,
  PAPYRUS_COOL_GUY_ID,
  SANS_GASTER_BLASTER_ID,
  UNDYNE_ENERGY_SPEAR_ID,
  UNDYNE_SPEAR_THROW_ID,
} from "../rulesHints";

export interface TargetingMode {
  sourceUnitId: string;
  abilityId:
    | string
    | "basicAttack"
    | "move"
    | "place"
    | "search";
  step: string;
  resourcePreview?: {
    action?: boolean;
    move?: boolean;
    stealth?: boolean;
    charges?: Array<{ counterId: string; amount: number }>;
  };
}

export interface LocalSelectionState<TMoveOptions = unknown> {
  actionMode: ActionMode;
  moveOptions: TMoveOptions | null;
  selectedUnitId?: string | null;
  targetingMode?: TargetingMode | null;
}

const CLEAR_ON_CONFIRMED_ACTION_MODES = new Set<Exclude<ActionMode, null>>([
  "attack",
  "assassinMark",
  "jebeKhansShooter",
  "asgoreFireball",
  "hassanTrueEnemy",
  "gutsArbalet",
  "gutsCannon",
]);

export function shouldClearActionModeAfterConfirmedResult({
  actionMode,
  lastActionResult,
  lastActionResultAt,
  actionModeStartedAt,
}: {
  actionMode: ActionMode;
  lastActionResult: { ok: boolean; error?: string } | null;
  lastActionResultAt: number;
  actionModeStartedAt: number;
}): boolean {
  return !!(
    actionMode &&
    CLEAR_ON_CONFIRMED_ACTION_MODES.has(actionMode) &&
    !!lastActionResult &&
    lastActionResultAt > 0 &&
    lastActionResultAt > actionModeStartedAt
  );
}

function abilityIdForActionMode(mode: Exclude<ActionMode, null>): TargetingMode["abilityId"] {
  switch (mode) {
    case "attack":
      return "basicAttack";
    case "move":
      return "move";
    case "place":
      return "place";
    case "dora":
      return KAISER_DORA_ID;
    case "tisona":
      return EL_CID_TISONA_ID;
    case "demonDuelist":
      return EL_CID_DEMON_DUELIST_ID;
    case "invadeTime":
      return GROZNY_INVADE_TIME_ID;
    case "assassinMark":
      return CHIKATILO_ASSASSIN_MARK_ID;
    case "guideTraveler":
      return LECHY_GUIDE_TRAVELER_ID;
    case "jebeHailOfArrows":
      return JEBE_HAIL_OF_ARROWS_ID;
    case "jebeKhansShooter":
      return JEBE_KHANS_SHOOTER_ID;
    case "asgoreFireball":
      return ASGORE_FIREBALL_ID;
    case "asgoreFireParade":
      return ASGORE_FIRE_PARADE_ID;
    case "papyrusCoolGuy":
      return PAPYRUS_COOL_GUY_ID;
    case "hassanTrueEnemy":
      return HASSAN_TRUE_ENEMY_ID;
    case "kaladinFifth":
      return KALADIN_FIFTH_ID;
    case "odinSleipnir":
      return ODIN_SLEIPNIR_ID;
    case "sansGasterBlaster":
      return SANS_GASTER_BLASTER_ID;
    case "undyneSpearThrow":
      return UNDYNE_SPEAR_THROW_ID;
    case "undyneEnergySpear":
      return UNDYNE_ENERGY_SPEAR_ID;
    case "mettatonPoppins":
      return METTATON_POPPINS_ID;
    case "mettatonLaser":
      return METTATON_LASER_ID;
    case "gutsArbalet":
      return GUTS_ARBALET_ID;
    case "gutsCannon":
      return GUTS_CANNON_ID;
  }
}

function previewForActionMode(
  mode: Exclude<ActionMode, null>
): TargetingMode["resourcePreview"] {
  switch (mode) {
    case "move":
    case "guideTraveler":
    case "invadeTime":
      return { move: true };
    case "place":
      return undefined;
    default:
      return { action: true };
  }
}

export function buildTargetingModeForActionMode(
  mode: ActionMode,
  sourceUnitId: string | null | undefined
): TargetingMode | null {
  if (!mode || !sourceUnitId) return null;
  return {
    sourceUnitId,
    abilityId: abilityIdForActionMode(mode),
    step: mode,
    resourcePreview: previewForActionMode(mode),
  };
}

export function transitionActionMode<TMoveOptions>(
  state: LocalSelectionState<TMoveOptions>,
  mode: ActionMode
): Partial<LocalSelectionState<TMoveOptions>> {
  const next: Partial<LocalSelectionState<TMoveOptions>> = {
    actionMode: mode,
    moveOptions: mode === "move" ? state.moveOptions : null,
  };
  if ("targetingMode" in state) {
    next.targetingMode = buildTargetingModeForActionMode(
      mode,
      state.selectedUnitId
    );
  }
  return next;
}
