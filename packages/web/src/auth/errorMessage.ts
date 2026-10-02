import type { Translate } from "../i18n";
import { ApiError } from "../api/client";

export function authErrorMessage(error: unknown, t: Translate): string {
  const code = error instanceof ApiError ? error.code : "UNKNOWN";
  const keys: Record<string, string> = {
    INVALID_CREDENTIALS: "invalidCredentials",
    EMAIL_ALREADY_REGISTERED: "emailTaken",
    USERNAME_ALREADY_TAKEN: "usernameTaken",
    INVALID_REQUEST: "invalidRequest",
    RATE_LIMITED: "rateLimited",
    NETWORK_ERROR: "unavailable",
    DATABASE_UNAVAILABLE: "unavailable",
    AUTH_UNAVAILABLE: "unavailable",
    LOGOUT_FAILED: "logoutFailed",
    REQUEST_IN_PROGRESS: "inProgress",
  };
  return t(`auth.errors.${keys[code] ?? "fallback"}`);
}
