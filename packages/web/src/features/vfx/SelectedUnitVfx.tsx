import type { PlayerId, PlayerView } from "rules";
import { useMemo, type CSSProperties } from "react";
import { getUnitTokenAsset } from "../../assets/registry";
import type { CombatVisualPlaybackFrame } from "../../game/effects/combatPlayback";
import { basicExpansion } from "./expansionPresentation";
import { cellToBoardRect } from "./vfxGeometry";
import { BOARD_LAYERS, vfxRegistry } from "./vfxRegistry";
import { VfxSprite } from "./VfxSprite";
import { deploymentRevealFractions, selectionRingBounds } from "./expansionPresence.generated";
import type { QueuedBoardVfxRequest } from "./vfxTypes";
import { usePortraitReady } from "./usePortraitReady";

/** Fit the visible contour, rather than its transparent 128px canvas, to the cell. */
export function selectionRingFrame(heroId: string) {
  const bounds = selectionRingBounds[heroId] ?? { left: 0, top: 0, width: 128, height: 128 };
  const fill = .98, inset = .01;
  return { width: `${128 / bounds.width * fill * 100}%`, height: `${128 / bounds.height * fill * 100}%`,
    left: `${(inset - bounds.left / bounds.width * fill) * 100}%`, top: `${(inset - bounds.top / bounds.height * fill) * 100}%` };
}

/** Local selection owns this static artwork. No event, timer or render-triggered one-shot. */
export function SelectedUnitVfx({ view, unitId, playerId = null, visualUnits = view.units, motion = {}, deployment, reducedMotion = false, boardSize, cellSize, isFlipped }: {
  view: PlayerView; unitId: string | null; playerId?: PlayerId | null; boardSize: number; cellSize: number; isFlipped: boolean;
  visualUnits?: PlayerView["units"]; motion?: CombatVisualPlaybackFrame["visualMotionByUnitId"];
  deployment?: QueuedBoardVfxRequest; reducedMotion?: boolean;
}) {
  const unit = unitId ? view.units[unitId] : undefined;
  const effectId = unitId ? basicExpansion(view, unitId, "select_ring") : undefined;
  const permitted = unit?.isAlive && unit.position && effectId && (!unit.isStealthed || unit.owner === playerId);
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
    style={{ ...cellToBoardRect(position, boardSize, cellSize, isFlipped), overflow: "hidden", opacity: motion[unit.id]?.opacity, zIndex: BOARD_LAYERS.status,
      maskImage: "radial-gradient(closest-side, transparent 72%, #000 80%)", WebkitMaskImage: "radial-gradient(closest-side, transparent 72%, #000 80%)" }}>
    <span className="absolute inset-0" style={timing}>
      <VfxSprite definition={vfxRegistry[effectId]} reducedMotion className="persistent-selection-art"
        style={{ ...selectionRingFrame(unit.heroId!), position: "absolute", objectFit: "fill", animation: "none" }} />
    </span>
  </span>;
}
