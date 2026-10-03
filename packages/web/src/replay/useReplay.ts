import { useEffect, useRef, useState } from "react";
import { replayApi } from "../api/replayApi";
import type { ReplayMetadata, ReplayStateResponse } from "./types";
import { ReplayStateCache } from "./navigation";

export function useReplayMetadata(id: string, attempt: number) {
  const [result, setResult] = useState<{ key: string; data?: ReplayMetadata; error?: unknown }>();
  const key = `${id}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    replayApi.getMetadata(id, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setResult({ key, data });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setResult({ key, error });
      },
    );
    return () => controller.abort();
  }, [id, key]);
  return result?.key === key ? result : undefined;
}

/** Mounted per match/session. Only five recent HTTP results, no reconstruction or prefetch. */
export function useReplayState(id: string, revision: number | null) {
  const cache = useRef(new ReplayStateCache());
  const [response, setResponse] = useState<ReplayStateResponse>();
  const [failure, setFailure] = useState<{ revision: number; error: unknown }>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (revision === null) return;
    const controller = new AbortController();
    setFailure(undefined);
    const cached = cache.current.get(revision);
    if (cached) {
      setResponse(cached);
      return;
    }
    replayApi.getState(id, revision, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        cache.current.set(data);
        setResponse(data);
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setFailure({ revision, error });
      },
    );
    return () => controller.abort();
  }, [id, revision, attempt]);
  const error = failure?.revision === revision ? failure.error : undefined;
  return {
    response,
    error,
    loading: revision !== null && response?.revision !== revision && !error,
    retry: () => setAttempt((value) => value + 1),
  };
}
