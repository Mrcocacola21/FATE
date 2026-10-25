import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import type { PlayerView, ProjectedGameEvent } from "rules";
import {
  LANGUAGE_STORAGE_KEY,
  en,
  getLanguage,
  localeKeys,
  resolveInitialLanguage,
  setLanguage,
  subscribeLanguage,
  translate,
  uk,
  localeRegistry,
  locales,
  getLocaleText,
  normalizeLanguage,
  translateForLanguage,
} from ".";
import { formatEventMessage } from "./eventMessages";
import { getUnitFigureDisplayName } from "./displayMetadata";

test("saved language wins, then supported browser language, then English", () => {
  assert.equal(resolveInitialLanguage({ getItem: () => "en" }, "uk-UA"), "en");
  assert.equal(resolveInitialLanguage({ getItem: () => null }, "uk-UA"), "uk");
  assert.equal(resolveInitialLanguage({ getItem: () => null }, "pl-PL"), "pl");
  assert.equal(resolveInitialLanguage({ getItem: () => "invalid" }, "it-IT"), "en");
  assert.equal(
    resolveInitialLanguage(
      {
        getItem: () => {
          throw new Error("disabled");
        },
      },
      "he-IL",
    ),
    "he",
  );
});

test("regional tags normalize without selecting Simplified Chinese for Traditional Chinese", () => {
  for (const [input, expected] of Object.entries({
    pt_br: "pt-BR",
    pt: "pt-BR",
    "zh-Hans": "zh-CN",
    "zh-SG": "zh-CN",
    "he-IL": "he",
    iw: "he",
    "tr-TR": "tr",
  })) {
    assert.equal(normalizeLanguage(input), expected);
  }
  for (const input of ["zh-TW", "zh-Hant", "zh-HK", "ru", "it", "<script>"])
    assert.equal(normalizeLanguage(input), undefined);
});

test("every registered language persists and restores", () => {
  const original = getLanguage();
  try {
    for (const locale of localeRegistry) {
      let saved = "";
      setLanguage(locale.code, {
        setItem: (_key, value) => {
          saved = value;
        },
      });
      assert.equal(saved, locale.code);
      assert.equal(resolveInitialLanguage({ getItem: () => saved }, "en"), locale.code);
      assert.equal(translate("common.cancel"), translateForLanguage(locale.code, "common.cancel"));
    }
    assert.doesNotThrow(() =>
      setLanguage("he", {
        setItem: () => {
          throw new Error("disabled");
        },
      }),
    );
  } finally {
    setLanguage(original, null);
  }
});

test("HTML language and direction update on Hebrew entry, reload synchronization, and exit", () => {
  const original = getLanguage();
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const root = { lang: "", dir: "" };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: root },
  });
  try {
    setLanguage("he", null);
    assert.deepEqual(root, { lang: "he", dir: "rtl" });
    root.dir = "ltr";
    setLanguage("he", null);
    assert.equal(root.dir, "rtl");
    setLanguage("de", null);
    assert.deepEqual(root, { lang: "de", dir: "ltr" });
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "document", descriptor);
    else Reflect.deleteProperty(globalThis, "document");
    setLanguage(original, null);
  }
});

const pluralSuffix = /_(zero|one|two|few|many|other)$/;
function placeholders(value: string) {
  return (value.match(/\{\{\w+\}\}/g) ?? []).sort();
}

for (const locale of localeRegistry) {
  test(`${locale.code}: complete nonempty resources, placeholders, and plural categories`, () => {
    const keys = localeKeys(locales[locale.code]);
    const canonical = localeKeys(en);
    const actual = new Set(keys.map((key) => key.replace(pluralSuffix, "")));
    const expected = new Set(canonical.map((key) => key.replace(pluralSuffix, "")));
    assert.deepEqual(
      {
        missing: [...expected].filter((key) => !actual.has(key)),
        unexpected: [...actual].filter((key) => !expected.has(key)),
      },
      { missing: [], unexpected: [] },
    );
    for (const key of canonical) {
      const value = getLocaleText(locale.code, key);
      assert.ok(value?.trim(), `${locale.code}: empty or missing ${key}`);
      assert.doesNotMatch(value!, /\?{3,}|\uFFFD/, `${locale.code}: ${key} has damaged encoding`);
      const source = getLocaleText("en", key)!;
      assert.ok(
        !value!.includes("\n") || source.includes("\n"),
        `${locale.code}: ${key} contains unrelated lines`,
      );
      assert.equal(
        /\[\d{3,5}\]/.test(value!),
        /\[\d{3,5}\]/.test(source),
        `${locale.code}: ${key} contains an import marker`,
      );
      assert.deepEqual(
        placeholders(value!),
        placeholders(getLocaleText("en", key)!),
        `${locale.code}: ${key} placeholders`,
      );
    }
    const bases = [
      ...new Set(
        canonical
          .filter((key) => pluralSuffix.test(key))
          .map((key) => key.replace(pluralSuffix, "")),
      ),
    ];
    for (const base of bases) {
      for (const category of new Intl.PluralRules(locale.code).resolvedOptions().pluralCategories) {
        const key = `${base}_${category}`;
        const value = getLocaleText(locale.code, key);
        assert.ok(value?.trim(), `${locale.code}: missing plural form ${key}`);
        assert.deepEqual(placeholders(value!), placeholders(getLocaleText("en", `${base}_other`)!));
      }
      for (const count of [0, 1, 2, 3, 5, 11, 21, 101, 1.5]) {
        assert.doesNotMatch(
          translateForLanguage(locale.code, base, { count }),
          /\{\{|_other|_few|_many/,
        );
      }
    }
  });
}

test("unknown keys have a safe deterministic fallback", () => {
  assert.equal(translateForLanguage("he", "unknown.future.key"), "unknown.future.key");
  const resource = locales.he;
  const existing = resource.common;
  try {
    resource.common = {};
    assert.equal(translateForLanguage("he", "common.cancel"), en.common.cancel);
  } finally {
    resource.common = existing;
  }
});

test("language switch persists and notifies subscribers without reload", () => {
  const original = getLanguage();
  const next = original === "en" ? "uk" : "en";
  const writes: Array<[string, string]> = [];
  let notifications = 0;
  const unsubscribe = subscribeLanguage(() => {
    notifications += 1;
  });

  setLanguage(next, {
    setItem: (key, value) => writes.push([key, value]),
  });

  assert.equal(getLanguage(), next);
  assert.deepEqual(writes, [[LANGUAGE_STORAGE_KEY, next]]);
  assert.equal(notifications, 1);

  unsubscribe();
  setLanguage(original, { setItem: () => undefined });
});

test("English and Ukrainian locale trees have identical keys", () => {
  assert.deepEqual(localeKeys(uk).sort(), localeKeys(en).sort());
});

test("event formatter localizes known and unknown events safely", () => {
  const event = {
    type: "unitMoved",
    unitId: "P1-rider-1",
  } as ProjectedGameEvent;

  setLanguage("en", { setItem: () => undefined });
  assert.match(formatEventMessage(event, "en", translate), /Unit moved/);

  setLanguage("uk", { setItem: () => undefined });
  assert.match(formatEventMessage(event, "uk", translate), /Фігуру переміщено/);

  const unknown = { type: "futureEvent", secret: "must-not-leak" } as unknown as ProjectedGameEvent;
  assert.equal(formatEventMessage(unknown, "uk", translate), "Невідома подія");
  assert.doesNotMatch(formatEventMessage(unknown, "uk", translate), /secret|futureEvent/);

  const redactedAbility = { type: "abilityUsed" } as ProjectedGameEvent;
  assert.equal(formatEventMessage(redactedAbility, "en", translate), "Hidden ability used.");
  assert.equal(
    formatEventMessage(
      {
        type: "abilityUsed",
        unitId: "griffith",
        abilityId: "griffithFemtoRebirth",
      } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "Griffith was reborn as Femto.",
  );
  assert.equal(
    formatEventMessage(
      { type: "abilityUsed", unitId: "guts", abilityId: "gutsBerserkMode" } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "guts entered Berserk Mode.",
  );
  assert.equal(
    formatEventMessage(
      { type: "abilityUsed", unitId: "guts", abilityId: "gutsExitBerserk" } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "guts exited Berserk Mode.",
  );
  assert.equal(
    formatEventMessage(
      { type: "abilityUsed", unitId: "mettaton", abilityId: "mettatonEx" } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "mettaton transformed into Mettaton EX.",
  );
  assert.equal(
    formatEventMessage(
      { type: "abilityUsed", unitId: "mettaton", abilityId: "mettatonNeo" } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "mettaton transformed into Mettaton NEO.",
  );

  const redactedMark = { type: "chikatiloMarkApplied" } as ProjectedGameEvent;
  assert.equal(formatEventMessage(redactedMark, "en", translate), "Killer's Mark was applied.");

  const fullMark = {
    type: "chikatiloMarkApplied",
    chikatiloId: "chikatilo",
    targetId: "hidden-target",
    ownerPlayerId: "P1",
    trackingStarts: "startOfChikatiloTurn",
    trackingExpires: "afterMarkedUnitTurn",
  } as ProjectedGameEvent;
  assert.match(formatEventMessage(fullMark, "en", translate), /hidden-target/);
  assert.match(formatEventMessage(fullMark, "en", translate), /turn start/);

  assert.equal(
    formatEventMessage(
      {
        type: "unitTransformed",
        unitId: "griffith",
        fromHeroId: "griffith",
        toHeroId: "femto",
        reason: "griffithFemtoRebirth",
        abilityId: "griffithFemtoRebirth",
      } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "Griffith was reborn as Femto.",
  );
  assert.equal(
    formatEventMessage(
      {
        type: "unitTransformed",
        unitId: "mettaton",
        fromHeroId: "mettaton",
        toHeroId: "mettaton",
        toFormId: "mettatonNeo",
        reason: "mettatonThreshold",
        abilityId: "mettatonNeo",
        rating: 10,
        ratingSpent: false,
      } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "Mettaton reached the Rating threshold and transformed into Mettaton NEO. Rating was not spent.",
  );
  assert.equal(
    formatEventMessage(
      {
        type: "lokiChickenGroupApplied",
        lokiId: "loki",
        targetIds: ["Papyrus", "Frisk", "Undyne", "Asgore"],
        abilityId: "lokiLaught",
      } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "Loki's Good Joke turned 4 units into chickens: Papyrus, Frisk, Undyne, and Asgore.",
  );
  assert.equal(
    formatEventMessage(
      {
        type: "searchStealth",
        unitId: "Frisk",
        mode: "move",
        rolls: [{ targetId: "Chikatilo", roll: 5, success: true }],
      } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "Frisk used Movement to Search and revealed Chikatilo.",
  );
  assert.equal(
    formatEventMessage(
      {
        type: "riverBoatResolved",
        riverId: "river",
        passengerId: "Papyrus",
        riverDestination: { col: 4, row: 4 },
        dropDestination: { col: 4, row: 5 },
      } as ProjectedGameEvent,
      "en",
      translate,
    ),
    "River Person transported Papyrus to 4:5.",
  );

  setLanguage("en", { setItem: () => undefined });
});

test("event formatter names figures in previously unknown hero and roll events", () => {
  const heroIds = {
    "P1-kaneki-1": "kaneki",
    "P1-frisk-1": "frisk",
    "P1-loki-1": "loki",
    "P1-grozny-1": "grozny",
    "P1-duolingo-1": "duolingo",
    "P1-guts-1": "guts",
    "P1-don-1": "donKihote",
    "P1-jack-1": "jackRipper",
    "P1-river-1": "riverPerson",
    "P2-genghis-1": "genghisKhan",
    "P2-lechy-1": "lechy",
  } as const;
  const units = Object.fromEntries(
    Object.entries(heroIds).map(([id, heroId]) => [
      id,
      { id, owner: id.slice(0, 2), class: "knight", heroId, figureId: heroId },
    ]),
  ) as unknown as PlayerView["rosterUnits"];
  const cell = { col: 3, row: 2 };
  const events = [
    { type: "rollResolved", rollId: "r1", rollKind: "enterStealth", rollerPlayerId: "P1", unitId: "P1-loki-1", rollIndex: 0, dice: [5], sides: 6, total: 5 },
    { type: "pendingRollUnhandled", rollId: "r2", kind: "enterStealth", player: "P1" },
    { type: "reactionMovementEnded", source: "genghis", controllerUnitId: "P2-genghis-1", reason: "completed" },
    { type: "reactionMovementEnded", source: "tralala", controllerUnitId: "P1-river-1", reason: "cancelled" },
    { type: "riverBoatPickup", riverId: "P1-river-1", passengerId: "P1-guts-1", sourceCell: cell, passengerCell: cell },
    { type: "riverBoatDisembarked", riverId: "P1-river-1", passengerId: "P1-guts-1", riverDestination: cell, dropDestination: cell },
    { type: "riverStormWard", unitId: "P1-river-1", turnNumber: 3 },
    { type: "snarePlaced", owner: "P1", sourceUnitId: "P1-jack-1", cell },
    { type: "snareTriggered", unitId: "P2-lechy-1", cell, immobilized: true },
    { type: "forestMovementStopped", unitId: "P1-guts-1" },
    { type: "heroSelfCost", unitId: "P1-guts-1", sourceAbilityId: "gutsBerserkMode", damage: 1, hpAfter: 4 },
    { type: "groznyTyrantRewarded", unitId: "P1-grozny-1" },
    { type: "duolingoBerserkerUnlocked", unitId: "P1-duolingo-1" },
    { type: "kanekiFormEntered", unitId: "P1-kaneki-1", form: "scolopendra" },
    { type: "friskOnePathUnlocked", unitId: "P1-frisk-1" },
    { type: "friskFriendshipWon", unitId: "P1-frisk-1" },
    { type: "lokiSpinCommitted", unitId: "P1-loki-1" },
    { type: "lokiGreatJokeCommitted", unitId: "P1-loki-1", radius: 2 },
    { type: "unitDeathFinalized", unitId: "P1-don-1" },
  ] as ProjectedGameEvent[];

  for (const language of ["en", "uk"] as const) {
    setLanguage(language, { setItem: () => undefined });
    const unknown = translate("log.unknownEvent");
    for (const event of events) {
      const message = formatEventMessage(event, language, translate, units);
      assert.notEqual(message, unknown, `${event.type} (${language})`);
      assert.doesNotMatch(message, /P[12]-[a-z]+-1|\{\{/, `${event.type} (${language}): ${message}`);
      for (const id of Object.keys(heroIds)) {
        if (Object.values(event).includes(id)) {
          const name = getUnitFigureDisplayName(units[id], { language, t: translate });
          assert.ok(message.includes(name), `${event.type} (${language}) names ${name}: ${message}`);
        }
      }
    }
  }

  setLanguage("en", { setItem: () => undefined });
  assert.equal(
    formatEventMessage(events[5], "en", translate, units),
    `${getUnitFigureDisplayName(units["P1-guts-1"], { language: "en", t: translate })} disembarked from ${getUnitFigureDisplayName(units["P1-river-1"], { language: "en", t: translate })}'s boat at 3:2.`,
  );
  assert.match(formatEventMessage(events[0], "en", translate, units), /: \(5\) = 5$/);
});

test("web components do not introduce direct English JSX labels", () => {
  const srcRoot = path.resolve("src");
  const files: string[] = [];
  const walk = (directory: string) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== "i18n") walk(fullPath);
      } else if (entry.name.endsWith(".tsx")) {
        files.push(fullPath);
      }
    }
  };
  walk(srcRoot);

  // Board status codes have localized titles/aria labels; the short codes stay fixed.
  const allowedText = new Set(["P1", "P2", "B", "BL", "S", "F", "F2", "R", "X"]);
  const violations: string[] = [];
  for (const file of files) {
    const sourceText = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const visit = (node: ts.Node) => {
      if (ts.isJsxText(node)) {
        const text = node.text.replace(/\s+/g, " ").trim();
        if (
          text &&
          /[A-Za-z]{2,}/.test(text) &&
          !allowedText.has(text) &&
          !/^\(?P[12]\)?$/.test(text)
        ) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          violations.push(`${path.relative(srcRoot, file)}:${line}: ${text}`);
        }
      }
      if (
        ts.isJsxAttribute(node) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        ts.isIdentifier(node.name) &&
        ["aria-label", "placeholder", "title", "alt"].includes(node.name.text)
      ) {
        const text = node.initializer.text.trim();
        if (/[A-Za-z]{2,}/.test(text)) {
          const line = source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;
          violations.push(`${path.relative(srcRoot, file)}:${line}: ${node.name.text}="${text}"`);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }

  assert.deepEqual(violations, []);
});
