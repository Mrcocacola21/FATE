import { GameShellLayout } from "./gameshell-content/components/GameShellLayout";
import { useGameShellViewModel } from "./gameshell-content/hooks/useGameShellViewModel";

export function Game() {
  const vm = useGameShellViewModel();
  return <GameShellLayout vm={vm} />;
}
