import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import type { Player } from "../api/friendApi";
import { useI18n } from "../i18n";
import { Avatar } from "../profile/Avatar";
import { publicProfilePath } from "../profile/ProfileOverview";

/** One player in a social list: arch avatar, names linking to the profile, a status line, actions. */
export function PlayerRow({
  player,
  detail,
  children,
}: {
  player: Player;
  detail?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <li className="player-row" data-testid="player-row">
      <Link className="player-row__identity" to={publicProfilePath(player.username)}>
        <span className="player-row__arch" aria-hidden="true">
          <Avatar {...player} arch />
        </span>
        <span className="player-row__names">
          <strong dir="auto">{player.displayName || player.username}</strong>
          <span dir="auto">@{player.username}</span>
          {detail && <span className="player-row__detail">{detail}</span>}
        </span>
      </Link>
      {children && <div className="player-row__actions">{children}</div>}
    </li>
  );
}

/** A small "⋯" menu; closes on outside click or Escape and returns focus to its button. */
export function MoreMenu({
  items,
}: {
  items: { label: string; danger?: boolean; onSelect(): void }[];
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === "Escape"
          : !root.current?.contains(event.target as Node)
      ) {
        setOpen(false);
        if (event instanceof KeyboardEvent) button.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <div className="more-menu" ref={root}>
      <button
        ref={button}
        type="button"
        className="btn btn-ghost btn-sm more-menu__button"
        aria-label={t("friends.more")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        ⋯
      </button>
      {open && (
        <div className="more-menu__list" role="menu">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              data-danger={item.danger || undefined}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
