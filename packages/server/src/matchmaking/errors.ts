/** Lifecycle forwards this rollback signal only after confirming no committed row
 * and ruling out every earlier unknown creation outcome for the same pair. */
export class PairCreationRolledBack extends Error {}
