import type { FC } from "react";
import type { GameAction } from "rules";
import type { ActionPreviewMode } from "../../../store";
import {
  formatMoveMode,
  getActionModeHint,
} from "../../components/RightPanel/rightPanelHelpers";
import {
  getCostPreview,
  getUsingName,
} from "../../components/RightPanel/sections/BattleBottomHints";
import { PanelCard, SectionHeader, StatusBadge } from "../../../components/ui";
import { useI18n } from "../../../i18n";
import { getPendingRollLabel } from "../helpers";
import { PendingBoardNotice } from "./PendingBoardNotice";
import {
  getPlacementUnitLabel,
  getUnitFigureDisplayName,
} from "../../../i18n/displayMetadata";

interface CurrentTaskPanelProps {
  vm: any;
  compact?: boolean;
}

export function hasActiveMobileTask(vm: any): boolean {
  return !!(
    vm.pendingRoll ||
    vm.pendingMeta ||
    vm.actionMode ||
    vm.targetingMode ||
    vm.boardSelectionPending ||
    (Array.isArray(vm.moveOptions?.modes) && vm.moveOptions.modes.length > 0) ||
    vm.view?.phase === "placement"
  );
}

function MobileTaskStrip({
  title,
  instruction,
  onCancel,
}: {
  title: string;
  instruction?: string | null;
  onCancel?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="mobile-active-task-bar" aria-live="polite" data-testid="mobile-active-task-strip">
      <div className="min-w-0 flex-1">
        <div className="section-kicker">{t("game.currentTask")}</div>
        <div className="truncate text-sm font-bold text-stone-900 dark:text-stone-100">{title}</div>
        {instruction ? (
          <p className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-stone-600 dark:text-stone-300">
            {instruction}
          </p>
        ) : null}
      </div>
      {onCancel ? (
        <button type="button" className="btn btn-secondary btn-sm shrink-0" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      ) : null}
    </div>
  );
}

export const CurrentTaskPanel: FC<CurrentTaskPanelProps> = ({ vm, compact = false }) => {
  const { language, t } = useI18n();

  if (vm.pendingRoll) {
    return (
      <div aria-live="polite" className={compact ? "mobile-task-content" : ""}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="section-kicker">{t("game.currentTask")}</div>
            <div className="section-title mt-0.5 text-base">
              {getPendingRollLabel(vm.pendingRoll.kind, language)}
            </div>
          </div>
          <StatusBadge tone={vm.pendingRoll.player === vm.playerId ? "warning" : "neutral"} dot>
            {t("pending.pendingFor", { player: vm.pendingRoll.player })}
          </StatusBadge>
        </div>
        <PendingBoardNotice
          className="mt-0"
          pendingRollKind={vm.pendingRoll.kind}
          pendingRollContext={(vm.pendingRoll.context ?? {}) as Record<string, unknown>}
          pendingQueueCount={vm.pendingQueueCount}
          stakeSelections={vm.stakeSelections}
          stakeLimit={vm.stakeLimit}
          hassanAssassinOrderSelections={vm.hassanAssassinOrderSelections}
          isStakePlacement={vm.isStakePlacement}
          isIntimidateChoice={vm.isIntimidateChoice}
          isForestTarget={vm.isForestTarget}
          isForestMoveDestination={vm.isForestMoveDestination}
          isForestChoice={vm.isForestChoice}
          isForestMoveCheck={vm.isForestMoveCheck}
          isDuelistChoice={vm.isDuelistChoice}
          isChikatiloPlacement={vm.isChikatiloPlacement}
          isGroznyTyrantOptionChoice={vm.isGroznyTyrantOptionChoice}
          isGroznyTyrantAllyChoice={vm.isGroznyTyrantAllyChoice}
          isGroznyTyrantAttackCellChoice={vm.isGroznyTyrantAttackCellChoice}
          groznyTyrantAllowSkip={vm.groznyTyrantAllowSkip}
          isGuideTravelerPlacement={vm.isGuideTravelerPlacement}
          isRiverBoatCarryChoice={vm.isRiverBoatCarryChoice}
          isRiverBoatDestinationChoice={vm.isRiverBoatDestinationChoice}
          isRiverBoatDropDestination={vm.isRiverBoatDropDestination}
          isRiverTraLaLaTargetChoice={vm.isRiverTraLaLaTargetChoice}
          isRiverTraLaLaDestinationChoice={vm.isRiverTraLaLaDestinationChoice}
          isRiverTraLaLaDropDestinationChoice={vm.isRiverTraLaLaDropDestinationChoice}
          isJebeKhansShooterTargetChoice={vm.isJebeKhansShooterTargetChoice}
          isLokiLaughtChoice={vm.isLokiLaughtChoice}
          isLokiChickenTargetChoice={vm.isLokiChickenTargetChoice}
          isLokiMindControlEnemyChoice={vm.isLokiMindControlEnemyChoice}
          isLokiMindControlTargetChoice={vm.isLokiMindControlTargetChoice}
          isHassanTrueEnemyTargetChoice={vm.isHassanTrueEnemyTargetChoice}
          isAsgoreSoulParadePatienceTargetChoice={vm.isAsgoreSoulParadePatienceTargetChoice}
          isAsgoreSoulParadePerseveranceTargetChoice={
            vm.isAsgoreSoulParadePerseveranceTargetChoice
          }
          isAsgoreSoulParadeJusticeTargetChoice={vm.isAsgoreSoulParadeJusticeTargetChoice}
          isAsgoreSoulParadeIntegrityDestination={vm.isAsgoreSoulParadeIntegrityDestination}
          isHassanAssassinOrderSelection={vm.isHassanAssassinOrderSelection}
          isChikatiloRevealChoice={vm.isChikatiloRevealChoice}
          isChikatiloDecoyChoice={vm.isChikatiloDecoyChoice}
          isFriskPacifismHugsTargetChoice={vm.isFriskPacifismHugsTargetChoice}
          isFriskWarmWordsTargetChoice={vm.isFriskWarmWordsTargetChoice}
          isFriskPrecisionStrikeTargetChoice={vm.isFriskPrecisionStrikeTargetChoice}
          onResolveChoice={(choice) => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice,
            } as GameAction);
          }}
          onResolveSkip={() => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice: "skip",
            } as GameAction);
          }}
          onConfirmStakePlacement={() => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice: { type: "placeStakes", positions: vm.stakeSelections },
            } as GameAction);
          }}
          onClearStakeSelections={() => vm.setStakeSelections([])}
          onConfirmHassanAssassinOrder={() => {
            vm.sendAction({
              type: "resolvePendingRoll",
              pendingRollId: vm.pendingRoll.id,
              choice: {
                type: "hassanAssassinOrderPick",
                unitIds: vm.hassanAssassinOrderSelections,
              },
            } as GameAction);
          }}
          onClearHassanAssassinOrder={() => vm.setHassanAssassinOrderSelections([])}
        />
      </div>
    );
  }

  if (vm.pendingMeta) {
    return (
      <div aria-live="polite" className={compact ? "mobile-task-content" : ""}>
        <PanelCard variant="arcane" className="p-3">
          <SectionHeader
            kicker={t("game.currentTask")}
            title={t("game.choicePending")}
            action={<StatusBadge tone="warning">{vm.pendingMeta.player}</StatusBadge>}
          />
          <p className="mt-2 text-xs leading-5 text-violet-800 dark:text-violet-200">
            {t("game.resolvingRoll", { player: vm.pendingMeta.player })}
          </p>
        </PanelCard>
      </div>
    );
  }

  const choosingMoveMode =
    Array.isArray(vm.moveOptions?.modes) && vm.moveOptions.modes.length > 0;
  if (choosingMoveMode) {
    const unitName = vm.selectedUnit
      ? getUnitFigureDisplayName(vm.selectedUnit, { language, t })
      : t("game.move");
    const title = t("game.chooseMoveModeFor", { unit: unitName });
    if (compact) {
      return (
        <MobileTaskStrip
          title={title}
          instruction={t("game.chooseMoveMode")}
          onCancel={() => {
            vm.setMoveOptions(null);
            vm.setActionMode(null);
          }}
        />
      );
    }
    return (
      <PanelCard variant="hud" className="p-3">
        <SectionHeader
          kicker={t("game.currentTask")}
          title={title}
          action={<StatusBadge tone="warning">{t("game.boardSelectionActive")}</StatusBadge>}
        />
        <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
          {t("game.chooseMoveMode")}
        </p>
      </PanelCard>
    );
  }

  if (vm.view.phase === "placement") {
    const selectedPlacementUnit = vm.placeUnitId ? vm.view.units?.[vm.placeUnitId] : null;
    const selectedPlacementLabel = selectedPlacementUnit
      ? getPlacementUnitLabel(selectedPlacementUnit, { language, t })
      : null;

    if (compact) {
      return (
        <MobileTaskStrip
          title={`${t("game.deployment")}: ${
            selectedPlacementLabel ??
            (vm.view.currentPlayer === vm.playerId
              ? t("game.placeUnits")
              : t("game.waitingOtherPlacement"))
          }`}
          instruction={
            selectedPlacementLabel
              ? t("game.placeHint", { unit: selectedPlacementLabel })
              : vm.view.currentPlayer === vm.playerId
                ? t("game.placeUnits")
                : null
          }
          onCancel={
            selectedPlacementLabel
              ? () => {
                  vm.setActionMode(null);
                  vm.setPlaceUnitId(null);
                }
              : undefined
          }
        />
      );
    }
  }

  if ((compact && (vm.actionMode || vm.targetingMode)) || (vm.actionMode && vm.targetingMode)) {
    const abilityViews =
      vm.selectedUnitId && vm.view.abilitiesByUnitId
        ? vm.view.abilitiesByUnitId[vm.selectedUnitId] ?? []
        : [];
    const undyneAxis =
      vm.undyneAxis === "col" || vm.papyrusLineAxis === "col" ? "col" : "row";
    const selectedMoveLabel =
      vm.actionMode === "move" && vm.moveOptions?.mode
        ? formatMoveMode(vm.moveOptions.mode, t, vm.selectedUnit?.class)
        : null;
    const usingName = vm.targetingMode
      ? getUsingName(vm.targetingMode, abilityViews, language, t)
      : null;
    const selectedSource = vm.targetingMode?.useSource;
    const selectedOption = selectedSource
      ? abilityViews.flatMap((ability: any) => ability.useOptions ?? []).find((option: any) =>
          option.source?.type === selectedSource.type &&
          (selectedSource.type === "abilityCounter"
            ? option.source.counterId === selectedSource.counterId
            : selectedSource.type === "heroResource"
              ? option.source.resourceId === selectedSource.resourceId
              : true),
        )
      : null;
    const sourceSuffix = selectedSource?.type === "abilityCounter"
      ? (language === "uk" ? "Лічильник" : "Counter")
      : selectedSource?.type === "heroResource"
        ? selectedOption?.sourceName ?? selectedSource.resourceId
        : null;
    const sourceAwareName = usingName && sourceSuffix ? `${usingName} — ${sourceSuffix}` : usingName;
    const newHeroDestinationStep =
      (vm.actionMode === "duolingoPush" || vm.actionMode === "zoroOniGiri") &&
      !!vm.newHeroAbilityTargetId;

    if (compact) {
      return (
        <MobileTaskStrip
          title={
            selectedMoveLabel
              ? `${selectedMoveLabel}: ${getActionModeHint("move", vm.papyrusLineAxis ?? "row", undyneAxis, language)}`
              : vm.targetingMode
                ? t("game.usingTargeting", {
                    name: sourceAwareName,
                  })
                : t("game.boardSelectionActive")
          }
          instruction={
            newHeroDestinationStep
              ? (language === "uk" ? "Оберіть підсвічену клітинку призначення." : "Choose a highlighted destination cell.")
              : vm.actionMode
                ? getActionModeHint(
                    vm.actionMode as ActionPreviewMode,
                    vm.papyrusLineAxis ?? "row",
                    undyneAxis,
                    language,
                  )
                : t("game.boardSelectionHint")
          }
          onCancel={() => vm.setActionMode(null)}
        />
      );
    }

    return (
      <div aria-live="polite" className={compact ? "mobile-task-content" : ""}>
        <PanelCard variant="hud" className="p-3">
          <SectionHeader
            kicker={t("game.currentTask")}
            title={
              selectedMoveLabel
                ? selectedMoveLabel
                : t("game.usingTargeting", {
                    name: getUsingName(vm.targetingMode, abilityViews, language, t),
                  })
            }
            action={<StatusBadge tone="warning">{t("game.boardSelectionActive")}</StatusBadge>}
          />
          <p className="mt-2 text-xs leading-5 text-stone-600 dark:text-stone-300">
            {t("game.targetingInstruction", {
              instruction: vm.actionMode === "attack" && vm.selectedUnit?.heroId === "zoro"
                  ? vm.zoroAttackTargetIds?.length
                    ? t("game.zoroSantoryuNextTarget")
                    : t("game.zoroSantoryuFirstTarget")
                : getActionModeHint(
                    vm.actionMode as ActionPreviewMode,
                    vm.papyrusLineAxis ?? "row",
                    undyneAxis,
                    language,
                  ),
            })}
          </p>
          <p className="mt-1 text-xs leading-5 text-sky-700 dark:text-sky-200">
            {t("game.targetingCost", {
              cost: getCostPreview(vm.targetingMode, abilityViews, t),
            })}
          </p>
          <button
            type="button"
            className="mt-2 rounded-md border border-sky-300 bg-white px-2.5 py-1.5 text-xs font-bold text-sky-800 shadow-sm transition hover:border-sky-400 hover:bg-sky-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500 dark:border-sky-800 dark:bg-sky-950/60 dark:text-sky-100 dark:hover:bg-sky-900/50"
            onClick={() => vm.setActionMode(null)}
          >
            {t("common.cancel")}
          </button>
        </PanelCard>
      </div>
    );
  }

  return null;
};
