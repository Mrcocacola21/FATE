import type { ExpansionEffectId } from "./expansionCatalog.generated";

export interface MeleeArtworkOrientation {
  /** Normalize the authored stroke to the bottom-left/top-right diagonal. */
  rotationDeg: number;
  /** Match the reveal to the authored growth, including reversed crescents. */
  revealFrom: "bottomLeft" | "topRight";
}
type MeleeExpansionId = Extract<ExpansionEffectId,
  `expansion.${string}.attack_swing` | `expansion.${string}.berserk_swing` |
  `expansion.${string}.centipede_attack` | `expansion.${string}.undying_swing`>;

// Reviewed from actual strip frames, not the import's generic authoredFacing=+X.
// Genghis keeps its accepted reference; Guts restores the reverse crescent.
export const MELEE_ARTWORK_ORIENTATIONS = {
  "expansion.asgore.attack_swing": { rotationDeg: -10, revealFrom: "bottomLeft" },
  "expansion.chikatilo.attack_swing": { rotationDeg: -8, revealFrom: "bottomLeft" },
  "expansion.donKihote.attack_swing": { rotationDeg: -14, revealFrom: "bottomLeft" },
  "expansion.duolingo.attack_swing": { rotationDeg: -7, revealFrom: "bottomLeft" },
  "expansion.elCidCompeador.attack_swing": { rotationDeg: -7, revealFrom: "bottomLeft" },
  "expansion.femto.attack_swing": { rotationDeg: -3, revealFrom: "bottomLeft" },
  "expansion.frisk.attack_swing": { rotationDeg: 50, revealFrom: "topRight" },
  "expansion.genghisKhan.attack_swing": { rotationDeg: 0, revealFrom: "bottomLeft" },
  "expansion.griffith.attack_swing": { rotationDeg: 0, revealFrom: "bottomLeft" },
  "expansion.grozny.attack_swing": { rotationDeg: -10, revealFrom: "bottomLeft" },
  "expansion.guts.attack_swing": { rotationDeg: 180, revealFrom: "topRight" },
  "expansion.guts.berserk_swing": { rotationDeg: 180, revealFrom: "topRight" },
  "expansion.hassan.attack_swing": { rotationDeg: -9, revealFrom: "bottomLeft" },
  "expansion.jackRipper.attack_swing": { rotationDeg: -8, revealFrom: "bottomLeft" },
  "expansion.kaladin.attack_swing": { rotationDeg: -35, revealFrom: "bottomLeft" },
  "expansion.kaneki.attack_swing": { rotationDeg: -5, revealFrom: "bottomLeft" },
  "expansion.kaneki.centipede_attack": { rotationDeg: -10, revealFrom: "bottomLeft" },
  "expansion.lechy.attack_swing": { rotationDeg: -9, revealFrom: "bottomLeft" },
  "expansion.loki.attack_swing": { rotationDeg: -10, revealFrom: "bottomLeft" },
  "expansion.luche.attack_swing": { rotationDeg: -32, revealFrom: "bottomLeft" },
  "expansion.odin.attack_swing": { rotationDeg: -45, revealFrom: "bottomLeft" },
  "expansion.papyrus.attack_swing": { rotationDeg: -21, revealFrom: "bottomLeft" },
  "expansion.riverPerson.attack_swing": { rotationDeg: -90, revealFrom: "bottomLeft" },
  "expansion.sans.attack_swing": { rotationDeg: -32, revealFrom: "bottomLeft" },
  "expansion.undyne.attack_swing": { rotationDeg: -20, revealFrom: "bottomLeft" },
  "expansion.undyne.undying_swing": { rotationDeg: -20, revealFrom: "bottomLeft" },
  "expansion.vladTepes.attack_swing": { rotationDeg: -34, revealFrom: "bottomLeft" },
} as const satisfies Record<MeleeExpansionId, MeleeArtworkOrientation>;

export function meleeArtworkOrientation(id: string): MeleeArtworkOrientation | undefined {
  return id in MELEE_ARTWORK_ORIENTATIONS
    ? MELEE_ARTWORK_ORIENTATIONS[id as MeleeExpansionId] : undefined;
}
