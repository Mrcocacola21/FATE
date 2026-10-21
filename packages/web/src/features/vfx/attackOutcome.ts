import type { PlayerView, ProjectedGameEvent } from "rules";
import type { BoardVfxRequest, VfxEffectId } from "./vfxTypes";
import { basicExpansion, expansionOutcome } from "./expansionPresentation";

// Hue of the existing cyan guard artwork, selected from the permitted defender.
export const HERO_GUARD_HUES: Readonly<Record<string, number>> = {
  artemida: 215, asgore: 35, chikatilo: 355, donKihote: 45, duolingo: 110,
  elCidCompeador: 40, femto: 275, frisk: 355, genghisKhan: 40, "grand-kaiser": 0,
  griffith: 215, grozny: 15, guts: 5, hassan: 155, jackRipper: 350, jebe: 185,
  kaladin: 195, kaneki: 355, lechy: 115, loki: 285, luche: 45, mettaton: 325,
  odin: 270, papyrus: 25, riverPerson: 185, sans: 205, undyne: 195, vladTepes: 0, zoro: 130,
};
export function guardHue(view: PlayerView, unitId: string): number | undefined {
  const unit = view.units[unitId];
  if (!unit?.position || !unit.heroId) return undefined;
  return unit.heroId === "mettaton" && unit.mettatonNeoUnlocked ? 195 : HERO_GUARD_HUES[unit.heroId];
}

/** Correlate only the immediately preceding accepted choice for this target. */
export function acceptedAutoDefense(events: readonly ProjectedGameEvent[], index: number): boolean {
  const event = events[index];
  if (event?.type !== "attackResolved" || event.hit) return false;
  for (let i = index - 1; i >= 0; i--) {
    const prior = events[i];
    if (prior.type === "attackResolved" && prior.defenderId === event.defenderId) return false;
    if (prior.type === "berserkerDefenseChosen" && prior.defenderId === event.defenderId) return prior.choice === "auto";
  }
  return false;
}

/** Attack gesture, contact result and confirmed protection have distinct owners. */
export function attackOutcomeRequests(event: Extract<ProjectedGameEvent, { type: "attackResolved" }>,
  view: PlayerView, id: string, atMs: number, durationMs?: number, legacyAuto = false,
  hitEffect?: VfxEffectId): BoardVfxRequest[] {
  if (!event.targetCell) return [];
  const hue = guardHue(view, event.defenderId);
  const request = (effectId: VfxEffectId, stage: string, tint = false): BoardVfxRequest => ({
    id: `${id}:${stage}`, effectId, placement: "cell", sourceCell: { ...event.targetCell! }, anchorMode: "event",
    unitId: event.defenderId,
    delayMs: atMs, ...(durationMs ? { durationMs } : {}), ...(tint && hue !== undefined ? { tintHue: hue } : {}),
  });
  const signature = event.defenseSignature ? request(event.defenseSignature === "friskCleanSoulBreak"
    ? "expansion.frisk.clean_soul_break" : event.defenseSignature, "defense") : undefined;
  if (!event.hit) {
    if (signature) return [signature];
    if (event.preventedBy === "odinMuninn") return [request("odinMuninn", "defense")];
    if (event.preventedBy || event.spearmanEvaded || legacyAuto) {
      const effect = basicExpansion(view, event.defenderId, "auto_defense") ?? "shield";
      return [request(effect, "defense", effect === "shield")];
    }
    return [request("missShield", "miss", true)];
  }
  const accent = expansionOutcome(event, view);
  const ordinaryHit = event.isBasicAttack || event.attackSignature === "riderPath" || event.attackSignature === "gutsBerserkSingle"
    ? basicExpansion(view, event.attackerId, "attack_impact") : undefined;
  const primary = hitEffect ?? ordinaryHit ?? accent ?? "combatHit";
  const result = [request(primary, "hit")];
  if (accent && accent !== primary) result.push(request(accent, "accent"));
  if (signature) result.push(signature);
  if ((event.bunkerAbsorbedDamage ?? 0) > 0) {
    const effect = basicExpansion(view, event.defenderId, "bunker_absorb");
    if (effect) result.push(request(effect, "bunker"));
  }
  if (event.damageReductions?.some(reduction => reduction.amount > 0)) {
    const effect = basicExpansion(view, event.defenderId, "auto_defense") ?? "shield";
    result.push(request(effect, "reduction", effect === "shield"));
  }
  return result;
}
