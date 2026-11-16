import { useEffect, useState } from "react";
import { getTokenArchSrc } from "../assets/registry";
import { profileApi } from "../api/profileApi";
import { useAuthStore } from "../auth/authStore";
import { useI18n } from "../i18n";
import {
  FRAME_ART,
  FRAME_IDS,
  FRAME_LABEL_KEYS,
  loadFrameChoice,
  saveFrameChoice,
  useFrameChoice,
  type FrameId,
} from "./frames";

/**
 * The Figure Set's frame tab: every frame previewed on one of the player's own figures. A signed-in
 * player's choice is saved to their profile, which is what opponents and replays see.
 */
export function FramePicker({ previewHeroId }: { previewHeroId: string }) {
  const { t } = useI18n();
  const chosen = useFrameChoice();
  const signedIn = useAuthStore((state) => state.status === "authenticated");
  const [saveFailed, setSaveFailed] = useState(false);
  const art = getTokenArchSrc(previewHeroId);
  const options: Array<FrameId | null> = [null, ...FRAME_IDS];

  // The profile is the source of truth; this browser's copy follows it.
  useEffect(() => {
    if (!signedIn) return;
    let current = true;
    profileApi.getOwn().then(
      (profile) => {
        if (current) saveFrameChoice(profile.figureFrame);
      },
      () => undefined,
    );
    return () => {
      current = false;
    };
  }, [signedIn]);

  const choose = (frame: FrameId | null) => {
    const previous = loadFrameChoice();
    setSaveFailed(false);
    saveFrameChoice(frame);
    if (!signedIn) return;
    profileApi.updateOwn({ figureFrame: frame }).then(
      (profile) => saveFrameChoice(profile.figureFrame),
      () => {
        saveFrameChoice(previous);
        setSaveFailed(true);
      },
    );
  };

  return (
    <section className="figure-frames panel-card" aria-labelledby="figure-frames-title">
      <header className="figure-pane-heading">
        <div>
          <div className="section-kicker">{t("figureSet.tabFrame")}</div>
          <h2 id="figure-frames-title" className="font-display text-lg font-semibold">
            {t("figureSet.frameSubtitle")}
          </h2>
          {!signedIn && <p className="mt-1 text-sm text-muted">{t("figureSet.frameSignInHint")}</p>}
        </div>
      </header>
      {saveFailed && (
        <div className="figure-import-error" role="alert">
          {t("figureSet.frameSaveFailed")}
        </div>
      )}
      <div className="figure-hero-grid figure-frame-grid">
        {options.map((frame) => {
          const selected = chosen === frame;
          const label = frame ? t(FRAME_LABEL_KEYS[frame]) : t("figureSet.frameNone");
          return (
            <button
              type="button"
              key={frame ?? "none"}
              className="figure-hero-card figure-frame-card"
              data-testid={`frame-${frame ?? "none"}`}
              aria-pressed={selected}
              onClick={() => choose(frame)}
            >
              <span
                className="frame-preview"
                data-framed={frame ? "true" : undefined}
                aria-hidden="true"
              >
                <img className="frame-preview__art" src={art} alt="" />
                {frame && <img className="frame-preview__frame" src={FRAME_ART[frame]} alt="" />}
              </span>
              <span className="figure-hero-caption">
                <span className="figure-hero-name">{label}</span>
                <span className="figure-card-state">
                  {selected ? (
                    <span className="figure-selected">
                      <span aria-hidden="true">✓ </span>
                      {t("common.selected")}
                    </span>
                  ) : (
                    " "
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
