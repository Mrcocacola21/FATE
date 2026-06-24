import { useEffect, useState } from "react";
import { Lobby } from "./components/Lobby";
import { GamePage } from "./pages/GamePage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FigureSetPage } from "./pages/FigureSetPage";
import { useGameStore } from "./store";
import { Heartbreak } from "./pages/Heartbreak";

export default function App() {
  const roomId = useGameStore((state) => state.roomId);
  const [screen, setScreen] = useState<"rooms" | "figures" | "heartbreak">("rooms");
  useEffect(() => {
    if (!roomId) {
      setScreen("rooms");
    }
  }, [roomId]);
  return (
    <ErrorBoundary>
      {roomId ? (
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
