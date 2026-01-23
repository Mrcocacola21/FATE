import { Lobby } from "./components/Lobby";
import { Game } from "./components/Game";
import { useGameStore } from "./store";

export default function App() {
  const joined = useGameStore((state) => state.joined);
  return joined ? <Game /> : <Lobby />;
}
