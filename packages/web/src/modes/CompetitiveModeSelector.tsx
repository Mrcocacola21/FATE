import type { GameModeId } from "rules";
import { useI18n } from "../i18n";
import { GAME_MODE_IDS, getGameModeName } from "./modeLabels";

export function CompetitiveModeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: GameModeId;
  onChange: (mode: GameModeId) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div
      className="competitive-mode-selector flex flex-wrap gap-2"
      role="group"
      aria-label={t("matchmaking.mode")}
    >
      {GAME_MODE_IDS.map((mode) => (
        <button
          key={mode}
          type="button"
          className={`btn btn-sm ${value === mode ? "btn-primary" : "btn-ghost"}`}
          aria-pressed={value === mode}
          disabled={disabled}
          onClick={() => onChange(mode)}
        >
          {getGameModeName(mode, t)}
        </button>
      ))}
    </div>
  );
}
