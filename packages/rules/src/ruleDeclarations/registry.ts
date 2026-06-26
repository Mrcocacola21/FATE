import type { RuleDeclarationConfig, RuleDeclarationId } from "./types";

export const RULE_DECLARATIONS: Record<
  RuleDeclarationId,
  RuleDeclarationConfig
> = {
  court: {
    id: "court",
    nameKey: "ruleDeclarations.court.name",
    descriptionKey: "ruleDeclarations.court.description",
    timingKey: "ruleDeclarations.court.timing",
    onRoundEnd: () => undefined,
  },
  chess_party: {
    id: "chess_party",
    nameKey: "ruleDeclarations.chessParty.name",
    descriptionKey: "ruleDeclarations.chessParty.description",
    timingKey: "ruleDeclarations.chessParty.timing",
    requiresSetup: true,
    onBattleStart: () => undefined,
    onUnitDeath: () => undefined,
    onDamage: () => undefined,
  },
  moon_game: {
    id: "moon_game",
    nameKey: "ruleDeclarations.moonGame.name",
    descriptionKey: "ruleDeclarations.moonGame.description",
    timingKey: "ruleDeclarations.moonGame.timing",
    onRoundEnd: () => undefined,
    modifiesMovement: () => undefined,
    modifiesTurnOrder: () => undefined,
  },
  advantage_game: {
    id: "advantage_game",
    nameKey: "ruleDeclarations.advantageGame.name",
    descriptionKey: "ruleDeclarations.advantageGame.description",
    timingKey: "ruleDeclarations.advantageGame.timing",
    requiresSetup: true,
    onUnitDeath: () => undefined,
  },
};

export function getRuleDeclarationConfig(id: RuleDeclarationId) {
  return RULE_DECLARATIONS[id];
}

export function getAvailableRuleDeclarationIds(): RuleDeclarationId[] {
  return Object.keys(RULE_DECLARATIONS) as RuleDeclarationId[];
}
