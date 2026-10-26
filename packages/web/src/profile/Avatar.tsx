import { useState } from "react";
import { API_BASE } from "../api/config";
import { useI18n } from "../i18n";

const UPLOADED_AVATAR_PATH = /^\/api\/avatars\/[0-9a-f-]{36}\?v=[0-9a-f]{16}$/;

/** Uploaded pictures are stored as an API path; everything else is an absolute URL. */
export function isUploadedAvatar(avatarUrl: string | null | undefined): avatarUrl is string {
  return !!avatarUrl && UPLOADED_AVATAR_PATH.test(avatarUrl);
}

export function resolveAvatarUrl(avatarUrl: string | null | undefined): string | null {
  return isUploadedAvatar(avatarUrl) ? `${API_BASE}${avatarUrl}` : (avatarUrl ?? null);
}

export function Avatar({
  username,
  displayName,
  avatarUrl,
  small = false,
  arch = false,
}: {
  username: string;
  displayName?: string | null;
  avatarUrl: string | null;
  small?: boolean;
  /** Fill a grimoire arch frame instead of drawing its own circle. */
  arch?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const { language } = useI18n();
  let safeUrl: string | null = null;
  const resolved = resolveAvatarUrl(avatarUrl);
  try {
    if (resolved && ["http:", "https:"].includes(new URL(resolved).protocol)) safeUrl = resolved;
  } catch {
    /* Fall back for invalid legacy URLs too. */
  }
  const name = displayName || username;
  const size = arch
    ? "h-full w-full text-3xl"
    : `rounded-full ${small ? "h-8 w-8 text-xs" : "h-20 w-20 text-2xl"}`;
  return safeUrl && failedUrl !== safeUrl ? (
    <img
      className={`shrink-0 object-cover ${size}`}
      src={safeUrl}
      alt={name}
      referrerPolicy="no-referrer"
      onError={() => setFailedUrl(safeUrl)}
    />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={`inline-flex shrink-0 items-center justify-center bg-amber-500/20 font-bold ${size}`}
    >
      {Array.from(name).slice(0, 2).join("").toLocaleUpperCase(language)}
    </span>
  );
}
