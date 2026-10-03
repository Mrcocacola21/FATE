import { useEffect, useState } from "react";
import { useI18n } from "../i18n";
import { parseRevision } from "./navigation";

export function ReplayControls({
  revisions,
  revision,
  onNavigate,
}: {
  revisions: readonly number[];
  revision: number;
  onNavigate: (revision: number) => void;
}) {
  const { t } = useI18n();
  const index = revisions.indexOf(revision);
  const finalRevision = revisions[revisions.length - 1];
  const [scrubIndex, setScrubIndex] = useState(index);
  const [draft, setDraft] = useState(String(revision));
  const [invalid, setInvalid] = useState(false);
  const [scrubbing, setScrubbing] = useState(false);
  useEffect(() => {
    setScrubIndex(index);
    setScrubbing(false);
    setDraft(String(revision));
    setInvalid(false);
  }, [revision, index]);
  // Debounce range changes; keyboard/touch/pointer share exactly the same request policy.
  useEffect(() => {
    if (!scrubbing) return;
    const timer = setTimeout(() => {
      setScrubbing(false);
      onNavigate(revisions[scrubIndex]);
    }, 180);
    return () => clearTimeout(timer);
  }, [scrubIndex, scrubbing, onNavigate, revisions]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        (target instanceof HTMLElement &&
          target.closest("input,textarea,select,button,a,[contenteditable]"))
      )
        return;
      const targets: Record<string, number | undefined> = {
        ArrowLeft: revisions[index - 1],
        ArrowRight: revisions[index + 1],
        Home: revisions[0],
        End: finalRevision,
      };
      if (targets[event.key] !== undefined) {
        event.preventDefault();
        onNavigate(targets[event.key]!);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [index, revisions, finalRevision, onNavigate]);
  return (
    <div className="replay-controls mt-4">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {(
          [
            ["beginning", "|‹", revisions[0], index <= 0],
            ["previous", "‹", revisions[index - 1], index <= 0],
            ["next", "›", revisions[index + 1], index >= revisions.length - 1],
            ["end", "›|", finalRevision, index >= revisions.length - 1],
          ] as const
        ).map(([label, glyph, target, disabled]) => (
          <button
            key={label}
            type="button"
            className="replay-button"
            aria-label={t(`replay.${label}`)}
            title={t(`replay.${label}`)}
            disabled={disabled}
            onClick={() => {
              if (target !== undefined) onNavigate(target);
            }}
          >
            {glyph}
          </button>
        ))}
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const target = parseRevision(draft, revisions);
            setInvalid(target === null);
            if (target !== null) onNavigate(target);
          }}
        >
          <label htmlFor="replay-jump" className="text-sm">
            {t("replay.revision")}
          </label>
          <input
            id="replay-jump"
            className="replay-jump"
            type="number"
            min={revisions[0]}
            max={finalRevision}
            value={draft}
            aria-invalid={invalid}
            aria-describedby={invalid ? "replay-invalid-jump" : undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              setInvalid(false);
            }}
          />
          <button className="replay-button text-sm" type="submit">
            {t("replay.go")}
          </button>
        </form>
      </div>
      {invalid && (
        <p id="replay-invalid-jump" role="alert" className="mt-2 text-sm">
          {t("replay.invalidRevision")}
        </p>
      )}
      <label className="mt-4 block text-center text-sm" htmlFor="replay-scrubber">
        {t("replay.position", {
          revision: revisions[scrubIndex] ?? revision,
          final: finalRevision,
        })}
      </label>
      <input
        id="replay-scrubber"
        type="range"
        className="mt-2 w-full"
        min={0}
        max={revisions.length - 1}
        value={Math.max(0, scrubIndex)}
        aria-valuetext={t("replay.position", {
          revision: revisions[scrubIndex],
          final: finalRevision,
        })}
        onChange={(event) => {
          setScrubIndex(Number(event.target.value));
          setScrubbing(true);
        }}
      />
      <p className="mt-2 text-center text-xs opacity-60">{t("replay.shortcuts")}</p>
    </div>
  );
}
