import { useGameStore } from "../../store";

export function useSelection() {
  const selectedUnitId = useGameStore((state) => state.selectedUnitId);
  const actionMode = useGameStore((state) => state.actionMode);
  const placeUnitId = useGameStore((state) => state.placeUnitId);
  const setSelectedUnit = useGameStore((state) => state.setSelectedUnit);
  const setActionMode = useGameStore((state) => state.setActionMode);
  const setPlaceUnitId = useGameStore((state) => state.setPlaceUnitId);

  return {
    selectedUnitId,
    actionMode,
    placeUnitId,
    setSelectedUnit,
    setActionMode,
    setPlaceUnitId,
  };
}
