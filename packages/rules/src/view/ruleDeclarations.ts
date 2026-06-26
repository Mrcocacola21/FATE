import type {
  MoonGameState,
  RuleDeclarationState,
} from "../ruleDeclarations/types";
import type { PlayerId } from "../model";

function cloneMoonGame(
  moonGame: MoonGameState | undefined,
  recipient: PlayerId | "spectator"
): MoonGameState | undefined {
  if (!moonGame) return undefined;
  const choices = moonGame.cheeseHoles?.choices ?? {};
  const bothChosen = !!choices.P1 && !!choices.P2;
  const projectedChoices =
    bothChosen || recipient === "spectator"
      ? bothChosen
        ? { ...choices }
        : {}
      : {
          [recipient]: choices[recipient],
        };
  return {
    ...moonGame,
    crater: moonGame.crater ? { ...moonGame.crater, center: { ...moonGame.crater.center } } : moonGame.crater,
    cheeseHoles: moonGame.cheeseHoles
      ? {
          choices: projectedChoices,
        }
      : moonGame.cheeseHoles,
  };
}

export function projectRuleDeclarationState(
  ruleDeclaration: RuleDeclarationState,
  recipient: PlayerId | "spectator"
): RuleDeclarationState {
  const ruleData = ruleDeclaration.ruleData ?? {};
  return {
    ...ruleDeclaration,
    ruleData: {
      ...ruleData,
      court: ruleData.court
        ? {
            ...ruleData.court,
            pendingEffects: ruleData.court.pendingEffects
              ? ruleData.court.pendingEffects.map((effect) => ({ ...effect }))
              : ruleData.court.pendingEffects,
          }
        : ruleData.court,
      chessParty: ruleData.chessParty
        ? {
            kings: { ...ruleData.chessParty.kings },
          }
        : ruleData.chessParty,
      moonGame: cloneMoonGame(ruleData.moonGame, recipient),
      advantageGame: ruleData.advantageGame
        ? { ...ruleData.advantageGame }
        : ruleData.advantageGame,
      pendingRoundAdvance: ruleData.pendingRoundAdvance
        ? { ...ruleData.pendingRoundAdvance }
        : ruleData.pendingRoundAdvance,
    },
  };
}
