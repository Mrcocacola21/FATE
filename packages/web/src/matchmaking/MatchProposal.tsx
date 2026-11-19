import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { conjure, dissolveBlock, magicCircle, writeWithRunes } from "../features/runes/runeMagic";
import { dissolvePage, raiseVeil, snapshotPage } from "../features/runes/pageRunes";
import { getGameModeName } from "../modes/modeLabels";
import { queue, useQueue } from "./store";
import type { MatchProposed } from "./types";
import { SEAL_ART, type SealId } from "../seals/seals";

/**
 * A found rated match, offered before it is made: a countdown, and Accept / Decline. The
 * opponent stays hidden until both accept; then the server seats both players at random and
 * the draft or the battle starts by itself. Letting the time run out counts as declining.
 */
export interface ProposalSeal {
  /** Whose seal: the player's own name, or the opponent's once both have accepted. */
  name: string;
  seal: SealId;
}

export function MatchProposal({
  offer,
  sealed = false,
  mine,
  opponent = null,
}: {
  offer: MatchProposed;
  mine: ProposalSeal;
  /** Unknown until both accept: the opponent stays hidden until then. */
  opponent?: ProposalSeal | null;
  /** Both have accepted: the card stays a moment for the last seal, then the window comes apart. */
  sealed?: boolean;
}) {
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
  const card = useRef<HTMLElement>(null);
  // Leaving: a sealed match takes the whole window apart into runes, which hang over a veil until
  // the draft or the battle is written out of them; a declined or lapsed offer, only the card.
  const sealedNow = useRef(sealed);
  sealedNow.current = sealed;
  useLayoutEffect(() => {
    const root = card.current;
    return () => {
      if (!root) return;
      const whole = sealedNow.current;
      const snapshot = whole ? snapshotPage(document.getElementById("root")) : null;
      const rect = root.getBoundingClientRect();
      // React's development check unmounts without taking anything away.
      queueMicrotask(() => {
        if (root.isConnected) return;
        if (whole) {
          raiseVeil();
          dissolvePage(snapshot, "gold", { hold: true });
        } else if (rect.width) dissolveBlock(root, "gold", rect);
      });
    };
  }, []);
  useEffect(() => {
    accept.current?.focus();
  }, [offer.expiresAt]);
  // The offer is written by runes: a circle turns round the countdown, and the news and its
  // mode gather out of it.
  useEffect(() => {
    const root = card.current;
    if (!root) return;
    const ring = root.querySelector(".match-proposal__ring");
    let close = () => undefined as void;
    // After the card has landed, so the letters are measured where they rest.
    if (sealed) return;
    const timer = setTimeout(() => {
      close = magicCircle(ring, { padding: 18 });
      // The kicker stays as it is once written; accepting rewrites only the title.
      if (!offer.accepted)
        void writeWithRunes(root.querySelector(".match-proposal__kicker"), {
          from: ring,
          stagger: 14,
        });
      void writeWithRunes(root.querySelector(".match-proposal__title [data-active]"), {
        from: ring,
        tone: "gold",
      });
    }, 380);
    return () => {
      clearTimeout(timer);
      close();
    };
    // Accepting changes the title, which is written again; the card keeps its size and the
    // circle is cast again round the countdown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offer.expiresAt, offer.accepted]);
  // Each acceptance is a seal set with a whirl of runes.
  useEffect(() => {
    if (offer.accepted)
      void conjure(card.current?.querySelector(".match-proposal__wax"), { tone: "gold" });
  }, [offer.accepted]);
  useEffect(() => {
    if (offer.opponentAccepted)
      void conjure(card.current?.querySelectorAll(".match-proposal__wax")[1], { tone: "violet" });
  }, [offer.opponentAccepted]);
  // Sealed, the words are plainly shown (a rune writing still under way is cut short).
  useEffect(() => {
    if (!sealed) return;
    card.current?.querySelectorAll<HTMLElement>("[data-rune-veil]").forEach((node) => {
      delete node.dataset.runeVeil;
    });
  }, [sealed]);
  // Sealed, the countdown stops where it was.
  const stopped = useRef<number | null>(null);
  if (sealed) stopped.current ??= Math.max(0, deadline - now);
  const left = stopped.current ?? Math.max(0, deadline - now);
  const seconds = Math.ceil(left / 1000);
  const share = offer.acceptMs > 0 ? left / offer.acceptMs : 0;
  return (
    <div className="match-proposal" data-testid="match-proposal">
      <section
        ref={card}
        className="match-proposal__card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="match-proposal-title"
        aria-describedby="match-proposal-note"
      >
        <span className="match-proposal__kicker">
          {t("matchTypes.RATED")} · {getGameModeName(offer.gameMode, t)}
        </span>
        {/* Both titles share one place, so accepting changes the words, not the card's size. */}
        <h2 id="match-proposal-title" className="match-proposal__title match-proposal__stack">
          <span data-active={!offer.accepted || undefined}>{t("matchmaking.proposal.title")}</span>
          <span data-active={offer.accepted || undefined}>{t("matchmaking.proposal.waiting")}</span>
        </h2>
        <div
          className="match-proposal__ring"
          style={{ "--share": `${Math.round(share * 1000) / 10}%` } as React.CSSProperties}
          role="timer"
          aria-label={t("matchmaking.proposal.timeLeft", { seconds })}
        >
          <b>{seconds}</b>
        </div>
        <div className="match-proposal__seals">
          <SealSlot
            on={offer.accepted}
            seal={mine.seal}
            name={mine.name}
            testId="match-proposal-seal-mine"
          />
          <SealSlot
            on={offer.opponentAccepted && !!opponent}
            seal={opponent?.seal ?? null}
            name={opponent?.name ?? t("matchmaking.proposal.opponent")}
            testId="match-proposal-seal-opponent"
          />
        </div>
        {/* Before and after accepting share one place too: the buttons give way to the note
            without the card shrinking. The hidden one is invisible to everyone, keyboard too. */}
        <div className="match-proposal__stack match-proposal__foot">
          <div data-active={!offer.accepted || undefined}>
            <p
              id={offer.accepted ? undefined : "match-proposal-note"}
              className="match-proposal__note"
            >
              {t("matchmaking.proposal.note")}
            </p>
            <div className="match-proposal__actions">
              <button
                ref={accept}
                type="button"
                className="btn btn-primary"
                disabled={busy || offer.accepted}
                onClick={() => void queue.accept()}
              >
                {t("matchmaking.proposal.accept")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busy || offer.accepted}
                onClick={() => void queue.decline()}
              >
                {t("matchmaking.proposal.decline")}
              </button>
              <p className="match-proposal__warning">{t("matchmaking.proposal.penaltyWarning")}</p>
            </div>
          </div>
          <div data-active={offer.accepted || undefined}>
            <p
              id={offer.accepted ? "match-proposal-note" : undefined}
              className="match-proposal__note"
            >
              {t("matchmaking.proposal.afterAccept")}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}

/** One seal on the offer: an empty dashed place until it is stamped, and whose it is under it. */
function SealSlot({
  on,
  seal,
  name,
  testId,
}: {
  on: boolean;
  seal: SealId | null;
  name: string;
  testId: string;
}) {
  return (
    <figure className="match-proposal__seal" data-on={on || undefined} data-testid={testId}>
      <span className="match-proposal__wax" aria-hidden="true">
        {on && seal ? <img src={SEAL_ART[seal]} alt="" draggable={false} /> : null}
      </span>
      <figcaption className="match-proposal__name" title={name} dir="auto">
        {name}
      </figcaption>
    </figure>
  );
}
