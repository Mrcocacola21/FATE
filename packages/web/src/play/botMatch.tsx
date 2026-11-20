import { useState } from "react";
import { Link, useNavigate } from "react-router";
import type { GameModeId, PlayerId } from "rules";
import { ApiError, isRecord } from "../api/client";
import { authClient, useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { useGameStore } from "../store";
import { isGameModeId } from "../modes/modeLabels";
import { BOT_DIFFICULTIES, type BotDifficulty } from "./PlaySigils";

export interface BotMatch {
  roomId: string;
  matchId: string;
  seat: PlayerId;
  gameMode: GameModeId;
  difficulty: BotDifficulty;
}

export function parseBotMatch(value: unknown): BotMatch {
  if (
    !isRecord(value) ||
    typeof value.roomId !== "string" ||
    !value.roomId ||
    typeof value.matchId !== "string" ||
    (value.seat !== "P1" && value.seat !== "P2") ||
    !isGameModeId(value.gameMode) ||
    !BOT_DIFFICULTIES.includes(value.difficulty as BotDifficulty)
  )
    throw new ApiError("INVALID_RESPONSE");
  return {
    roomId: value.roomId,
    matchId: value.matchId,
    seat: value.seat,
    gameMode: value.gameMode,
    difficulty: value.difficulty as BotDifficulty,
  };
}

export const botApi = {
  create: (difficulty: BotDifficulty, gameMode: GameModeId) =>
    authClient.request("/api/bot-matches", parseBotMatch, {
      method: "POST",
      body: JSON.stringify({ difficulty, gameMode }),
    }),
};

/** The challenge button: the server seats the bot, and the player takes the seat kept for them. */
export function BotChallenge({
  difficulty,
  gameMode,
  create = botApi.create,
}: {
  difficulty: BotDifficulty;
  gameMode: GameModeId;
  create?: typeof botApi.create;
}) {
  const { t } = useI18n();
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user)
    return (
      <div className="play-start">
        <Link className="btn btn-primary" to="/login">
          {t("play.botSignIn")}
        </Link>
      </div>
    );
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const match = await create(difficulty, gameMode);
      navigate("/");
      await useGameStore
        .getState()
        .joinRoom({ mode: "join", roomId: match.roomId, role: match.seat });
    } catch (failure) {
      const code = failure instanceof ApiError ? failure.code : "BOT_UNAVAILABLE";
      setError(
        code === "MATCHMAKING_IN_QUEUE" || code === "MATCHMAKING_ALREADY_IN_MATCH"
          ? "matchmaking.activeMatch"
          : "play.botError",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="play-start">
      <button
        type="button"
        className="btn btn-primary"
        data-testid="bot-challenge"
        disabled={busy}
        onClick={() => void start()}
      >
        {t("play.challenge")}
      </button>
      <p className="play-caption">{t("play.botNote")}</p>
      {error && (
        <p role="alert" className="fate-notice text-sm">
          {t(error as "play.botError")}
        </p>
      )}
    </div>
  );
}
