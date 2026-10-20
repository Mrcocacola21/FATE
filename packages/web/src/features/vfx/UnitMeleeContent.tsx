import type { ReactNode } from "react";
import type { MeleeLungePose } from "../../game/effects/meleeLunge";

/** The portrait leans into the cut; selection, aura and tactical cell stay fixed. */
export function UnitMeleeContent({ pose, preparing = false, cellSize, isFlipped, children }: {
  pose?: MeleeLungePose; preparing?: boolean; cellSize: number; isFlipped: boolean; children: ReactNode;
}) {
  const flip = isFlipped ? -1 : 1;
  const x = (pose?.direction.col ?? 0) * flip, y = -(pose?.direction.row ?? 0) * flip;
  const angle = Math.atan2(y, x) * 180 / Math.PI;
  const distance = (pose?.distance ?? 0) * cellSize;
  return <div className={`unit-melee-content${preparing && !pose ? " unit-combat-preparing" : ""}`} data-combat-preparing={preparing && !pose ? "true" : undefined} data-melee-lunge={pose ? "true" : undefined}
    style={pose ? { pointerEvents: "none", transform: `translate(${x * distance}px, ${y * distance}px) rotate(${angle}deg) scale(${pose.stretch}, ${1 - (pose.stretch - 1) * .45}) rotate(${-angle}deg)` } : undefined}>
    {children}
  </div>;
}
