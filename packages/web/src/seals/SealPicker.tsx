import { useEffect, useState } from "react";
import { profileApi } from "../api/profileApi";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import {
  SEAL_ART,
  SEAL_IDS,
  SEAL_LABEL_KEYS,
  loadSealChoice,
  saveSealChoice,
  useSealChoice,
  type SealId,
} from "./seals";

/**
 * The Figure Set's seal tab: every wax seal the player may stamp to accept a rated match. A
 * signed-in player's choice is saved to their profile, which is what the opponent sees.
 */
export function SealPicker() {
  const { t } = useI18n();
  const chosen = useSealChoice();
  const signedIn = useAuthStore((state) => state.status === "authenticated");
  const [saveFailed, setSaveFailed] = useState(false);

  // The profile is the source of truth; this browser's copy follows it.
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    profileApi.getOwn().then(
      (profile) => {
        if (current) saveSealChoice(profile.seal);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [signedIn]);

  const choose = (seal: SealId) => {
    const previous = loadSealChoice();
    setSaveFailed(false);
    saveSealChoice(seal);
    if (!signedIn) return;
    profileApi.updateOwn({ seal }).then(
      (profile) => saveSealChoice(profile.seal),
      () => {
        saveSealChoice(previous);
        setSaveFailed(true);
      },
    );
  };

  return (
    <section className="figure-frames panel-card" aria-labelledby="figure-seals-title">
      <header className="figure-pane-heading">
        <div>
          <div className="section-kicker">{t("figureSet.tabSeal")}</div>
          <h2 id="figure-seals-title" className="font-display text-lg font-semibold">
            {t("figureSet.sealSubtitle")}
          </h2>
          {!signedIn && <p className="mt-1 text-sm text-muted">{t("figureSet.sealSignInHint")}</p>}
        </div>
      </header>
      {saveFailed && (
        <div className="figure-import-error" role="alert">
          {t("figureSet.sealSaveFailed")}
        </div>
      )}
      <div className="figure-hero-grid figure-frame-grid">
        {SEAL_IDS.map((seal) => {
          const selected = chosen === seal;
          return (
            <button
              type="button"
              key={seal}
              className="figure-hero-card figure-frame-card"
              data-testid={`seal-${seal}`}
              aria-pressed={selected}
              onClick={() => choose(seal)}
            >
              <span className="seal-preview" aria-hidden="true">
                <img src={SEAL_ART[seal]} alt="" draggable={false} />
              </span>
              <span className="figure-hero-caption">
                <span className="figure-hero-name">{t(SEAL_LABEL_KEYS[seal])}</span>
                <span className="figure-card-state">
                  {selected ? (
                    <span className="figure-selected">
                      <span aria-hidden="true">✓ </span>
                      {t("common.selected")}
                    </span>
                  ) : (
                    " "
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
