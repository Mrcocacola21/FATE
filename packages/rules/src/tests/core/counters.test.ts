import {
  ABILITY_BERSERK_AUTO_DEFENSE,
  ABILITY_CHIKATILO_DECOY,
  ABILITY_FRISK_GENOCIDE,
  ABILITY_FRISK_PACIFISM,
  ABILITY_LOKI_LAUGHT,
  addCharges,
  getChargeLimit,
  getCharges,
  isUnboundedChargeCounter,
  setCharges,
} from "../../abilities";
import {
  addMettatonRating,
  getMettatonRating,
  setMettatonRating,
} from "../../mettaton";
import {
  assert,
  attachArmy,
  createDefaultArmy,
  createEmptyGame,
  HERO_CHIKATILO_ID,
  HERO_FRISK_ID,
  HERO_LOKI_ID,
  HERO_METTATON_ID,
  UnitState,
} from "../helpers/testUtils";

function getHeroUnit(heroId: string): UnitState {
  const selection =
    heroId === HERO_FRISK_ID
      ? { assassin: HERO_FRISK_ID }
      : heroId === HERO_CHIKATILO_ID
      ? { assassin: HERO_CHIKATILO_ID }
      : heroId === HERO_LOKI_ID
      ? { trickster: HERO_LOKI_ID }
      : heroId === HERO_METTATON_ID
      ? { archer: HERO_METTATON_ID }
      : undefined;
  let state = createEmptyGame();
  state = attachArmy(state, createDefaultArmy("P1", selection));
  const unit = Object.values(state.units).find((item) => item.heroId === heroId);
  assert(unit, `expected hero unit ${heroId}`);
  return unit;
}

export function testUnboundedCountersExceedCommonChargeLimits() {
  let frisk = getHeroUnit(HERO_FRISK_ID);
  frisk = addCharges(frisk, ABILITY_FRISK_PACIFISM, 8);
  frisk = addCharges(frisk, ABILITY_FRISK_GENOCIDE, 12);

  let loki = getHeroUnit(HERO_LOKI_ID);
  loki = addCharges(loki, ABILITY_LOKI_LAUGHT, 16);

  let mettaton = getHeroUnit(HERO_METTATON_ID);
  mettaton = setMettatonRating(mettaton, 9);
  const rated = addMettatonRating(mettaton, 6).unit;

  assert.strictEqual(getChargeLimit(ABILITY_FRISK_PACIFISM), null);
  assert.strictEqual(getChargeLimit(ABILITY_FRISK_GENOCIDE), null);
  assert.strictEqual(getChargeLimit(ABILITY_LOKI_LAUGHT), null);
  assert(isUnboundedChargeCounter(ABILITY_FRISK_PACIFISM));
  assert(isUnboundedChargeCounter(ABILITY_FRISK_GENOCIDE));
  assert(isUnboundedChargeCounter(ABILITY_LOKI_LAUGHT));
  assert.strictEqual(getCharges(frisk, ABILITY_FRISK_PACIFISM), 8);
  assert.strictEqual(getCharges(frisk, ABILITY_FRISK_GENOCIDE), 12);
  assert.strictEqual(getCharges(loki, ABILITY_LOKI_LAUGHT), 16);
  assert.strictEqual(getMettatonRating(rated), 15);

  console.log("unbounded_counters_exceed_common_charge_limits passed");
}

export function testBoundedCountersStillClamp() {
  let berserker = getHeroUnit(HERO_FRISK_ID);
  berserker = setCharges(berserker, ABILITY_BERSERK_AUTO_DEFENSE, 99);
  berserker = addCharges(berserker, ABILITY_BERSERK_AUTO_DEFENSE, 99);

  let chikatilo = getHeroUnit(HERO_CHIKATILO_ID);
  chikatilo = setCharges(chikatilo, ABILITY_CHIKATILO_DECOY, 99);
  chikatilo = addCharges(chikatilo, ABILITY_CHIKATILO_DECOY, 99);

  assert.strictEqual(getChargeLimit(ABILITY_BERSERK_AUTO_DEFENSE), 6);
  assert.strictEqual(getCharges(berserker, ABILITY_BERSERK_AUTO_DEFENSE), 6);
  assert.strictEqual(getChargeLimit(ABILITY_CHIKATILO_DECOY), 6);
  assert.strictEqual(getCharges(chikatilo, ABILITY_CHIKATILO_DECOY), 6);
  assert(!isUnboundedChargeCounter(ABILITY_CHIKATILO_DECOY));

  console.log("bounded_counters_still_clamp passed");
}
