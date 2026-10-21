/** Shared presentation timing; rules stay immediate and SFX use the combat cues. */
export const MELEE_CONTACT_MS = 420;
export const MELEE_RECOVERY_MS = 220;
export function meleeTraceMs(contactMs: number) {
  return Math.min(260, contactMs);
}

/** Authored rightward cut is the reference, in screen space after board rotation.
 * Reflections preserve the requested sweep/chirality; a 180deg rotation does not.
 * Diagonals use 45deg intermediate poses instead of squashing mirrored artwork.
 */
export function meleeFacingTransform(screenAngleDeg: number): string {
  const octant = ((Math.round(screenAngleDeg / 45) % 8) + 8) % 8;
  const poses = [
    [0, 1, 1],     // right: reference
    [45, 1, 1],    // down-right
    [0, 1, 1],     // down: two vertical reflections cancel out
    [-45, -1, 1],  // down-left
    [0, -1, 1],    // left: horizontal reflection
    [45, -1, 1],   // up-left
    [0, 1, -1],    // up: vertical reflection
    [-45, 1, 1],   // up-right
  ] as const;
  const [rotation, x, y] = poses[octant];
  return `rotate(${rotation}deg) scale(${x}, ${y})`;
}
