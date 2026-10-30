import { useEffect, useState } from "react";
import type { HeroMeta } from "rules";
import { listHeroes } from "../api";

interface UseHeroesResult {
  heroes: HeroMeta[];
  loading: boolean;
  error: string | null;
  retry: () => void;
}

let sharedHeroes: Promise<HeroMeta[]> | null = null;

function loadSharedHeroes(): Promise<HeroMeta[]> {
  sharedHeroes ??= listHeroes().catch((err: unknown) => {
    sharedHeroes = null;
    throw err;
  });
  return sharedHeroes;
}

/** The hero list once per session: battle panels mount and unmount with every selection. */
export function useSharedHeroes(): UseHeroesResult {
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    loadSharedHeroes()
      .then((data) => {
        if (!cancelled) setHeroes(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load heroes.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { heroes, loading, error, retry: () => setAttempt((value) => value + 1) };
}

export function useHeroes(): UseHeroesResult {
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    listHeroes()
      .then((data) => {
        if (cancelled) return;
        setHeroes(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : "Failed to load heroes.";
        setError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  return { heroes, loading, error, retry: () => setAttempt((value) => value + 1) };
}
