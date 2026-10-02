import { useEffect, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { authStore, useAuthStore } from "./auth/authStore";
import { AuthLayout } from "./auth/AuthLayout";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { MatchHistoryPage, PublicMatchHistoryPage } from "./pages/MatchHistoryPage";
import { MatchDetailsPage } from "./pages/MatchDetailsPage";
import { ProfileSync } from "./profile/ProfileSync";
import { Lobby } from "./components/Lobby";
import { GamePage } from "./pages/GamePage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FigureSetPage } from "./pages/FigureSetPage";
import { useGameStore } from "./store";
import { Heartbreak } from "./pages/Heartbreak";
import { VfxPreviewPage } from "./pages/VfxPreviewPage";
import { VFX_PREVIEW_ROUTE } from "./features/vfx/vfxPreviewScenarios";
import { AppShell } from "./layout/AppShell";
import { CapabilitiesProvider, useCapabilities } from "./layout/Capabilities";
import { PanelCard } from "./components/ui";

export default function App() {
  const location = useLocation();
  const path = location.pathname.replace(/\/$/, "") || "/";
  const authPage = ["/login", "/register"].includes(path);
  const runtimePage = path === "/" || path === VFX_PREVIEW_ROUTE;
  const roomId = useGameStore((state) => state.roomId);
  useEffect(() => {
    void authStore.getState().initializeSession();
  }, []);
  return (
    <ErrorBoundary>
      <ProfileSync />
      <CapabilitiesProvider>
        <AppShell
          standalone={authPage}
          immersive={runtimePage && (!!roomId || path === VFX_PREVIEW_ROUTE)}
        >
          {/* Preserve mounted game UI and its connection while visiting account routes. */}
          <div hidden={!runtimePage} style={{ display: runtimePage ? "contents" : "none" }}>
            <GameRuntime />
          </div>
          {!runtimePage && (
            <ApplicationPage standalone={authPage}>
              <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/register" element={<RegisterPage />} />
                <Route path="/figures" element={<FigureSetPage />} />
                <Route path="/heartbreak" element={<CapabilityHeartbreak />} />
                <Route path="/users/:username" element={<PublicProfilePage />} />
                <Route path="/users/:username/matches" element={<PublicMatchHistoryPage />} />
                <Route
                  path="/matches"
                  element={
                    <RequireAuth>
                      <MatchHistoryPage />
                    </RequireAuth>
                  }
                />
                <Route path="/matches/:id" element={<MatchDetailsPage />} />
                <Route path="/account" element={<Navigate replace to="/profile" />} />
                <Route
                  path="/profile"
                  element={
                    <RequireAuth>
                      <ProfilePage />
                    </RequireAuth>
                  }
                />
                <Route path="*" element={<Navigate replace to="/" />} />
              </Routes>
            </ApplicationPage>
          )}
        </AppShell>
      </CapabilitiesProvider>
    </ErrorBoundary>
  );
}

function ApplicationPage({ children, standalone }: { children: ReactNode; standalone: boolean }) {
  const location = useLocation();
  if (standalone) return <AuthLayout>{children}</AuthLayout>;
  if (["/figures", "/heartbreak"].includes(location.pathname.replace(/\/$/, "")))
    return <>{children}</>;
  return (
    <PanelCard className="information-page mx-auto w-full max-w-4xl p-5 sm:p-7">
      {children}
    </PanelCard>
  );
}

function CapabilityHeartbreak() {
  const capabilities = useCapabilities();
  if (!capabilities) return null;
  return capabilities.testRooms.enabled ? <Heartbreak /> : <Navigate replace to="/" />;
}

function GameRuntime() {
  const authStatus = useAuthStore((state) => state.status);
  const joined = useGameStore((state) => state.joined);
  const roomId = useGameStore((state) => state.roomId);
  const resumeRoom = useGameStore((state) => state.resumeRoom);
  useEffect(() => {
    if (authStatus === "authenticated" && !joined) void resumeRoom();
  }, [authStatus, joined, resumeRoom]);
  const isVfxPreviewPath =
    typeof window !== "undefined" && window.location.pathname === VFX_PREVIEW_ROUTE;
  const canShowVfxPreview = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_ROOM === "true";
  useEffect(() => {
    void resumeRoom();

    const refreshRoomSnapshot = () => {
      void resumeRoom({ force: true });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshRoomSnapshot();
    };

    window.addEventListener("online", refreshRoomSnapshot);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("online", refreshRoomSnapshot);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [resumeRoom]);
  return (
    <ErrorBoundary>
      {isVfxPreviewPath && canShowVfxPreview ? (
        <VfxPreviewPage />
      ) : roomId ? (
        <GamePage />
      ) : (
        <Lobby />
      )}
    </ErrorBoundary>
  );
}
