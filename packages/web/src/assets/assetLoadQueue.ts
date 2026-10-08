export type AssetPriority = "high" | "medium" | "low";
const ranks: Record<AssetPriority, number> = { high: 0, medium: 1, low: 2 };

/** Shared fetch/decode budget for audio and image warmup, including cold cues. */
export class AssetLoadQueue {
  private active = 0;
  private pending: { priority: AssetPriority; run: () => Promise<void> }[] = [];
  constructor(
    readonly concurrency = 4,
    readonly maxPending = 256,
  ) {
    if (!Number.isInteger(concurrency) || concurrency < 1)
      throw new Error("Invalid asset concurrency");
  }
  get diagnostics() {
    return { active: this.active, pending: this.pending.length, concurrency: this.concurrency };
  }
  enqueue<T>(work: () => Promise<T>, priority: AssetPriority = "low"): Promise<T | undefined> {
    if (this.pending.length >= this.maxPending) return Promise.resolve(undefined);
    return new Promise((resolve) => {
      this.pending.push({
        priority,
        run: async () => {
          try {
            resolve(await work());
          } catch {
            resolve(undefined);
          }
        },
      });
      this.drain();
    });
  }
  private drain(): void {
    this.pending.sort((a, b) => ranks[a.priority] - ranks[b.priority]);
    while (this.active < this.concurrency && this.pending.length) {
      const job = this.pending.shift()!;
      this.active++;
      void job.run().finally(() => {
        this.active--;
        this.drain();
      });
    }
  }
}
export const assetLoadQueue = new AssetLoadQueue();
