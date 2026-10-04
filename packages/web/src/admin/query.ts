import { useSearchParams } from "react-router";
import { modes, roles, statuses, type Query } from "./types";

const allowed = (value: string | null, values: readonly string[]) =>
  value && values.includes(value) ? value : undefined;
const positive = (value: string | null) =>
  value && /^[1-9]\d*$/.test(value) && Number(value) <= 1000000 ? Number(value) : 1;
export function readQuery(params: URLSearchParams, kind: "users" | "matches" | "actions"): Query {
  const base = {
    page: positive(params.get(kind === "actions" ? "actionPage" : "page")),
    limit: Number(
      allowed(params.get("limit"), ["20", "50", "100"]) ?? (kind === "actions" ? 50 : 20),
    ),
    order:
      allowed(params.get(kind === "actions" ? "actionOrder" : "order"), ["asc", "desc"]) ??
      (kind === "actions" ? "asc" : "desc"),
  };
  if (kind === "actions") return base;
  if (kind === "users")
    return {
      ...base,
      search: params.get("search")?.trim().slice(0, 100) || undefined,
      role: allowed(params.get("role"), roles),
      status: allowed(params.get("status")?.toUpperCase() ?? null, ["ACTIVE", "BLOCKED"]),
      sort: allowed(params.get("sort"), ["createdAt", "updatedAt", "username"]) ?? "createdAt",
    };
  const query: Query = {
    ...base,
    status: allowed(params.get("status"), statuses),
    gameMode: allowed(params.get("gameMode") ?? params.get("mode")?.toLowerCase() ?? null, modes),
    matchType: allowed(params.get("matchType") ?? params.get("type"), ["CASUAL", "RATED"]),
    participantUserId: params.get("participant") || params.get("participantUserId") || undefined,
    matchId: params.get("matchId") || undefined,
    sort: allowed(params.get("sort"), ["createdAt", "finishedAt"]) ?? "createdAt",
  };
  for (const key of ["createdFrom", "createdTo", "finishedFrom", "finishedTo"]) {
    const value = params.get(key);
    if (value && Number.isFinite(Date.parse(value))) query[key] = new Date(value).toISOString();
  }
  return query;
}
export function useAdminQuery(kind: "users" | "matches" | "actions") {
  const [params, setParams] = useSearchParams();
  const query = readQuery(params, kind);
  const change = (patch: Query) =>
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (kind === "matches") {
        if (query.gameMode) next.set("gameMode", String(query.gameMode));
        if (query.matchType) next.set("matchType", String(query.matchType));
        next.delete("mode");
        next.delete("type");
      }
      const pageKey = kind === "actions" ? "actionPage" : "page";
      if (!(pageKey in patch)) next.delete(pageKey);
      Object.entries(patch).forEach(([key, value]) => {
        if (value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      });
      return next;
    });
  return { query, change, params, reset: () => setParams({}), key: JSON.stringify(query) };
}
