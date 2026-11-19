import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { getGameModeName } from "../modes/modeLabels";
import { queue, useQueue } from "./store";
import type { MatchProposed } from "./types";

/**
 * A found rated match, offered before it is made: a countdown, and Accept / Decline. The
 * opponent stays hidden until both accept; then the server seats both players at random and
 * the draft or the battle starts by itself. Letting the time run out counts as declining.
 */
export function MatchProposal({ offer }: { offer: MatchProposed }) {
  const { t } = useI18n();
  const busy = useQueue((s) => s.busy);
  // The deadline is fixed on this machine's clock the first time the offer is seen, so a skewed
  // clock cannot change how long the player has.
  const deadlines = useRef(new Map<string, number>());
  if (!deadlines.current.has(offer.expiresAt))
    deadlines.current.set(offer.expiresAt, Date.now() + offer.acceptMs);
  const deadline = deadlines.current.get(offer.expiresAt)!;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, []);
  const accept = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    accept.current?.focus();
  }, [offer.expiresAt]);
  const left = Math.max(0, deadline - now);
  const seconds = Math.ceil(left / 1000);
  const share = offer.acceptMs > 0 ? left / offer.acceptMs : 0;
  return (
    <div className="match-proposal" data-testid="match-proposal">
      <section
        className="match-proposal__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="match-proposal-title"
        aria-describedby="match-proposal-note"
      >
        <span className="match-proposal__kicker">
          {t("matchTypes.RATED")} · {getGameModeName(offer.gameMode, t)}
        </span>
        <h2 id="match-proposal-title" className="match-proposal__title">
          {t(offer.accepted ? "matchmaking.proposal.waiting" : "matchmaking.proposal.title")}
        </h2>
        <div
          className="match-proposal__ring"
          style={{ "--share": `${Math.round(share * 1000) / 10}%` } as React.CSSProperties}
          role="timer"
          aria-label={t("matchmaking.proposal.timeLeft", { seconds })}
        >
          <b>{seconds}</b>
        </div>
        {offer.accepted && (
          <div className="match-proposal__seals" aria-hidden="true">
            <span className="match-proposal__seal" data-on="">
              {t("matchmaking.proposal.you")}
            </span>
            <span className="match-proposal__seal" data-on={offer.opponentAccepted || undefined}>
              {t("matchmaking.proposal.opponent")}
            </span>
          </div>
        )}
        <p id="match-proposal-note" className="match-proposal__note">
          {t(offer.accepted ? "matchmaking.proposal.afterAccept" : "matchmaking.proposal.note")}
        </p>
        {!offer.accepted && (
          <div className="match-proposal__actions">
            <button
              ref={accept}
              type="button"
              className="btn btn-primary"
              disabled={busy}
              onClick={() => void queue.accept()}
            >
              {t("matchmaking.proposal.accept")}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => void queue.decline()}
            >
              {t("matchmaking.proposal.decline")}
            </button>
            <p className="match-proposal__warning">{t("matchmaking.proposal.penaltyWarning")}</p>
          </div>
        )}
      </section>
    </div>
  );
}
