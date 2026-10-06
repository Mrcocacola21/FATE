import type { Coord, GameState, PlayerId } from "../index";
import { canPlayerKnowUnitExactPosition } from "../../visibility";

/** Symbol keys survive internal object copies, but cannot enter JSON or wire payloads. */
export const EVENT_VISIBILITY: unique symbol = Symbol("eventVisibility");
export type EventVisibility = { recipients: readonly (PlayerId | "spectator")[] };

export function intersectVisibility(...facts: EventVisibility[]): EventVisibility {
  return {
    recipients:
      facts[0]?.recipients.filter((recipient) =>
        facts.every((fact) => fact.recipients.includes(recipient)),
      ) ?? [],
  };
}

/** Both movement endpoints must be authorized before any subsequent reveal/hide. */
export function movementVisibility(
  state: GameState,
  unitId: string,
  from: Coord,
  to: Coord = from,
): EventVisibility {
  const unit = state.units[unitId];
  if (!unit) return { recipients: [] };
  const at = (position: Coord): GameState => ({
    ...state,
    units: { ...state.units, [unitId]: { ...unit, position } },
  });
  const players: PlayerId[] = ["P1", "P2"];
  const recipients: (PlayerId | "spectator")[] = players.filter(
    (player) =>
      canPlayerKnowUnitExactPosition(at(from), player, unitId) &&
      canPlayerKnowUnitExactPosition(at(to), player, unitId),
  );
  if (!unit.isStealthed) recipients.push("spectator");
  return { recipients };
}
