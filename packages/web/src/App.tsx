import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router";
import { authStore, useAuthStore } from "./auth/authStore";
import { AuthLayout } from "./auth/AuthLayout";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PublicProfilePage } from "./pages/PublicProfilePage";
import { ProfileSync } from "./profile/ProfileSync";
import { Lobby } from "./components/Lobby";
import { GamePage } from "./pages/GamePage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FigureSetPage } from "./pages/FigureSetPage";
import { useGameStore } from "./store";
import { Heartbreak } from "./pages/Heartbreak";
import { VfxPreviewPage } from "./pages/VfxPreviewPage";
import { VFX_PREVIEW_ROUTE } from "./features/vfx/vfxPreviewScenarios";

export default function App() {
  const location = useLocation();
  const authPage =
    location.pathname.startsWith("/users/") ||
    ["/login", "/register", "/account", "/profile"].includes(location.pathname.replace(/\/$/, ""));
  useEffect(() => {
    void authStore.getState().initializeSession();
  }, []);
  return (
    <ErrorBoundary>
      <ProfileSync />
      {/* Preserve mounted game UI and its connection while visiting account routes. */}
      <div hidden={authPage} style={{ display: authPage ? "none" : "contents" }}>
        <GameRuntime />
      </div>
      {authPage && (
        <AuthLayout>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/users/:username" element={<PublicProfilePage />} />
            <Route path="/account" element={<Navigate replace to="/profile" />} />
            <Route
              path="/profile"
              element={
                <RequireAuth>
                  <ProfilePage />
                </RequireAuth>
              }
            />
          </Routes>
        </AuthLayout>
      )}
    </ErrorBoundary>
  );
}

function GameRuntime() {
  const authStatus = useAuthStore((state) => state.status);
  const joined = useGameStore((state) => state.joined);
  const roomId = useGameStore((state) => state.roomId);
  const resumeRoom = useGameStore((state) => state.resumeRoom);
  useEffect(() => {
    if (authStatus === "authenticated" && !joined) void resumeRoom();
  }, [authStatus, joined, resumeRoom]);
  const [screen, setScreen] = useState<"rooms" | "figures" | "heartbreak">("rooms");
  const isVfxPreviewPath =
    typeof window !== "undefined" && window.location.pathname === VFX_PREVIEW_ROUTE;
  const canShowVfxPreview = import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_ROOM === "true";
  useEffect(() => {
    if (!roomId) {
      setScreen("rooms");
    }
  }, [roomId]);
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
      ) : screen === "figures" ? (
        <FigureSetPage onBack={() => setScreen("rooms")} />
      ) : screen === "heartbreak" ? (
        <Heartbreak onBack={() => setScreen("rooms")} />
      ) : (
        <Lobby
          onOpenFigures={() => setScreen("figures")}
          onOpenHeartbreak={() => setScreen("heartbreak")}
        />
      )}
    </ErrorBoundary>
  );
}
