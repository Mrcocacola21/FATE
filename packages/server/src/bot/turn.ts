import type { GameAction, PlayerId } from "rules";
import type { GameRoom } from "../store";
import { isActionAllowedByPlayer } from "../permissions";
import { GameActionSchema } from "../schemas";

/** The same gate the room applies to a seated player's command, before the rules see it. */
export function botMayAct(room: GameRoom, action: GameAction, seat: PlayerId): boolean {
  if (room.state.phase === "ended") return false;
  // Only what a player's socket would let through: the journal stores nothing else.
  if (!GameActionSchema.safeParse(action).success) return false;
  if (room.state.pendingRoll && action.type !== "resolvePendingRoll") return false;
  return isActionAllowedByPlayer(room.state, action, seat);
}

/** Who has to answer next in battle: the owner of a pending roll, else the side to move. */
export function seatToAct(room: GameRoom): PlayerId | null {
  if (room.state.phase === "ended") return null;
  if (room.state.pendingRoll) return room.state.pendingRoll.player;
  return room.state.phase === "lobby" ? null : room.state.currentPlayer;
}
