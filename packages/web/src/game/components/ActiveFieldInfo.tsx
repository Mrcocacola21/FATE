import type { FC } from "react";
import type { PlayerView } from "rules";
import {
  getActiveBoardFieldVisual,
  getBoardFieldDescriptionKey,
  getBoardFieldLabelKey,
} from "../../assets/registry";
import { PanelCard, SectionHeader, StatusBadge } from "../../components/ui";
import { useI18n } from "../../i18n";

interface ActiveFieldInfoProps {
  view: PlayerView;
}

export const ActiveFieldInfo: FC<ActiveFieldInfoProps> = ({ view }) => {
  const { t } = useI18n();
  const fieldId = getActiveBoardFieldVisual(view);
  if (!fieldId) return null;

  const remaining =
    fieldId === "lechy_storm"
      ? view.arenaEffects?.find((effect) => effect.effectId === "storm" && effect.remaining > 0)
          ?.remaining
      : Math.max(0, view.boneFieldTurnsLeft ?? 0);

  return (
    <div className="active-field-info" data-active-field-info={fieldId}>
      <PanelCard variant="parchment" className="p-4">
        <SectionHeader
          kicker={t("game.activeField")}
          title={t(getBoardFieldLabelKey(fieldId))}
          description={t("game.fieldRules")}
          action={
            typeof remaining === "number" ? (
              <StatusBadge tone="warning">
                {t("game.arenaEffectRemainingTurns", { count: remaining })}
              </StatusBadge>
            ) : undefined
          }
        />
        <p className="mt-3 text-sm leading-6 text-stone-700 dark:text-stone-200">
          {t(getBoardFieldDescriptionKey(fieldId))}
        </p>
      </PanelCard>
    </div>
  );
};
