import {
  banDraftHero,
  createSafeClassDraftState,
  pickDraftHero,
  type DraftCommandResult,
  type PlayerId,
} from "rules";
import type { GameRoom } from "../store";

export function startDraftSession(room: GameRoom) {
  room.draftState = createSafeClassDraftState();
}

export function applyDraftBan(
  room: GameRoom,
  player: PlayerId,
  heroId: string
): DraftCommandResult {
  if (!room.draftState) {
    room.draftState = createSafeClassDraftState();
  }
  const result = banDraftHero(room.draftState, player, heroId);
  if (result.ok) {
    room.draftState = result.state;
  }
  return result;
}

export function applyDraftPick(
  room: GameRoom,
  player: PlayerId,
  heroId: string
): DraftCommandResult {
  if (!room.draftState) {
    room.draftState = createSafeClassDraftState();
  }
  const result = pickDraftHero(room.draftState, player, heroId);
  if (result.ok) {
    room.draftState = result.state;
  }
  return result;
}
