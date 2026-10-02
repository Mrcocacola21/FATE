import type { GameShellViewModel } from "../gameshell-content/hooks/useGameShellViewModel";

type FixtureFields<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends Set<infer Item>
    ? Set<Item>
    : T extends Array<infer Item>
      ? FixtureFields<Item>[]
      : T extends object
        ? { [Key in keyof T]?: FixtureFields<T[Key]> }
        : T;

export type GameShellFixture = FixtureFields<GameShellViewModel>;

export function gameShellFixture(fields: GameShellFixture): GameShellViewModel {
  // Isolated render tests supply only the fields read by the branch under test.
  // Keep their domain types checked without inventing unrelated game state.
  return fields as GameShellViewModel;
}
