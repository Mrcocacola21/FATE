import { Lobby } from "./components/Lobby";
import { Game } from "./components/Game";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { useGameStore } from "./store";

export default function App() {
  const joined = useGameStore((state) => state.joined);
  return (
    <ErrorBoundary>
      {joined ? <Game /> : <Lobby />}
    </ErrorBoundary>
  );
}
