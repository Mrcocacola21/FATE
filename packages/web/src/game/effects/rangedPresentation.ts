import type { PlayerView, ProjectedGameEvent } from "rules";
import type { VfxEffectId } from "../../features/vfx/vfxTypes";

/** Explicit projectile branches only; distant melee and area victims are not arrows. */
export function rangedAttackEffect(event: Extract<ProjectedGameEvent, { type: "attackResolved" }>, view: PlayerView): VfxEffectId | undefined {
  const source = event.attackerId ? view.units[event.attackerId] : undefined;
  if (!source?.position || !event.sourceCell || !event.targetCell) return undefined;
  if (event.attackSignature === "riderPath") return undefined;
  if (event.attackSignature === "friskPrecisionStrike") return "friskPrecision";
  if (event.abilityId === "jebeKhansShooter") return "jebeRicochet";
  if (source.heroId === "odin" && event.hit && event.attackerRoll.isDouble) return "odinGungnir";
  if (event.abilityId === "gutsArbalet") return "gutsCrossbow";
  if (event.abilityId === "gutsCannon") return "basicProjectile";
  if (event.abilityId === "undyneSpearThrow") return "undyneThrow";
  return event.isBasicAttack && source.class === "archer" && !event.attackSignature ? "basicProjectile" : undefined;
}

/** A readable distance-based flight on the existing presentation clock. */
export function rangedFlightMs(event: Extract<ProjectedGameEvent, { type: "attackResolved" }>): number {
  if (!event.sourceCell || !event.targetCell) return 360;
  const distance = Math.max(Math.abs(event.targetCell.col - event.sourceCell.col), Math.abs(event.targetCell.row - event.sourceCell.row));
  return Math.min(780, 300 + Math.max(1, distance) * 60);
}
