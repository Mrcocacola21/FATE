import { useEffect, useState } from "react";
import { Lobby } from "./components/Lobby";
import { Game } from "./components/Game";
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
        <Game />
      ) : screen === "figures" ? (
        <FigureSetPage onBack={() => setScreen("rooms")} />
      ) : screen === "heartbreak" ? (
        <Heartbreak />
      ) : (
        <>
          <Lobby onOpenFigures={() => setScreen("figures")} />
          <div style={{marginTop:12}}><button onClick={() => setScreen("heartbreak")}>Open Heartbreak (Ping-Pong)</button></div>
        </>
      )}
    </ErrorBoundary>
  );
}
