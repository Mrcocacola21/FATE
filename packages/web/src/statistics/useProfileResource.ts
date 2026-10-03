import { useEffect, useState } from "react";

type Resource<T> =
  | { key: string; data: T; error?: never }
  | { key: string; error: unknown; data?: never };

/** Scope every response to its player and attempt, including the render before effect cleanup. */
export function useProfileResource<T>(
  userId: string,
  revision: number,
  load: (userId: string) => Promise<T>,
) {
  const [attempt, setAttempt] = useState(0);
  const key = `${userId}:${revision}:${attempt}`;
  const [result, setResult] = useState<Resource<T> | null>(null);
  useEffect(() => {
    let active = true;
    load(userId).then(
      (data) => {
        if (active) setResult({ key, data });
      },
      (error: unknown) => {
        if (active) setResult({ key, error });
      },
    );
    return () => {
      active = false;
    };
  }, [userId, key, load]);
  return {
    result: result?.key === key ? result : null,
    retry: () => setAttempt((value) => value + 1),
  };
}
