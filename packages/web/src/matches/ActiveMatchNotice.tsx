import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { useGameStore } from "../store";
import { useI18n } from "../i18n";
import { activeMatchApi, type ActiveMatch } from "./activeMatchApi";

export function ActiveMatchNotice() {
  const userId = useAuthStore(s => s.user?.id);
  const joinError = useGameStore(s => s.joinError);
  const [current, setCurrent] = useState<{ userId: string; match: ActiveMatch } | null>(null);
  const navigate = useNavigate();
  const { t } = useI18n();
  useEffect(() => {
    if (!userId) return;
    let active = true;
    let loading = false;
    const refresh = () => {
      if (loading) return;
      loading = true;
      void activeMatchApi.get().then(match => {
        if (active) setCurrent(match ? { userId, match } : null);
      }).catch(() => { if (active) setCurrent(null); }).finally(() => { loading = false; });
    };
    refresh();
    const timer = setInterval(refresh, 10000);
    if (typeof window !== "undefined") window.addEventListener("focus", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      if (typeof window !== "undefined") window.removeEventListener("focus", refresh);
    };
  }, [userId, joinError]);
  if (!current || current.userId !== userId) return null;
  const { match } = current;
  return <div className="fate-notice mb-4 text-sm" role="status">
    <p>{t("activeMatch.present")}</p>
    {match.rejoinable && <button className="btn btn-secondary mt-3" onClick={() => {
      void useGameStore.getState().joinRoom({ mode: "join", roomId: match.roomId, role: match.seat });
      navigate("/");
    }}>{t("activeMatch.return")}</button>}
  </div>;
}
