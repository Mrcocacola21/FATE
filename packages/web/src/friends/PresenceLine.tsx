import type { Presence } from "../api/friendApi";
import { useI18n, type Language, type Translate } from "../i18n";
import { getGameModeName, isGameModeId } from "../modes/modeLabels";

/** "3 hours ago", "yesterday", or a date once it is more than a month back. */
export function relativeTime(iso: string, language: Language, now = Date.now()) {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const format = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(0, "minute");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86400) return format.format(Math.round(seconds / 3600), "hour");
  if (abs < 30 * 86400) return format.format(Math.round(seconds / 86400), "day");
  return new Date(iso).toLocaleDateString(language);
}

export function presenceText(presence: Presence, t: Translate, language: Language) {
  const activity = presence.activity;
  switch (presence.state) {
    case "battle": {
      const mode = activity?.gameMode;
      return activity
        ? t("presence.battle", {
            mode: mode && isGameModeId(mode) ? getGameModeName(mode, t) : mode,
          })
        : t("presence.groupBattle");
    }
    case "lobby": {
      const place = activity?.lobbyName
        ? t("presence.lobby", { name: activity.lobbyName })
        : t("presence.lobbyUnnamed");
      return activity?.openSeat ? `${place} · ${t("presence.openSeat")}` : place;
    }
    case "online":
      return t("presence.online");
    default:
      return presence.lastSeenAt
        ? t("presence.lastSeen", { time: relativeTime(presence.lastSeenAt, language) })
        : t("presence.offline");
  }
}

/** A coloured dot plus the status in words; colour is never the only signal. */
export function PresenceLine({ presence }: { presence: Presence }) {
  const { t, language } = useI18n();
  return (
    <span className="presence-line" data-state={presence.state}>
      <span className="presence-dot" aria-hidden="true" />
      {presenceText(presence, t, language)}
    </span>
  );
}
