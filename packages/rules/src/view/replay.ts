import type { GameState, PlayerView, UnitState } from "../model";
import { cloneForestMarkers, collectSpectatorStakeMarkers } from "./helpers";

/** Board presentation only. No choices, action legality, counters or private hero memory. */
export type ReplayUnit = Pick<
  UnitState,
  | "id"
  | "owner"
  | "class"
  | "figureId"
  | "heroId"
  | "hp"
  | "position"
  | "isAlive"
  | "isStealthed"
  | "transformed"
  | "blindUntilOwnTurnStart"
  | "immobilizedUntilOwnTurnStart"
  | "duolingoBerserkerUnlocked"
  | "gutsBerserkModeActive"
  | "kanekiCentipedeUnlocked"
  | "mettatonExUnlocked"
  | "mettatonNeoUnlocked"
  | "papyrusUnbelieverActive"
  | "sansUnbelieverUnlocked"
  | "undyneImmortalActive"
  | "friskPacifismDisabled"
> & {
  isChicken: boolean;
  bunkerActive: boolean;
  boneStatus: "blue" | "orange" | null;
  boneSource: "papyrus" | "sansBoneField" | null;
};

export interface ReplayView extends Pick<
  PlayerView,
  | "boardSize"
  | "phase"
  | "currentPlayer"
  | "turnNumber"
  | "roundNumber"
  | "activeUnitId"
  | "arenaId"
  | "arenaEffects"
  | "boneFieldTurnsLeft"
  | "forestMarkers"
  | "stakeMarkers"
> {
  units: Record<string, ReplayUnit>;
}

/** Same unit visibility as spectators: living stealth is revealed only at the ended position.
 * Exact HP of visible units is already part of the existing spectator board contract.
 * An explicit allowlist prevents future GameState/UnitState fields entering HTTP responses.
 */
export function makeReplayView(state: GameState): ReplayView {
  const units: Record<string, ReplayUnit> = {};
  for (const unit of Object.values(state.units)) {
    if (state.phase !== "ended" && unit.isAlive && unit.isStealthed) continue;
    units[unit.id] = {
      id: unit.id,
      owner: unit.owner,
      class: unit.class,
      figureId: unit.figureId,
      heroId: unit.heroId,
      hp: unit.hp,
      position: unit.position ? { col: unit.position.col, row: unit.position.row } : null,
      isAlive: unit.isAlive,
      isStealthed: unit.isStealthed,
      transformed: unit.transformed,
      blindUntilOwnTurnStart: unit.blindUntilOwnTurnStart,
      immobilizedUntilOwnTurnStart: unit.immobilizedUntilOwnTurnStart,
      duolingoBerserkerUnlocked: unit.duolingoBerserkerUnlocked,
      gutsBerserkModeActive: unit.gutsBerserkModeActive,
      kanekiCentipedeUnlocked: unit.kanekiCentipedeUnlocked,
      mettatonExUnlocked: unit.mettatonExUnlocked,
      mettatonNeoUnlocked: unit.mettatonNeoUnlocked,
      papyrusUnbelieverActive: unit.papyrusUnbelieverActive,
      sansUnbelieverUnlocked: unit.sansUnbelieverUnlocked,
      undyneImmortalActive: unit.undyneImmortalActive,
      friskPacifismDisabled: unit.friskPacifismDisabled,
      isChicken: (unit.lokiChickenSources?.length ?? 0) > 0,
      bunkerActive: unit.bunker?.active ?? false,
      boneStatus: unit.sansBoneFieldStatus?.kind ?? unit.papyrusBoneStatus?.kind ?? null,
      boneSource: unit.sansBoneFieldStatus
        ? "sansBoneField"
        : unit.papyrusBoneStatus
          ? "papyrus"
          : null,
    };
  }
  return {
    boardSize: state.boardSize,
    phase: state.phase,
    currentPlayer: state.currentPlayer,
    turnNumber: state.turnNumber,
    roundNumber: state.roundNumber,
    activeUnitId: state.activeUnitId && units[state.activeUnitId] ? state.activeUnitId : null,
    arenaId: state.arenaId,
    boneFieldTurnsLeft: state.boneFieldTurnsLeft,
    arenaEffects: (state.arenaEffects ?? []).map((effect) => ({
      id: effect.id,
      effectId: effect.effectId,
      remaining: effect.remaining,
      durationUnit: effect.durationUnit,
      startedTurnNumber: effect.startedTurnNumber,
    })),
    forestMarkers: cloneForestMarkers(state),
    stakeMarkers: collectSpectatorStakeMarkers(state),
    units,
  };
}
