import type { UnitState } from "rules";
import {
  ASGORE_SOUL_PARADE_ID,
  CHIKATILO_FALSE_TRAIL_ID,
  FEMTO_DIVINE_MOVE_ID,
  FRISK_GENOCIDE_ID,
  FRISK_ONE_PATH_ID,
  FRISK_PACIFISM_ID,
  GRIFFITH_FEMTO_REBIRTH_ID,
  GROZNY_TYRANT_ID,
  GUTS_BERSERK_MODE_ID,
  KAISER_ENGINEERING_MIRACLE_ID,
  LOKI_LAUGHT_ID,
  METTATON_RATING_ID,
  PAPYRUS_UNBELIEVER_ID,
  RIVER_PERSON_BOAT_ID,
  RIVER_PERSON_TRA_LA_LA_ID,
  SANS_UNBELIEVER_ID,
  UNDYNE_UNDYING_ID,
  VLAD_FOREST_ID,
  VLAD_STAKES_ID,
} from "../rulesHints";

export type AbilityDisplayPresentation = "resource" | "outcomes" | "transformation" | "details";

export type AbilityDisplayType =
  | "passive"
  | "active"
  | "reaction"
  | "impulse"
  | "phantasm"
  | "automatic"
  | "effect";

type BooleanUnitFlag =
  | "transformed"
  | "gutsBerserkModeActive"
  | "papyrusUnbelieverActive"
  | "sansUnbelieverUnlocked"
  | "mettatonExUnlocked"
  | "mettatonNeoUnlocked"
  | "undyneImmortalActive";

export interface AbilityDisplayCost {
  amount: number | null;
  resourceKey: string;
}

export interface AbilityDisplayCondition {
  flag: BooleanUnitFlag;
  value?: boolean;
  reasonKey: string;
}

export interface AbilityDisplayOption {
  id: string;
  nameKey: string;
  descriptionKey: string;
  types?: AbilityDisplayType[];
  cost?: AbilityDisplayCost;
  roll?: number | string;
  requires?: AbilityDisplayCondition;
  activeWhen?: Omit<AbilityDisplayCondition, "reasonKey">;
}

export interface AbilityDisplaySection {
  labelKey: string;
  options: AbilityDisplayOption[];
}

export interface AbilityDisplayResource {
  labelKey: string;
  source: { kind: "abilityCharges" } | { kind: "unitField"; field: "mettatonRating" };
  max?: number;
}

export interface AbilityDisplayDetails {
  presentation: AbilityDisplayPresentation;
  summaryKey: string;
  categoryKey?: string;
  gainRuleKey?: string;
  notesKeys?: string[];
  resource?: AbilityDisplayResource;
  state?: {
    activeWhen: Omit<AbilityDisplayCondition, "reasonKey">;
    activeLabelKey: string;
    inactiveLabelKey: string;
  };
  sections?: AbilityDisplaySection[];
}

export interface AbilityOptionAvailability {
  available: boolean;
  reasonKey?: string;
  reasonValues?: Record<string, string | number>;
}

export interface AbilityDisplayAbility {
  id: string;
  currentCharges?: number;
  maxCharges?: number;
  isAvailable?: boolean;
}

const detailRegistry: Record<string, AbilityDisplayDetails> = {
  [FRISK_PACIFISM_ID]: {
    presentation: "resource",
    summaryKey: "abilityDetails.frisk.pacifism.summary",
    categoryKey: "abilityDetails.labels.resourceAbility",
    gainRuleKey: "abilityDetails.frisk.pacifism.gain",
    resource: {
      labelKey: "abilityDetails.resources.pacifism",
      source: { kind: "abilityCharges" },
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.options",
        options: [
          {
            id: "hugs",
            nameKey: "abilityDetails.frisk.pacifism.options.hugs.name",
            descriptionKey: "abilityDetails.frisk.pacifism.options.hugs.description",
            types: ["active"],
            cost: { amount: 3, resourceKey: "abilityDetails.resources.pacifism" },
          },
          {
            id: "childsCry",
            nameKey: "abilityDetails.frisk.pacifism.options.childsCry.name",
            descriptionKey: "abilityDetails.frisk.pacifism.options.childsCry.description",
            types: ["passive", "reaction"],
            cost: { amount: 5, resourceKey: "abilityDetails.resources.pacifism" },
          },
          {
            id: "warmWords",
            nameKey: "abilityDetails.frisk.pacifism.options.warmWords.name",
            descriptionKey: "abilityDetails.frisk.pacifism.options.warmWords.description",
            types: ["active"],
            cost: { amount: 10, resourceKey: "abilityDetails.resources.pacifism" },
          },
          {
            id: "powerOfFriendship",
            nameKey: "abilityDetails.frisk.pacifism.options.powerOfFriendship.name",
            descriptionKey: "abilityDetails.frisk.pacifism.options.powerOfFriendship.description",
            types: ["impulse", "automatic"],
            cost: { amount: null, resourceKey: "abilityDetails.resources.pacifism" },
          },
        ],
      },
    ],
  },
  [FRISK_GENOCIDE_ID]: {
    presentation: "resource",
    summaryKey: "abilityDetails.frisk.genocide.summary",
    categoryKey: "abilityDetails.labels.resourceAbility",
    gainRuleKey: "abilityDetails.frisk.genocide.gain",
    notesKeys: ["abilityDetails.frisk.genocide.killScaling"],
    resource: {
      labelKey: "abilityDetails.resources.genocide",
      source: { kind: "abilityCharges" },
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.options",
        options: [
          {
            id: "substitution",
            nameKey: "abilityDetails.frisk.genocide.options.substitution.name",
            descriptionKey: "abilityDetails.frisk.genocide.options.substitution.description",
            types: ["passive", "reaction"],
            cost: { amount: 3, resourceKey: "abilityDetails.resources.genocide" },
          },
          {
            id: "keenEye",
            nameKey: "abilityDetails.frisk.genocide.options.keenEye.name",
            descriptionKey: "abilityDetails.frisk.genocide.options.keenEye.description",
            types: ["active"],
            cost: { amount: 5, resourceKey: "abilityDetails.resources.genocide" },
          },
          {
            id: "precisionStrike",
            nameKey: "abilityDetails.frisk.genocide.options.precisionStrike.name",
            descriptionKey: "abilityDetails.frisk.genocide.options.precisionStrike.description",
            types: ["active"],
            cost: { amount: 10, resourceKey: "abilityDetails.resources.genocide" },
          },
        ],
      },
    ],
  },
  [FRISK_ONE_PATH_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.frisk.onePath.summary",
  },
  [LOKI_LAUGHT_ID]: {
    presentation: "resource",
    summaryKey: "abilityDetails.loki.laughter.summary",
    categoryKey: "abilityDetails.labels.resourceAbility",
    gainRuleKey: "abilityDetails.loki.laughter.gain",
    resource: {
      labelKey: "abilityDetails.resources.laughter",
      source: { kind: "abilityCharges" },
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.options",
        options: [
          {
            id: "againSomeNonsense",
            nameKey: "abilityDetails.loki.laughter.options.againSomeNonsense.name",
            descriptionKey: "abilityDetails.loki.laughter.options.againSomeNonsense.description",
            types: ["active"],
            cost: { amount: 3, resourceKey: "abilityDetails.resources.laughter" },
          },
          {
            id: "chicken",
            nameKey: "abilityDetails.loki.laughter.options.chicken.name",
            descriptionKey: "abilityDetails.loki.laughter.options.chicken.description",
            types: ["active"],
            cost: { amount: 5, resourceKey: "abilityDetails.resources.laughter" },
          },
          {
            id: "mindControl",
            nameKey: "abilityDetails.loki.laughter.options.mindControl.name",
            descriptionKey: "abilityDetails.loki.laughter.options.mindControl.description",
            types: ["active"],
            cost: { amount: 10, resourceKey: "abilityDetails.resources.laughter" },
          },
          {
            id: "spinTheDrum",
            nameKey: "abilityDetails.loki.laughter.options.spinTheDrum.name",
            descriptionKey: "abilityDetails.loki.laughter.options.spinTheDrum.description",
            types: ["active"],
            cost: { amount: 12, resourceKey: "abilityDetails.resources.laughter" },
          },
          {
            id: "greatLokiJoke",
            nameKey: "abilityDetails.loki.laughter.options.greatLokiJoke.name",
            descriptionKey: "abilityDetails.loki.laughter.options.greatLokiJoke.description",
            types: ["phantasm"],
            cost: { amount: 15, resourceKey: "abilityDetails.resources.laughter" },
          },
        ],
      },
    ],
  },
  [ASGORE_SOUL_PARADE_ID]: {
    presentation: "outcomes",
    summaryKey: "abilityDetails.asgore.soulParade.summary",
    categoryKey: "abilityDetails.labels.randomOutcome",
    notesKeys: ["abilityDetails.asgore.soulParade.roll"],
    sections: [
      {
        labelKey: "abilityDetails.labels.outcomes",
        options: [
          {
            id: "patience",
            roll: 1,
            nameKey: "abilityDetails.asgore.soulParade.outcomes.patience.name",
            descriptionKey: "abilityDetails.asgore.soulParade.outcomes.patience.description",
            types: ["effect"],
          },
          {
            id: "bravery",
            roll: 2,
            nameKey: "abilityDetails.asgore.soulParade.outcomes.bravery.name",
            descriptionKey: "abilityDetails.asgore.soulParade.outcomes.bravery.description",
            types: ["effect"],
          },
          {
            id: "integrity",
            roll: 3,
            nameKey: "abilityDetails.asgore.soulParade.outcomes.integrity.name",
            descriptionKey: "abilityDetails.asgore.soulParade.outcomes.integrity.description",
            types: ["effect"],
          },
          {
            id: "perseverance",
            roll: 4,
            nameKey: "abilityDetails.asgore.soulParade.outcomes.perseverance.name",
            descriptionKey: "abilityDetails.asgore.soulParade.outcomes.perseverance.description",
            types: ["effect"],
          },
          {
            id: "kindness",
            roll: 5,
            nameKey: "abilityDetails.asgore.soulParade.outcomes.kindness.name",
            descriptionKey: "abilityDetails.asgore.soulParade.outcomes.kindness.description",
            types: ["effect"],
          },
          {
            id: "justice",
            roll: 6,
            nameKey: "abilityDetails.asgore.soulParade.outcomes.justice.name",
            descriptionKey: "abilityDetails.asgore.soulParade.outcomes.justice.description",
            types: ["effect"],
          },
        ],
      },
    ],
  },
  [PAPYRUS_UNBELIEVER_ID]: {
    presentation: "transformation",
    summaryKey: "abilityDetails.papyrus.unbeliever.summary",
    categoryKey: "abilityDetails.labels.transformation",
    state: {
      activeWhen: { flag: "papyrusUnbelieverActive", value: true },
      activeLabelKey: "abilityDetails.labels.activeForm",
      inactiveLabelKey: "abilityDetails.labels.lockedForm",
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.afterTransformation",
        options: [
          {
            id: "orangeBone",
            nameKey: "abilityDetails.papyrus.unbeliever.options.orangeBone.name",
            descriptionKey: "abilityDetails.papyrus.unbeliever.options.orangeBone.description",
            types: ["passive"],
          },
          {
            id: "longBone",
            nameKey: "abilityDetails.papyrus.unbeliever.options.longBone.name",
            descriptionKey: "abilityDetails.papyrus.unbeliever.options.longBone.description",
            types: ["passive"],
          },
          {
            id: "ossified",
            nameKey: "abilityDetails.papyrus.unbeliever.options.ossified.name",
            descriptionKey: "abilityDetails.papyrus.unbeliever.options.ossified.description",
            types: ["passive", "reaction"],
          },
          {
            id: "coolGuy",
            nameKey: "abilityDetails.papyrus.unbeliever.options.coolGuy.name",
            descriptionKey: "abilityDetails.papyrus.unbeliever.options.coolGuy.description",
            types: ["impulse"],
          },
        ],
      },
    ],
  },
  [KAISER_ENGINEERING_MIRACLE_ID]: {
    presentation: "transformation",
    summaryKey: "abilityDetails.kaiser.engineeringMiracle.summary",
    categoryKey: "abilityDetails.labels.transformation",
    gainRuleKey: "abilityDetails.kaiser.engineeringMiracle.gain",
    resource: {
      labelKey: "abilityDetails.resources.engineering",
      source: { kind: "abilityCharges" },
      max: 4,
    },
    state: {
      activeWhen: { flag: "transformed", value: true },
      activeLabelKey: "abilityDetails.labels.activeForm",
      inactiveLabelKey: "abilityDetails.labels.buildingCharge",
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.afterTransformation",
        options: [
          {
            id: "stats",
            nameKey: "abilityDetails.kaiser.engineeringMiracle.options.stats.name",
            descriptionKey: "abilityDetails.kaiser.engineeringMiracle.options.stats.description",
            types: ["passive"],
          },
          {
            id: "multiclass",
            nameKey: "abilityDetails.kaiser.engineeringMiracle.options.multiclass.name",
            descriptionKey:
              "abilityDetails.kaiser.engineeringMiracle.options.multiclass.description",
            types: ["passive"],
          },
          {
            id: "dora",
            nameKey: "abilityDetails.kaiser.engineeringMiracle.options.dora.name",
            descriptionKey: "abilityDetails.kaiser.engineeringMiracle.options.dora.description",
            types: ["active"],
          },
          {
            id: "defenses",
            nameKey: "abilityDetails.kaiser.engineeringMiracle.options.defenses.name",
            descriptionKey: "abilityDetails.kaiser.engineeringMiracle.options.defenses.description",
            types: ["passive"],
          },
        ],
      },
    ],
  },
  [GUTS_BERSERK_MODE_ID]: {
    presentation: "transformation",
    summaryKey: "abilityDetails.guts.berserk.summary",
    categoryKey: "abilityDetails.labels.mode",
    state: {
      activeWhen: { flag: "gutsBerserkModeActive", value: true },
      activeLabelKey: "abilityDetails.labels.active",
      inactiveLabelKey: "abilityDetails.labels.inactive",
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.whileActive",
        options: [
          {
            id: "damage",
            nameKey: "abilityDetails.guts.berserk.options.damage.name",
            descriptionKey: "abilityDetails.guts.berserk.options.damage.description",
            types: ["passive"],
          },
          {
            id: "movement",
            nameKey: "abilityDetails.guts.berserk.options.movement.name",
            descriptionKey: "abilityDetails.guts.berserk.options.movement.description",
            types: ["passive"],
          },
          {
            id: "aoe",
            nameKey: "abilityDetails.guts.berserk.options.aoe.name",
            descriptionKey: "abilityDetails.guts.berserk.options.aoe.description",
            types: ["active"],
          },
          {
            id: "damageCap",
            nameKey: "abilityDetails.guts.berserk.options.damageCap.name",
            descriptionKey: "abilityDetails.guts.berserk.options.damageCap.description",
            types: ["passive"],
          },
          {
            id: "drain",
            nameKey: "abilityDetails.guts.berserk.options.drain.name",
            descriptionKey: "abilityDetails.guts.berserk.options.drain.description",
            types: ["passive"],
          },
          {
            id: "exit",
            nameKey: "abilityDetails.guts.berserk.options.exit.name",
            descriptionKey: "abilityDetails.guts.berserk.options.exit.description",
            types: ["active"],
          },
        ],
      },
    ],
  },
  [GRIFFITH_FEMTO_REBIRTH_ID]: {
    presentation: "transformation",
    summaryKey: "abilityDetails.griffith.rebirth.summary",
    categoryKey: "abilityDetails.labels.transformation",
    sections: [
      {
        labelKey: "abilityDetails.labels.afterTransformation",
        options: [
          {
            id: "rebirth",
            nameKey: "abilityDetails.griffith.rebirth.options.rebirth.name",
            descriptionKey: "abilityDetails.griffith.rebirth.options.rebirth.description",
            types: ["phantasm", "automatic"],
          },
          {
            id: "stats",
            nameKey: "abilityDetails.griffith.rebirth.options.stats.name",
            descriptionKey: "abilityDetails.griffith.rebirth.options.stats.description",
            types: ["passive"],
          },
          {
            id: "multiclass",
            nameKey: "abilityDetails.griffith.rebirth.options.multiclass.name",
            descriptionKey: "abilityDetails.griffith.rebirth.options.multiclass.description",
            types: ["passive"],
          },
          {
            id: "movement",
            nameKey: "abilityDetails.griffith.rebirth.options.movement.name",
            descriptionKey: "abilityDetails.griffith.rebirth.options.movement.description",
            types: ["active"],
          },
        ],
      },
    ],
  },
  [FEMTO_DIVINE_MOVE_ID]: {
    presentation: "outcomes",
    summaryKey: "abilityDetails.griffith.divineMovement.summary",
    categoryKey: "abilityDetails.labels.randomOutcome",
    notesKeys: ["abilityDetails.griffith.divineMovement.roll"],
    sections: [
      {
        labelKey: "abilityDetails.labels.outcomes",
        options: [
          {
            id: "near",
            roll: "1–3",
            nameKey: "abilityDetails.griffith.divineMovement.outcomes.near.name",
            descriptionKey: "abilityDetails.griffith.divineMovement.outcomes.near.description",
            types: ["effect"],
          },
          {
            id: "far",
            roll: "4–6",
            nameKey: "abilityDetails.griffith.divineMovement.outcomes.far.name",
            descriptionKey: "abilityDetails.griffith.divineMovement.outcomes.far.description",
            types: ["effect"],
          },
        ],
      },
    ],
  },
  [GROZNY_TYRANT_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.grozny.tyrant.summary",
    sections: [
      {
        labelKey: "abilityDetails.labels.sequence",
        options: [
          {
            id: "trigger",
            nameKey: "abilityDetails.grozny.tyrant.options.trigger.name",
            descriptionKey: "abilityDetails.grozny.tyrant.options.trigger.description",
            types: ["impulse"],
          },
          {
            id: "execution",
            nameKey: "abilityDetails.grozny.tyrant.options.execution.name",
            descriptionKey: "abilityDetails.grozny.tyrant.options.execution.description",
            types: ["active"],
          },
          {
            id: "reward",
            nameKey: "abilityDetails.grozny.tyrant.options.reward.name",
            descriptionKey: "abilityDetails.grozny.tyrant.options.reward.description",
            types: ["passive"],
          },
          {
            id: "scaling",
            nameKey: "abilityDetails.grozny.tyrant.options.scaling.name",
            descriptionKey: "abilityDetails.grozny.tyrant.options.scaling.description",
            types: ["passive"],
          },
        ],
      },
    ],
  },
  [CHIKATILO_FALSE_TRAIL_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.chikatilo.falseTrail.summary",
    sections: [
      {
        labelKey: "abilityDetails.labels.details",
        options: [
          {
            id: "placement",
            nameKey: "abilityDetails.chikatilo.falseTrail.options.placement.name",
            descriptionKey: "abilityDetails.chikatilo.falseTrail.options.placement.description",
            types: ["passive"],
          },
          {
            id: "stealth",
            nameKey: "abilityDetails.chikatilo.falseTrail.options.stealth.name",
            descriptionKey: "abilityDetails.chikatilo.falseTrail.options.stealth.description",
            types: ["passive"],
          },
          {
            id: "trap",
            nameKey: "abilityDetails.chikatilo.falseTrail.options.trap.name",
            descriptionKey: "abilityDetails.chikatilo.falseTrail.options.trap.description",
            types: ["passive", "reaction"],
          },
          {
            id: "explosion",
            nameKey: "abilityDetails.chikatilo.falseTrail.options.explosion.name",
            descriptionKey: "abilityDetails.chikatilo.falseTrail.options.explosion.description",
            types: ["active"],
          },
        ],
      },
    ],
  },
  [VLAD_STAKES_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.vlad.stakes.summary",
    sections: [
      {
        labelKey: "abilityDetails.labels.stakeRules",
        options: [
          {
            id: "placement",
            nameKey: "abilityDetails.vlad.stakes.options.placement.name",
            descriptionKey: "abilityDetails.vlad.stakes.options.placement.description",
            types: ["impulse"],
          },
          {
            id: "trigger",
            nameKey: "abilityDetails.vlad.stakes.options.trigger.name",
            descriptionKey: "abilityDetails.vlad.stakes.options.trigger.description",
            types: ["passive"],
          },
          {
            id: "persistence",
            nameKey: "abilityDetails.vlad.stakes.options.persistence.name",
            descriptionKey: "abilityDetails.vlad.stakes.options.persistence.description",
            types: ["passive"],
          },
        ],
      },
    ],
  },
  [VLAD_FOREST_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.vlad.forest.summary",
    sections: [
      {
        labelKey: "abilityDetails.labels.details",
        options: [
          {
            id: "cost",
            nameKey: "abilityDetails.vlad.forest.options.cost.name",
            descriptionKey: "abilityDetails.vlad.forest.options.cost.description",
            types: ["phantasm"],
          },
          {
            id: "area",
            nameKey: "abilityDetails.vlad.forest.options.area.name",
            descriptionKey: "abilityDetails.vlad.forest.options.area.description",
            types: ["active"],
          },
        ],
      },
    ],
  },
  [RIVER_PERSON_BOAT_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.river.boat.summary",
    sections: [
      {
        labelKey: "abilityDetails.labels.carryFlow",
        options: [
          {
            id: "choose",
            nameKey: "abilityDetails.river.boat.options.choose.name",
            descriptionKey: "abilityDetails.river.boat.options.choose.description",
            types: ["passive"],
          },
          {
            id: "move",
            nameKey: "abilityDetails.river.boat.options.move.name",
            descriptionKey: "abilityDetails.river.boat.options.move.description",
            types: ["passive"],
          },
          {
            id: "drop",
            nameKey: "abilityDetails.river.boat.options.drop.name",
            descriptionKey: "abilityDetails.river.boat.options.drop.description",
            types: ["passive"],
          },
        ],
      },
    ],
  },
  [RIVER_PERSON_TRA_LA_LA_ID]: {
    presentation: "details",
    summaryKey: "abilityDetails.river.tralala.summary",
    sections: [
      {
        labelKey: "abilityDetails.labels.sequence",
        options: [
          {
            id: "target",
            nameKey: "abilityDetails.river.tralala.options.target.name",
            descriptionKey: "abilityDetails.river.tralala.options.target.description",
            types: ["active"],
          },
          {
            id: "move",
            nameKey: "abilityDetails.river.tralala.options.move.name",
            descriptionKey: "abilityDetails.river.tralala.options.move.description",
            types: ["active"],
          },
          {
            id: "allies",
            nameKey: "abilityDetails.river.tralala.options.allies.name",
            descriptionKey: "abilityDetails.river.tralala.options.allies.description",
            types: ["effect"],
          },
        ],
      },
    ],
  },
  [METTATON_RATING_ID]: {
    presentation: "resource",
    summaryKey: "abilityDetails.mettaton.rating.summary",
    categoryKey: "abilityDetails.labels.resourceAbility",
    gainRuleKey: "abilityDetails.mettaton.rating.gain",
    notesKeys: [
      "abilityDetails.mettaton.rating.exBonus",
      "abilityDetails.mettaton.rating.neoBonus",
    ],
    resource: {
      labelKey: "abilityDetails.resources.rating",
      source: { kind: "unitField", field: "mettatonRating" },
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.options",
        options: [
          {
            id: "poppins",
            nameKey: "abilityDetails.mettaton.rating.options.poppins.name",
            descriptionKey: "abilityDetails.mettaton.rating.options.poppins.description",
            types: ["active"],
            cost: { amount: 3, resourceKey: "abilityDetails.resources.rating" },
          },
          {
            id: "ex",
            nameKey: "abilityDetails.mettaton.rating.options.ex.name",
            descriptionKey: "abilityDetails.mettaton.rating.options.ex.description",
            types: ["impulse"],
            cost: { amount: null, resourceKey: "abilityDetails.resources.rating" },
            activeWhen: { flag: "mettatonExUnlocked", value: true },
          },
          {
            id: "laser",
            nameKey: "abilityDetails.mettaton.rating.options.laser.name",
            descriptionKey: "abilityDetails.mettaton.rating.options.laser.description",
            types: ["active"],
            cost: { amount: 3, resourceKey: "abilityDetails.resources.rating" },
            requires: {
              flag: "mettatonExUnlocked",
              value: true,
              reasonKey: "abilityDetails.reasons.requiresEx",
            },
          },
          {
            id: "neo",
            nameKey: "abilityDetails.mettaton.rating.options.neo.name",
            descriptionKey: "abilityDetails.mettaton.rating.options.neo.description",
            types: ["impulse"],
            cost: { amount: null, resourceKey: "abilityDetails.resources.rating" },
            activeWhen: { flag: "mettatonNeoUnlocked", value: true },
          },
          {
            id: "finalChord",
            nameKey: "abilityDetails.mettaton.rating.options.finalChord.name",
            descriptionKey: "abilityDetails.mettaton.rating.options.finalChord.description",
            types: ["phantasm"],
            cost: { amount: 12, resourceKey: "abilityDetails.resources.rating" },
          },
        ],
      },
    ],
  },
  [SANS_UNBELIEVER_ID]: {
    presentation: "transformation",
    summaryKey: "abilityDetails.sans.unbeliever.summary",
    categoryKey: "abilityDetails.labels.transformation",
    state: {
      activeWhen: { flag: "sansUnbelieverUnlocked", value: true },
      activeLabelKey: "abilityDetails.labels.activeForm",
      inactiveLabelKey: "abilityDetails.labels.lockedForm",
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.unlockedAbilities",
        options: [
          {
            id: "boneField",
            nameKey: "abilityDetails.sans.unbeliever.options.boneField.name",
            descriptionKey: "abilityDetails.sans.unbeliever.options.boneField.description",
            types: ["impulse"],
          },
          {
            id: "sleep",
            nameKey: "abilityDetails.sans.unbeliever.options.sleep.name",
            descriptionKey: "abilityDetails.sans.unbeliever.options.sleep.description",
            types: ["active"],
          },
          {
            id: "lastAttack",
            nameKey: "abilityDetails.sans.unbeliever.options.lastAttack.name",
            descriptionKey: "abilityDetails.sans.unbeliever.options.lastAttack.description",
            types: ["passive"],
          },
        ],
      },
    ],
  },
  [UNDYNE_UNDYING_ID]: {
    presentation: "transformation",
    summaryKey: "abilityDetails.undyne.undying.summary",
    categoryKey: "abilityDetails.labels.transformation",
    state: {
      activeWhen: { flag: "undyneImmortalActive", value: true },
      activeLabelKey: "abilityDetails.labels.activeForm",
      inactiveLabelKey: "abilityDetails.labels.readyOnDeath",
    },
    sections: [
      {
        labelKey: "abilityDetails.labels.afterTransformation",
        options: [
          {
            id: "revive",
            nameKey: "abilityDetails.undyne.undying.options.revive.name",
            descriptionKey: "abilityDetails.undyne.undying.options.revive.description",
            types: ["passive", "reaction"],
          },
          {
            id: "damageCap",
            nameKey: "abilityDetails.undyne.undying.options.damageCap.name",
            descriptionKey: "abilityDetails.undyne.undying.options.damageCap.description",
            types: ["passive"],
          },
          {
            id: "offense",
            nameKey: "abilityDetails.undyne.undying.options.offense.name",
            descriptionKey: "abilityDetails.undyne.undying.options.offense.description",
            types: ["passive"],
          },
          {
            id: "drain",
            nameKey: "abilityDetails.undyne.undying.options.drain.name",
            descriptionKey: "abilityDetails.undyne.undying.options.drain.description",
            types: ["passive"],
          },
        ],
      },
    ],
  },
};

function matchesCondition(
  unit: UnitState | undefined,
  condition: Omit<AbilityDisplayCondition, "reasonKey">,
): boolean {
  if (!unit) return false;
  return Boolean(unit[condition.flag]) === (condition.value ?? true);
}

export function getAbilityDisplayDetails(abilityId: string): AbilityDisplayDetails | undefined {
  return detailRegistry[abilityId];
}

export function getAbilityResourceValue(
  details: AbilityDisplayDetails,
  ability: AbilityDisplayAbility,
  unit?: UnitState,
): number | null {
  if (!details.resource) return null;
  if (details.resource.source.kind === "abilityCharges") {
    return ability.currentCharges ?? unit?.charges?.[ability.id] ?? null;
  }
  if (!unit) return null;
  return Math.max(0, unit[details.resource.source.field] ?? 0);
}

export function getAbilityResourceMax(
  details: AbilityDisplayDetails,
  ability: AbilityDisplayAbility,
): number | null {
  return details.resource?.max ?? ability.maxCharges ?? null;
}

export function isAbilityDetailStateActive(
  details: AbilityDisplayDetails,
  unit?: UnitState,
): boolean {
  return details.state ? matchesCondition(unit, details.state.activeWhen) : false;
}

export function isAbilityDisplayOptionActive(
  option: AbilityDisplayOption,
  unit?: UnitState,
): boolean {
  return option.activeWhen ? matchesCondition(unit, option.activeWhen) : false;
}

export function getAbilityDisplayOptionAvailability(
  details: AbilityDisplayDetails,
  option: AbilityDisplayOption,
  ability: AbilityDisplayAbility,
  unit?: UnitState,
): AbilityOptionAvailability {
  if (
    ability.isAvailable === false &&
    ability.id === FRISK_PACIFISM_ID &&
    unit?.friskPacifismDisabled
  ) {
    return { available: false, reasonKey: "abilityDetails.reasons.parentUnavailable" };
  }

  if (isAbilityDisplayOptionActive(option, unit)) {
    return { available: true };
  }

  if (option.requires && !matchesCondition(unit, option.requires)) {
    return { available: false, reasonKey: option.requires.reasonKey };
  }

  const resource = getAbilityResourceValue(details, ability, unit);
  if (
    option.cost?.amount !== null &&
    option.cost?.amount !== undefined &&
    resource !== null &&
    resource < option.cost.amount
  ) {
    return {
      available: false,
      reasonKey: "abilityDetails.reasons.notEnoughResource",
      reasonValues: {
        resource: option.cost.resourceKey,
        amount: option.cost.amount,
      },
    };
  }

  return { available: true };
}

export function isResourceAbilityDetails(details: AbilityDisplayDetails | undefined): boolean {
  return details?.presentation === "resource";
}
