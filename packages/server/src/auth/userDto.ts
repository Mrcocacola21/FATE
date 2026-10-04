import type { UserWithProfile } from "../repositories/userRepository";

export function toAuthUserDto(user: UserWithProfile) {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    username: user.profile?.username ?? null,
    displayName: user.profile?.displayName ?? null,
    avatarUrl: user.profile?.avatarUrl ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}
