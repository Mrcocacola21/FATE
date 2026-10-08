import type { CommonSfxCategory, HeroId, HeroSfxCategory, SfxKey } from "../../assets/sfx/registry";
import type { SoundDefinition, SoundKey } from "../../assets/sfx/registry";

export type SfxEvent =
  | { type: "unitAttack"; heroId: HeroId }
  | { type: "unitHit"; heroId: HeroId }
  | { type: "unitDeath"; heroId: HeroId }
  | { type: "unitMove"; heroId: HeroId }
  | { type: "abilityUsed"; heroId: HeroId; abilityId: string }
  | { type: "phantasmUsed"; heroId: HeroId; phantasmId: string }
  | { type: "transformation"; heroId: HeroId; transformationId?: string }
  | { type: "statusApplied"; heroId?: HeroId; statusId: string };

export interface SfxLookup {
  sfxKey: SfxKey;
  heroId?: HeroId;
  category?: HeroSfxCategory;
  key: string;
  commonCategory: CommonSfxCategory;
  genericCommonKey?: string;
}

export interface SoundCue extends SoundDefinition {
  id: string;
  key: SoundKey;
  src: string;
  delayMs?: number;
  /** Bound a finite travel cue to its presentation segment, even if the WAV is longer. */
  durationMs?: number;
}

export type SfxPlaybackRequest = SoundCue;
