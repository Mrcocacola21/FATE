import { Link } from "react-router";
import { useI18n } from "../i18n";
import { FateSigil } from "../ui/FateSigil";

/**
 * What a guest finds on a page that needs an account: a page of the grimoire saying so, with
 * the way in. Following either link closes the book onto its cover (AppShell), where the reader
 * signs in or signs up and is brought back here.
 */
export function SignInGate({ returnTo }: { returnTo: string }) {
  const { t } = useI18n();
  const back = `?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <section
      className="sign-in-gate"
      aria-labelledby="sign-in-gate-title"
      data-testid="sign-in-gate"
    >
      <FateSigil className="sign-in-gate__seal" />
      <span className="grimoire-kicker">{t("auth.brand")}</span>
      <h1 id="sign-in-gate-title">{t("auth.gateTitle")}</h1>
      <p className="sign-in-gate__body">{t("auth.gateBody")}</p>
      <div className="sign-in-gate__actions">
        <Link className="btn btn-primary" to={`/login${back}`}>
          {t("auth.login")}
        </Link>
        <Link className="btn btn-ghost" to={`/register${back}`}>
          {t("auth.register")}
        </Link>
      </div>
    </section>
  );
}
