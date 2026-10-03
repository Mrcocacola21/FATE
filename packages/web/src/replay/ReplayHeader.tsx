import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import {
  finishReasonLabel,
  formatDate,
  formatDuration,
  modeLabel,
  outcomeLabel,
} from "../matches/presentation";
import type { ReplayMetadata } from "./types";

export function ReplayHeader({ metadata }: { metadata: ReplayMetadata }) {
  const { t, language } = useI18n();
  const winner = metadata.participants.find((p) => p.seat === metadata.winnerSeat);
  const draw = metadata.participants.every((p) => p.outcome === "DRAW");
  return (
    <header>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 id="replay-title" className="text-2xl font-bold">
          {t("replay.title")}
        </h1>
        <p className="font-semibold">
          {winner
            ? t("replay.winner", { name: winner.displayName })
            : draw
              ? t("matches.DRAW")
              : t("matches.unknown")}
        </p>
      </div>
      <div className="my-4 grid grid-cols-2 gap-3">
        {metadata.participants.map((p) => (
          <article
            key={p.seat}
            className="match-participant flex min-w-0 items-center gap-3 p-3"
            data-outcome={p.outcome}
          >
            <Avatar
              username={p.username ?? p.displayName}
              displayName={p.displayName}
              avatarUrl={p.avatarUrl}
              small
            />
            <div className="min-w-0 break-words">
              <h2 className="font-bold">{p.displayName}</h2>
              <p className="text-sm">
                {p.seat} · {outcomeLabel(p.outcome, t)}
              </p>
            </div>
          </article>
        ))}
      </div>
      <p className="text-xs leading-5 opacity-75">
        {modeLabel(metadata.gameMode, t)} · {formatDuration(metadata.durationMs, t)}
        {" · "}
        {formatDate(metadata.finishedAt, language, t)} ·{" "}
        {finishReasonLabel(metadata.finishReason, t)}
      </p>
      <p className="mt-1 text-xs opacity-75">{t("replay.readOnly")}</p>
    </header>
  );
}
