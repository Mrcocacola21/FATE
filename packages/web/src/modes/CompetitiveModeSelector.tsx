import type { GameModeId } from "rules";
import { useI18n } from "../i18n";
import { SegmentTabs } from "../ui/SegmentTabs";
import { GAME_MODE_IDS, getGameModeName } from "./modeLabels";

export function CompetitiveModeSelector({
  value,
  onChange,
  disabled = false,
  idPrefix = "competitive-mode",
  controls,
  stretch,
  className,
}: {
  value: GameModeId;
  onChange: (mode: GameModeId) => void;
  disabled?: boolean;
  idPrefix?: string;
  controls?: string;
  stretch?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <SegmentTabs
      className={`competitive-mode-selector ${className ?? ""}`}
      value={value}
      items={GAME_MODE_IDS.map((mode) => ({ value: mode, label: getGameModeName(mode, t) }))}
      onChange={onChange}
      ariaLabel={t("matchmaking.mode")}
      idPrefix={idPrefix}
      controls={controls}
      disabled={disabled}
      stretch={stretch}
    />
  );
}
