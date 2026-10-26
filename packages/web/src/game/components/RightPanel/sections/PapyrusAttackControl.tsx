import { useEffect, useRef, useState } from "react";
import { useI18n } from "../../../../i18n";
import { useGameStore } from "../../../../store";

/**
 * Papyrus the unbeliever: Attack with its Long Bone variant as one split action. A segment is pressed
 * only while attack targeting in that variant is open. Switching the variant is a server-side
 * toggle, so targeting starts only once the new mode is confirmed; earlier it would be reset.
 */
export function PapyrusAttackControl({
  longBoneMode,
  attacking,
  disabled,
  reason,
  onToggleLongBone,
  onAttack,
  onPreview,
}: {
  longBoneMode: boolean;
  /** Attack targeting is open. */
  attacking: boolean;
  disabled: boolean;
  /** Why the attack is blocked; empty when it is available. */
  reason: string;
  onToggleLongBone: () => void;
  onAttack: () => void;
  onPreview?: (active: boolean) => void;
}) {
  const { t } = useI18n();
  const [awaiting, setAwaiting] = useState<boolean | null>(null);
  const [noReply, setNoReply] = useState(false);
  const resultAt = useGameStore((state) => state.lastActionResultAt);
  const resultOk = useGameStore((state) => state.lastActionResult?.ok ?? true);
  const sentAt = useRef(0);
  useEffect(() => {
    if (awaiting === null || awaiting !== longBoneMode) return;
    setAwaiting(null);
    onAttack();
  }, [awaiting, longBoneMode, onAttack]);
  // A rejected toggle never confirms: release the buttons at once and let the
  // Controls tab notice show the server's reason.
  useEffect(() => {
    if (awaiting !== null && resultAt > sentAt.current && !resultOk) setAwaiting(null);
  }, [awaiting, resultAt, resultOk]);
  // No reply at all: release the buttons and say so instead of unlocking silently.
  useEffect(() => {
    if (awaiting === null) return;
    const timer = setTimeout(() => {
      setAwaiting(null);
      setNoReply(true);
    }, 3000);
    return () => clearTimeout(timer);
  }, [awaiting]);
  const pick = (longBone: boolean) => {
    setNoReply(false);
    if (longBone === longBoneMode) {
      onAttack();
      return;
    }
    sentAt.current = Date.now();
    setAwaiting(longBone);
    onToggleLongBone();
  };
  const cost = reason || t("game.usesAction");
  return (
    <div
      className="attack-split"
      role="group"
      aria-label={t("game.attack")}
      data-testid="papyrus-attack-variants"
    >
      {[false, true].map((longBone) => (
        <button
          key={String(longBone)}
          type="button"
          className="action-control"
          aria-pressed={attacking && longBoneMode === longBone}
          aria-busy={awaiting === longBone || undefined}
          disabled={disabled || awaiting !== null}
          title={longBone ? t("game.attackLongBone") : reason || undefined}
          onClick={() => pick(longBone)}
          onMouseEnter={() => !disabled && onPreview?.(true)}
          onMouseLeave={() => onPreview?.(false)}
          onFocus={() => !disabled && onPreview?.(true)}
          onBlur={() => onPreview?.(false)}
        >
          <span className="block">
            {longBone
              ? t("abilityDetails.papyrus.unbeliever.options.longBone.name")
              : t("game.attack")}
          </span>
          <span
            className={`mt-0.5 block text-[10px] font-semibold leading-tight ${
              reason ? "opacity-80" : "action-control-cost"
            }`}
          >
            {cost}
          </span>
        </button>
      ))}
      {noReply ? (
        <p className="attack-variant__note" role="status">
          {t("actionMenu.noServerReply")}
        </p>
      ) : null}
    </div>
  );
}
