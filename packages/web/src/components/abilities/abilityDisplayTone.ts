import type { AbilityKind } from "rules";
import type { AbilityDisplayPresentation } from "../../game/abilityDisplayDetails";

export function getAbilityDisplayTone(
  kind: AbilityKind,
  unavailable: boolean,
  presentation?: AbilityDisplayPresentation,
) {
  if (unavailable) return { card: "ability-tone ability-tone--muted", badge: "badge-neutral" };
  if (presentation === "resource" || presentation === "transformation") {
    return { card: "ability-tone ability-tone--active", badge: "badge-active" };
  }
  if (presentation === "outcomes" || kind === "impulse") {
    return { card: "ability-tone", badge: "badge-impulse" };
  }
  if (kind === "passive") {
    return { card: "ability-tone ability-tone--passive", badge: "badge-passive" };
  }
  if (kind === "phantasm") {
    return { card: "ability-tone ability-tone--phantasm", badge: "badge-danger" };
  }
  return { card: "ability-tone ability-tone--active", badge: "badge-active" };
}
