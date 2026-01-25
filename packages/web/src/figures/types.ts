export type BaseClass =
  | "assassin"
  | "archer"
  | "berserker"
  | "rider"
  | "spearman"
  | "trickster"
  | "knight";

export const BASE_CLASSES: BaseClass[] = [
  "assassin",
  "archer",
  "berserker",
  "rider",
  "spearman",
  "trickster",
  "knight",
];

export interface HeroDefinition {
  id: string;
  name: string;
  mainClass: BaseClass;
}

export type HeroCatalog = HeroDefinition[];

export type FigureSetSelection = Record<BaseClass, string>;

export interface FigureSetState {
  version: number;
  updatedAt: string;
  selection: FigureSetSelection;
}
