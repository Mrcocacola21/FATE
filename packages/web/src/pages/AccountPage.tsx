import React from "react";
import { useI18n } from "../i18n";
import { reloadCurrentUser, useAuthStore } from "../auth/authStore";
import { authErrorMessage } from "../auth/errorMessage";
import { useState } from "react";

export function AccountPage() {
  const { t, language } = useI18n();
  const { user, logout, operation } = useAuthStore((state) => state);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!user) return null;
  const refreshIdentity = async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await reloadCurrentUser();
    } catch (failure) {
      setError(authErrorMessage(failure, t));
    } finally {
      setLoading(false);
    }
  };
  return (
    <section aria-labelledby="account-title" data-testid="account-page">
      <p className="section-kicker">{t("auth.brand")}</p>
      <h1 id="account-title" className="mt-2 text-2xl font-bold">
        {t("auth.account")}
      </h1>
      <dl className="my-6 grid gap-4 break-words text-sm">
        <div>
          <dt className="text-stone-600 dark:text-stone-300">{t("auth.username")}</dt>
          <dd className="font-semibold">{user.username ?? t("common.none")}</dd>
        </div>
        <div>
          <dt className="text-stone-600 dark:text-stone-300">{t("auth.email")}</dt>
          <dd className="font-semibold">{user.email}</dd>
        </div>
        {user.displayName && (
          <div>
            <dt className="text-stone-600 dark:text-stone-300">{t("auth.displayName")}</dt>
            <dd className="font-semibold">{user.displayName}</dd>
          </div>
        )}
        <div>
          <dt className="text-stone-600 dark:text-stone-300">{t("auth.createdAt")}</dt>
          <dd className="font-semibold">{new Date(user.createdAt).toLocaleDateString(language)}</dd>
        </div>
      </dl>
      {error && (
        <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={() => void refreshIdentity()}
        >
          {loading ? t("common.refreshing") : t("common.refresh")}
        </button>
        <button
          className="btn btn-primary"
          disabled={operation !== null}
          onClick={() => void logout()}
        >
          {t("auth.logout")}
        </button>
      </div>
    </section>
  );
}
