/** Shares combat playback's single presentation clock; never delays rules. */
export function kaiserBuildupMs(abilityId: string | undefined, reducedMotion: boolean): number {
  return abilityId === "kaiserCarpetStrike" ? (reducedMotion ? 100 : 320)
    : abilityId === "kaiserDora" ? (reducedMotion ? 80 : 180) : 0;
}
