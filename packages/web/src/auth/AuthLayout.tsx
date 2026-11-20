import { useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router";
import { localeRegistry, useI18n, type Language } from "../i18n";
import { changePreference } from "../profile/profileStore";
import { scheduleUiSfx } from "../features/sfx/uiSfx";
import { useTheme } from "../theme";
import { FateSigil } from "../ui/FateSigil";
import { claspSnapAt, fastenClasp } from "./clasp";
import { prepareCoverOpening } from "./coverOpening";
import { safeReturnTo } from "./safeReturnTo";
import { burnOut, type Reink } from "./reink";
import {
  BOOK_CLOSE_DELAY_MS,
  BOOK_CLOSE_MS,
  BOOK_PULL_BACK_MS,
  BookClosingContext,
} from "../layout/bookClosing";

/** Length of the closing creak (`bookCloseCreak.wav`), so it can end as the cover shuts. */
const BOOK_CLOSE_CREAK_MS = 1220;

function Corner({ className }: { className: string }) {
  return (
    <svg className={`auth-cover__corner ${className}`} viewBox="0 0 44 44" aria-hidden="true">
      <path d="M2 42V10a8 8 0 0 1 8-8h32" />
      <path d="M9 34V17a8 8 0 0 1 8-8h17" opacity=".55" />
      <circle cx="10" cy="10" r="2.8" />
    </svg>
  );
}

/**
 * The two bookmarks hanging from the cover are its settings: the violet one turns the theme
 * (and pales in the light theme), the red one opens the list of languages on the cover.
 */
function CoverRibbons() {
  const { t, language } = useI18n();
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const holder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const outside = (event: PointerEvent) => {
      if (!holder.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const next = theme === "dark" ? "light" : "dark";
  const apply = (patch: Parameters<typeof changePreference>[0]) => {
    setFailed(false);
    void changePreference(patch).catch(() => setFailed(true));
  };
  return (
    <div ref={holder} className="auth-cover__ribbons">
      <button
        type="button"
        className="auth-cover__ribbon auth-cover__ribbon--wax"
        aria-label={t("language.switchLabel")}
        aria-expanded={open}
        aria-controls="cover-languages"
        title={t("language.switchLabel")}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{language.slice(0, 2).toUpperCase()}</span>
      </button>
      <button
        type="button"
        className="auth-cover__ribbon auth-cover__ribbon--arcane"
        aria-label={t("theme.switchTo", { theme: t(`theme.${next}`) })}
        title={t("theme.switchTo", { theme: t(`theme.${next}`) })}
        onClick={() => apply({ preferredTheme: next })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          {theme === "dark" ? (
            <path d="M20.4 15.2A8.5 8.5 0 0 1 8.8 3.6 8.5 8.5 0 1 0 20.4 15.2Z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="4.2" />
              <path d="M11 1.5h2v3h-2Zm0 18h2v3h-2ZM1.5 11h3v2h-3Zm18 0h3v2h-3Z" />
            </>
          )}
        </svg>
      </button>
      {open && (
        <div
          id="cover-languages"
          className="auth-cover__languages"
          role="group"
          aria-label={t("language.switchLabel")}
        >
          {localeRegistry.map((locale) => (
            <button
              key={locale.code}
              type="button"
              lang={locale.code}
              dir={locale.direction}
              aria-pressed={locale.code === language}
              onClick={() => {
                setOpen(false);
                apply({ preferredLanguage: locale.code as Language });
              }}
            >
              {locale.label}
            </button>
          ))}
        </div>
      )}
      {failed && (
        <p role="alert" className="auth-cover__ribbon-error">
          {t("profile.preferenceError")}
        </p>
      )}
    </div>
  );
}

/**
 * Sign-in and sign-up as the cover of the grimoire: tooled leather, the spine on the right, a
 * strap holding it shut and the form on a gilded bookplate. Signing in opens the cover from
 * left to right onto the first page (coverOpening.ts).
 */
export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  // Only the first render matters: the shell drops the closing flag on its very next render.
  const intro = useRef(useContext(BookClosingContext));
  const book = useRef<HTMLDivElement>(null);
  const leaf = useRef<HTMLDivElement>(null);
  const tilt = useRef<HTMLDivElement>(null);
  const copyHost = useRef<HTMLDivElement>(null);
  const plate = useRef<HTMLDivElement>(null);
  const reink = useRef<Reink | null>(null);
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  // Where the book opens back to: the page it closed on (kept in the address as returnTo, so
  // signing in comes back there too), or the game's first page.
  const returnTo = safeReturnTo(new URLSearchParams(search).get("returnTo"));
  useLayoutEffect(() => {
    const left = intro.current.page?.path;
    const params = new URLSearchParams(window.location.search);
    if (!left || params.has("returnTo") || safeReturnTo(left) === "/") return;
    params.set("returnTo", safeReturnTo(left));
    void navigate(`${window.location.pathname}?${params.toString()}`, { replace: true });
  }, [navigate]);
  // Turning between sign-in and sign-up: the words burn off the cover before the route changes,
  // and the new ones are written in once the new form is on it (reink.ts).
  const turnForm = (event: React.MouseEvent<HTMLDivElement>) => {
    const link = (event.target as Element).closest?.("a");
    const form = plate.current;
    if (!link || !form || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    const target = new URL(link.href, window.location.href);
    if (!/^\/(login|register)$/.test(target.pathname) || target.pathname === pathname) return;
    const burning = burnOut(form);
    if (!burning) return;
    event.preventDefault();
    reink.current?.cancel();
    reink.current = burning;
    void navigate(`${target.pathname}${target.search}`);
  };
  useLayoutEffect(() => {
    reink.current?.inkIn();
    reink.current = null;
  }, [pathname]);
  useEffect(() => () => reink.current?.cancel(), []);
  // Coming from the app, the leaf starts exactly where the page the reader left was, with that
  // page on it; the book pulls slowly back, tilting like a book on a table, and then the cover
  // swings shut over the leaf.
  useLayoutEffect(() => {
    const { closing, page } = intro.current;
    const element = leaf.current;
    const whole = book.current;
    const lean = tilt.current;
    if (!closing || !element || !whole || !lean || typeof element.animate !== "function") return;
    const stage = whole.parentElement;
    // Narrow screens rarely fit a page on one screen: there the book takes the whole page (up to
    // two and a half screens of it), so pulling back shows it down to the bottom.
    const narrow = window.innerWidth < 900;
    const visible = page
      ? Math.max(1, window.innerHeight - Math.max(page.rect.top, 0))
      : window.innerHeight;
    const shown = page
      ? narrow
        ? Math.min(page.rect.height, window.innerHeight * 2.5)
        : Math.min(visible, page.rect.height || visible)
      : visible;
    if (page && stage) {
      // The book takes the shape of the page being closed, filling the room under the bar, so the
      // page stays easy to see as it pulls back and its bottom stays on screen.
      const aspect = page.rect.width / Math.max(1, shown);
      const room = window.innerHeight - Math.max(0, whole.getBoundingClientRect().top) - 20;
      const height = Math.max(240, Math.min(room, window.innerHeight * 0.86));
      const width = Math.min(height * aspect, window.innerWidth * 0.92, 1180);
      stage.style.setProperty("--book-width", `${Math.round(width)}px`);
      stage.style.setProperty("--book-aspect", aspect.toFixed(4));
      stage.dataset.shaped = "";
    }
    const box = whole.getBoundingClientRect();
    let start = { x: box.width * -0.55, y: box.height * 0.04, scale: 2.1 };
    const host = copyHost.current;
    // The page sits on the back board, a little in from its edges: it is the page, not the
    // whole book, that starts exactly where the reader left it.
    const sheet = lean.querySelector<HTMLElement>(".auth-book__page")?.getBoundingClientRect();
    const inset = sheet
      ? {
          x: sheet.left - box.left,
          y: sheet.top - box.top,
          width: sheet.width,
          height: sheet.height,
        }
      : { x: 0, y: 0, width: box.width, height: box.height };
    if (page && host && inset.width > 0) {
      const scale = page.rect.width / inset.width;
      // On a narrow screen the leaf holds the page from its top, wherever it was scrolled to;
      // elsewhere it holds what was on screen.
      const top = narrow ? page.rect.top : Math.max(page.rect.top, 0);
      start = {
        x: page.rect.left - box.left - inset.x * scale,
        y: top - box.top - inset.y * scale,
        scale,
      };
      const copy = page.clone;
      copy.classList.add("auth-book__copy-page");
      Object.assign(copy.style, {
        width: `${page.rect.width}px`,
        // A short page still fills the whole leaf.
        minHeight: `${inset.height * scale}px`,
        transform: `translateY(${page.rect.top - top}px)`,
      });
      host.style.transform = `scale(${1 / scale})`;
      host.replaceChildren(copy);
      whole.dataset.copy = "";
    }
    const running: Animation[] = [];
    running.push(
      whole.animate(
        // One unbroken move from the page to the book: a middle keyframe would kink its speed.
        [
          { transform: `translate(${start.x}px, ${start.y}px) scale(${start.scale})` },
          { transform: "translate(0px, 0px) scale(1)" },
        ],
        {
          duration: BOOK_PULL_BACK_MS,
          easing: "cubic-bezier(0.33, 0, 0.2, 1)",
          fill: "backwards",
        },
      ),
    );
    running.push(
      lean.animate(
        // A soft lean back while the book pulls away; it rights itself slowly as the cover
        // swings shut, so the book never bobs up on its own.
        [
          {
            transform: "rotateX(0deg)",
            filter: "brightness(1)",
            easing: "cubic-bezier(0.45, 0, 0.55, 1)",
          },
          {
            transform: "rotateX(12deg)",
            filter: "brightness(0.94)",
            offset: 0.42,
            easing: "cubic-bezier(0.45, 0, 0.55, 1)",
          },
          { transform: "rotateX(0deg)", filter: "brightness(1)" },
        ],
        { duration: BOOK_CLOSE_DELAY_MS + BOOK_CLOSE_MS, fill: "backwards" },
      ),
    );
    running.push(
      element.animate([{ transform: "rotateY(172deg)" }, { transform: "rotateY(0deg)" }], {
        duration: BOOK_CLOSE_MS,
        delay: BOOK_CLOSE_DELAY_MS,
        easing: "cubic-bezier(0.45, 0.05, 0.3, 1)",
        fill: "backwards",
      }),
    );
    // The leather of the book comes in round the page as it pulls away from the screen.
    const board = lean.querySelector<HTMLElement>(".auth-book__board");
    if (board)
      running.push(
        board.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: BOOK_PULL_BACK_MS * 0.4,
          delay: BOOK_PULL_BACK_MS * 0.12,
          easing: "ease-out",
          fill: "backwards",
        }),
      );
    // The way back to the game belongs to the cover at rest: it stays out of the closing and
    // comes in once the book is shut.
    const bar = stage?.querySelector<HTMLElement>(".auth-stage__bar");
    if (bar)
      running.push(
        bar.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: 320,
          delay: BOOK_CLOSE_DELAY_MS + BOOK_CLOSE_MS,
          fill: "backwards",
        }),
      );
    const shut = element.querySelector<HTMLElement>(".auth-cover");
    const claspAt = BOOK_CLOSE_DELAY_MS + BOOK_CLOSE_MS - 60;
    if (shut) running.push(...fastenClasp(shut, claspAt));
    // The creak swells as the cover swings shut and ends as it meets the pages; then the book
    // shuts with the clasp, the sound landing as the ring snaps onto the stud.
    const creak = scheduleUiSfx(
      "bookCloseCreak",
      BOOK_CLOSE_DELAY_MS + BOOK_CLOSE_MS * 0.95 - BOOK_CLOSE_CREAK_MS,
    );
    const thud = scheduleUiSfx("bookClose", claspSnapAt(claspAt));
    if (narrow && page && stage) {
      // The narrow shape was for the page; once shut, the book comes forward to its usual size,
      // where the form fits.
      void Promise.all(running.map((animation) => animation.finished))
        .then(() => {
          const before = whole.getBoundingClientRect();
          delete stage.dataset.shaped;
          const after = whole.getBoundingClientRect();
          if (!after.width) return;
          whole.animate(
            [
              {
                transform: `translate(${before.left - after.left}px, ${
                  before.top - after.top
                }px) scale(${before.width / after.width})`,
              },
              { transform: "translate(0px, 0px) scale(1)" },
            ],
            { duration: 650, easing: "cubic-bezier(0.3, 0.05, 0.25, 1)" },
          );
        })
        .catch(() => {
          /* Cancelled: the book was already put back at rest. */
        });
    }
    // A second run (React's development check) must measure the book at rest, not mid-flight.
    return () => {
      creak();
      thud();
      running.forEach((animation) => animation.cancel());
    };
  }, []);
  return (
    <div className="app-shell auth-stage">
      {/* Embers drifting up through the dark behind the book. */}
      <div className="auth-stage__embers" aria-hidden="true">
        {Array.from({ length: 14 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <header className="auth-stage__bar">
        <Link
          to={returnTo}
          className="btn btn-ghost btn-sm"
          onClick={(event) => {
            // Back to the game opens the book, just as signing in does.
            if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
            event.preventDefault();
            prepareCoverOpening().play();
            void navigate(returnTo);
          }}
        >
          {t("common.backToRooms")}
        </Link>
      </header>
      <div ref={book} className="auth-book">
        <div ref={tilt} className="auth-book__tilt">
          {/* The back board: the leather the page is bound into, joined to the cover at the spine. */}
          <div className="auth-book__board" aria-hidden="true" />
          <div className="auth-book__page" aria-hidden="true">
            <div ref={copyHost} className="auth-book__copy" />
            <Corner className="auth-book__page-corner auth-book__page-corner--tl" />
            <Corner className="auth-book__page-corner auth-book__page-corner--bl" />
            <FateSigil className="auth-book__page-seal" />
          </div>
          <div ref={leaf} className="auth-book__leaf">
            <div className="auth-cover" data-auth-cover="">
              <span className="auth-cover__tooling" aria-hidden="true" />
              <Corner className="auth-cover__corner--tl" />
              <Corner className="auth-cover__corner--tr" />
              <Corner className="auth-cover__corner--bl" />
              <Corner className="auth-cover__corner--br" />
              <span className="auth-cover__spine" aria-hidden="true">
                <i />
                <span>
                  <FateSigil />
                </span>
                <i />
                <span>
                  <b>{t("auth.brand")}</b>
                </span>
                <i />
                <span>
                  <em />
                </span>
                <i />
              </span>
              <CoverRibbons />
              <div className="auth-cover__emblem" aria-hidden="true">
                <FateSigil className="auth-cover__seal" />
                <p className="auth-cover__title">{t("auth.brand")}</p>
              </div>
              <div ref={plate} className="auth-cover__plate" onClickCapture={turnForm}>
                {children}
              </div>
              <span className="auth-cover__stud" aria-hidden="true" />
              <span className="auth-cover__strap" aria-hidden="true">
                <span className="auth-cover__ring" />
              </span>
            </div>
            {/* The inside of the cover: an endpaper with gilt corners and the seal pressed faintly in. */}
            <div className="auth-book__inside" aria-hidden="true">
              <Corner className="auth-book__inside-corner auth-book__inside-corner--tl" />
              <Corner className="auth-book__inside-corner auth-book__inside-corner--tr" />
              <Corner className="auth-book__inside-corner auth-book__inside-corner--bl" />
              <Corner className="auth-book__inside-corner auth-book__inside-corner--br" />
              <FateSigil className="auth-book__inside-seal" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
