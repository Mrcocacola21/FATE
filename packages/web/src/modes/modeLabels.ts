import type { GameModeId } from "rules";
import type { Translate } from "../i18n";

// Import lightweight shared metadata directly; the rules package entry is CommonJS.
export { GAME_MODE_IDS, isGameModeId } from "../../../rules/src/modes/gameModes";

export function getGameModeName(mode: GameModeId, t: Translate): string {
  return t(`modes.${mode}.name`);
}

export function getGameModeDescription(mode: GameModeId, t: Translate): string {
  return t(`modes.${mode}.description`);
}
