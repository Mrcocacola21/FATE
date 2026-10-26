import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ProfileRanks, bestRankedMode, useProfileRanks } from "./ProfileRank";
import { competitiveApi } from "../play/api";
import { competitiveRatingFixture } from "../ranks/testFixtures";
import { setLanguage } from "../i18n";

function Ranks({ userId }: { userId: string }) {
  return <ProfileRanks resource={useProfileRanks(userId)} mode="draft" onModeChange={() => {}} />;
}

test("profile shows a rank card per mode with calibration and safely changes identity", async () => {
  setLanguage("en", null);
  const rating = competitiveApi.ratings,
    config = competitiveApi.config;
  competitiveApi.ratings = async (id) => ({
    standard: competitiveRatingFixture(id === "first" ? 1500 : 2150, 2),
    draft: competitiveRatingFixture(900, 2),
    classic: competitiveRatingFixture(2010, 5),
  });
  competitiveApi.config = async () => 5;
  let renderer!: ReactTestRenderer;
  try {
    await act(async () => {
      renderer = create(<Ranks userId="first" />);
    });
    const card = (mode: string) => {
      const output = JSON.stringify(renderer.toJSON());
      const start = output.indexOf(`"data-testid":"profile-rank-${mode}"`);
      assert.notEqual(start, -1);
      const next = output.indexOf(`"data-testid":"profile-rank-`, start + 1);
      return output.slice(start, next === -1 ? undefined : next);
    };
    assert.match(card("standard"), /full\.png/);
    assert.match(card("standard"), /Provisional/);
    assert.deepEqual(
      renderer.root.findAllByType("bdi").map((node) => node.children.join("")),
      ["2 / 5", "2 / 5"],
    );
    assert.match(card("draft"), /half\.png/);
    assert.match(card("draft"), /900/);
    assert.match(card("classic"), /destiny\.png/);
    assert.match(card("classic"), /5 rated games/);
    assert.doesNotMatch(card("classic"), /Provisional/);
    assert.match(card("draft"), /"data-selected":true/);
    assert.match(card("standard"), /"data-selected":false/);
    await act(async () => renderer.update(<Ranks userId="second" />));
    assert.match(card("standard"), /destiny\.png/);
    assert.match(card("standard"), /2150/);
    assert(!JSON.stringify(renderer.toJSON()).includes("full.png"));
  } finally {
    act(() => renderer?.unmount());
    competitiveApi.ratings = rating;
    competitiveApi.config = config;
  }
});

test("header kicker uses the highest-rated mode", () => {
  assert.equal(
    bestRankedMode({
      standard: competitiveRatingFixture(1500, 2),
      draft: competitiveRatingFixture(1900, 9),
      classic: competitiveRatingFixture(1700, 9),
    }),
    "draft",
  );
  assert.equal(
    bestRankedMode({
      standard: competitiveRatingFixture(1500, 2),
      draft: competitiveRatingFixture(1900, 0),
      classic: competitiveRatingFixture(1400, 3),
    }),
    "standard",
  );
  assert.equal(
    bestRankedMode({
      standard: competitiveRatingFixture(1500, 0),
      draft: competitiveRatingFixture(1500, 0),
      classic: competitiveRatingFixture(1500, 0),
    }),
    null,
  );
});
