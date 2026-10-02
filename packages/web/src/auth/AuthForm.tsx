import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useI18n } from "../i18n";
import { useAuthStore } from "./authStore";
import { authErrorMessage } from "./errorMessage";
import { safeReturnTo } from "./safeReturnTo";
import { SessionStatus } from "./SessionStatus";

export function AuthForm({ kind }: { kind: "login" | "register" }) {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const destination = safeReturnTo(params.get("returnTo"));
  const {
    status,
    login,
    register,
    logout,
    operation,
    error: sessionError,
  } = useAuthStore((state) => state);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const pending = useRef(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const isRegister = kind === "register";
  const busy = submitting || operation !== null;
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  if (status === "initializing") return <SessionStatus />;
  if (status === "authenticated") return <Navigate replace to={destination} />;
  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || operation !== null) return;
    const form = event.currentTarget;
    const fields = new FormData(form);
    const email = String(fields.get("email") ?? "");
    const password = String(fields.get("password") ?? "");
    const username = String(fields.get("username") ?? "");
    if (!email.trim() || !password || (isRegister && !username.trim())) {
      setError(t("auth.errors.required"));
      return;
    }
    if (isRegister && password !== fields.get("confirmation")) {
      setError(t("auth.errors.passwordMismatch"));
      return;
    }
    pending.current = true;
    setSubmitting(true);
    setError(null);
    try {
      if (isRegister) await register({ email, username, password });
      else await login({ email, password });
      form.reset();
    } catch (failure) {
      setError(authErrorMessage(failure, t));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };
  const alternate = isRegister ? "login" : "register";
  return (
    <>
      <p className="section-kicker">{t("auth.brand")}</p>
      <h1 className="mt-2 text-2xl font-bold">{t(`auth.${kind}`)}</h1>
      <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
        {t(`auth.${kind}Description`)}
      </p>
      {status === "unavailable" && (
        <div className="mt-4 text-sm">
          <SessionStatus />
        </div>
      )}
      {sessionError?.code === "LOGOUT_FAILED" && (
        <div role="alert" className="mt-4 text-sm">
          {authErrorMessage(sessionError, t)}{" "}
          <button className="underline" disabled={busy} onClick={() => void logout()}>
            {t("auth.retryLogout")}
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => void onSubmit(event)}
        className="mt-6 grid gap-4"
        aria-label={t(`auth.${kind}`)}
        aria-busy={busy}
      >
        {isRegister && (
          <div className="grid gap-1.5 text-sm font-semibold">
            <label htmlFor="auth-username">{t("auth.username")}</label>
            <input
              id="auth-username"
              name="username"
              className="field-control"
              autoComplete="username"
              required
              minLength={3}
              maxLength={32}
              pattern={"[A-Za-z0-9_\\-]+"}
              aria-describedby="auth-username-help"
              disabled={busy}
            />
            <span
              id="auth-username-help"
              className="text-xs font-normal text-stone-600 dark:text-stone-300"
            >
              {t("auth.usernameHelp")}
            </span>
          </div>
        )}
        <label className="grid gap-1.5 text-sm font-semibold" htmlFor="auth-email">
          {t("auth.email")}
          <input
            id="auth-email"
            name="email"
            className="field-control"
            type="email"
            autoComplete="email"
            required
            maxLength={320}
            disabled={busy}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold" htmlFor="auth-password">
          {t("auth.password")}
          <input
            id="auth-password"
            name="password"
            className="field-control"
            type="password"
            autoComplete={isRegister ? "new-password" : "current-password"}
            required
            minLength={isRegister ? 8 : undefined}
            maxLength={128}
            disabled={busy}
          />
        </label>
        {isRegister && (
          <label className="grid gap-1.5 text-sm font-semibold" htmlFor="auth-confirmation">
            {t("auth.confirmPassword")}
            <input
              id="auth-confirmation"
              name="confirmation"
              className="field-control"
              type="password"
              autoComplete="new-password"
              required
              maxLength={128}
              disabled={busy}
            />
          </label>
        )}
        {error && (
          <p
            ref={errorRef}
            tabIndex={-1}
            id="auth-form-error"
            role="alert"
            className="text-sm text-red-700 dark:text-red-300"
          >
            {error}
          </p>
        )}
        <button
          type="submit"
          className="btn btn-primary w-full"
          disabled={busy}
          aria-describedby={error ? "auth-form-error" : undefined}
        >
          {busy ? t("common.loading") : t(`auth.${kind}`)}
        </button>
      </form>
      <p className="mt-5 text-sm text-stone-600 dark:text-stone-300">
        {t(`auth.${alternate}Prompt`)}{" "}
        <Link
          className="font-semibold underline"
          to={`/${alternate}?returnTo=${encodeURIComponent(destination)}`}
        >
          {t(`auth.${alternate}`)}
        </Link>
      </p>
    </>
  );
}
