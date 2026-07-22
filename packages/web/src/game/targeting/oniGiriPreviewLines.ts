import type { PlayerView } from "rules";
import { ZORO_ONI_GIRI_ID } from "../../rulesHints";
import type { BoardPreviewLine } from "../effects/types";

export function getOniGiriPreviewLines(
  view: PlayerView,
  sourceUnitId: string,
  selectedTargetId?: string | null,
): BoardPreviewLine[] {
  const source = view.units[sourceUnitId];
  if (!source?.position) return [];

  const targeting = view.abilitiesByUnitId?.[sourceUnitId]
    ?.find((ability) => ability.id === ZORO_ONI_GIRI_ID)
    ?.targeting;
  const projectedTargetIds = targeting?.targetIds ?? [];
  const targetIds = selectedTargetId && projectedTargetIds.includes(selectedTargetId)
    ? [selectedTargetId]
    : projectedTargetIds;

  return targetIds.flatMap((targetId) => {
    const target = view.units[targetId];
    return target?.position
      ? [{ from: { ...source.position! }, to: { ...target.position }, tone: "attack" as const }]
      : [];
  });
}
