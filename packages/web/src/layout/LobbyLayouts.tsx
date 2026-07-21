import type { ReactNode } from "react";
import { useIsMobile } from "./useIsMobile";

interface LobbyLayoutProps {
  children: ReactNode;
}

export function MobileLobbyLayout({ children }: LobbyLayoutProps) {
  return (
    <div
      className="app-shell w-full overflow-x-hidden px-2.5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(0.75rem,env(safe-area-inset-top))]"
      data-layout="mobile"
      data-testid="mobile-lobby-layout"
    >
      <div className="mx-auto w-full min-w-0 max-w-xl space-y-5">{children}</div>
    </div>
  );
}

export function DesktopLobbyLayout({ children }: LobbyLayoutProps) {
  return (
    <div className="app-shell px-6 py-8" data-layout="desktop" data-testid="desktop-lobby-layout">
      <div className="mx-auto max-w-6xl space-y-5">{children}</div>
    </div>
  );
}

export function LobbyLayout({ children }: LobbyLayoutProps) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <MobileLobbyLayout>{children}</MobileLobbyLayout>
  ) : (
    <DesktopLobbyLayout>{children}</DesktopLobbyLayout>
  );
}
