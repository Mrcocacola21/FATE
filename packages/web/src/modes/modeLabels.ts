import type { GameModeId } from "rules";
import type { Translate } from "../i18n";

export const GAME_MODE_IDS: GameModeId[] = ["standard", "draft", "classic"];

export function getGameModeName(mode: GameModeId, t: Translate): string {
  return t(`modes.${mode}.name`);
}

export function getGameModeDescription(mode: GameModeId, t: Translate): string {
  return t(`modes.${mode}.description`);
}
