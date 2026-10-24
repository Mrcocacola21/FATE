import type { Coord, ResolveRollChoice, PlayerView } from "rules";
import { getPendingRollLabel } from "../helpers";
import { useI18n } from "../../../i18n";
import {
  getCellLabel,
  getHeroDisplayName,
  getUnitFigureDisplayName,
} from "../../../i18n/displayMetadata";
import { ReactionChoicePanel } from "./ReactionChoicePanel";

interface PendingBoardNoticeProps {
  pendingRollKind: string;
  pendingRollContext?: Record<string, unknown>;
  units?: PlayerView["rosterUnits"];
  pendingQueueCount: number;
  stakeSelections: Coord[];
  stakeLimit: number;
  hassanAssassinOrderSelections: string[];
  isStakePlacement: boolean;
  isIntimidateChoice: boolean;
  isForestTarget: boolean;
  isForestMoveDestination: boolean;
  isForestChoice: boolean;
  isForestMoveCheck: boolean;
  isDuelistChoice: boolean;
  isChikatiloPlacement: boolean;
  isGroznyTyrantOptionChoice: boolean;
  isGroznyTyrantAllyChoice: boolean;
  isGroznyTyrantAttackCellChoice: boolean;
  groznyTyrantAllowSkip: boolean;
  isGuideTravelerPlacement: boolean;
  isRiverBoatCarryChoice: boolean;
  isRiverBoatDestinationChoice: boolean;
  isRiverBoatDropDestination: boolean;
  isRiverTraLaLaTargetChoice: boolean;
  isRiverTraLaLaDestinationChoice: boolean;
  isRiverTraLaLaDropDestinationChoice: boolean;
  isJebeKhansShooterTargetChoice: boolean;
  isLokiLaughtChoice: boolean;
  isLokiChickenTargetChoice: boolean;
  isLokiMindControlEnemyChoice: boolean;
  isLokiMindControlTargetChoice: boolean;
  isHassanTrueEnemyTargetChoice: boolean;
  isAsgoreSoulParadePatienceTargetChoice: boolean;
  isAsgoreSoulParadePerseveranceTargetChoice: boolean;
  isAsgoreSoulParadeJusticeTargetChoice: boolean;
  isAsgoreSoulParadeIntegrityDestination: boolean;
  isHassanAssassinOrderSelection: boolean;
  isChikatiloRevealChoice: boolean;
  isChikatiloDecoyChoice: boolean;
  isFriskPacifismHugsTargetChoice: boolean;
  isFriskWarmWordsTargetChoice: boolean;
  isFriskPrecisionStrikeTargetChoice: boolean;
  onResolveChoice: (choice: ResolveRollChoice) => void;
  onResolveSkip: () => void;
  onConfirmStakePlacement: () => void;
  onClearStakeSelections: () => void;
  onConfirmHassanAssassinOrder: () => void;
  onClearHassanAssassinOrder: () => void;
  className?: string;
}

type SoulId = "patience" | "bravery" | "integrity" | "perseverance" | "kindness" | "justice";

const SOUL_IDS = new Set<SoulId>([
  "patience",
  "bravery",
  "integrity",
  "perseverance",
  "kindness",
  "justice",
]);

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

type GroznyTyrantMode = "normal" | "invadeTime";

function groznyModeList(value: unknown): GroznyTyrantMode[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is GroznyTyrantMode => item === "normal" || item === "invadeTime",
  );
}

export function PendingBoardNotice({
  pendingRollKind,
  pendingRollContext = {},
  units,
  pendingQueueCount,
  stakeSelections,
  stakeLimit,
  hassanAssassinOrderSelections,
  isStakePlacement,
  isIntimidateChoice,
  isForestTarget,
  isForestMoveDestination,
  isForestChoice,
  isForestMoveCheck,
  isDuelistChoice,
  isChikatiloPlacement,
  isGroznyTyrantOptionChoice,
  isGroznyTyrantAllyChoice,
  isGroznyTyrantAttackCellChoice,
  groznyTyrantAllowSkip,
  isGuideTravelerPlacement,
  isRiverBoatCarryChoice,
  isRiverBoatDestinationChoice,
  isRiverBoatDropDestination,
  isRiverTraLaLaTargetChoice,
  isRiverTraLaLaDestinationChoice,
  isRiverTraLaLaDropDestinationChoice,
  isJebeKhansShooterTargetChoice,
  isLokiLaughtChoice,
  isLokiChickenTargetChoice,
  isLokiMindControlEnemyChoice,
  isLokiMindControlTargetChoice,
  isHassanTrueEnemyTargetChoice,
  isAsgoreSoulParadePatienceTargetChoice,
  isAsgoreSoulParadePerseveranceTargetChoice,
  isAsgoreSoulParadeJusticeTargetChoice,
  isAsgoreSoulParadeIntegrityDestination,
  isHassanAssassinOrderSelection,
  isChikatiloRevealChoice,
  isChikatiloDecoyChoice,
  isFriskPacifismHugsTargetChoice,
  isFriskWarmWordsTargetChoice,
  isFriskPrecisionStrikeTargetChoice,
  onResolveChoice,
  onResolveSkip,
  onConfirmStakePlacement,
  onClearStakeSelections,
  onConfirmHassanAssassinOrder,
  onClearHassanAssassinOrder,
  className = "mt-4",
}: PendingBoardNoticeProps) {
  const { language, t } = useI18n();
  const groznyModeOptions = groznyModeList(pendingRollContext.options);
  const groznyAllowSkip = pendingRollContext.allowSkip === true;
  const groznySelectedMode =
    pendingRollContext.mode === "invadeTime"
      ? t("presentation.PendingBoardNotice.Tyrant_with_Invade_Time")
      : pendingRollContext.mode === "normal"
        ? t("presentation.PendingBoardNotice.Tyrant_normally")
        : null;
  const soulContext =
    pendingRollContext.soulResult && typeof pendingRollContext.soulResult === "object"
      ? (pendingRollContext.soulResult as Record<string, unknown>)
      : null;
  const soulId = stringValue(soulContext?.soulId);
  const validSoulId = soulId && SOUL_IDS.has(soulId as SoulId) ? (soulId as SoulId) : null;
  const soulRoll = numberValue(soulContext?.roll);
  const soulName = validSoulId
    ? t(`abilityDetails.asgore.soulParade.outcomes.${validSoulId}.name`)
    : stringValue(soulContext?.soulName);
  const soulEffect = validSoulId
    ? t(`abilityDetails.asgore.soulParade.outcomes.${validSoulId}.description`)
    : stringValue(soulContext?.effectDescription);
  const showSoulSummary =
    !!soulContext &&
    (isAsgoreSoulParadePatienceTargetChoice ||
      isAsgoreSoulParadePerseveranceTargetChoice ||
      isAsgoreSoulParadeJusticeTargetChoice ||
      isAsgoreSoulParadeIntegrityDestination);
  const ricochetStepIndex = numberValue(pendingRollContext.stepIndex);
  const ricochetTotalSteps = numberValue(pendingRollContext.totalSteps);
  const ricochetPrompt =
    ricochetStepIndex && ricochetTotalSteps
      ? ricochetStepIndex >= ricochetTotalSteps
        ? t("pending.khansShooterFinalRicochet")
        : t("pending.khansShooterRicochetStep", {
            current: ricochetStepIndex,
            total: ricochetTotalSteps,
          })
      : t("pending.khansShooterNextRicochet");
  const chargedAbilityId = stringValue(pendingRollContext.abilityId);
  const windmillIds = Array.isArray(pendingRollContext.affectedIds)
    ? pendingRollContext.affectedIds.filter((value): value is string => typeof value === "string")
    : [];
  const windmillIndex = numberValue(pendingRollContext.index) ?? 0;
  const windmillUnitId = windmillIds[windmillIndex] ?? "?";
  return (
    <div
      className={`panel-arcane rounded-2xl border border-violet-300/70 bg-violet-50/75 p-4 text-sm text-violet-950 shadow-lg shadow-violet-950/5 dark:border-violet-800/70 dark:bg-violet-950/30 dark:text-violet-100 ${className}`}
    >
      {showSoulSummary ? (
        <div className="mb-3 rounded-lg border border-violet-300/70 bg-white/70 p-3 text-xs text-violet-950 dark:border-violet-700/70 dark:bg-violet-950/40 dark:text-violet-100">
          <div className="font-semibold">{t("pending.soulParade")}</div>
          <div className="mt-1">{t("pending.soulParadeRolled", { roll: soulRoll ?? "-" })}</div>
          <div>{t("pending.soulParadeSoul", { soul: soulName ?? "-" })}</div>
          <div>{t("pending.soulParadeEffect", { effect: soulEffect ?? "-" })}</div>
        </div>
      ) : null}
      {pendingRollKind === "reactionChoice" ? (
        <ReactionChoicePanel
          context={pendingRollContext}
          units={units}
          onResolve={onResolveChoice}
        />
      ) : pendingRollKind === "selectLastAttackTarget" ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Last_Attack_choose_an_enemy_unit_to")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {((pendingRollContext.legalTargetIds as string[] | undefined) ?? []).map((targetId) => (
              <button
                key={targetId}
                type="button"
                className="btn btn-secondary"
                onClick={() => onResolveChoice({ type: "sansLastAttackTarget", targetId })}
              >
                {units?.[targetId]
                  ? getUnitFigureDisplayName(units[targetId], { language, t })
                  : targetId}
              </button>
            ))}
          </div>
        </div>
      ) : pendingRollKind === "donMadDelusionDirection" ? (
        <div>
          <div className="font-semibold">{t("pending.donMadnessTitle")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.donMadnessDirection")}
          </div>
        </div>
      ) : pendingRollKind === "donWindmillsRepositionChoice" ? (
        <div>
          <div className="font-semibold">
            {t(
              "presentation.PendingBoardNotice.Attack_on_Windmills_choose_a_highlighted_destination",
              { value0: windmillUnitId },
            )}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_directly_on_the_board")}
          </div>
        </div>
      ) : pendingRollKind === "donSorrowfulMoveChoice" ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Knight_of_the_Sorrowful_Image_optional_reaction")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Choose_a_highlighted_adjacent_cell_on_the")}
          </div>
          <div className="mt-2">
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.skip")}
            </button>
          </div>
        </div>
      ) : pendingRollKind === "chargedImpulseTargetChoice" && chargedAbilityId ? (
        <div>
          <div className="font-semibold">
            {chargedAbilityId === "jackRipperSnares" && pendingRollContext.step === "coveringTracks"
              ? t("presentation.PendingBoardNotice.Covering_Tracks")
              : chargedAbilityId === "artemidaMoonlightShot"
                ? t("presentation.PendingBoardNotice.Moon_Insight")
                : chargedAbilityId === "jackRipperSnares"
                  ? t("presentation.PendingBoardNotice.Maniac_Traps")
                  : chargedAbilityId === "lucheDivineRay"
                    ? t("presentation.PendingBoardNotice.Light_Ray")
                    : chargedAbilityId === "zoroOniGiri"
                      ? t("presentation.PendingBoardNotice.Oni_Giri")
                      : t("presentation.PendingBoardNotice.Impulse_target")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {chargedAbilityId === "jackRipperSnares" && pendingRollContext.step === "coveringTracks"
              ? t("presentation.PendingBoardNotice.Covering_Tracks_choose_a_snare_to_explode")
              : chargedAbilityId === "artemidaMoonlightShot"
                ? t("presentation.PendingBoardNotice.Choose_a_x_center_on_Artemida_s")
                : chargedAbilityId === "jackRipperSnares"
                  ? t("presentation.PendingBoardNotice.Place_your_snares_Choose_a_trap_cell")
                  : chargedAbilityId === "zoroOniGiri" && pendingRollContext.step === "destination"
                    ? t(
                        "presentation.PendingBoardNotice.Choose_the_highlighted_cell_before_or_behind",
                      )
                    : chargedAbilityId === "zoroOniGiri"
                      ? t("presentation.PendingBoardNotice.Choose_an_enemy_on_Zoro_s_straight")
                      : chargedAbilityId === "lucheDivineRay"
                        ? t("presentation.PendingBoardNotice.Choose_a_line_target_or_choose_Luche")
                        : t("presentation.PendingBoardNotice.Choose_a_straight_attack_line")}
          </div>
        </div>
      ) : isStakePlacement ? (
        <div>
          <div className="font-semibold">{t("pending.placeStakes")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.selectedCount", { current: stakeSelections.length, total: stakeLimit })}
          </div>
          {stakeSelections.length > 0 && (
            <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
              {stakeSelections.map(getCellLabel).join(", ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
              onClick={onConfirmStakePlacement}
              disabled={stakeSelections.length !== stakeLimit}
            >
              {t("pending.placeStakesButton")}
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onClearStakeSelections}
            >
              {t("common.clear")}
            </button>
          </div>
        </div>
      ) : isIntimidateChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Intimidate_choose_a_push_cell")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Click_a_highlighted_cell_or_skip")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.skip")}
          </button>
        </div>
      ) : isForestTarget ? (
        <div>
          <div className="font-semibold">{t("pending.forestDead")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_the_x_center_cell")}
          </div>
        </div>
      ) : isForestMoveDestination ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Forest_check_failed")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Choose_a_highlighted_destination_inside_the_aura")}
          </div>
        </div>
      ) : isForestChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Forest_of_the_Dead_ready")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Decide_whether_to_activate_the_phantasm")}
          </div>
        </div>
      ) : isForestMoveCheck ? (
        <div>
          <div className="font-semibold">{t("pending.forestCheck")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Forest_check_roll_to_leave")}
          </div>
        </div>
      ) : isDuelistChoice ? (
        <div>
          <div className="font-semibold">{t("pending.demonDuelist")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Choose_whether_to_continue_the_duel")}
          </div>
        </div>
      ) : isChikatiloPlacement ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.False_Trail_placement")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_any_empty_cell_to_place_Chikatilo")}
          </div>
        </div>
      ) : isGroznyTyrantOptionChoice ? (
        <div>
          <div className="font-semibold">
            {getHeroDisplayName("grozny", "Ivan Grozny", language)}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Choose_how_to_use_Tyrant_before_any")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {groznyModeOptions.includes("invadeTime") ? (
              <button
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() =>
                  onResolveChoice({
                    type: "groznyTyrantOption",
                    mode: "invadeTime",
                  })
                }
              >
                {t("presentation.PendingBoardNotice.Use_Tyrant_with_Invade_Time")}
              </button>
            ) : null}
            {groznyModeOptions.includes("normal") ? (
              <button
                className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
                onClick={() =>
                  onResolveChoice({
                    type: "groznyTyrantOption",
                    mode: "normal",
                  })
                }
              >
                {t("presentation.PendingBoardNotice.Use_Tyrant_normally")}
              </button>
            ) : null}
            {groznyAllowSkip ? (
              <button
                className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
                onClick={onResolveSkip}
              >
                {t("common.skip")}
              </button>
            ) : null}
          </div>
        </div>
      ) : isGroznyTyrantAllyChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Tyrant_choose_ally")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {groznySelectedMode ? `${groznySelectedMode}. ` : ""}
            {t("presentation.PendingBoardNotice.Select_a_highlighted_allied_figure")}
          </div>
          {groznyAllowSkip ? (
            <button
              className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.skip")}
            </button>
          ) : null}
        </div>
      ) : isGroznyTyrantAttackCellChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Tyrant_choose_attack_cell")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {groznySelectedMode ? `${groznySelectedMode}. ` : ""}
            {t("presentation.PendingBoardNotice.Select_the_highlighted_cell_Ivan_Grozny_attacks")}
          </div>
          {groznyTyrantAllowSkip && (
            <button
              className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.skip")}
            </button>
          )}
        </div>
      ) : isGuideTravelerPlacement ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Guide_Traveler_placement")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_an_empty_cell_to_place_the")}
          </div>
        </div>
      ) : isRiverBoatCarryChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Boat_carry")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_an_adjacent_ally_to_carry_or")}
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-sky-800"
              onClick={() => onResolveChoice({ type: "riverBoatNoPassenger" })}
            >
              {t("presentation.PendingBoardNotice.Move_without_passenger")}
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.cancel")}
            </button>
          </div>
        </div>
      ) : isRiverBoatDestinationChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Boat_destination")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_River_Person_s_destination")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverBoatDropDestination ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Boat_drop")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {pendingRollContext.reason === "movementInterrupted"
              ? t("presentation.PendingBoardNotice.Movement_was_interrupted_by_a_stake_Choose")
              : t("presentation.PendingBoardNotice.Select_an_adjacent_empty_cell_to_drop")}
          </div>
          {pendingRollContext.phase !== "selectDisembark" && (
            <button
              className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onResolveSkip}
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
      ) : isRiverTraLaLaTargetChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Tra_la_la")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_an_adjacent_enemy_target")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverTraLaLaDestinationChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Tra_la_la")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_highlighted_straight_line_destination")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isRiverTraLaLaDropDestinationChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Tra_la_la_drop")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_an_adjacent_empty_cell_to_drop_2")}
          </div>
          <button
            className="mt-2 rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
            onClick={onResolveSkip}
          >
            {t("common.cancel")}
          </button>
        </div>
      ) : isJebeKhansShooterTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.khansShooter")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">{ricochetPrompt}</div>
        </div>
      ) : isLokiLaughtChoice ? (
        <div>
          <div className="font-semibold">{t("pending.lokiLaughter")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Choose_a_Loki_s_Laugh_option_The")}
          </div>
        </div>
      ) : isLokiChickenTargetChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Chicken")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_an_enemy_hero_within_cells")}
          </div>
        </div>
      ) : isLokiMindControlEnemyChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Mind_Capture")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_unit_to_control")}
          </div>
        </div>
      ) : isLokiMindControlTargetChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Mind_Capture")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_target_for_the_controlled_attack")}
          </div>
        </div>
      ) : pendingRollKind === "mongolChargeAllyAttackTarget" ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.Mongol_Charge")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Choose_a_target_for_the_allied_attack")}
          </div>
        </div>
      ) : isHassanTrueEnemyTargetChoice ? (
        <div>
          <div className="font-semibold">{t("presentation.PendingBoardNotice.True_Enemy")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_target_for_the_controlled_attack")}
          </div>
        </div>
      ) : isAsgoreSoulParadePatienceTargetChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Soul_Parade_Patience")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_target_in_assassin_attack_range")}
          </div>
        </div>
      ) : isAsgoreSoulParadePerseveranceTargetChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Soul_Parade_Perseverance")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_target_in_trickster_attack_range")}
          </div>
        </div>
      ) : isAsgoreSoulParadeJusticeTargetChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Soul_Parade_Justice")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_a_target_in_archer_attack_line")}
          </div>
        </div>
      ) : isAsgoreSoulParadeIntegrityDestination ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.Soul_Parade_Integrity")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Select_any_highlighted_destination_cell")}
          </div>
        </div>
      ) : isHassanAssassinOrderSelection ? (
        <div>
          <div className="font-semibold">{t("pending.hassanAssassinOrderTitle")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.hassanAssassinOrderInstruction")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.selectedCount", {
              current: hassanAssassinOrderSelections.length,
              total: 2,
            })}
          </div>
          {hassanAssassinOrderSelections.length > 0 && (
            <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
              {hassanAssassinOrderSelections.join(", ")}
            </div>
          )}
          <div className="mt-2 flex gap-2">
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-semibold text-white shadow-sm transition hover:shadow dark:bg-emerald-800/50 dark:text-slate-100 dark:hover:bg-emerald-700/60"
              onClick={onConfirmHassanAssassinOrder}
              disabled={hassanAssassinOrderSelections.length !== 2}
            >
              {t("common.confirm")}
            </button>
            <button
              className="rounded-lg bg-slate-200 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm transition hover:shadow dark:bg-slate-800 dark:text-slate-200"
              onClick={onClearHassanAssassinOrder}
            >
              {t("common.clear")}
            </button>
          </div>
        </div>
      ) : isChikatiloRevealChoice ? (
        <div>
          <div className="font-semibold">
            {t("presentation.PendingBoardNotice.False_Trail_choice")}
          </div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Decide_whether_the_token_explodes_or_is")}
          </div>
        </div>
      ) : isChikatiloDecoyChoice ? (
        <div>
          <div className="font-semibold">{t("pending.decoy")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("presentation.PendingBoardNotice.Roll_defense_or_spend_charges_to_take")}
          </div>
        </div>
      ) : isFriskPacifismHugsTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.friskHugs")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.friskHugsPrompt")}
          </div>
        </div>
      ) : isFriskWarmWordsTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.friskWarmWords")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.friskWarmWordsPrompt")}
          </div>
        </div>
      ) : isFriskPrecisionStrikeTargetChoice ? (
        <div>
          <div className="font-semibold">{t("pending.friskPrecisionStrike")}</div>
          <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
            {t("pending.friskPrecisionStrikePrompt")}
          </div>
        </div>
      ) : (
        <div>
          {t("pending.resolveToContinue", {
            roll: getPendingRollLabel(pendingRollKind, language),
          })}
        </div>
      )}
      {!isStakePlacement && pendingQueueCount > 0 && (
        <div className="mt-1 text-xs text-amber-700 dark:text-amber-200">
          {t("pending.pendingAttacks", { count: pendingQueueCount })}
        </div>
      )}
    </div>
  );
}
