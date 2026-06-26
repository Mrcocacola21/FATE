export type GameModeId = "standard" | "draft" | "classic";

export type GameModeConfig = {
  id: GameModeId;
  displayNameKey: string;
  descriptionKey: string;
  usesPlayerFigureSets: boolean;
  usesDraft: boolean;
  usesOnlyBaseUnits: boolean;
};

export const GAME_MODES: Record<GameModeId, GameModeConfig> = {
  standard: {
    id: "standard",
    displayNameKey: "modes.standard.name",
    descriptionKey: "modes.standard.description",
    usesPlayerFigureSets: true,
    usesDraft: false,
    usesOnlyBaseUnits: false,
  },
  draft: {
    id: "draft",
    displayNameKey: "modes.draft.name",
    descriptionKey: "modes.draft.description",
    usesPlayerFigureSets: false,
    usesDraft: true,
    usesOnlyBaseUnits: false,
  },
  classic: {
    id: "classic",
    displayNameKey: "modes.classic.name",
    descriptionKey: "modes.classic.description",
    usesPlayerFigureSets: false,
    usesDraft: false,
    usesOnlyBaseUnits: true,
  },
};

export const GAME_MODE_IDS = Object.keys(GAME_MODES) as GameModeId[];

export function isGameModeId(value: unknown): value is GameModeId {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(GAME_MODES, value)
  );
}
