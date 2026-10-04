import { useEffect, useRef, useState } from "react";
import { ApiError } from "../api/client";

/** Each route owns its data; a new key hides previous data immediately. Late responses are ignored. */
export function useAdminResource<T>(key: string, load: () => Promise<T>) {
  const loader = useRef(load);
  loader.current = load;
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    attempt: number;
    data?: T;
    error?: ApiError;
  }>();
  useEffect(() => {
    let active = true;
    void loader.current().then(
      (data) => {
        if (active) setResult({ key, attempt, data });
      },
      (error) => {
        if (active)
          setResult({
            key,
            attempt,
            error: error instanceof ApiError ? error : new ApiError("NETWORK_ERROR"),
          });
      },
    );
    return () => {
      active = false;
    };
  }, [key, attempt]);
  const current = result?.key === key && result.attempt === attempt ? result : undefined;
  return {
    data: current?.data,
    error: current?.error,
    loading: !current,
    retry: () => setAttempt((value) => value + 1),
  };
}
