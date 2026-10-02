import React, { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router";
import { authStore } from "./auth/authStore";
import { AuthLayout } from "./auth/AuthLayout";
import { RequireAuth } from "./auth/RequireAuth";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { AccountPage } from "./pages/AccountPage";
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
  const authPage = ["/login", "/register", "/account"].includes(
    location.pathname.replace(/\/$/, ""),
  );
  useEffect(() => {
    void authStore.getState().initializeSession();
  }, []);
  return (
    <ErrorBoundary>
      {/* Preserve mounted game UI and its connection while visiting account routes. */}
      <div hidden={authPage} style={{ display: authPage ? "none" : "contents" }}>
        <GameRuntime />
      </div>
      {authPage && (
        <AuthLayout>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/account"
              element={
                <RequireAuth>
                  <AccountPage />
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
  const roomId = useGameStore((state) => state.roomId);
  const resumeRoom = useGameStore((state) => state.resumeRoom);
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
