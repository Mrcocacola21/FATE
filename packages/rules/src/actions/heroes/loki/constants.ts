export const LOKI_LAUGHT_OPTION_IDS = [
  "againSomeNonsense",
  "chicken",
  "mindControl",
  "spinTheDrum",
  "greatLokiJoke",
] as const;

export type LokiLaughtOption = (typeof LOKI_LAUGHT_OPTION_IDS)[number];

export const LOKI_LAUGHT_OPTION_COSTS: Record<LokiLaughtOption, number> = {
  againSomeNonsense: 3,
  chicken: 5,
  mindControl: 10,
  spinTheDrum: 12,
  greatLokiJoke: 15,
};

export const LOKI_LAUGHT_REJECTIONS = {
  notEnoughLaugh: "Not enough Laugh.",
  invalidOption: "Invalid Loki's Laugh option.",
  noValidTarget: "No valid target.",
  cannotUseNow: "Loki cannot use this option now.",
} as const;
