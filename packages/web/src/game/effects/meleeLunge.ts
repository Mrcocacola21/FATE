import type { Coord, PlayerView, ProjectedGameEvent } from "rules";
import { expansionAttack } from "../../features/vfx/expansionPresentation";
import { MELEE_RECOVERY_MS } from "../../features/vfx/meleeStrike";

export const MELEE_RETURN_MS = MELEE_RECOVERY_MS;
export interface MeleeLungePose { direction: Coord; distance: number; stretch: number }

/** Only an accepted adjacent melee release; no aim inferred from hidden units. */
export function isMeleeRelease(event: Extract<ProjectedGameEvent, { type: "attackResolved" }>, view: PlayerView): boolean {
  const unit = event.attackerId ? view.units[event.attackerId] : undefined;
  if (!unit?.position || !event.sourceCell || !event.targetCell) return false;
  return Boolean(expansionAttack(event, undefined, view, "lunge")[0]?.strikeContactMs);
}

export function meleeLungeDirection(event: Extract<ProjectedGameEvent, { type: "attackResolved" }>, view: PlayerView): Coord | null {
  if (!isMeleeRelease(event, view) || !event.sourceCell || !event.targetCell) return null;
  const dx = event.targetCell.col - event.sourceCell.col, dy = event.targetCell.row - event.sourceCell.row;
  if (Math.max(Math.abs(dx), Math.abs(dy)) !== 1) return null;
  const length = Math.hypot(dx, dy);
  return { col: dx / length, row: dy / length };
}

const smooth = (value: number) => { const t = Math.max(0, Math.min(1, value)); return t * t * (3 - 2 * t); };
/** Sampled by the existing combat RAF. Never modifies the occupied board cell. */
export function meleeLungePose(direction: Coord, elapsedMs: number, contactMs: number): MeleeLungePose {
  const phase = elapsedMs / Math.max(1, contactMs);
  const distance = phase <= 1
    ? phase < .35 ? -.035 * smooth(phase / .35) : -.035 + .275 * smooth((phase - .35) / .65)
    : .24 * (1 - smooth((elapsedMs - contactMs) / MELEE_RETURN_MS));
  return { direction, distance, stretch: 1 + .075 * Math.max(0, distance / .24) };
}
