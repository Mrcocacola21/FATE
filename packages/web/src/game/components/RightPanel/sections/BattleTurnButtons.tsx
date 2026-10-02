import type { FC } from "react";
import { useI18n } from "../../../../i18n";

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
      <button
        type="button"
        className="btn btn-primary min-h-11 px-2.5 text-xs"
        onClick={onEndTurn}
        disabled={!isMyTurn || !joined || isSpectator || pendingRoll}
      >
        {t("game.endTurn")}
      </button>
      <button type="button" className="btn btn-secondary min-h-11 px-2.5 text-xs" onClick={onClear}>
        {t("game.clearSelection")}
      </button>
    </>
  );
};
