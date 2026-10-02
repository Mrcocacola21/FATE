import { randomBytes } from "node:crypto";
import argon2 from "argon2";

// Argon2id: 64 MiB, three passes, one lane; library generates a random salt.
const options = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 } as const;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, options);
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

export class PasswordVerifier {
  private dummyHash?: Promise<string>;

  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    // Unknown accounts and accounts without a password still perform the KDF.
    if (!hash) this.dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
    const valid = await verifyPassword(hash ?? (await this.dummyHash!), password);
    return Boolean(hash) && valid;
  }
}
