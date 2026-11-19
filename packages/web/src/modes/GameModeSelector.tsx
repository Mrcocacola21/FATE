import { useEffect, useId, useRef, useState } from "react";
import type { GameModeId } from "rules";
import { useI18n } from "../i18n";
import { GAME_MODE_IDS, getGameModeDescription, getGameModeName } from "./modeLabels";

interface GameModeSelectorProps {
  value: GameModeId;
  isHost: boolean;
  disabled?: boolean;
  onChange: (mode: GameModeId) => void;
}

/**
 * The room's game mode as one line: the host opens it like a menu and picks another mode; anyone
 * else, or a locked room, just reads it.
 */
export function GameModeSelector({
  value,
  isHost,
  disabled = false,
  onChange,
}: GameModeSelectorProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const listId = useId();
  const editable = isHost && !disabled;

  useEffect(() => {
    if (!editable) setOpen(false);
  }, [editable]);
  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const hint = disabled ? t("errors.modeLocked") : isHost ? null : t("modes.readOnlyHint");

  return (
    <section className="mode-select" ref={root}>
      <div className="mode-select__label">{t("modes.selectorTitle")}</div>
      <button
        type="button"
        className="mode-select__current"
        data-testid="game-mode-select"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        disabled={!editable}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="mode-select__text">
          <strong>{getGameModeName(value, t)}</strong>
          <small>{getGameModeDescription(value, t)}</small>
        </span>
        {editable ? (
          <svg className="mode-select__chevron" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m6 9 6 6 6-6" />
          </svg>
        ) : null}
      </button>
      {hint ? <p className="mode-select__hint">{hint}</p> : null}
      {open ? (
        <ul
          className="mode-select__menu"
          id={listId}
          role="listbox"
          aria-label={t("modes.selectorTitle")}
        >
          {GAME_MODE_IDS.map((mode) => (
            <li key={mode} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={mode === value}
                className="mode-select__option"
                data-testid={`game-mode-option-${mode}`}
                onClick={() => {
                  setOpen(false);
                  if (mode !== value) onChange(mode);
                }}
              >
                <strong>{getGameModeName(mode, t)}</strong>
                <small>{getGameModeDescription(mode, t)}</small>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
