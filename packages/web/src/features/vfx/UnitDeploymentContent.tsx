import { useMemo, type CSSProperties, type ReactNode } from "react";
import type { QueuedBoardVfxRequest } from "./vfxTypes";
import { vfxRegistry } from "./vfxRegistry";
import { VfxSprite } from "./VfxSprite";
import { usePortraitReady } from "./usePortraitReady";
import { deploymentRevealFractions } from "./expansionPresence.generated";

interface Props {
  effect?: QueuedBoardVfxRequest;
  reducedMotion: boolean;
  portraitSrc?: string;
  cellSize?: number;
  style?: CSSProperties;
  movementMode?: string;
  children: ReactNode;
}

/** The portrait DOM survives entry and cleanup; the whole composition enters together. */
export function UnitDeploymentContent({ effect, reducedMotion, portraitSrc, cellSize = 64, style, movementMode, children }: Props) {
  const portraitReady = usePortraitReady(portraitSrc);
  const mountedAt = useMemo(() => effect && portraitReady ? Date.now() : 0, [effect, portraitReady]);
  const active = effect && portraitReady && effect.expiresAt > mountedAt ? effect : undefined;
  const definition = active ? vfxRegistry[active.effectId] : undefined;
  const profile = definition?.stagingProfile;
  const durationMs = active ? active.expiresAt - active.startedAt : 0;
  const revealFraction = active ? deploymentRevealFractions[active.effectId.split(".")[1]] ?? .5 : .5;
  const timing = active ? { "--vfx-delay": `${active.startedAt - mountedAt}ms`, "--vfx-duration": `${durationMs}ms`,
    "--vfx-reveal-duration": `${durationMs * revealFraction}ms`,
    "--vfx-opacity": definition?.opacity, animationDelay: `${active.startedAt - mountedAt}ms`, animationDuration: `${durationMs}ms` } as CSSProperties : undefined;
  const width = (profile?.deployWidth ?? 1.65) * cellSize;
  const height = (profile?.deployHeight ?? 1.65) * cellSize;
  return <div className="board-unit-content" style={style} data-movement-mode={movementMode}>
    <div data-unit-deployment={active?.id} data-portrait-ready={portraitReady}
      className={`unit-deployment-composition ${active ? reducedMotion ? "unit-deployment-enter-reduced" : "unit-deployment-enter" : ""}`} style={timing}>
      <div className={`unit-deployment-token ${effect && !portraitReady ? "unit-deployment-pending" : ""}`}>{children}</div>
      {active && definition && <span aria-hidden="true" data-vfx-cue={active.id} data-vfx-effect={active.effectId} data-vfx-start={active.startedAt}
        data-vfx-layer="ground" className={`vfx-geometry vfx-geometry-cell vfx-stage-deploy pointer-events-none ${reducedMotion ? "vfx-reduced" : ""}`}
        style={{ ...timing, width, height, left: `calc(50% - ${width / 2}px)`, top: `calc(50% - ${height / 2 + cellSize * 0.04}px)`, zIndex: -1 }}>
        <span className="unit-deployment-light" />
        <VfxSprite definition={definition} reducedMotion={reducedMotion} durationMs={durationMs} className="vfx-artwork" style={timing} />
      </span>}
    </div>
  </div>;
}
