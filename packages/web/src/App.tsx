import { useEffect, useState } from "react";
import { Lobby } from "./components/Lobby";
import { GamePage } from "./pages/GamePage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FigureSetPage } from "./pages/FigureSetPage";
import { useGameStore } from "./store";
import { Heartbreak } from "./pages/Heartbreak";
import { VfxPreviewPage } from "./pages/VfxPreviewPage";
import { VFX_PREVIEW_ROUTE } from "./features/vfx/vfxPreviewScenarios";

export default function App() {
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
