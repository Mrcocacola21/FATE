import assert from "node:assert/strict";
import test from "node:test";
import { bookSections, roman, sheetPlace } from "./GrimoireSheet";
import { riffleBetween, turnDirection } from "./pageTurn";

test("chapters are numbered in menu order with roman numerals; the profile comes last", () => {
  assert.deepEqual(
    ["/", "/lobby", "/figures", "/matches", "/friends", "/leaderboard", "/profile"].map((path) =>
      roman(sheetPlace(path)!.chapter),
    ),
    ["I", "II", "III", "IV", "V", "VI", "VII"],
  );
  assert.deepEqual(sheetPlace("/matches/abc"), {
    chapter: 4,
    sectionTitle: "matches.history",
    path: "/matches",
  });
  assert.deepEqual(sheetPlace("/users/Ann"), {
    chapter: 7,
    sectionTitle: "profile.title",
    path: "/profile",
  });
  assert.equal(sheetPlace("/admin"), null);
  assert.equal(roman(9), "IX");
  assert.equal(roman(14), "XIV");
});

test("the profile is a chapter like any other: going to it and back riffles the chapters", () => {
  const index = (path: string) => sheetPlace(path)!.chapter - 1;
  assert.equal(bookSections()[index("/profile")].to, "/profile");
  // Play (I) to the profile (VII) turns forward through the last chapters before it.
  assert.equal(turnDirection(index("/"), index("/profile")), "forward");
  assert.deepEqual(
    riffleBetween(index("/"), index("/profile")).map((i) => bookSections()[i].to),
    ["/matches", "/friends", "/leaderboard"],
  );
  // And back from the profile to the lobby (II) turns back through them.
  assert.equal(turnDirection(index("/profile"), index("/lobby")), "backward");
  assert.deepEqual(
    riffleBetween(index("/profile"), index("/lobby")).map((i) => bookSections()[i].to),
    ["/friends", "/matches", "/figures"],
  );
});
