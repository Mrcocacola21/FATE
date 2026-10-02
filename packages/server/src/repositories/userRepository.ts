import type { PrismaClient, User } from "@prisma/client";
import { getDatabaseClient } from "../db/client";

export interface CreateUserInput {
  email: string;
  passwordHash?: string | null;
  profile?: {
    username: string;
    displayName?: string | null;
    avatarUrl?: string | null;
  };
}

export class UserRepository {
  constructor(private readonly database: PrismaClient = getDatabaseClient()) {}

  findById(id: string): Promise<User | null> {
    return this.database.user.findUnique({ where: { id } });
  }

  findByEmail(email: string): Promise<User | null> {
    return this.database.user.findUnique({ where: { email } });
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
