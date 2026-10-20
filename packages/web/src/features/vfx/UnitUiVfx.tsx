import { useState, type CSSProperties } from "react";
import type { QueuedBoardVfxRequest } from "./vfxTypes";
import { vfxRegistry } from "./vfxRegistry";
import { VfxSprite } from "./VfxSprite";

/** Uses the same queue, sprite and playback clock as board art; only the attachment differs. */
export function UnitUiVfx({ effect, reducedMotion }: { effect: QueuedBoardVfxRequest; reducedMotion: boolean }) {
  const [mountedAt] = useState(() => Date.now());
  const durationMs = effect.expiresAt - effect.startedAt;
  return <span data-unit-ui-vfx={effect.id} aria-hidden="true" className="vfx-geometry vfx-geometry-cell pointer-events-none absolute"
    style={{ width: "100%", height: "300%", left: 0, bottom: "-100%", zIndex: 1,
      "--vfx-delay": `${effect.startedAt - mountedAt}ms`, "--vfx-duration": `${durationMs}ms`,
      animationDelay: `${effect.startedAt - mountedAt}ms` } as CSSProperties}>
    <VfxSprite definition={vfxRegistry[effect.effectId]} reducedMotion={reducedMotion} durationMs={durationMs}
      className="vfx-artwork" style={{ animationDelay: `${effect.startedAt - mountedAt}ms` }} />
  </span>;
}
