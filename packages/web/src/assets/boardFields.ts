import type { PlayerView } from "rules";

export type BoardFieldVisualId = "lechy_storm" | "sans_bone_field";

const BOARD_FIELD_ASSETS: Record<BoardFieldVisualId, string> = {
  lechy_storm: new URL("./fields/storm.jpg", import.meta.url).href,
  sans_bone_field: new URL("./fields/bone.jpg", import.meta.url).href,
};

export function getBoardFieldAsset(id: BoardFieldVisualId): string {
  return BOARD_FIELD_ASSETS[id];
}

type BoardFieldView = Pick<PlayerView, "arenaId" | "arenaEffects" | "boneFieldTurnsLeft">;

/**
 * The rules engine exposes one current arena, so field visuals are mutually exclusive.
 * Storm retains its legacy behavior when no structured arena effects are present.
 */
export function getActiveBoardFieldVisual(view: BoardFieldView): BoardFieldVisualId | null {
  if (view.arenaId === "storm") {
    const effects = Array.isArray(view.arenaEffects) ? view.arenaEffects : [];
    if (
      effects.length === 0 ||
      effects.some((effect) => effect.effectId === "storm" && effect.remaining > 0)
    ) {
      return "lechy_storm";
    }
  }

  if (view.arenaId === "boneField" && Math.max(0, view.boneFieldTurnsLeft ?? 0) > 0) {
    return "sans_bone_field";
  }

  return null;
}

export function getBoardFieldLabelKey(id: BoardFieldVisualId): string {
  return id === "lechy_storm" ? "game.arenaEffectStorm" : "arenas.boneField";
}

export function getBoardFieldDescriptionKey(id: BoardFieldVisualId): string {
  return id === "lechy_storm"
    ? "game.arenaEffectStormDescription"
    : "game.arenaEffectBoneFieldDescription";
}
