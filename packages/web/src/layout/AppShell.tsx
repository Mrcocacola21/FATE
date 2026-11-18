import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";
import { useI18n } from "../i18n";
import { useGameStore } from "../store";
import { useCapabilities } from "./Capabilities";
import { Sidebar } from "./Sidebar";
import { TacticalIcon } from "../ui/TacticalIcon";
import { SettingsDrawer } from "../ui/SettingsDrawer";
import { useDialogFocus } from "../ui/useDialogFocus";
import { RoomConnectionDialog } from "../lobby/RoomConnectionDialog";
import { NotificationBell } from "../notifications/NotificationBell";
import { loadSoundSettings } from "../features/sfx/SoundControls";
import { playUiSfx, prepareAudioFromGesture } from "../features/sfx/uiSfx";
import { useAuthStore } from "../auth/authStore";
import { capturePage, clonePage, playPageTurn, type PageSnapshot } from "./pageTurn";
import { getPageTransition } from "./pageTransition";

const SIDEBAR_KEY = "sidebar-collapsed";

function readSidebarCollapsed() {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch {
    return false;
  }
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

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
  const navigate = useNavigate();
  const capabilities = useCapabilities();
  const roomId = useGameStore((state) => state.roomId);
  const [drawer, setDrawer] = useState(false);
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      window.localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
    } catch {
      /* Private mode: the choice lasts until reload. */
    }
  };
  const [overlay, setOverlay] = useState<"rules" | "settings" | "test" | null>(null);
  const [pendingOverlay, setPendingOverlay] = useState<typeof overlay>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLElement>(null);
  useDialogFocus(drawer, drawerRef, () => setDrawer(false));
  const overlayRef = useRef(overlay);
  overlayRef.current = overlay;
  useEffect(() => {
    // A test room created from an account page would otherwise open out of sight.
    const path = location.pathname.replace(/\/$/, "") || "/";
    if (roomId && overlayRef.current === "test" && path !== "/" && path !== "/lobby") navigate("/");
    setDrawer(false);
    setOverlay(null);
    setPendingOverlay(null);
  }, [location.pathname, roomId, navigate]);
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
  // Sidebar links turn the page: the old page is copied on click, before the router swaps it.
  const pageTurn = useRef<PageSnapshot | null>(null);
  const stopPageTurn = useRef<(() => void) | null>(null);
  /** When the plain transition is chosen: the time of the sidebar click it answers. */
  const plainTurn = useRef(0);
  // The last look of each menu section, so a riffle shows real pages it passes. Copies belong
  // to the signed-in account: another account starts with none.
  const pageCopies = useRef(new Map<string, HTMLElement>());
  const accountId = useAuthStore((state) => state.user?.id ?? null);
  useEffect(() => pageCopies.current.clear(), [accountId]);
  const menuPaths = () =>
    new Set(
      Array.from(document.querySelectorAll<HTMLAnchorElement>(".shell-navigation a[href]")).map(
        (item) => new URL(item.href, window.location.href).pathname,
      ),
    );
  useEffect(() => {
    // Refresh the copy once the page has had a moment to load its data.
    if (!navigation || typeof window === "undefined" || typeof window.setTimeout !== "function")
      return;
    const path = location.pathname;
    const timer = window.setTimeout(() => {
      const main = contentRef.current;
      if (main && menuPaths().has(path)) pageCopies.current.set(path, clonePage(main));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [location.pathname, navigation]);
  const capturePageTurn = (event: MouseEvent<HTMLElement>) => {
    const main = contentRef.current;
    if (!main || !navigation || prefersReducedMotion()) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    const link = (event.target as Element).closest?.("a[href]");
    if (!(link instanceof HTMLAnchorElement)) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname === location.pathname) return;
    if (getPageTransition() === "simple") {
      plainTurn.current = performance.now();
      return;
    }
    const items = Array.from(
      link.closest(".shell-navigation")?.querySelectorAll<HTMLAnchorElement>("a[href]") ?? [],
    );
    stopPageTurn.current?.();
    try {
      const snapshot = capturePage(
        main,
        items.findIndex((item) => item.getAttribute("aria-current") === "page"),
        items.indexOf(link),
        items.map((item) => ({
          title: item.dataset.tip ?? item.textContent?.trim() ?? "",
          page: pageCopies.current.get(new URL(item.href, window.location.href).pathname),
        })),
      );
      if (menuPaths().has(location.pathname))
        pageCopies.current.set(location.pathname, snapshot.clone.cloneNode(true) as HTMLElement);
      pageTurn.current = snapshot;
    } catch {
      pageTurn.current = null;
    }
  };
  useLayoutEffect(() => {
    const snapshot = pageTurn.current;
    pageTurn.current = null;
    const main = contentRef.current;
    const plainAt = plainTurn.current;
    plainTurn.current = 0;
    if (main && navigation && plainAt && performance.now() - plainAt < 1000) {
      // The plain transition: the new page rises into place in a blink.
      main.animate?.(
        [
          { opacity: 0, transform: "translateY(6px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 180, easing: "ease-out" },
      );
      return;
    }
    if (!snapshot || !main || !navigation || performance.now() - snapshot.at > 1000) return;
    try {
      stopPageTurn.current = playPageTurn(main, snapshot);
    } catch {
      /* The turn is decoration; the new page is already in place. */
    }
  }, [location.pathname, navigation]);
  useEffect(() => () => stopPageTurn.current?.(), []);
  return (
    <div
      className={navigation ? "app-shell application-shell" : "application-standalone"}
      data-testid="app-shell"
      data-immersive={immersive || undefined}
      data-sidebar={navigation && collapsed ? "collapsed" : undefined}
      onPointerDownCapture={prepareAudioFromGesture}
      onKeyDownCapture={event => { if (event.key === "Enter" || event.key === " ") prepareAudioFromGesture(); }}
    >
      {navigation && (
        <>
          <a className="shell-skip" href="#app-content">
            {t("shell.skipContent")}
          </a>
          <div className="shell-desktop" onClickCapture={capturePageTurn}>
            <Sidebar {...sidebarProps} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
          </div>
          <header className="shell-mobile-bar">
            <span className="fate-brand text-lg">{t("auth.brand")}</span>
            <span className="shell-mobile-bar__end">
              <NotificationBell align="end" />
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
            </span>
          </header>
          {drawer && (
            <div
              id="mobile-navigation"
              ref={drawerRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("lobby.navLabel")}
              className="shell-drawer-backdrop"
              onClickCapture={capturePageTurn}
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
      {overlay === "settings" && <SettingsDrawer onClose={() => setOverlay(null)} />}
      {overlay === "test" && capabilities?.testRooms.enabled && (
        <RoomConnectionDialog kind="test" onClose={() => setOverlay(null)} />
      )}
    </div>
  );
}
