import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { AbilityView, UnitState } from "rules";
import { setLanguage } from "../i18n";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { FigureSetAbilityCard } from "../components/abilities/FigureSetAbilityCard";
import { AbilityDetails } from "../components/abilities/AbilityDetails";
import {
  ASGORE_SOUL_PARADE_ID,
  FRISK_GENOCIDE_ID,
  FRISK_PACIFISM_ID,
  LOKI_LAUGHT_ID,
} from "../rulesHints";
import {
  getAbilityDisplayDetails,
  getAbilityDisplayOptionAvailability,
} from "./abilityDisplayDetails";

function makeUnit(charges: Record<string, number>): UnitState {
  return {
    id: "P1-assassin-1",
    owner: "P1",
    class: "assassin",
    heroId: "frisk",
    hp: 5,
    attack: 2,
    position: { col: 1, row: 1 },
    isStealthed: false,
    stealthTurnsLeft: 0,
    stealthAttemptedThisTurn: false,
    turn: {
      moveUsed: false,
      attackUsed: false,
      actionUsed: false,
      stealthUsed: false,
    },
    charges,
    cooldowns: {},
    hasMovedThisTurn: false,
    hasAttackedThisTurn: false,
    hasActedThisTurn: false,
    isAlive: true,
  };
}

function makeAbility(id: string, currentCharges: number, maxCharges: number): AbilityView {
  return {
    id,
    name: id,
    kind: "phantasm",
    description: id,
    slot: "none",
    chargeRequired: 0,
    maxCharges,
    currentCharges,
    isAvailable: true,
  };
}

test("Frisk display metadata lists every Pacifism and Genocide option", () => {
  const pacifism = getAbilityDisplayDetails(FRISK_PACIFISM_ID);
  const genocide = getAbilityDisplayDetails(FRISK_GENOCIDE_ID);

  assert(pacifism);
  assert(genocide);
  assert.deepEqual(
    pacifism.sections?.[0]?.options.map((option) => option.id),
    ["hugs", "childsCry", "warmWords", "powerOfFriendship"],
  );
  assert.deepEqual(
    pacifism.sections?.[0]?.options.map((option) => option.cost?.amount),
    [3, 5, 10, null],
  );
  assert.deepEqual(
    genocide.sections?.[0]?.options.map((option) => option.id),
    ["substitution", "keenEye", "precisionStrike"],
  );
  assert.deepEqual(
    genocide.sections?.[0]?.options.map((option) => option.cost?.amount),
    [3, 5, 10],
  );
});

test("Loki Laughter display metadata contains all option costs", () => {
  const details = getAbilityDisplayDetails(LOKI_LAUGHT_ID);
  assert(details);
  assert.deepEqual(
    details.sections?.[0]?.options.map((option) => [option.id, option.cost?.amount]),
    [
      ["againSomeNonsense", 3],
      ["chicken", 5],
      ["mindControl", 10],
      ["spinTheDrum", 12],
      ["greatLokiJoke", 15],
    ],
  );
});

test("Asgore Soul Parade display metadata contains all six numbered outcomes", () => {
  const details = getAbilityDisplayDetails(ASGORE_SOUL_PARADE_ID);
  assert(details);
  assert.deepEqual(
    details.sections?.[0]?.options.map((option) => [option.id, option.roll]),
    [
      ["patience", 1],
      ["bravery", 2],
      ["integrity", 3],
      ["perseverance", 4],
      ["kindness", 5],
      ["justice", 6],
    ],
  );
});

test("resource option availability follows the projected current counter", () => {
  const details = getAbilityDisplayDetails(FRISK_PACIFISM_ID);
  assert(details);
  const ability = makeAbility(FRISK_PACIFISM_ID, 4, 30);
  const unit = makeUnit({ [FRISK_PACIFISM_ID]: 4 });
  const options = details.sections?.[0]?.options ?? [];

  assert.equal(
    getAbilityDisplayOptionAvailability(details, options[0], ability, unit).available,
    true,
  );
  assert.equal(
    getAbilityDisplayOptionAvailability(details, options[1], ability, unit).available,
    false,
  );
  assert.equal(
    getAbilityDisplayOptionAvailability(details, options[3], ability, unit).available,
    true,
  );
});

test("nested ability details render in English and Ukrainian", () => {
  const details = getAbilityDisplayDetails(FRISK_PACIFISM_ID);
  assert(details);
  const ability = makeAbility(FRISK_PACIFISM_ID, 5, 30);
  const unit = makeUnit({ [FRISK_PACIFISM_ID]: 5 });

  setLanguage("en", { setItem: () => undefined });
  const english = renderToStaticMarkup(
    <AbilityDetails ability={ability} details={details} unit={unit} />,
  );
  assert.match(english, /Hugs/);
  assert.match(english, /Child’s Cry/);
  assert.match(english, /5<span/);

  setLanguage("uk", { setItem: () => undefined });
  const ukrainian = renderToStaticMarkup(
    <AbilityDetails ability={ability} details={details} unit={unit} />,
  );
  assert.match(ukrainian, /Обійми/);
  assert.match(ukrainian, /Плач дитини/);

  setLanguage("en", { setItem: () => undefined });
});

test("Figure Set ability cards reuse structured read-only details", () => {
  setLanguage("en", { setItem: () => undefined });
  const markup = renderToStaticMarkup(
    <FigureSetAbilityCard
      ability={{
        id: FRISK_PACIFISM_ID,
        name: "Pacifism",
        type: "phantasm",
        description: "legacy summary",
        chargeRequired: 0,
      }}
    />,
  );

  assert.match(markup, /Gain Pacifism points whenever an attack against Frisk misses/);
  assert.match(markup, /Pacifism points capacity/);
  assert.match(markup, />30</);
  assert.match(markup, /Hugs/);
  assert.match(markup, /Power of Friendship/);
  assert.doesNotMatch(markup, /legacy summary/);
  assert.doesNotMatch(markup, /Charge: 0/);
});

test("language switcher displays EN and UA while retaining the uk locale", () => {
  setLanguage("uk", { setItem: () => undefined });
  const markup = renderToStaticMarkup(<LanguageSwitcher />);

  assert.match(markup, />EN</);
  assert.match(markup, />UA</);
  assert.doesNotMatch(markup, />UK</);
  assert.match(markup, /aria-pressed="true"[^>]*>UA</);

  setLanguage("en", { setItem: () => undefined });
});
