import { AdminRepository } from "../repositories/adminRepository";
import { paginated, toAdminAction, toAdminMatch, toAdminUser } from "../admin/dto";
import type { ActionListQuery, MatchListQuery, UserListQuery } from "../admin/schemas";
import type { UserRole } from "@prisma/client";
import { getRatingTier } from "../rating/rankTiers";

export class AdminService {
  constructor(
    private readonly repository: AdminRepository,
    private readonly revokeRuntime: (userId: string) => void,
  ) {}
  async listUsers(query: UserListQuery, role: UserRole) {
    const result = await this.repository.listUsers(query, role === "ADMIN");
    return paginated(query, result.total, result.items.map(toAdminUser));
  }
  async getUser(id: string, role: UserRole) {
    const user = await this.repository.getUser(id, role === "ADMIN");
    return {
      user: {
        ...toAdminUser(user),
        matchCount: user._count.matchParticipants,
        ratings: user.ratings.map((r) => ({
          gameMode: r.gameMode,
          rating: r.rating,
          rankTier: getRatingTier(r.rating),
          ratingDeviation: r.ratingDeviation,
          volatility: r.volatility,
          ratedGames: r.ratedGames,
          updatedAt: r.updatedAt.toISOString(),
        })),
      },
    };
  }
  async setBlocked(actorId: string, targetId: string, blocked: boolean, reason?: string) {
    const user = await this.repository.setBlocked(actorId, targetId, blocked, reason);
    // Always repeat runtime cleanup on an idempotent retry, after the durable transaction commits.
    if (blocked) this.revokeRuntime(targetId);
    return { user: toAdminUser(user) };
  }
  async changeRole(actorId: string, targetId: string, role: UserRole) {
    return { user: toAdminUser(await this.repository.changeRole(actorId, targetId, role)) };
  }
  async listMatches(query: MatchListQuery) {
    const result = await this.repository.listMatches(query);
    return paginated(query, result.total, result.items.map(toAdminMatch));
  }
  async getMatch(id: string) {
    const { match, latestActionRevision } = await this.repository.getMatch(id);
    const latestSnapshot = match.snapshots[0];
    return {
      match: {
        ...toAdminMatch(match),
        actionCount: match._count.actions,
        snapshotCount: match._count.snapshots,
        latestActionRevision,
        durableRevision: Math.max(latestActionRevision ?? 0, latestSnapshot?.revision ?? 0),
        latestSnapshot: latestSnapshot
          ? {
              revision: latestSnapshot.revision,
              formatVersion: latestSnapshot.formatVersion,
              createdAt: latestSnapshot.createdAt.toISOString(),
            }
          : null,
      },
    };
  }
  async listActions(id: string, query: ActionListQuery) {
    const result = await this.repository.listActions(id, query);
    return paginated(query, result.total, result.items.map(toAdminAction));
  }
  summary() {
    return this.repository.summary();
  }
}
