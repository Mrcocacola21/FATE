export type ReplayErrorCode =
  | "MATCH_NOT_FOUND"
  | "MATCH_NOT_REPLAYABLE"
  | "INVALID_TARGET_REVISION"
  | "UNSUPPORTED_SNAPSHOT_VERSION"
  | "INVALID_SNAPSHOT"
  | "INVALID_ACTION_LOG"
  | "REPLAY_ACTION_GAP"
  | "REPLAY_DUPLICATE_REVISION"
  | "UNSUPPORTED_ACTION_FORMAT"
  | "RNG_RESTORE_FAILED"
  | "REPLAY_FINAL_STATE_MISMATCH"
  | "REPLAY_RNG_MISMATCH"
  | "REPLAY_STORAGE_UNAVAILABLE";

/** Only safe identifiers and categories; no hidden state or raw database diagnostics. */
export class ReplayError extends Error {
  constructor(
    readonly code: ReplayErrorCode,
    readonly metadata: {
      matchId: string;
      targetRevision?: number;
      baseRevision?: number;
      revision?: number;
    },
  ) {
    super(code);
  }
}
