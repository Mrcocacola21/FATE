import { useGameStore } from "../../store";

export function usePendingRoll() {
  const roomState = useGameStore((state) => state.roomState);
  const pendingRoll = roomState?.pendingRoll ?? null;
  const resolvePendingRoll = useGameStore((state) => state.resolvePendingRoll);

  return {
    pendingRoll,
    resolvePendingRoll,
  };
}
