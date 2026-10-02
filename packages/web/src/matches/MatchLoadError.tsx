import { useI18n } from "../i18n";
import { matchErrorMessage } from "./presentation";

export function MatchLoadError({ error, retry }: { error: unknown; retry: () => void }) {
  const { t } = useI18n();
  return (
    <div role="alert" className="my-4 text-sm">
      <p>{matchErrorMessage(error, t)}</p>
      <button className="btn btn-secondary mt-3" onClick={retry}>
        {t("profile.retry")}
      </button>
    </div>
  );
}
