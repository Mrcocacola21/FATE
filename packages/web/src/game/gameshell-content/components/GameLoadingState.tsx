interface GameLoadingStateProps {
  connectionStatus: string;
  joined: boolean;
  roomId: string | null;
  role: string | null;
  leavingRoom: boolean;
  onLeave: () => void;
}

import { LanguageSwitcher } from "../../../components/LanguageSwitcher";
import { useI18n } from "../../../i18n";
import { getConnectionLabel } from "../../../i18n/displayMetadata";

export function GameLoadingState({
  connectionStatus,
  joined,
  roomId,
  role,
  leavingRoom,
  onLeave,
}: GameLoadingStateProps) {
  const { t } = useI18n();
  return (
    <div className="app-shell flex min-h-screen items-center justify-center p-4">
      <div className="panel-card panel-arcane arcane-prompt w-full max-w-xl p-6 text-center sm:p-8">
        <div className="brand-sigil mx-auto h-12 w-12 animate-pulse" />
        <div className="section-kicker mt-5">{t("game.loadingKicker")}</div>
        <h1 className="fate-brand mt-2 text-2xl">{t("game.loadingTitle")}</h1>
        <p className="mt-2 text-sm text-muted">{t("game.loadingDescription")}</p>
        <div className="panel-card-muted mt-5 grid grid-cols-2 gap-3 p-3 text-left text-xs text-muted sm:grid-cols-4">
          <div>
            <div className="font-semibold text-primary">{t("game.connection")}</div>
            {getConnectionLabel(connectionStatus, t)}
          </div>
          <div>
            <div className="font-semibold text-primary">{t("game.joined")}</div>
            {joined ? t("common.yes") : t("common.no")}
          </div>
          <div>
            <div className="font-semibold text-primary">{t("game.room")}</div>
            <span className="break-all font-mono">{roomId ?? "-"}</span>
          </div>
          <div>
            <div className="font-semibold text-primary">{t("game.role")}</div>
            {role ?? "-"}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-secondary mt-5"
          onClick={onLeave}
          disabled={leavingRoom}
        >
          {leavingRoom ? t("game.leaving") : t("common.leave")}
        </button>
        <div className="mt-3 flex justify-center">
          <LanguageSwitcher />
        </div>
      </div>
    </div>
  );
}
