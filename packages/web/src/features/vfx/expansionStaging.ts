/** Board-space presentation only: no game timing, targeting or art generation. */
export type ExpansionStaging = "deploy" | "moveTrail" | "moveArrive";
export interface ExpansionStagingProfile {
  deployWidth: number;
  deployHeight: number;
  deployDuration: number;
  trailWidth: number;
  trailHeight: number;
  arrivalWidth: number;
  arrivalHeight: number;
  arrivalDuration: number;
  opacity: number;
}
const profiles = {
  heavy: { deployWidth: 2, deployHeight: 1.85, deployDuration: 860, trailWidth: 1.7, trailHeight: 0.68, arrivalWidth: 1.6, arrivalHeight: 0.85, arrivalDuration: 260, opacity: 0.72 },
  light: { deployWidth: 1.8, deployHeight: 1.8, deployDuration: 720, trailWidth: 1.45, trailHeight: 0.58, arrivalWidth: 1.4, arrivalHeight: 0.8, arrivalDuration: 220, opacity: 0.66 },
  arcane: { deployWidth: 1.95, deployHeight: 1.95, deployDuration: 820, trailWidth: 1.55, trailHeight: 0.65, arrivalWidth: 1.5, arrivalHeight: 0.9, arrivalDuration: 250, opacity: 0.7 },
  water: { deployWidth: 1.95, deployHeight: 1.8, deployDuration: 820, trailWidth: 1.7, trailHeight: 0.6, arrivalWidth: 1.65, arrivalHeight: 0.72, arrivalDuration: 280, opacity: 0.7 },
} satisfies Record<string, ExpansionStagingProfile>;
const heroProfiles: Record<string, keyof typeof profiles> = {
  artemida: "arcane", asgore: "heavy", chikatilo: "light", donKihote: "heavy",
  duolingo: "light", elCidCompeador: "heavy", femto: "arcane", frisk: "light",
  genghisKhan: "heavy", "grand-kaiser": "heavy", griffith: "arcane", grozny: "heavy",
  guts: "heavy", hassan: "light", jackRipper: "light", jebe: "light", kaladin: "water",
  kaneki: "heavy", lechy: "arcane", loki: "arcane", luche: "arcane", mettaton: "arcane",
  odin: "arcane", papyrus: "light", riverPerson: "water", sans: "light", undyne: "water",
  vladTepes: "heavy", zoro: "water",
};
export function expansionStagingProfile(heroId: string): ExpansionStagingProfile {
  return profiles[heroProfiles[heroId] ?? "light"];
}
export function expansionStaging(role: string): ExpansionStaging | undefined {
  if (role === "deploy") return "deploy";
  if (role === "move_arrive") return "moveArrive";
  if (role === "move_trail" || /^(berserk|centipede|undying|engineering|ex|neo)_move$/.test(role)) return "moveTrail";
  return undefined;
}
