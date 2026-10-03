import { useMemo } from "react";
import type { PlayerView, UnitState } from "rules";
import { Board } from "../components/Board";
import type { ReplayView } from "./types";

/** Presentation adapter for the existing Board. Neutral placeholders have no gameplay meaning.
 * This does not run the engine or infer a historical state from actions.
 */
export function replayBoardView(state: ReplayView): PlayerView {
  const units = Object.fromEntries(
    Object.entries(state.units).map(([id, u]) => {
      const unit: UnitState = {
        ...u,
        attack: 0,
        stealthTurnsLeft: 0,
        stealthAttemptedThisTurn: false,
        hasMovedThisTurn: false,
        hasAttackedThisTurn: false,
        hasActedThisTurn: false,
        turn: { moveUsed: false, attackUsed: false, actionUsed: false, stealthUsed: false },
        charges: {},
        cooldowns: {},
        bunker: { active: u.bunkerActive, ownTurnsInBunker: 0 },
        lokiChickenSources: u.isChicken ? ["public-chicken-status"] : [],
        sansBoneFieldStatus:
          u.boneStatus && u.boneSource === "sansBoneField"
            ? { kind: u.boneStatus, turnNumber: state.turnNumber }
            : undefined,
        papyrusBoneStatus:
          u.boneStatus && u.boneSource === "papyrus"
            ? { kind: u.boneStatus, sourceUnitId: "", expiresOnSourceOwnTurn: 0 }
            : undefined,
      };
      return [id, unit];
    }),
  );
  return {
    ...state,
    units,
    gameOver: null,
    hostPlayerId: null,
    playersReady: { P1: false, P2: false },
    seats: { P1: false, P2: false },
    pendingMove: null,
    pendingRoll: null,
    pendingCombatQueueCount: 0,
    pendingAoEPreview: null,
    jackTraps: [],
    forestMarker: state.forestMarkers[0] ?? null,
    turnOrder: [],
    turnOrderIndex: 0,
    placementOrder: [],
    turnQueue: [],
    turnQueueIndex: 0,
    events: [],
    knowledge: { P1: {}, P2: {} },
    lastKnownPositions: {},
    initiative: { P1: null, P2: null, winner: null },
    ruleDeclaration: {
      selectedRuleId: null,
      chooserPlayer: null,
      setupComplete: false,
      ruleData: {},
    },
    placementFirstPlayer: null,
    startingUnitId: null,
    unitsPlaced: { P1: 0, P2: 0 },
    rosterUnits: {},
    abilitiesByUnitId: {},
  };
}
const ignore = () => undefined;
export function ReplayBoard({ state }: { state: ReplayView }) {
  const view = useMemo(() => replayBoardView(state), [state]);
  return (
    <Board
      view={view}
      playerId={null}
      selectedUnitId={null}
      highlightedCells={{}}
      disabled
      allowUnitSelection={false}
      visualEffectsEnabled={false}
      onSelectUnit={ignore}
      onCellClick={ignore}
      className="replay-board"
    />
  );
}
