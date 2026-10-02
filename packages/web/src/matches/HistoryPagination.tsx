import { useI18n } from "../i18n";
import type { MatchHistoryResponse } from "./types";

export function HistoryPagination({
  pagination,
  onPage,
}: {
  pagination: MatchHistoryResponse["pagination"];
  onPage: (page: number) => void;
}) {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("matches.pagination")}
      className="mt-5 flex flex-wrap items-center justify-between gap-3"
    >
      <button
        className="btn btn-secondary"
        disabled={pagination.page <= 1}
        onClick={() => onPage(pagination.page - 1)}
      >
        {t("matches.previous")}
      </button>
      <span className="text-sm">
        {t("matches.page", { page: pagination.page, total: Math.max(1, pagination.totalPages) })}
      </span>
      <button
        className="btn btn-secondary"
        disabled={pagination.page >= pagination.totalPages}
        onClick={() => onPage(pagination.page + 1)}
      >
        {t("matches.next")}
      </button>
    </nav>
  );
}
