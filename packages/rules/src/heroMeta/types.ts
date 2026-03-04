export type AbilityType = "passive" | "active" | "impulse" | "phantasm";

export interface AbilityMeta {
  id: string;
  name: string;
  type: AbilityType;
  description: string;
  consumesAction?: boolean;
  consumesMove?: boolean;
  chargeRequired?: number | null;
}

export interface HeroMeta {
  id: string;
  name: string;
  mainClass:
    | "assassin"
    | "knight"
    | "archer"
    | "rider"
    | "berserker"
    | "trickster"
    | "spearman";
  baseStats: {
    hp: number;
    damage: number;
    moveType: string;
    attackRange: string;
  };
  abilities: AbilityMeta[];
  description?: string;
}

