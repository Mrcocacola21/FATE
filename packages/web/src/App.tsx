import { useEffect, useState } from "react";
import { Lobby } from "./components/Lobby";
import { Game } from "./components/Game";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { FigureSetPage } from "./pages/FigureSetPage";
import { useGameStore } from "./store";

export default function App() {
  const roomId = useGameStore((state) => state.roomId);
  const [screen, setScreen] = useState<"rooms" | "figures">("rooms");
  useEffect(() => {
    if (!roomId) {
      setScreen("rooms");
    }
  }, [roomId]);
  return (
    <ErrorBoundary>
      {roomId ? (
        <Game />
      ) : screen === "figures" ? (
        <FigureSetPage onBack={() => setScreen("rooms")} />
      ) : (
        <Lobby onOpenFigures={() => setScreen("figures")} />
      )}
    </ErrorBoundary>
  );
}
