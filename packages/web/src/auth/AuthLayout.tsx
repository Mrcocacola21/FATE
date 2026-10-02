import { type ReactNode } from "react";
import { Link } from "react-router";
import { PanelCard } from "../components/ui";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeToggle } from "../components/ThemeToggle";
import { useI18n } from "../i18n";

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="app-shell min-h-screen px-3 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-md space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <Link to="/" className="btn btn-secondary">
            {t("common.backToRooms")}
          </Link>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </header>
        <PanelCard className="p-5 sm:p-7">{children}</PanelCard>
      </div>
    </div>
  );
}
