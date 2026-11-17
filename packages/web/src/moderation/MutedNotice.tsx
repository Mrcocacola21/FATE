import { useEffect, useState } from "react";
import { useI18n } from "../i18n";

/** The restriction while it lasts; re-renders the moment it ends. */
export function useActiveMute(until: string | null | undefined) {
  const end = until ? Date.parse(until) : NaN;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!Number.isFinite(end) || end <= Date.now()) return;
    // Long restrictions re-check daily; timers cannot wait longer than about 24 days.
    const timer = setTimeout(() => setNow(Date.now()), Math.min(end - Date.now() + 50, 86_400_000));
    return () => clearTimeout(timer);
  }, [end, now]);
  return Number.isFinite(end) && end > now ? until! : null;
}

/** In place of the box to write in, while a moderator's restriction lasts. */
export function MutedNotice({ until, className = "" }: { until: string; className?: string }) {
  const { t, language } = useI18n();
  const date = new Date(until).toLocaleString(language, {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  return (
    <p className={`muted-notice ${className}`} role="status" data-testid="chat-muted">
      {t("moderation.mutedNotice", { date })}
    </p>
  );
}
