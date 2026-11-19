import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { subscribeMatchmaking, unsubscribeMatchmaking, useGameStore } from "../store";
import { useI18n } from "../i18n";
import { queue, useQueue } from "./store";
import { getGameModeName } from "../modes/modeLabels";
import { MatchProposal } from "./MatchProposal";
import type { MatchProposed } from "./types";
import { setSealing as holdMatch } from "./sealing";
import { profileApi } from "../api/profileApi";
import { saveSealChoice, sealOrDefault, useSealChoice } from "../seals/seals";

/** Mounted across application routes; queue delivery uses the existing game socket. */
export function MatchmakingSync() {
  const userId = useAuthStore((s) => (s.status === "authenticated" ? s.user?.id : undefined));
  const ownName = useAuthStore((s) => s.user?.displayName || s.user?.username || "");
  const ownSeal = useSealChoice();
  // The profile holds the seal; this browser's copy follows it once signed in.
  useEffect(() => {
    if (!userId) return;
    let current = true;
    profileApi.getOwn().then(
      (profile) => {
        if (current) saveSealChoice(profile.seal);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [userId]);
  const connection = useGameStore((s) => s.connectionStatus);
  const result = useQueue((s) => s.status);
  const entering = useRef<string | null>(null);
  const navigate = useNavigate();
  // When the match is made the offer stays a moment, both seals set (the opponent's stamped if it
  // came last), and then comes apart; the room is entered meanwhile, behind it. Worked out while
  // rendering, so the card is never taken away for a moment in between.
  const [previous, setPrevious] = useState(result);
  const [sealing, setSealing] = useState<MatchProposed | null>(null);
  if (result !== previous) {
    setPrevious(result);
    // Accepted by both, the offer becomes a match being made, then a found match.
    const made = result.status === "MATCHING" || result.status === "MATCH_FOUND";
    if (previous.status === "MATCH_PROPOSED" && made)
      setSealing({
        ...previous,
        accepted: true,
        opponentAccepted: true,
        // The opponent's seal is stamped when it came last; the player's own was already set.
      });
    else if (!made) setSealing(null);
  }
  // Before paint, so the match never shows for a frame in front of the sealed offer.
  useLayoutEffect(() => {
    holdMatch(!!sealing);
  }, [sealing]);
  // The opponent's seal is stamped, under their name, as soon as the match is found; the offer
  // stays long enough to see it set.
  const found = result.status === "MATCH_FOUND";
  useEffect(() => {
    if (!sealing || !found) return;
    const timer = setTimeout(() => setSealing(null), 950);
    return () => clearTimeout(timer);
  }, [sealing, found]);
  const { t } = useI18n();
  useEffect(() => {
    queue.owner(userId ?? null);
    if (!userId) unsubscribeMatchmaking();
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const restore = async () => {
      try {
        await subscribeMatchmaking();
        if (active) await queue.restore();
      } catch {
        if (active) timer = setTimeout(() => void restore(), 2000);
      }
    };
    void restore();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [userId, connection]);
  useEffect(() => {
    if (connection !== "connected") {
      entering.current = null;
      return;
    }
    if (result.status !== "MATCH_FOUND") {
      entering.current = null;
      return;
    }
    // The room is entered once the sealed offer has come apart, so the page behind it stays
    // as it was until then.
    if (!userId || sealing || entering.current === result.roomId) return;
    entering.current = result.roomId;
    navigate("/");
    const game = useGameStore.getState();
    if (!game.joined || game.roomId !== result.roomId)
      void game.joinRoom({ mode: "join", roomId: result.roomId, role: result.seat }).catch(() => {
        useGameStore.setState({ joinError: t("matchmaking.error") });
      });
  }, [result, userId, navigate, t, connection, sealing]);
  // One place in the tree for the offer, so the card that is sealed is the same card.
  const offer = userId && result.status === "MATCH_PROPOSED" ? result : userId ? sealing : null;
  const proposal = offer ? (
    <MatchProposal
      offer={offer}
      sealed={offer === sealing}
      mine={{ name: ownName || t("competitive.you"), seal: ownSeal }}
      opponent={
        result.status === "MATCH_FOUND"
          ? { name: result.opponent.displayName, seal: sealOrDefault(result.opponent.seal) }
          : null
      }
    />
  ) : null;
  return (
    <>
      {proposal}
      {/* Told to screen readers; on screen the sealed offer says it. */}
      {userId && result.status === "MATCH_FOUND" ? (
        <div role="status" className="sr-only">
          <p className="section-kicker">{t("matchmaking.found")}</p>
          <p className="text-primary mt-1 font-display text-lg">
            {t("competitive.you")} {t("customLobby.vs")} {result.opponent.displayName}
          </p>
          <p className="mt-1 text-xs text-muted">
            {t("matchTypes.RATED")} · {getGameModeName(result.gameMode, t)}
          </p>
        </div>
      ) : null}
    </>
  );
}
