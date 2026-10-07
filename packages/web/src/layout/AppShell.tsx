import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useI18n } from "../i18n";
import { useGameStore } from "../store";
import { useCapabilities } from "./Capabilities";
import { Sidebar } from "./Sidebar";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { ThemeToggle } from "../components/ThemeToggle";
import { TacticalIcon } from "../ui/TacticalIcon";
import { Dialog } from "../ui/Dialog";
import { useDialogFocus } from "../ui/useDialogFocus";
import { RoomConnectionDialog } from "../lobby/RoomConnectionDialog";
import { SoundControls, loadSoundSettings } from "../features/sfx/SoundControls";
import { playUiSfx, prepareAudioFromGesture } from "../features/sfx/uiSfx";

const RulesModal = lazy(() =>
  import("../components/RulesModal").then((module) => ({ default: module.RulesModal })),
);

export function AppShell({
  children,
  standalone = false,
  immersive = false,
}: {
  children: ReactNode;
  standalone?: boolean;
  immersive?: boolean;
}) {
  const { t } = useI18n();
  useEffect(() => { loadSoundSettings(); }, []);
  const location = useLocation();
  const capabilities = useCapabilities();
  const roomId = useGameStore((state) => state.roomId);
  const [drawer, setDrawer] = useState(false);
  const [overlay, setOverlay] = useState<"rules" | "settings" | "test" | null>(null);
  const [pendingOverlay, setPendingOverlay] = useState<typeof overlay>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  useDialogFocus(drawer, drawerRef, () => setDrawer(false));
  useEffect(() => {
    setDrawer(false);
    setOverlay(null);
    setPendingOverlay(null);
  }, [location.pathname, roomId]);
  useEffect(() => {
    // Let the drawer restore its opener before a new dialog takes focus.
    if (!drawer && pendingOverlay) {
      setOverlay(pendingOverlay);
      setPendingOverlay(null);
    }
  }, [drawer, pendingOverlay]);
  useEffect(() => {
    if (!drawer) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawer]);
  useEffect(() => {
    contentRef.current?.toggleAttribute("inert", drawer);
  }, [drawer]);
  const open = (value: typeof overlay) => {
    if (value === "settings") playUiSfx();
    setDrawer(false);
    if (drawer) setPendingOverlay(value);
    else setOverlay(value);
  };
  const sidebarProps = {
    testRoomsEnabled: capabilities?.testRooms.enabled === true,
    onRules: () => open("rules"),
    onSettings: () => open("settings"),
    onTestRoom: () => open("test"),
    onNavigate: () => setDrawer(false),
  };
  const navigation = !standalone && !immersive;
  return (
    <div
      className={navigation ? "app-shell application-shell" : "application-standalone"}
      data-testid="app-shell"
      data-immersive={immersive || undefined}
      onPointerDownCapture={prepareAudioFromGesture}
      onKeyDownCapture={event => { if (event.key === "Enter" || event.key === " ") prepareAudioFromGesture(); }}
    >
      {navigation && (
        <>
          <a className="shell-skip" href="#app-content">
            {t("shell.skipContent")}
          </a>
          <div className="shell-desktop">
            <Sidebar {...sidebarProps} />
          </div>
          <header className="shell-mobile-bar">
            <span className="fate-brand text-lg">{t("auth.brand")}</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              aria-label={t("shell.openMenu")}
              aria-expanded={drawer}
              aria-controls="mobile-navigation"
              onClick={() => setDrawer(true)}
              data-testid="open-navigation"
            >
              <TacticalIcon name="menu" />
            </button>
          </header>
          {drawer && (
            <div
              id="mobile-navigation"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("lobby.navLabel")}
              className="shell-drawer-backdrop"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setDrawer(false);
              }}
            >
              <Sidebar {...sidebarProps} mobile onClose={() => setDrawer(false)} />
            </div>
          )}
        </>
      )}
      <main
        id="app-content"
        ref={contentRef}
        className={navigation ? "shell-content" : undefined}
        tabIndex={-1}
      >
        {children}
      </main>
      {overlay === "rules" && (
        <Suspense fallback={null}>
          <RulesModal open onClose={() => setOverlay(null)} />
        </Suspense>
      )}
      {overlay === "settings" && (
        <Dialog title={t("mobile.settings")} id="settings-title" onClose={() => setOverlay(null)}>
          <div className="space-y-5">
            <div>
              <p className="field-label">{t("language.switchLabel")}</p>
              <LanguageSwitcher />
            </div>
            <div>
              <p className="field-label">{t("profile.theme")}</p>
              <ThemeToggle />
            </div>
            <SoundControls />
          </div>
        </Dialog>
      )}
      {overlay === "test" && capabilities?.testRooms.enabled && (
        <RoomConnectionDialog kind="test" onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}
