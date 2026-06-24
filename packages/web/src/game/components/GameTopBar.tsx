import type { FC } from "react";
import { ThemeToggle } from "../../components/ThemeToggle";
import { LanguageSwitcher } from "../../components/LanguageSwitcher";
import { useI18n } from "../../i18n";

interface GameTopBarProps {
  roomId: string | null;
  role: string | null;
}

export const GameTopBar: FC<GameTopBarProps> = ({ roomId, role }) => {
  const { t } = useI18n();
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs text-slate-500 dark:text-slate-300">
        {t("game.room")}: {roomId ?? "-"} | {t("game.role")}:{" "}
        {role ? t(`roles.${role}`) : "-"}
      </div>
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <ThemeToggle />
      </div>
    </div>
  );
};
