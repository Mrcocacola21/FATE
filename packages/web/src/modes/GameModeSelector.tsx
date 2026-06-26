import type { GameModeId } from "rules";
import { useI18n } from "../i18n";
import { StatusBadge } from "../components/ui";
import {
  GAME_MODE_IDS,
  getGameModeDescription,
  getGameModeName,
} from "./modeLabels";

interface GameModeSelectorProps {
  value: GameModeId;
  isHost: boolean;
  disabled?: boolean;
  onChange: (mode: GameModeId) => void;
}

export function GameModeSelector({
  value,
  isHost,
  disabled = false,
  onChange,
}: GameModeSelectorProps) {
  const { t } = useI18n();

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t("modes.selectorTitle")}
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {isHost ? t("modes.hostHint") : t("modes.readOnlyHint")}
          </p>
        </div>
        <StatusBadge tone={disabled ? "neutral" : "info"}>
          {disabled ? t("modes.locked") : t("modes.unlocked")}
        </StatusBadge>
      </div>

      <div className="mt-3 grid gap-2">
        {GAME_MODE_IDS.map((mode) => {
          const selected = value === mode;
          return (
            <button
              key={mode}
              type="button"
              className={`rounded-xl border p-3 text-left transition ${
                selected
                  ? "border-amber-500 bg-amber-50 text-amber-950 ring-2 ring-amber-500/15 dark:bg-amber-950/30 dark:text-amber-100"
                  : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950/45 dark:text-slate-200 dark:hover:border-slate-700"
              } ${!isHost || disabled ? "cursor-default" : ""}`}
              disabled={!isHost || disabled || selected}
              onClick={() => onChange(mode)}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-semibold">{getGameModeName(mode, t)}</span>
                {selected ? <StatusBadge tone="success">{t("common.current")}</StatusBadge> : null}
              </span>
              <span className="mt-1 block text-xs leading-5 text-slate-500 dark:text-slate-400">
                {getGameModeDescription(mode, t)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
