import { useI18n } from "../i18n";
import { chapters, isActive } from "./Sidebar";

/**
 * Every page is a leaf of the grimoire: paper, a gutter shadow by the spine, a double gilded
 * frame with corner flourishes, a ribbon bookmark and a running head naming the chapter. The
 * dressing lives inside the content column, so a page turn carries it with the page.
 */

const ROMAN: [number, string][] = [
  [10, "X"],
  [9, "IX"],
  [5, "V"],
  [4, "IV"],
  [1, "I"],
];
export function roman(value: number) {
  let rest = value;
  let result = "";
  for (const [size, numeral] of ROMAN)
    while (rest >= size) {
      result += numeral;
      rest -= size;
    }
  return result;
}

/** The chapters of the book in order: the menu sections, then the profile. */
export function bookSections(): ReadonlyArray<{ to: string; label: string }> {
  return [
    ...chapters.flatMap((chapter): ReadonlyArray<{ to: string; label: string }> => chapter.items),
    { to: "/profile", label: "profile.title" },
  ];
}

/**
 * The chapter a path opens: its number, its section title and the section's own path. Pages
 * under a section (a match, a public profile) belong to that section's chapter.
 */
export function sheetPlace(pathname: string) {
  const sections = bookSections();
  const index = sections.findIndex((item) =>
    item.to === "/profile"
      ? /^\/(profile|users\/[^/]+)\/?$/.test(pathname)
      : isActive(item.to, pathname),
  );
  if (index < 0) return null;
  return { chapter: index + 1, sectionTitle: sections[index].label, path: sections[index].to };
}

function Corner({ className }: { className: string }) {
  return (
    <svg className={`grimoire-sheet__corner ${className}`} viewBox="0 0 44 44" aria-hidden="true">
      <path d="M2 42V10a8 8 0 0 1 8-8h32" />
      <path d="M9 34V17a8 8 0 0 1 8-8h17" opacity=".55" />
      <circle cx="10" cy="10" r="2.8" />
      <path d="M20 2v4M2 20h4" />
    </svg>
  );
}

/** The leaf's dressing, drawn behind and around the page content. */
export function GrimoireSheetDecor({ pathname }: { pathname: string }) {
  const { t } = useI18n();
  const place = sheetPlace(pathname);
  return (
    <div className="grimoire-sheet__decor" aria-hidden="true">
      <span className="grimoire-sheet__gutter" />
      <span className="grimoire-sheet__frame" />
      <Corner className="grimoire-sheet__corner--tl" />
      <Corner className="grimoire-sheet__corner--tr" />
      <Corner className="grimoire-sheet__corner--bl" />
      <Corner className="grimoire-sheet__corner--br" />
      <span className="grimoire-sheet__ribbon" />
      {place && (
        <p className="grimoire-sheet__head">
          {t("shell.chapterNumber", { number: roman(place.chapter) })} · {t(place.sectionTitle)}
        </p>
      )}
    </div>
  );
}
