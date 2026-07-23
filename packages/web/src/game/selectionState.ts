import type { AbilityUseSource } from "rules";
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
  DUOLINGO_PUSH_NOTIFICATION_ID,
  LUCHE_DIVINE_RAY_ID,
  ZORO_ONI_GIRI_ID,
  DON_SORROWFUL_ID,
  DON_WINDMILLS_ID,
  JACK_SNARES_ID,
  JACK_HOLY_MOTHER_ID,
  ARTEMIS_MOON_INSIGHT_ID,
  ARTEMIS_SILVER_SICKLE_ID,
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
  useSource?: AbilityUseSource;
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

export function shouldActivateMoveSelection(
  selectedUnitId: string | null | undefined,
  options:
    | {
        unitId: string;
        legalTo: unknown[];
        modes?: unknown[];
      }
    | null
): boolean {
  return !!(
    options &&
    selectedUnitId === options.unitId &&
    options.legalTo.length > 0 &&
    (!options.modes || options.modes.length === 0)
  );
}

export function transitionMoveOptions<
  TMoveOptions extends {
    unitId: string;
    legalTo: unknown[];
    modes?: unknown[];
  },
>(
  state: LocalSelectionState<TMoveOptions>,
  options: TMoveOptions | null
): Partial<LocalSelectionState<TMoveOptions>> {
  const next = { moveOptions: options };
  return shouldActivateMoveSelection(state.selectedUnitId, options)
    ? {
        ...next,
        ...transitionActionMode({ ...state, moveOptions: options }, "move"),
      }
    : next;
}

export function shouldResetLocalBoardUiForSnapshot({
  lifecycleChanged,
  selectionLost,
  view,
  metaPendingRoll,
}: {
  lifecycleChanged: boolean;
  selectionLost: boolean;
  view: {
    pendingRoll?: unknown;
    pendingMove?: unknown;
    pendingAoEPreview?: unknown;
  };
  metaPendingRoll?: unknown;
}): boolean {
  const hasForcedBoardPending = !!(
    view.pendingRoll ||
    view.pendingAoEPreview ||
    metaPendingRoll
  );
  return lifecycleChanged || selectionLost || hasForcedBoardPending;
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
    case "duolingoPush":
      return DUOLINGO_PUSH_NOTIFICATION_ID;
    case "lucheLightRay":
    case "lucheLightRayAround":
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
  }
}

function previewForActionMode(
  mode: Exclude<ActionMode, null>,
  useSource?: AbilityUseSource,
): TargetingMode["resourcePreview"] {
  if (useSource?.type === "abilityCounter") {
    return { charges: [{ counterId: useSource.counterId, amount: 2 }] };
  }
  if (useSource?.type === "heroResource") {
    const slotPreview = mode === "zoroOniGiri"
      ? { action: true, move: true }
      : mode === "lucheLightRay" || mode === "lucheLightRayAround"
        ? { action: true }
        : mode === "duolingoPush"
          ? { move: true }
          : {};
    return {
      ...slotPreview,
      charges: [{ counterId: useSource.resourceId, amount: useSource.amount }],
    };
  }
  switch (mode) {
    case "move":
    case "guideTraveler":
    case "invadeTime":
    case "duolingoPush":
    case "donWindmills":
      return { move: true };
    case "donReaction":
    case "jackTrap":
    case "lucheLightRay":
    case "lucheLightRayAround":
    case "artemisMoonInsight":
      return undefined;
    case "place":
      return undefined;
    default:
      return { action: true };
  }
}

export function buildTargetingModeForActionMode(
  mode: ActionMode,
  sourceUnitId: string | null | undefined,
  useSource?: AbilityUseSource,
): TargetingMode | null {
  if (!mode || !sourceUnitId) return null;
  return {
    sourceUnitId,
    abilityId: abilityIdForActionMode(mode),
    step: mode,
    useSource,
    resourcePreview: previewForActionMode(mode, useSource),
  };
}

export function transitionActionMode<TMoveOptions>(
  state: LocalSelectionState<TMoveOptions>,
  mode: ActionMode,
  useSource?: AbilityUseSource,
): Partial<LocalSelectionState<TMoveOptions>> {
  const next: Partial<LocalSelectionState<TMoveOptions>> = {
    actionMode: mode,
    moveOptions: mode === "move" ? state.moveOptions : null,
  };
  if ("targetingMode" in state) {
    next.targetingMode = buildTargetingModeForActionMode(
      mode,
      state.selectedUnitId,
      useSource,
    );
  }
  return next;
}
