import { writeFileSync } from "node:fs";
import { createEmptyGame, makePlayerView, makeSpectatorView, type GameState } from "rules";
import { createPersistentStatusFixture } from "../src/features/vfx/persistentStatusPreview";

const state = createPersistentStatusFixture(createEmptyGame());
const patch = (id: string, fields: Partial<GameState["units"][string]>) => ({
  ...state,
  units: {
    ...state.units,
    [id]: { ...state.units[id], ...fields },
  },
});
const frames: Record<string, GameState> = {
  baseline: state,
  noBunker: patch("status-kaiser", { bunker: undefined }),
  tick: patch("status-cursed", { hp: 4 }),
  noCurse: patch("status-cursed", { sansLastAttackCurseSourceId: undefined }),
  moved: patch("status-cursed", { position: { col: 5, row: 4 } }),
  preDeath: patch("status-cursed", { hp: 0, sansPendingDeath: { killerId: null } }),
  dead: patch("status-cursed", { hp: 0, isAlive: false, position: null }),
  bone: { ...state, arenaId: "boneField", boneFieldTurnsLeft: 3 },
  storm: {
    ...state,
    arenaId: "storm",
    arenaEffects: [
      { id: "storm", effectId: "storm", remaining: 2, durationUnit: "turn", startedTurnNumber: 4 },
    ],
  },
};
writeFileSync(
  process.argv[2],
  JSON.stringify(
    Object.fromEntries(
      Object.entries(frames).map(([key, frame]) => [
        key,
        {
          P1: makePlayerView(frame, "P1"),
          P2: makePlayerView(frame, "P2"),
          spectator: makeSpectatorView(frame),
        },
      ]),
    ),
  ),
);
