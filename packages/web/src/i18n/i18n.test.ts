import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import ts from "typescript";
import type { GameEvent } from "rules";
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
} from ".";
import { formatEventMessage } from "./eventMessages";

test("saved language wins, then Ukrainian browser language, then English", () => {
  assert.equal(
    resolveInitialLanguage({ getItem: () => "en" }, "uk-UA"),
    "en",
  );
  assert.equal(resolveInitialLanguage({ getItem: () => null }, "uk-UA"), "uk");
  assert.equal(resolveInitialLanguage({ getItem: () => null }, "pl-PL"), "en");
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
  } as GameEvent;

  setLanguage("en", { setItem: () => undefined });
  assert.match(formatEventMessage(event, "en", translate), /Unit moved/);

  setLanguage("uk", { setItem: () => undefined });
  assert.match(formatEventMessage(event, "uk", translate), /Фігуру переміщено/);

  const unknown = { type: "futureEvent", secret: "must-not-leak" } as unknown as GameEvent;
  assert.equal(formatEventMessage(unknown, "uk", translate), "Невідома подія");
  assert.doesNotMatch(formatEventMessage(unknown, "uk", translate), /secret|futureEvent/);

  setLanguage("en", { setItem: () => undefined });
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

  const allowedText = new Set(["P1", "P2", "B", "S", "F", "F2", "R", "X"]);
  const violations: string[] = [];
  for (const file of files) {
    const sourceText = fs.readFileSync(file, "utf8");
    const source = ts.createSourceFile(file, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
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
