import { Link } from "react-router";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import { useReplayMetadata } from "./useReplay";

export function MatchReplayLink({
  id,
  finalRevision,
}: {
  id: string;
  finalRevision: number | null;
}) {
  const status = useAuthStore((state) => state.status);
  if (status !== "authenticated" || !finalRevision || finalRevision < 1) return null;
  return <AvailableReplayLink key={id} id={id} />;
}
function AvailableReplayLink({ id }: { id: string }) {
  const result = useReplayMetadata(id, 0);
  const { t } = useI18n();
  if (!result)
    return (
      <p className="mt-5 text-sm" role="status">
        {t("replay.checking")}
      </p>
    );
  if (!result.data) return <p className="mt-5 text-sm opacity-75">{t("replay.unavailable")}</p>;
  return (
    <Link
      className="replay-button mt-5 inline-block"
      to={`/matches/${encodeURIComponent(id)}/replay`}
    >
      {t("replay.watch")}
    </Link>
  );
}
