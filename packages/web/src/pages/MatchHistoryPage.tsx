import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { matchApi } from "../api/matchApi";
import { profileApi } from "../api/profileApi";
import { MatchHistoryFilters, readHistoryFilters } from "../matches/MatchHistoryFilters";
import { MatchHistoryList } from "../matches/MatchHistoryList";
import { HistoryPagination } from "../matches/HistoryPagination";
import { MatchLoadError } from "../matches/MatchLoadError";
import type { MatchHistoryResponse } from "../matches/types";
import type { PublicProfile } from "../profile/types";

export function MatchHistoryPage() {
  const userId = useAuthStore((state) => state.user?.id);
  return userId ? <MatchHistoryView userId={userId} /> : null;
}

export function PublicMatchHistoryPage() {
  const { username = "" } = useParams();
  const { t } = useI18n();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    username: string;
    profile?: PublicProfile;
    error?: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    profileApi.getPublic(username).then(
      (profile) => {
        if (active) setResult({ username, profile });
      },
      (error: unknown) => {
        if (active) setResult({ username, error });
      },
    );
    return () => {
      active = false;
    };
  }, [username, attempt]);
  const current = result?.username === username ? result : null;
  if (current?.error)
    return (
      <MatchLoadError
        error={current.error}
        retry={() => {
          setResult(null);
          setAttempt(attempt + 1);
        }}
      />
    );
  if (!current?.profile) return <p role="status">{t("matches.loading")}</p>;
  return (
    <MatchHistoryView
      key={current.profile.id}
      userId={current.profile.id}
      username={current.profile.username}
    />
  );
}

export function MatchHistoryView({ userId, username }: { userId: string; username?: string }) {
  const { t } = useI18n();
  const [query, setQuery] = useSearchParams();
  const serialized = query.toString();
  const filters = readHistoryFilters(query);
  const [attempt, setAttempt] = useState(0);
  const requestKey = `${userId}:${serialized}:${attempt}`;
  const [result, setResult] = useState<{
    key: string;
    data?: MatchHistoryResponse;
    error?: unknown;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const parsed = readHistoryFilters(new URLSearchParams(serialized));
    if (parsed)
      matchApi.getUserMatches(userId, parsed).then(
        (data) => {
          if (active) setResult({ key: requestKey, data });
        },
        (error: unknown) => {
          if (active) setResult({ key: requestKey, error });
        },
      );
    return () => {
      active = false;
    };
  }, [userId, serialized, requestKey]);
  const current = result?.key === requestKey ? result : null;
  const totalPages = current?.data?.pagination.totalPages;
  const page = filters?.page;
  useEffect(() => {
    if (totalPages !== undefined && page !== undefined && page > Math.max(1, totalPages)) {
      const next = new URLSearchParams(serialized);
      next.set("page", String(Math.max(1, totalPages)));
      setQuery(next, { replace: true });
    }
  }, [totalPages, page, serialized, setQuery]);
  const filtered = Boolean(filters?.result || filters?.gameMode);
  return (
    <section aria-labelledby="match-history-title" data-testid="match-history-page">
      <p className="section-kicker">{t("auth.brand")}</p>
      <h1 id="match-history-title" className="mt-2 text-2xl font-bold">
        {t("matches.history")}
      </h1>
      {username && (
        <Link
          className="mt-2 block text-sm underline"
          to={`/users/${encodeURIComponent(username)}`}
        >
          @{username}
        </Link>
      )}
      {!filters ? (
        <div role="alert" className="mt-5">
          <p>{t("matches.invalidRequest")}</p>
          <button className="btn btn-secondary mt-3" onClick={() => setQuery({})}>
            {t("matches.resetFilters")}
          </button>
        </div>
      ) : (
        <>
          <MatchHistoryFilters
            filters={filters}
            onChange={(key, value) => {
              const next = new URLSearchParams(query);
              if (value) next.set(key, value);
              else next.delete(key);
              next.set("page", "1");
              setQuery(next);
            }}
          />
          <div aria-busy={!current} className="min-h-32">
            {!current && <p role="status">{t("matches.loading")}</p>}
            {Boolean(current?.error) && (
              <MatchLoadError error={current?.error} retry={() => setAttempt(attempt + 1)} />
            )}
            {current?.data && (
              <>
                {current.data.items.length ? (
                  <MatchHistoryList items={current.data.items} />
                ) : (
                  <p className="py-6">{t(filtered ? "matches.filteredEmpty" : "matches.empty")}</p>
                )}
                <HistoryPagination
                  pagination={current.data.pagination}
                  onPage={(nextPage) => {
                    const next = new URLSearchParams(query);
                    next.set("page", String(nextPage));
                    setQuery(next);
                  }}
                />
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
