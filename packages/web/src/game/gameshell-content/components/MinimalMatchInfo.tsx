import type { FC } from "react";
import type { GameShellViewModel } from "../hooks/useGameShellViewModel";
import type { MatchPanelModel } from "../matchPanelModel";
import {
  getActiveBoardFieldVisual,
  getBoardFieldDescriptionKey,
  getBoardFieldLabelKey,
} from "../../../assets/registry";
import { useI18n } from "../../../i18n";
import { getArenaLabel, getUnitIdDisplayName } from "../../../i18n/displayMetadata";
import { ARENA_BONE_FIELD_ID } from "../../../rulesHints";
import { InitiativeQueue } from "../../components/InitiativeQueue";
import { RuleDeclarationStatus } from "./RuleDeclarationStatus";

/** Left column of the minimal battle layout: turn queue, start-turn and the battle codex. */
export const MinimalMatchInfo: FC<{ vm: GameShellViewModel; model: MatchPanelModel }> = ({
  vm,
  model,
}) => {
  const { t } = useI18n();
  const { panelVm, rightPanelProps } = model;
  return (
    <div className="minimal-match-info" data-testid="match-info-panel">
      <InitiativeQueue
        view={vm.view!}
        playerId={vm.playerId}
        selectedUnitId={vm.selectedUnitId}
        onSelectUnit={rightPanelProps.onSelectUnit}
      />
      {panelVm.canStartTurn && panelVm.expectedUnitId ? (
        <button
          type="button"
          className="btn btn-primary w-full"
          onClick={() => panelVm.onStartTurn(panelVm.expectedUnitId!)}
        >
          {t("game.startTurn", { unit: panelVm.expectedUnitId })}
        </button>
      ) : null}
      <BattleCodex vm={vm} model={model} />
    </div>
  );
};

/**
 * Arena, its live effects and the battle rule, always in view: they change how every
 * figure moves and attacks, so they never hide behind a tab.
 */
const BattleCodex: FC<{ vm: GameShellViewModel; model: MatchPanelModel }> = ({ vm, model }) => {
  const { t, language } = useI18n();
  const { panelVm } = model;
  const view = vm.view!;
  const fieldId = getActiveBoardFieldVisual(view);
  const fieldRemaining =
    fieldId === "lechy_storm"
      ? view.arenaEffects?.find((effect) => effect.effectId === "storm" && effect.remaining > 0)
          ?.remaining
      : fieldId
        ? Math.max(0, view.boneFieldTurnsLeft ?? 0)
        : undefined;
  const effects = (view.arenaEffects ?? []).filter((effect) => effect.remaining > 0);

  return (
    <section
      className="battle-codex"
      aria-label={t("game.battleCodex")}
      data-testid="battle-codex"
      data-active-field-info={fieldId ?? undefined}
    >
      <h2 className="battle-codex__title">{t("game.battleCodex")}</h2>
      <section className="battle-codex__block">
        <h3 className="battle-codex__kicker">
          {fieldId ? t("game.activeField") : t("game.arenaKicker")}
        </h3>
        <strong className="battle-codex__name">
          {fieldId ? t(getBoardFieldLabelKey(fieldId)) : getArenaLabel(view.arenaId, t)}
          {typeof fieldRemaining === "number" ? (
            <span className="battle-codex__count">
              {t("game.arenaEffectRemainingRounds", { count: fieldRemaining })}
            </span>
          ) : null}
        </strong>
        {fieldId ? (
          <p className="battle-codex__text">{t(getBoardFieldDescriptionKey(fieldId))}</p>
        ) : null}
        <div className="battle-codex__chips">
          {view.arenaId === ARENA_BONE_FIELD_ID && !fieldId ? (
            <span>
              {t("game.boneFieldTurns", { count: Math.max(0, view.boneFieldTurnsLeft ?? 0) })}
            </span>
          ) : null}
          {panelVm.stormActive ? <span data-tone="warning">{t("game.stormActive")}</span> : null}
          {panelVm.forestMarkers.length > 0 ? (
            <span data-tone="forest">
              {t("game.forestMarkers", { count: panelVm.forestMarkers.length })}
            </span>
          ) : null}
        </div>
        {panelVm.stormActive ? (
          <p className="battle-codex__text">{t("game.stormRestriction")}</p>
        ) : null}
      </section>

      {effects.length > 0 ? (
        <section className="battle-codex__block" data-active-arena-effects>
          <h3 className="battle-codex__kicker">{t("game.activeArenaEffects")}</h3>
          {effects.map((effect) => (
            <div key={effect.id} className="battle-codex__effect">
              <strong>
                {effect.effectId === "storm" ? t("game.arenaEffectStorm") : effect.effectId}
                <span className="battle-codex__count">
                  {t(
                    effect.effectId === "storm" || effect.durationUnit === "round"
                      ? "game.arenaEffectRemainingRounds"
                      : "game.arenaEffectRemainingTurns",
                    { count: Math.max(0, effect.remaining) },
                  )}
                </span>
              </strong>
              {effect.sourceUnitId && view.units[effect.sourceUnitId] ? (
                <span className="battle-codex__text">
                  {t("game.arenaEffectSource", {
                    source:
                      getUnitIdDisplayName(view, effect.sourceUnitId, { language, t }) ??
                      effect.sourceUnitId,
                  })}
                </span>
              ) : null}
              {effect.effectId === "storm" ? (
                <span className="battle-codex__text">{t("game.arenaEffectStormDescription")}</span>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}

      <RuleDeclarationStatus vm={vm} compact />
    </section>
  );
};
