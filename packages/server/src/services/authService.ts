import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { AuthError } from "../auth/authErrors";
import { hashPassword, PasswordVerifier } from "../auth/password";
import { equalTokenHashes, hashRefreshToken, TokenService } from "../auth/tokens";
import { toAuthUserDto } from "../auth/userDto";
import { AuthSessionRepository, UserRepository } from "../repositories";
import { assertActiveAccount } from "../auth/accountAccess";

export class AuthService {
  private readonly passwords = new PasswordVerifier();

  constructor(
    readonly tokens: TokenService,
    private readonly users: UserRepository,
    private readonly sessions: AuthSessionRepository,
  ) {}

  private newSession(userId: string) {
    const id = randomUUID();
    const expiresAt = new Date(
      (Math.floor(Date.now() / 1000) + this.tokens.config.refreshTtlSeconds) * 1000,
    );
    const refreshToken = this.tokens.signRefreshToken(userId, id, expiresAt);
    return {
      id,
      userId,
      expiresAt,
      refreshToken,
      refreshTokenHash: hashRefreshToken(refreshToken),
    };
  }

  private credentials(userId: string, refreshToken: string, expiresAt: Date) {
    return {
      accessToken: this.tokens.signAccessToken(userId),
      accessTokenExpiresIn: this.tokens.config.accessTtlSeconds,
      refreshToken,
      refreshExpiresAt: expiresAt,
    };
  }

  async register(input: { email: string; username: string; password: string }) {
    const userId = randomUUID();
    const session = this.newSession(userId);
    const passwordHash = await hashPassword(input.password);
    try {
      const user = await this.users.createAccount({
        id: userId,
        email: input.email,
        username: input.username,
        passwordHash,
        session: {
          id: session.id,
          refreshTokenHash: session.refreshTokenHash,
          expiresAt: session.expiresAt,
        },
      });
      return {
        user: toAuthUserDto(user),
        ...this.credentials(userId, session.refreshToken, session.expiresAt),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const target = error.meta?.target;
        const fields = Array.isArray(target) ? target : [target];
        if (fields.includes("email")) throw new AuthError("EMAIL_ALREADY_REGISTERED");
        if (fields.includes("username")) throw new AuthError("USERNAME_ALREADY_TAKEN");
      }
      throw error;
    }
  }

  async login(input: { email: string; password: string }) {
    const user = await this.users.findAccountByEmail(input.email);
    if (!(await this.passwords.verify(user?.passwordHash, input.password)) || !user) {
      throw new AuthError("INVALID_CREDENTIALS");
    }
    const session = this.newSession(user.id);
    assertActiveAccount(user);
    await this.sessions.create({
      id: session.id,
      userId: user.id,
      refreshTokenHash: session.refreshTokenHash,
      expiresAt: session.expiresAt,
    });
    return {
      user: toAuthUserDto(user),
      ...this.credentials(user.id, session.refreshToken, session.expiresAt),
    };
  }

  async refresh(rawToken: string | undefined) {
    if (!rawToken) throw new AuthError("INVALID_REFRESH_TOKEN");
    const claims = this.tokens.verifyRefreshToken(rawToken);
    const user = await this.users.findById(claims.sub);
    if (!user) throw new AuthError("INVALID_REFRESH_TOKEN");
    assertActiveAccount(user);
    const session = await this.sessions.findById(claims.sid);
    const now = new Date();
    if (
      !session ||
      session.userId !== claims.sub ||
      session.revokedAt ||
      session.expiresAt <= now
    ) {
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }
    const currentHash = hashRefreshToken(rawToken);
    if (!equalTokenHashes(session.refreshTokenHash, currentHash)) {
      await this.sessions.revoke(session.id, claims.sub, now);
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }
    // Fixed lifetime: rotating credentials never extends session.expiresAt.
    const nextToken = this.tokens.signRefreshToken(claims.sub, session.id, session.expiresAt);
    const rotated = await this.sessions.rotateToken(
      session.id,
      claims.sub,
      currentHash,
      hashRefreshToken(nextToken),
      new Date(),
    );
    if (!rotated) {
      // A racing request using the same credential counts as reuse too.
      await this.sessions.revoke(session.id, claims.sub, new Date());
      throw new AuthError("INVALID_REFRESH_TOKEN");
    }
    return this.credentials(claims.sub, nextToken, session.expiresAt);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    let claims;
    try {
      claims = this.tokens.verifyRefreshToken(rawToken);
    } catch (error) {
      if (error instanceof AuthError) return;
      throw error;
    }
    await this.sessions.revoke(claims.sid, claims.sub, new Date());
  }

  async currentUser(userId: string) {
    const user = await this.users.findAccountById(userId);
    if (!user) throw new AuthError("UNAUTHORIZED");
    assertActiveAccount(user);
    return toAuthUserDto(user);
  }
}
