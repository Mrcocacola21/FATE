import { ApiError } from "../api/client";
import type { Translate } from "../i18n";

export function profileErrorMessage(error: unknown, t: Translate): string {
  if (error instanceof ApiError) {
    if (error.code === "USERNAME_ALREADY_TAKEN") return t("auth.errors.usernameTaken");
    if (error.code === "USER_NOT_FOUND") return t("profile.notFound");
    if (["INVALID_REQUEST", "VALIDATION_ERROR"].includes(error.code)) return t("profile.invalidRequest");
    if (error.code === "REQUEST_IN_PROGRESS") return t("auth.errors.inProgress");
  }
  return t("profile.loadError");
}
