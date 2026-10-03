import type { ReplayMetadata, ReplayStateResponse } from "./types";

export function replayRevisions(metadata: ReplayMetadata): number[] {
  return [metadata.initialRevision, ...metadata.timeline.map((entry) => entry.revision)];
}
export function parseRevision(value: string | null, revisions: readonly number[]): number | null {
  if (value === null || !/^(0|[1-9]\d*)$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revisions.includes(revision) ? revision : null;
}
export const REPLAY_CACHE_LIMIT = 5;
export class ReplayStateCache {
  private readonly entries = new Map<number, ReplayStateResponse>();
  get size() {
    return this.entries.size;
  }
  get(revision: number) {
    const value = this.entries.get(revision);
    if (value) {
      this.entries.delete(revision);
      this.entries.set(revision, value);
    }
    return value;
  }
  set(value: ReplayStateResponse) {
    this.entries.delete(value.revision);
    this.entries.set(value.revision, value);
    while (this.entries.size > REPLAY_CACHE_LIMIT)
      this.entries.delete(this.entries.keys().next().value!);
  }
}
