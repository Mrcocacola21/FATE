import { readAuthConfig } from "./config";
import { TokenService } from "./tokens";
import { UserRepository } from "../repositories/userRepository";
import type { GameRoom } from "../store";
import type { PlayerId } from "rules";
import { assertActiveAccount } from "./accountAccess";
import { AuthError } from "./authErrors";

export interface ConnectionIdentity {
  userId: string;
  username: string;
  displayName: string | null;
}

export class MultiplayerIdentityError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class ConnectionIdentityService {
  private tokens?: TokenService;
  private users?: Pick<UserRepository, "findAccountById">;

  constructor(tokens?: TokenService, users?: Pick<UserRepository, "findAccountById">) {
    this.tokens = tokens;
    this.users = users;
  }

  async verify(accessToken?: string): Promise<ConnectionIdentity | null> {
    if (accessToken === undefined) return null;
    try {
      const userId = (this.tokens ??= new TokenService(readAuthConfig())).verifyAccessToken(
        accessToken,
      ).sub;
      const user = await (this.users ??= new UserRepository()).findAccountById(userId);
      if (!user?.profile) throw new AuthError("UNAUTHORIZED");
      assertActiveAccount(user);
      return {
        userId: user.id,
        username: user.profile.username,
        displayName: user.profile.displayName,
      };
    } catch (error) {
      if (error instanceof AuthError && error.code === "ACCOUNT_BLOCKED")
        throw new MultiplayerIdentityError(error.code, error.message);
      if (error instanceof AuthError && error.code === "UNAUTHORIZED")
        throw new MultiplayerIdentityError("INVALID_ACCESS_TOKEN", "Unable to verify access token");
      throw error;
    }
  }
  async assertActive(userId: string): Promise<void> {
    const user = await (this.users ??= new UserRepository()).findAccountById(userId);
    if (!user)
      throw new MultiplayerIdentityError("INVALID_ACCESS_TOKEN", "Unable to verify account");
    if (user.blockedAt != null)
      throw new MultiplayerIdentityError("ACCOUNT_BLOCKED", "Account access is blocked");
  }
}

export function identityDisplayName(identity: ConnectionIdentity): string {
  return identity.displayName?.trim() || identity.username;
}

/** Runs inside the room command queue, before any seat or grace mutation. */
export function assertSeatIdentity(
  room: GameRoom,
  seat: PlayerId,
  identity: ConnectionIdentity | null | undefined,
  resumeToken: string,
): void {
  if (room.roomMode === "test") return;
  if (!identity)
    throw new MultiplayerIdentityError(
      room.matchType === "RATED" ? "RATED_MATCH_REQUIRES_AUTHENTICATION" : "AUTH_REQUIRED",
      "Sign in to occupy a player seat",
    );
  if (room.reservedUserIds && room.reservedUserIds[seat] !== identity.userId)
    throw new MultiplayerIdentityError(
      "SEAT_OWNED_BY_ANOTHER_USER",
      "Seat is reserved for the matched player",
    );
  const owner = room.seatIdentities[seat];
  const opposite = room.seatIdentities[seat === "P1" ? "P2" : "P1"];
  if (owner && room.seatTokens[seat] === resumeToken && owner.userId !== identity.userId)
    throw new MultiplayerIdentityError(
      "RESUME_IDENTITY_MISMATCH",
      "Resume identity does not match seat owner",
    );
  if (opposite?.userId === identity.userId)
    throw new MultiplayerIdentityError(
      room.matchType === "RATED" ? "RATED_MATCH_SAME_USER" : "USER_ALREADY_IN_MATCH",
      "User already owns the other player seat",
    );
  if (owner && owner.userId !== identity.userId && (room.participantsLocked || room.seats[seat]))
    throw new MultiplayerIdentityError(
      "SEAT_OWNED_BY_ANOTHER_USER",
      "Seat belongs to another player",
    );
  if (
    room.participantsLocked &&
    (!owner || room.seatTokens[seat] !== resumeToken) &&
    !room.reservedUserIds
  )
    throw new MultiplayerIdentityError("INVALID_RESUME_TOKEN", "A valid resume token is required");
}

export function hasDistinctPlayerIdentities(room: GameRoom): boolean {
  return !!(
    room.seats.P1 &&
    room.seats.P2 &&
    room.seatIdentities.P1 &&
    room.seatIdentities.P2 &&
    room.seatIdentities.P1.userId !== room.seatIdentities.P2.userId
  );
}
