import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
const path = resolve(import.meta.dirname, "../docs/assets/vfx-workflow/integration-state.json");
const state = JSON.parse(readFileSync(path, "utf8"));
const [heroesArg, rolesArg, status = "bound", evidence = "", nextBatch = state.nextBatch] = process.argv.slice(2);
const heroes = heroesArg.split(","), roles = rolesArg.split(",");
const routes = {
  move_trail: "Projected unitMoved -> movementPlan normal/rider -> existing segment travel clock",
  move_arrive: "movementPlan atMs+durationMs -> confirmed reached to cell",
  attack_swing: "Projected basic attackResolved -> combat cue attackAtMs -> source facing target",
  attack_projectile: "Projected basic attackResolved -> combat cue attackAtMs -> authorized source-to-target flight",
  attack_impact: "Projected basic attackResolved.hit -> hit cue atMs; replaces generic combatHit only",
  select_ring: "Board.selectedUnitId -> SelectedUnitVfx; explicit local selection, static",
  deploy: "Projected unitPlaced.position -> event mapper; never initial snapshot/hover/cancel",
  death_final: "Projected unitDied.deathCell -> combat death cue; never inferred from HP",
  divine_exit: "Confirmed femtoDivineMove unitMoved -> teleport departure half of movement cue",
  divine_arrive: "Confirmed femtoDivineMove unitMoved -> teleport arrival half of movement cue",
  auto_defense: "Accepted berserkerDefenseChosen(auto) -> correlated miss cue or accepted choice; replaces shield",
};
for (const row of state.assets) {
  const role = row.filename.split("/").at(-1).replace(/\.png$/, "");
  if (!heroes.includes(row.heroId) || !roles.includes(role)) continue;
  row.integrationStatus = status;
  row.triggerRoute = routes[role] ?? evidence;
  row.visibility.runtime = "ProjectedGameEvent / permitted PlayerView only; missing source/position suppresses artwork";
  row.cleanup = role === "select_ring" ? "Removed on deselect, death, permission loss, form change and Board session replacement; no timer"
    : "Existing VFX queue expiry, stable cue IDs and cancelled presentation session token";
  if (status === "verified") row.verification.tests = evidence.split(";");
  row.blocker = null;
}
state.nextBatch = nextBatch;
writeFileSync(path, JSON.stringify(state, null, 2) + "\n");
console.log(`Recorded ${heroesArg}: ${rolesArg} -> ${status}`);
