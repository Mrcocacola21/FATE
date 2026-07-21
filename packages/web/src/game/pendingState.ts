import type { PlayerId, PlayerView } from "rules";
import type { PlayerRole, RoomMeta } from "../ws";

export type PublicPendingRoll = NonNullable<RoomMeta["pendingRoll"]>;
export type VisiblePendingRoll = NonNullable<PlayerView["pendingRoll"]>;

export function getPlayerIdForViewer(
  role: PlayerRole | null,
  seat: PlayerId | null = null,
): PlayerId | null {
  if (seat === "P1" || seat === "P2") return seat;
  return role === "P1" || role === "P2" ? role : null;
}

export function isPendingRollForPlayer(
  pending: Pick<PublicPendingRoll, "player"> | null | undefined,
  playerId: PlayerId | null,
): boolean {
  return !!pending && !!playerId && pending.player === playerId;
}

export function getPendingRollForPlayer(
  visiblePending: VisiblePendingRoll | null | undefined,
  publicPending: PublicPendingRoll | null | undefined,
  playerId: PlayerId | null,
): VisiblePendingRoll | null {
  if (visiblePending) return visiblePending;
  if (publicPending?.kind === "initiativeRoll" && isPendingRollForPlayer(publicPending, playerId)) {
    return {
      ...publicPending,
      context: { step: publicPending.player },
    } as VisiblePendingRoll;
  }
  return null;
}

export function hasAuthoritativeMatchStarted(
  view: Pick<PlayerView, "phase" | "pendingRoll" | "initiative">,
  publicPending: PublicPendingRoll | null | undefined,
): boolean {
  if (view.phase !== "lobby" || view.pendingRoll || publicPending) return true;
  return (
    view.initiative.P1 !== null || view.initiative.P2 !== null || view.initiative.winner !== null
  );
}
