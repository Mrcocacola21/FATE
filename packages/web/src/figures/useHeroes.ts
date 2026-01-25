import { useEffect, useState } from "react";
import type { HeroMeta } from "rules";
import { listHeroes } from "../api";

interface UseHeroesResult {
  heroes: HeroMeta[];
  loading: boolean;
  error: string | null;
}

export function useHeroes(): UseHeroesResult {
  const [heroes, setHeroes] = useState<HeroMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listHeroes()
      .then((data) => {
        if (cancelled) return;
        setHeroes(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error ? err.message : "Failed to load heroes.";
        setError(message);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return { heroes, loading, error };
}
