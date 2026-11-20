/**
 * Menu music: one long track looped through two players, so the ending fades into the next
 * start instead of cutting. Streaming players rather than Web Audio keep a three-minute theme
 * out of decoded memory.
 */
export interface MusicTrack {
  src: string;
  volume: number;
  currentTime: number;
  duration: number;
  paused: boolean;
  loop: boolean;
  preload: string;
  play(): Promise<void> | void;
  pause(): void;
}

export interface MenuMusicOptions {
  createTrack?: (src: string) => MusicTrack;
  /** Seconds the end of the track overlaps the next start. */
  crossfadeSeconds?: number;
  /** Music sits under interface sounds at the same master volume. */
  musicGain?: number;
  tickMs?: number;
  setTimer?: (tick: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export class MenuMusic {
  private readonly tracks: [MusicTrack, MusicTrack];
  private current = 0;
  private wanted = false;
  private unlocked = false;
  private muted = false;
  private volume = 1;
  private fade = 0;
  private crossfadeFrom: number | null = null;
  private crossfadeAt = 0;
  private timer: unknown = null;
  private readonly crossfade: number;
  private readonly musicGain: number;
  private readonly tickMs: number;
  private readonly setTimer: (tick: () => void, ms: number) => unknown;
  private readonly clearTimer: (handle: unknown) => void;

  constructor(src: string, options: MenuMusicOptions = {}) {
    const create =
      options.createTrack ?? ((url: string) => new Audio(url) as unknown as MusicTrack);
    this.tracks = [create(src), create(src)];
    for (const track of this.tracks) {
      track.loop = false;
      track.preload = "auto";
      track.volume = 0;
    }
    this.crossfade = options.crossfadeSeconds ?? 4;
    this.musicGain = options.musicGain ?? 0.55;
    this.tickMs = options.tickMs ?? 100;
    this.setTimer = options.setTimer ?? ((tick, ms) => setInterval(tick, ms));
    this.clearTimer = options.clearTimer ?? ((handle) => clearInterval(handle as number));
  }

  /** Browsers allow audio only after the player has interacted with the page. */
  unlock(): void {
    if (this.unlocked) return;
    this.unlocked = true;
    this.sync();
  }

  /** Whether the current screen wants music (menus yes, battles no). */
  setWanted(wanted: boolean): void {
    if (this.wanted === wanted) return;
    this.wanted = wanted;
    this.sync();
  }

  setLevel(muted: boolean, volume: number): void {
    this.muted = muted;
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 1;
    this.applyVolumes();
  }

  /** Pause while the tab is hidden; resume where it was when it returns. */
  setHidden(hidden: boolean): void {
    if (hidden) {
      for (const track of this.tracks) track.pause();
      this.stopTimer();
    } else this.sync();
  }

  dispose(): void {
    this.wanted = false;
    for (const track of this.tracks) track.pause();
    this.stopTimer();
  }

  private sync(): void {
    if (!this.unlocked) return;
    if (this.wanted) {
      const track = this.tracks[this.current];
      if (track.paused) void Promise.resolve(track.play()).catch(() => undefined);
      if (this.crossfadeFrom !== null) {
        const other = this.tracks[this.crossfadeFrom];
        if (other.paused) void Promise.resolve(other.play()).catch(() => undefined);
      }
    }
    this.startTimer();
    this.applyVolumes();
  }

  private startTimer(): void {
    if (this.timer === null) this.timer = this.setTimer(() => this.tick(), this.tickMs);
  }

  private stopTimer(): void {
    if (this.timer !== null) this.clearTimer(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const step = this.tickMs / 1000;
    // Entering a menu fades the music up; entering a battle fades it out, then stops it.
    if (this.wanted) this.fade = Math.min(1, this.fade + step / 1.5);
    else this.fade = Math.max(0, this.fade - step / 0.8);
    if (!this.wanted && this.fade === 0) {
      for (const track of this.tracks) track.pause();
      this.crossfadeFrom = null;
      this.stopTimer();
      this.applyVolumes();
      return;
    }
    const track = this.tracks[this.current];
    if (
      this.crossfadeFrom === null &&
      Number.isFinite(track.duration) &&
      track.duration > this.crossfade * 2 &&
      track.currentTime >= track.duration - this.crossfade
    ) {
      // Start the other player from the top while this one plays out its ending.
      const next = this.current === 0 ? 1 : 0;
      this.crossfadeFrom = this.current;
      this.crossfadeAt = track.currentTime;
      this.current = next;
      const incoming = this.tracks[next];
      incoming.currentTime = 0;
      void Promise.resolve(incoming.play()).catch(() => undefined);
    }
    if (this.crossfadeFrom !== null) {
      const outgoing = this.tracks[this.crossfadeFrom];
      if (outgoing.paused || outgoing.currentTime >= outgoing.duration - 0.05) {
        outgoing.pause();
        outgoing.currentTime = 0;
        this.crossfadeFrom = null;
      }
    }
    this.applyVolumes();
  }

  private applyVolumes(): void {
    const level = this.muted ? 0 : this.volume * this.musicGain * this.fade;
    if (this.crossfadeFrom === null) {
      this.tracks[this.current].volume = level;
      this.tracks[this.current === 0 ? 1 : 0].volume = 0;
      return;
    }
    const outgoing = this.tracks[this.crossfadeFrom];
    const progress = Math.min(
      1,
      Math.max(0, (outgoing.currentTime - this.crossfadeAt) / Math.max(0.001, this.crossfade)),
    );
    // Equal-power curves keep the loudness steady through the overlap.
    const incomingGain = Math.sin((progress * Math.PI) / 2);
    const outgoingGain = Math.cos((progress * Math.PI) / 2);
    outgoing.volume = level * outgoingGain;
    this.tracks[this.current].volume = level * incomingGain;
  }
}
