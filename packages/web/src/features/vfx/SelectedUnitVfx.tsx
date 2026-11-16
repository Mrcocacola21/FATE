import type { PlayerId, PlayerView } from "rules";
import { useMemo, type CSSProperties } from "react";
import { getUnitTokenAsset } from "../../assets/registry";
import type { CombatVisualPlaybackFrame } from "../../game/effects/combatPlayback";
import { basicExpansion } from "./expansionPresentation";
import { cellToBoardRect } from "./vfxGeometry";
import { BOARD_LAYERS } from "./vfxRegistry";
import { deploymentRevealFractions } from "./expansionPresence.generated";
import { getSelectionHalo } from "./selectionHalos";
import type { QueuedBoardVfxRequest } from "./vfxTypes";
import { usePortraitReady } from "./usePortraitReady";

/**
 * Local selection owns this artwork: the hero's halo around the arch, brightened, with a softly
 * pulsing glow copy beneath it. No event, timer or render-triggered one-shot.
 */
export function SelectedUnitVfx({ view, unitId, playerId = null, visualUnits = view.units, motion = {}, deployment, reducedMotion = false, boardSize, cellSize, isFlipped }: {
  view: PlayerView; unitId: string | null; playerId?: PlayerId | null; boardSize: number; cellSize: number; isFlipped: boolean;
  visualUnits?: PlayerView["units"]; motion?: CombatVisualPlaybackFrame["visualMotionByUnitId"];
  deployment?: QueuedBoardVfxRequest; reducedMotion?: boolean;
}) {
  const unit = unitId ? view.units[unitId] : undefined;
  const effectId = unitId ? basicExpansion(view, unitId, "select_ring") : undefined;
  const halo = effectId ? getSelectionHalo(effectId) : undefined;
  const permitted = unit?.isAlive && unit.position && halo && (!unit.isStealthed || unit.owner === playerId);
  const portrait = permitted ? getUnitTokenAsset(unit) : undefined;
  const ready = usePortraitReady(portrait && !portrait.isFallback ? portrait.src : undefined);
  const mountedAt = useMemo(() => deployment && ready ? Date.now() : 0, [deployment, ready]);
  if (!permitted || !ready) return null;
  const position = motion[unit.id]?.position ?? visualUnits[unit.id]?.position;
  if (!position) return null;
  const reveal = deployment && deployment.unitId === unit.id && deployment.expiresAt > mountedAt
    ? (deployment.expiresAt - deployment.startedAt) * (deploymentRevealFractions[unit.heroId!] ?? .5) : 0;
  const timing: CSSProperties = reveal && deployment ? {
    animation: `unit-deployment-token-reveal ${reducedMotion ? Math.min(120, reveal) : reveal}ms ease-in-out ${deployment.startedAt - mountedAt}ms both`,
  } : { animation: "none" };
  return <span data-selection-vfx={unit.id} aria-hidden="true" className="pointer-events-none absolute"
    style={{ ...cellToBoardRect(position, boardSize, cellSize, isFlipped), overflow: "hidden", opacity: motion[unit.id]?.opacity, zIndex: BOARD_LAYERS.status }}>
    <span className="absolute inset-0" style={timing}>
      <img src={halo} alt="" draggable={false} className="selection-halo selection-halo--glow"
        data-reduced-motion={reducedMotion ? "true" : undefined} />
      <img src={halo} alt="" draggable={false} className="selection-halo" />
    </span>
  </span>;
}
