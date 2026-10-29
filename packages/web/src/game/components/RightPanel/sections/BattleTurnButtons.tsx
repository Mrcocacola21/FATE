import type { FC } from "react";
import { useI18n } from "../../../../i18n";
import { ActionRuneGlyph } from "../../../../components/abilityRunes";

interface BattleTurnButtonsProps {
  isMyTurn: boolean;
  joined: boolean;
  isSpectator: boolean;
  pendingRoll: boolean;
  onEndTurn: () => void;
  onClear: () => void;
}

export const BattleTurnButtons: FC<BattleTurnButtonsProps> = ({
  isMyTurn,
  joined,
  isSpectator,
  pendingRoll,
  onEndTurn,
  onClear,
}) => {
  const { t } = useI18n();
  return (
    <>
      <button type="button" className="btn btn-secondary min-h-11 px-2.5 text-xs" onClick={onClear}>
        {t("game.clearSelection")}
      </button>
      <button
        type="button"
        className="btn btn-primary end-turn-button min-h-11 px-2.5 text-sm"
        onClick={onEndTurn}
        disabled={!isMyTurn || !joined || isSpectator || pendingRoll}
      >
        {/* The turn's one wax seal: ending the turn seals the decision. */}
        <span className="end-turn-seal" aria-hidden="true">
          <ActionRuneGlyph action="endTurn" />
        </span>
        <span className="end-turn-button__label">{t("game.endTurn")}</span>
      </button>
    </>
  );
};
