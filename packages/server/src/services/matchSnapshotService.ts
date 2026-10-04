import type { GameRoom } from "../store";
import { readMatchSnapshotConfig, type MatchSnapshotConfig } from "../config";
import { MatchSnapshotRepository } from "../repositories/matchSnapshotRepository";
import {
  deserializeMatchSnapshot,
  serializeMatchSnapshot,
  MatchSnapshotError,
  type LoadedMatchSnapshot,
  type SerializedMatchSnapshot,
} from "../persistence/matchSnapshot";

type Repository = Pick<
  MatchSnapshotRepository,
  "create" | "findByMatchAndRevision" | "findLatestByMatchId" | "findLatestAtOrBeforeRevision"
>;
export class MatchSnapshotService {
  constructor(
    private repository?: Repository,
    private readonly config: MatchSnapshotConfig = readMatchSnapshotConfig(),
  ) {
    if (
      !Number.isSafeInteger(config.interval) ||
      config.interval < 0 ||
      config.interval > 2147483647
    )
      throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
  }
  private getRepository(): Repository {
    return (this.repository ??= new MatchSnapshotRepository());
  }
  shouldCapture(revision: number, final = false): boolean {
    return (
      Number.isSafeInteger(revision) &&
      revision > 0 &&
      revision <= 2147483647 &&
      (final || (this.config.interval > 0 && revision % this.config.interval === 0))
    );
  }
  capture(room: GameRoom): SerializedMatchSnapshot {
    return serializeMatchSnapshot(room);
  }
  persistSnapshot(snapshot: SerializedMatchSnapshot): Promise<void> {
    return this.getRepository().create(snapshot);
  }
  async loadSnapshot(matchId: string, revision: number): Promise<LoadedMatchSnapshot | null> {
    this.validateQueryRevision(revision);
    const row = await this.getRepository().findByMatchAndRevision(matchId, revision);
    return row ? deserializeMatchSnapshot(row) : null;
  }
  async loadLatestSnapshot(matchId: string): Promise<LoadedMatchSnapshot | null> {
    const row = await this.getRepository().findLatestByMatchId(matchId);
    return row ? deserializeMatchSnapshot(row) : null;
  }
  async loadLatestSnapshotAtOrBefore(
    matchId: string,
    revision: number,
  ): Promise<LoadedMatchSnapshot | null> {
    this.validateQueryRevision(revision);
    const row = await this.getRepository().findLatestAtOrBeforeRevision(matchId, revision);
    return row ? deserializeMatchSnapshot(row) : null;
  }
  /** Recovery can bypass an unusable checkpoint, but never a storage failure. */
  async loadLatestCompatibleSnapshotAtOrBefore(
    matchId: string, revision: number,
  ): Promise<LoadedMatchSnapshot | null> {
    this.validateQueryRevision(revision);
    let ceiling = revision;
    while (ceiling > 0) {
      const row = await this.getRepository().findLatestAtOrBeforeRevision(matchId, ceiling);
      if (!row) return null;
      if (row.matchId !== matchId || row.revision < 1 || row.revision > ceiling)
        throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
      try { return deserializeMatchSnapshot(row); }
      catch (error) {
        if (!(error instanceof MatchSnapshotError)) throw error;
        ceiling = row.revision - 1;
      }
    }
    return null;
  }
  private validateQueryRevision(revision: number): void {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision > 2147483647)
      throw new MatchSnapshotError("MATCH_SNAPSHOT_INVALID");
  }
}
