import type { GameState, ResolveRollChoice } from "../../../../model";
import { HERO_FRISK_ID } from "../../../../heroes";

export function parseFriskPacifismOption(
  choice: ResolveRollChoice | undefined
):
  | "hugs"
  | "childsCry"
  | "warmWords"
  | "powerOfFriendship"
  | undefined {
  if (!choice || typeof choice !== "object" || !("type" in choice)) {
    return undefined;
  }
  const payload = choice as { type?: string; option?: string };
  if (payload.type !== "friskPacifismOption") {
    return undefined;
  }
  if (
    payload.option === "hugs" ||
    payload.option === "childsCry" ||
    payload.option === "warmWords" ||
    payload.option === "powerOfFriendship"
  ) {
    return payload.option;
  }
  return undefined;
}

export function parseFriskGenocideOption(
  choice: ResolveRollChoice | undefined
): "substitution" | "keenEye" | "precisionStrike" | undefined {
  if (!choice || typeof choice !== "object" || !("type" in choice)) {
    return undefined;
  }
  const payload = choice as { type?: string; option?: string };
  if (payload.type !== "friskGenocideOption") {
    return undefined;
  }
  if (
    payload.option === "substitution" ||
    payload.option === "keenEye" ||
    payload.option === "precisionStrike"
  ) {
    return payload.option;
  }
  return undefined;
}

export function getFriskUnit(state: GameState, friskId: string) {
  const frisk = state.units[friskId];
  if (
    !frisk ||
    !frisk.isAlive ||
    !frisk.position ||
    frisk.heroId !== HERO_FRISK_ID
  ) {
    return null;
  }
  return frisk;
}
