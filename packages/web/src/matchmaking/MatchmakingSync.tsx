import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { subscribeMatchmaking, unsubscribeMatchmaking, useGameStore } from "../store";
import { useI18n } from "../i18n";
import { queue, useQueue } from "./store";
import { getGameModeName } from "../modes/modeLabels";

/** Mounted across application routes; queue delivery uses the existing game socket. */
export function MatchmakingSync() {
  const userId = useAuthStore((s) => (s.status === "authenticated" ? s.user?.id : undefined));
  const connection = useGameStore((s) => s.connectionStatus);
  const result = useQueue((s) => s.status);
  const entering = useRef<string | null>(null);
  const [announcement, setAnnouncement] = useState(false);
  const foundRoom = result.status === "MATCH_FOUND" ? result.roomId : null;
  const navigate = useNavigate();
  const { t } = useI18n();
  useEffect(() => {
    setAnnouncement(!!foundRoom);
    if (!foundRoom) return;
    const timer = setTimeout(() => setAnnouncement(false), 2000);
    return () => clearTimeout(timer);
  }, [foundRoom]);
  useEffect(() => {
    queue.owner(userId ?? null);
    if (userId) void queue.loadRating(userId);
    else unsubscribeMatchmaking();
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
    if (!userId || entering.current === result.roomId) return;
    entering.current = result.roomId;
    navigate("/");
    const game = useGameStore.getState();
    if (!game.joined || game.roomId !== result.roomId)
      void game.joinRoom({ mode: "join", roomId: result.roomId, role: result.seat }).catch(() => {
        useGameStore.setState({ joinError: t("matchmaking.error") });
      });
  }, [result, userId, navigate, t, connection]);
  if (!userId || result.status !== "MATCH_FOUND") return null;
  return (
    <div
      role="status"
      className={
        announcement
          ? "panel-card pointer-events-none fixed bottom-20 left-1/2 z-50 w-max max-w-[90vw] -translate-x-1/2 break-words px-4 py-3 text-sm shadow-xl"
          : "sr-only"
      }
    >
      <p className="section-kicker">{t("matchmaking.found")}</p>
      <p className="text-primary mt-1 font-display text-lg">
        {t("competitive.you")} {t("customLobby.vs")} {result.opponent.displayName}
      </p>
      <p className="mt-1 text-xs text-muted">
        {t("matchTypes.RATED")} · {getGameModeName(result.gameMode, t)}
      </p>
    </div>
  );
}
