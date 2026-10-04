import type { Match } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import {
  applyAction,
  SeededRNG,
  banDraftHero,
  pickDraftHero,
  createDraftArmy,
  attachArmy,
  createEmptyGame,
  type DraftState,
  type GameState,
  type SeededRngState,
  type HeroSelection,
} from "rules";
import { MatchRepository } from "../repositories/matchRepository";
import { MatchActionRepository } from "../repositories/matchActionRepository";
import { MatchSnapshotService } from "./matchSnapshotService";
import {
  MatchSnapshotError,
  normalizeSnapshotState,
  type LoadedMatchSnapshot,
} from "../persistence/matchSnapshot";
import { createInitialMatchState, initialConfigSchema } from "../replay/initialState";
import { restoreReplaySetup, restoreDraftHistory, captureReplaySetup } from "../replay/actionSetup";
import { deserializeReplayAction } from "../replay/deserializeAction";
import { ReplayError } from "../replay/replayError";
import { withAcceptedRevision } from "../replay/stateRevision";
import { isActionAllowedByPlayer } from "../permissions";

export interface ReconstructedMatchState {
  matchId: string;
  revision: number;
  state: GameState;
  rngState: SeededRngState;
  draftState: DraftState | null;
  figureSets: Partial<Record<"P1" | "P2", HeroSelection>>;
  base: { type: "initial" | "snapshot"; revision: number };
  actionsApplied: number;
  /** Loading a checkpoint is reconstruction, not independent verification. */
  verification: "not_checked" | "checkpoint_matched" | "checkpoint_loaded" | "no_final_checkpoint";
}
type MatchReader = Pick<MatchRepository, "findById">;
type ActionReader = Pick<MatchActionRepository, "findInRevisionRange">;
type SnapshotReader = Pick<MatchSnapshotService, "loadSnapshot" | "loadLatestSnapshotAtOrBefore"> &
  Partial<Pick<MatchSnapshotService, "loadLatestCompatibleSnapshotAtOrBefore">>;

/** Read-only durable reconstruction. No runtime rooms, lifecycle, socket or write capability. */
export class ReplayService {
  constructor(
    private matches?: MatchReader,
    private actions?: ActionReader,
    private snapshots: SnapshotReader = new MatchSnapshotService(),
  ) {}

  async reconstructAtRevision(
    matchId: string,
    targetRevision: number,
  ): Promise<ReconstructedMatchState> {
    return this.guard(matchId, async () => {
      const match = await this.loadMatch(matchId);
      this.validateTarget(match, targetRevision);
      return this.reconstruct(match, targetRevision, false);
    });
  }

  async reconstructFinalState(matchId: string): Promise<ReconstructedMatchState> {
    return this.guard(matchId, async () => {
      const match = await this.loadMatch(matchId);
      const target = this.finalRevision(match);
      return this.reconstruct(match, target, false);
    });
  }

  /** Same deterministic engine, with checkpoint fallback and room-owned setup metadata. */
  async reconstructForRecovery(matchId: string, targetRevision: number): Promise<ReconstructedMatchState> {
    return this.guard(matchId, async () => {
      const match = await this.loadMatch(matchId);
      this.validateTarget(match, targetRevision);
      return this.reconstruct(match, targetRevision, false, true);
    });
  }

  /** Always starts at revision zero; the final snapshot can never verify itself. */
  async validateFinalDeterminism(matchId: string) {
    return this.guard(matchId, async () => {
      const match = await this.loadMatch(matchId);
      const target = this.finalRevision(match);
      const result = await this.reconstruct(match, target, true);
      return {
        matchId,
        finalRevision: target,
        baseRevision: result.base.revision,
        actionsApplied: result.actionsApplied,
        deterministic: result.verification === "checkpoint_matched" ? true : null,
        verification: result.verification,
      };
    });
  }

  private async loadMatch(matchId: string): Promise<Match> {
    const match = await (this.matches ??= new MatchRepository()).findById(matchId);
    if (!match) throw new ReplayError("MATCH_NOT_FOUND", { matchId });
    // WAITING/CANCELLED matches have no stable gameplay contract in this phase.
    if (
      !["FINISHED", "IN_PROGRESS"].includes(match.status) ||
      !["standard", "classic", "draft"].includes(match.gameMode)
    )
      throw new ReplayError("MATCH_NOT_REPLAYABLE", { matchId });
    return match;
  }

  private finalRevision(match: Match): number {
    if (
      match.status !== "FINISHED" ||
      !Number.isSafeInteger(match.finalRevision) ||
      match.finalRevision === null ||
      match.finalRevision < 1 ||
      match.finalRevision > 2147483647
    )
      throw new ReplayError("MATCH_NOT_REPLAYABLE", { matchId: match.id });
    return match.finalRevision;
  }

  private validateTarget(match: Match, target: number) {
    if (match.status === "FINISHED") this.finalRevision(match);
    if (
      !Number.isSafeInteger(target) ||
      target < 0 ||
      target > 2147483647 ||
      (match.status === "FINISHED" && target > match.finalRevision!)
    )
      throw new ReplayError("INVALID_TARGET_REVISION", {
        matchId: match.id,
        targetRevision: target,
      });
  }

  private checkSnapshot(snapshot: LoadedMatchSnapshot, match: Match, target: number) {
    if (snapshot.matchId !== match.id || snapshot.revision < 1 || snapshot.revision > target)
      throw new ReplayError("INVALID_SNAPSHOT", { matchId: match.id, targetRevision: target });
  }

  private async reconstruct(
    match: Match,
    target: number,
    fromInitial: boolean,
    recovery = false,
  ): Promise<ReconstructedMatchState> {
    const snapshot = fromInitial
      ? null
      : await (this.snapshots.loadLatestCompatibleSnapshotAtOrBefore
          ? this.snapshots.loadLatestCompatibleSnapshotAtOrBefore(match.id, target)
          : this.snapshots.loadLatestSnapshotAtOrBefore(match.id, target));
    if (snapshot) this.checkSnapshot(snapshot, match, target);
    const base = {
      type: snapshot ? ("snapshot" as const) : ("initial" as const),
      revision: snapshot?.revision ?? 0,
    };
    let rng: SeededRNG;
    let state: GameState;
    // Snapshot v1 does not store room-owned draft state. The first bounded setup restores it.
    let draft: DraftState | null | undefined = snapshot ? undefined : null;
    let figureSets: ReconstructedMatchState["figureSets"] = {};
    if (snapshot) {
      state = structuredClone(snapshot.state);
      try {
        rng = SeededRNG.fromState(snapshot.rngState);
      } catch {
        throw new ReplayError("RNG_RESTORE_FAILED", {
          matchId: match.id,
          baseRevision: base.revision,
        });
      }
    } else {
      const config = initialConfigSchema.safeParse(match.initialConfig);
      // Old seed/mode alone cannot prove original host, arena or lobby configuration.
      if (!config.success || !Number.isInteger(match.seed))
        throw new ReplayError("MATCH_NOT_REPLAYABLE", { matchId: match.id });
      rng = new SeededRNG(match.seed);
      state = createInitialMatchState(config.data, rng);
    }
    if (recovery && snapshot) {
      // v1 checkpoints contain GameState, not the completed room-owned draft/figure selection.
      const prefix = await (this.actions ??= new MatchActionRepository()).findInRevisionRange(
        match.id, 0, base.revision,
      );
      for (const row of prefix) {
        const { setup } = deserializeReplayAction(row);
        if (setup) {
          try { draft = restoreDraftHistory(setup); }
          catch { throw new ReplayError("INVALID_ACTION_LOG", { matchId: match.id, revision: row.revision }); }
          figureSets = structuredClone(setup.armies);
        }
      }
      if (match.gameMode === "draft" && !draft)
        throw new ReplayError("MATCH_NOT_REPLAYABLE", { matchId: match.id });
    }
    const rows =
      target === base.revision
        ? []
        : await (this.actions ??= new MatchActionRepository()).findInRevisionRange(
            match.id,
            base.revision,
            target,
          );
    if (base.type === "initial" && target > 0 && rows.length === 0)
      throw new ReplayError("MATCH_NOT_REPLAYABLE", { matchId: match.id });
    let revision = base.revision;
    const seen = new Set<number>();
    for (const row of rows) {
      if (!Number.isSafeInteger(row.revision) || row.revision < 1 || row.revision > 2147483647)
        throw new ReplayError("INVALID_ACTION_LOG", { matchId: match.id });
      if (seen.has(row.revision))
        throw new ReplayError("REPLAY_DUPLICATE_REVISION", {
          matchId: match.id,
          revision: row.revision,
        });
      seen.add(row.revision);
      if (row.matchId !== match.id || row.revision <= base.revision || row.revision > target)
        throw new ReplayError("INVALID_ACTION_LOG", { matchId: match.id, revision: row.revision });
      if (row.revision !== revision + 1)
        throw new ReplayError("REPLAY_ACTION_GAP", { matchId: match.id, revision: revision + 1 });
      const { action, setup } = deserializeReplayAction(row);
      if (setup) figureSets = structuredClone(setup.armies);
      try {
        if (setup) state = restoreReplaySetup(state, setup);
        // New lobby history must carry its unrevisioned setup; do not invent readiness.
        else if (state.phase === "lobby")
          throw new ReplayError("MATCH_NOT_REPLAYABLE", {
            matchId: match.id,
            revision: row.revision,
          });
        if (action.type === "setGameMode") {
          if (
            !setup ||
            setup.gameMode !== action.gameMode ||
            setup.draftHistory !== null ||
            state.pendingRoll
          )
            throw new Error();
          draft = null;
        } else if (
          action.type === "draftStarted" ||
          action.type === "draftBanHero" ||
          action.type === "draftPickHero"
        ) {
          if (!setup || setup.gameMode !== "draft") throw new Error();
          const restoredDraft = restoreDraftHistory(setup);
          if (!restoredDraft) throw new Error();
          const event = restoredDraft.history.at(-1);
          if (
            action.type === "draftStarted"
              ? restoredDraft.history.length !== 0 || !!draft
              : !event ||
                event.type !== (action.type === "draftBanHero" ? "ban" : "pick") ||
                event.player !== action.player ||
                event.heroId !== action.heroId
          )
            throw new Error();
          if (action.type !== "draftStarted" && draft !== undefined) {
            if (!draft) throw new Error();
            const next =
              action.type === "draftBanHero"
                ? banDraftHero(draft, action.player, action.heroId)
                : pickDraftHero(draft, action.player, action.heroId);
            if (!next.ok || !isDeepStrictEqual(next.state.history, restoredDraft.history))
              throw new Error();
          }
          draft = restoredDraft;
        } else {
          if (setup) {
            const restoredDraft = restoreDraftHistory(setup);
            if (
              draft !== undefined &&
              !isDeepStrictEqual(draft?.history ?? null, restoredDraft?.history ?? null)
            )
              throw new Error();
            draft = restoredDraft;
          }
          if (action.type === "startGame" && setup?.gameMode !== match.gameMode) throw new Error();
          if (action.type === "startGame" && match.gameMode === "draft") {
            if (!draft || draft.phase !== "complete" || !setup) throw new Error();
            let armies = attachArmy(createEmptyGame(), createDraftArmy("P1", draft.picks.P1));
            armies = attachArmy(armies, createDraftArmy("P2", draft.picks.P2));
            if (!isDeepStrictEqual(captureReplaySetup(armies, "draft", draft).armies, setup.armies))
              throw new Error();
          }
          const previous = state;
          // Domain seat consistency only; no session/JWT or present-day user lookup.
          if (row.actorSeat && !isActionAllowedByPlayer(state, action, row.actorSeat))
            throw new Error();
          const result = applyAction(state, action, rng);
          if (result.rejectionReason || (result.state === previous && result.events.length === 0))
            throw new Error();
          state = withAcceptedRevision(previous, result.state, row.revision);
        }
      } catch (error) {
        if (error instanceof ReplayError) throw error;
        throw new ReplayError("INVALID_ACTION_LOG", { matchId: match.id, revision: row.revision });
      }
      // Events are presentation history, deliberately omitted by snapshot v1.
      state = { ...state, events: [] };
      revision = row.revision;
    }
    if (revision !== target)
      throw new ReplayError("REPLAY_ACTION_GAP", { matchId: match.id, revision: revision + 1 });
    let verification: ReconstructedMatchState["verification"] = "not_checked";
    if (match.status === "FINISHED" && target === match.finalRevision) {
      const oracle =
        snapshot?.revision === target
          ? snapshot
          : await this.snapshots.loadSnapshot(match.id, target);
      if (!oracle) verification = "no_final_checkpoint";
      else {
        this.checkSnapshot(oracle, match, target);
        if (oracle.revision !== target)
          throw new ReplayError("INVALID_SNAPSHOT", { matchId: match.id, targetRevision: target });
        if (!isDeepStrictEqual(normalizeSnapshotState(state), normalizeSnapshotState(oracle.state)))
          throw new ReplayError("REPLAY_FINAL_STATE_MISMATCH", {
            matchId: match.id,
            targetRevision: target,
            baseRevision: base.revision,
          });
        if (!isDeepStrictEqual(rng.exportState(), oracle.rngState))
          throw new ReplayError("REPLAY_RNG_MISMATCH", {
            matchId: match.id,
            targetRevision: target,
            baseRevision: base.revision,
          });
        verification = base.revision === target ? "checkpoint_loaded" : "checkpoint_matched";
      }
      if (state.phase !== "ended")
        throw new ReplayError("REPLAY_FINAL_STATE_MISMATCH", {
          matchId: match.id,
          targetRevision: target,
        });
    }
    return {
      matchId: match.id,
      revision: target,
      state,
      rngState: rng.exportState(),
      draftState: draft ?? null,
      figureSets,
      base,
      actionsApplied: rows.length,
      verification,
    };
  }

  private async guard<T>(matchId: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      if (error instanceof ReplayError) throw error;
      if (error instanceof MatchSnapshotError)
        throw new ReplayError(
          error.code === "UNSUPPORTED_SNAPSHOT_VERSION" ? error.code : "INVALID_SNAPSHOT",
          { matchId },
        );
      throw new ReplayError("REPLAY_STORAGE_UNAVAILABLE", { matchId });
    }
  }
}
