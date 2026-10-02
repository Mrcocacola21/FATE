import { useI18n } from "../i18n";
import { useId } from "react";
import { GAME_MODE_IDS, isGameModeId, getGameModeName } from "../modes/modeLabels";
import type { MatchHistoryFilters as Filters } from "./types";

export function readHistoryFilters(query: URLSearchParams): Filters | null {
  const page = query.get("page") ?? "1",
    limit = query.get("limit") ?? "20";
  const result = query.get("result"),
    gameMode = query.get("gameMode");
  if (
    !/^[1-9]\d*$/.test(page) ||
    Number(page) > 21474836 ||
    !/^[1-9]\d*$/.test(limit) ||
    Number(limit) > 100 ||
    (result !== null && result !== "WIN" && result !== "LOSS" && result !== "DRAW") ||
    (gameMode !== null && !isGameModeId(gameMode)) ||
    [...query.keys()].some((key) => !["page", "limit", "result", "gameMode"].includes(key)) ||
    [...query.keys()].some((key) => query.getAll(key).length > 1)
  )
    return null;
  return {
    page: Number(page),
    limit: Number(limit),
    result: result ?? undefined,
    gameMode: gameMode ?? undefined,
  };
}

export function MatchHistoryFilters({
  filters,
  onChange,
}: {
  filters: Filters;
  onChange: (key: "result" | "gameMode", value: string) => void;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <div className="my-5 grid gap-3 sm:grid-cols-2">
      <div className="grid gap-1 text-sm">
        <label htmlFor={`${id}-result`}>{t("matches.result")}</label>
        <select
          id={`${id}-result`}
          name="result"
          className="field-control w-full"
          value={filters.result ?? ""}
          onChange={(e) => onChange("result", e.target.value)}
        >
          <option value="">{t("matches.all")}</option>
          {["WIN", "LOSS", "DRAW"].map((result) => (
            <option key={result} value={result}>
              {t(`matches.${result}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-1 text-sm">
        <label htmlFor={`${id}-mode`}>{t("matches.gameMode")}</label>
        <select
          id={`${id}-mode`}
          name="gameMode"
          className="field-control w-full"
          value={filters.gameMode ?? ""}
          onChange={(e) => onChange("gameMode", e.target.value)}
        >
          <option value="">{t("matches.all")}</option>
          {GAME_MODE_IDS.map((mode) => (
            <option key={mode} value={mode}>
              {getGameModeName(mode, t)}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
