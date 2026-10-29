import { randomUUID } from "node:crypto";
import type { FastifyBaseLogger } from "fastify";
import { AuthError } from "../auth/authErrors";
import { AppError } from "../errors/appError";
import { silentChannel, type UserChannel } from "../realtime/userEvents";
import type { FriendRepository } from "../repositories/friendRepository";
import { toPlayerDto, type PlayerDto } from "../services/friendService";
import type { GameRoom } from "../store";

export const INVITE_TTL_MS = 2 * 60_000;
export const INVITE_RATE_LIMIT = 10;
export const INVITE_RATE_WINDOW_MS = 60_000;
export const INVITE_SWEEP_MS = 2000;

type Seat = "P1" | "P2";

export interface InviteDto {
  id: string;
  from: PlayerDto;
  to: PlayerDto;
  roomId: string;
  /** The free seat the invited player takes. */
  seat: Seat;
  lobbyName: string | null;
  gameMode: string;
  createdAt: string;
  expiresAt: string;
}

interface Invite {
  id: string;
  roomId: string;
  /** The inviter's own seat; the invite lives only while they keep it and the other is free. */
  fromSeat: Seat;
  from: PlayerDto;
  to: PlayerDto;
  lobbyName: string | null;
  gameMode: string;
  createdAt: number;
  expiresAt: number;
}

export const inviteErrors = {
  self: () => new AppError("INVITE_SELF", 400, "You cannot invite yourself."),
  roomClosed: () =>
    new AppError(
      "LOBBY_NOT_INVITABLE",
      409,
      "Invite players from your own casual lobby while the other seat is free.",
    ),
  notAllowed: () =>
    new AppError("INVITE_NOT_ALLOWED", 403, "This player does not accept lobby invites from you."),
  notFound: () => new AppError("INVITE_NOT_FOUND", 404, "Invite not found."),
};

const other = (seat: Seat): Seat => (seat === "P1" ? "P2" : "P1");

/** A lobby someone can still be invited into: casual, made by hand, waiting, other seat free. */
function openFor(room: GameRoom | undefined, userId: string, seat: Seat) {
  if (!room || room.seatIdentities[seat]?.userId !== userId) return false;
  const free = other(seat);
  return (
    room.roomMode === "normal" &&
    room.origin === "MANUAL" &&
    !room.reservedUserIds &&
    !room.interruptionReason &&
    !room.draftState &&
    room.state.phase === "lobby" &&
    !room.seats[free] &&
    !room.seatIdentities[free]
  );
}

type Players = Pick<FriendRepository, "findPlayerById" | "blocksBetween" | "findPair">;

/**
 * Lobby invites for one server instance, kept next to the in-memory rooms they point at. An
 * invite lasts two minutes, or until the seat is taken, the inviter leaves or the game starts;
 * both sides hear about it when it goes.
 */
export class InviteService {
  private readonly invites = new Map<string, Invite>();
  private readonly sent = new Map<string, number[]>();
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly players: Players,
    private readonly rooms: (roomId: string) => GameRoom | undefined,
    private readonly channel: UserChannel = silentChannel,
    private readonly now: () => number = Date.now,
    private readonly log?: FastifyBaseLogger,
  ) {}

  start(intervalMs = INVITE_SWEEP_MS) {
    this.timer ??= setInterval(() => this.sweep(), intervalMs);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  async send(fromUserId: string, roomId: string, toUserId: string): Promise<{ invite: InviteDto }> {
    const room = this.rooms(roomId);
    const fromSeat = (["P1", "P2"] as const).find(
      (seat) => room?.seatIdentities[seat]?.userId === fromUserId,
    );
    if (!room || !fromSeat || !openFor(room, fromUserId, fromSeat)) throw inviteErrors.roomClosed();
    if (toUserId === fromUserId) throw inviteErrors.self();
    this.sweep();
    const existing = [...this.invites.values()].find(
      (invite) => invite.roomId === roomId && invite.to.id === toUserId && invite.from.id === fromUserId,
    );
    if (existing) return { invite: this.toDto(existing) };

    const [target, sender] = await Promise.all([
      this.players.findPlayerById(toUserId),
      this.players.findPlayerById(fromUserId),
    ]);
    if (!target || !sender) throw new AuthError("USER_NOT_FOUND");
    const blocks = await this.players.blocksBetween(fromUserId, toUserId);
    // A block or a closed setting look the same to the inviter.
    if (blocks.iBlocked || blocks.blockedMe || target.lobbyInvites === "NOBODY")
      throw inviteErrors.notAllowed();
    if (target.lobbyInvites === "FRIENDS") {
      const pair = await this.players.findPair(fromUserId, toUserId);
      if (pair?.status !== "ACCEPTED") throw inviteErrors.notAllowed();
    }
    this.takeRateSlot(fromUserId);

    const now = this.now();
    const invite: Invite = {
      id: randomUUID(),
      roomId,
      fromSeat,
      from: toPlayerDto(sender),
      to: toPlayerDto(target),
      lobbyName: room.lobbyName || null,
      gameMode: room.gameMode,
      createdAt: now,
      expiresAt: now + INVITE_TTL_MS,
    };
    this.invites.set(invite.id, invite);
    const dto = this.toDto(invite);
    this.channel.send(toUserId, { type: "invite", invite: dto });
    this.channel.send(fromUserId, { type: "invite", invite: dto });
    this.log?.info({ event: "lobby_invite_sent", roomId, inviteId: invite.id }, "Lobby invite sent");
    return { invite: dto };
  }

  /** Invites addressed to the player and the ones they sent, still valid. */
  list(userId: string) {
    this.sweep();
    const all = [...this.invites.values()].sort((a, b) => b.createdAt - a.createdAt);
    return {
      incoming: all.filter((invite) => invite.to.id === userId).map((invite) => this.toDto(invite)),
      outgoing: all.filter((invite) => invite.from.id === userId).map((invite) => this.toDto(invite)),
    };
  }

  /** Declines an invite (the invited player) or withdraws it (the inviter). */
  remove(userId: string, inviteId: string) {
    const invite = this.invites.get(inviteId);
    if (!invite || (invite.to.id !== userId && invite.from.id !== userId))
      throw inviteErrors.notFound();
    this.drop(invite);
  }

  /** Drops expired invites and the ones whose lobby is no longer open; returns how many. */
  sweep() {
    const now = this.now();
    let dropped = 0;
    for (const invite of [...this.invites.values()]) {
      if (invite.expiresAt > now && openFor(this.rooms(invite.roomId), invite.from.id, invite.fromSeat))
        continue;
      this.drop(invite);
      dropped++;
    }
    for (const [userId, times] of this.sent) {
      const recent = times.filter((time) => time > now - INVITE_RATE_WINDOW_MS);
      if (recent.length) this.sent.set(userId, recent);
      else this.sent.delete(userId);
    }
    return dropped;
  }

  private takeRateSlot(userId: string) {
    const now = this.now();
    const recent = (this.sent.get(userId) ?? []).filter(
      (time) => time > now - INVITE_RATE_WINDOW_MS,
    );
    if (recent.length >= INVITE_RATE_LIMIT) throw new AuthError("RATE_LIMITED");
    this.sent.set(userId, [...recent, now]);
  }

  private drop(invite: Invite) {
    if (!this.invites.delete(invite.id)) return;
    for (const userId of [invite.to.id, invite.from.id])
      this.channel.send(userId, { type: "inviteGone", inviteId: invite.id });
  }

  private toDto(invite: Invite): InviteDto {
    return {
      id: invite.id,
      from: invite.from,
      to: invite.to,
      roomId: invite.roomId,
      seat: other(invite.fromSeat),
      lobbyName: invite.lobbyName,
      gameMode: invite.gameMode,
      createdAt: new Date(invite.createdAt).toISOString(),
      expiresAt: new Date(invite.expiresAt).toISOString(),
    };
  }
}
