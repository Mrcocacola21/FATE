import { subscribeMatchmaking } from "../store";
import { createStore } from "zustand/vanilla";
import { useStore } from "zustand";
import { ApiError } from "../api/client";
import { matchmakingApi, parseMatchmakingStatus } from "../api/matchmakingApi";
import type { MatchmakingEvent, MatchmakingStatus } from "./types";
import type { GameModeId } from "rules";

export interface QueueState {
  ownerId: string | null;
  status: MatchmakingStatus;
  revision: number;
  busy: boolean;
  error: string | null;
  rating: number | null;
  receivedAt: number;
}
export function createQueueStore(
  api: typeof matchmakingApi,
  connect: () => Promise<void>,
  now = Date.now,
) {
  const initial: QueueState = {
    ownerId: null,
    status: { status: "NOT_QUEUED" },
    revision: -1,
    busy: false,
    error: null,
    rating: null,
    receivedAt: now(),
  };
  const state = createStore<QueueState>()(() => initial);
  let generation = 0;
  let mutation = false;
  const apply = (status: MatchmakingStatus) =>
    state.setState({
      status,
      receivedAt: now(),
      ...(status.status === "QUEUED" || status.status === "MATCHING"
        ? { rating: status.rating }
        : {}),
    });
  const run = async (request: () => Promise<MatchmakingStatus>, requireConnection: boolean) => {
    if (mutation) return;
    mutation = true;
    const expected = generation;
    state.setState({ busy: true, error: null });
    try {
      if (requireConnection) await connect();
      if (generation !== expected) return;
      const revision = state.getState().revision;
      const status = await request();
      const current = state.getState().revision;
      if (expected === generation && (status.revision === undefined ? revision === current : status.revision >= current)) {
        if (status.revision !== undefined) state.setState({ revision: status.revision });
        apply(status);
      }
    } catch (error) {
      if (generation === expected)
        state.setState({
          error: error instanceof ApiError ? error.code : "MATCHMAKING_UNAVAILABLE",
        });
    } finally {
      if (generation === expected) {
        mutation = false;
        state.setState({ busy: false });
      }
    }
  };
  return {
    state,
    owner(id: string | null) {
      if (state.getState().ownerId === id) return;
      generation++;
      mutation = false;
      state.setState({ ...initial, ownerId: id, receivedAt: now() });
    },
    newConnection() {
      state.setState({ revision: -1 });
    },
    event(event: MatchmakingEvent) {
      if (
        !state.getState().ownerId ||
        !Number.isSafeInteger(event.revision) ||
        event.revision <= state.getState().revision
      )
        return;
      try {
        const status = parseMatchmakingStatus(event.status);
        state.setState({ revision: event.revision, error: null });
        apply(status);
      } catch {
        /* Invalid events cannot change authenticated queue state. */
      }
    },
    restore: () => run(api.status, false),
    join: (mode: GameModeId) => run(() => api.join(mode), true),
    cancel: () => run(api.cancel, false),
    async loadRating(id: string) {
      const expected = generation;
      try {
        const rating = await api.rating(id);
        if (expected === generation && state.getState().ownerId === id) state.setState({ rating });
      } catch {
        /* A rating display outage does not gate matchmaking eligibility. */
      }
    },
  };
}
export const queue = createQueueStore(matchmakingApi, async () => subscribeMatchmaking());
export const useQueue = <T>(selector: (state: QueueState) => T): T =>
  useStore(queue.state, selector);
