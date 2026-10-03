import type { Prisma, PrismaClient, User } from "@prisma/client";
import { getDatabaseClient } from "../db/client";
import { INITIAL_RATING } from "../rating/constants";

export interface CreateUserInput {
  email: string;
  passwordHash?: string | null;
  profile?: {
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
}

export type UserWithProfile = Prisma.UserGetPayload<{ include: { profile: true } }>;

export interface CreateAccountInput {
  id: string;
  email: string;
  username: string;
  passwordHash: string;
  session: { id: string; refreshTokenHash: string; expiresAt: Date };
}

export class UserRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  findById(id: string): Promise<User | null> {
    return this.database.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.database.user.findUnique({ where: { email } });
  }

  findAccountById(id: string): Promise<UserWithProfile | null> {
    return this.database.user.findUnique({ where: { id }, include: { profile: true } });
  }

  findAccountByEmail(email: string): Promise<UserWithProfile | null> {
    return this.database.user.findUnique({ where: { email }, include: { profile: true } });
  }

  createAccount(input: CreateAccountInput): Promise<UserWithProfile> {
    // Prisma nested writes run in one transaction, including the initial session.
    return this.database.user.create({
      data: {
        id: input.id,
        email: input.email,
        passwordHash: input.passwordHash,
        profile: { create: { username: input.username } },
        rating: { create: { ...INITIAL_RATING } },
        authSessions: { create: input.session },
      },
      include: { profile: true },
    });
  }

  create(input: CreateUserInput): Promise<User> {
    return this.database.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        profile: input.profile ? { create: input.profile } : undefined,
      },
    });
  }
}
