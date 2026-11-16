import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RankEmblem } from "./RankEmblem";
import { RANK_ASSETS, UNCALIBRATED_RANK_ASSET } from "./rankAssets";
import { setLanguage } from "../i18n";
import { CompetitiveIdentity } from "../pages/PlayPage";
import { competitiveRatingFixture } from "./testFixtures";

test("every rank uses its artwork at hero, 64px and 40px sizes with accessible text", () => {
  setLanguage("en", null);
  for (const rank of Object.keys(RANK_ASSETS)) {
    for (const size of ["hero", "medium", "small"] as const) {
      const html = renderToStaticMarkup(<RankEmblem rank={rank} size={size} />);
      assert.match(html, new RegExp(`data-rank="${rank}"`));
      assert.match(html, /<img.*alt="".*width="1254".*height="1254"/);
      assert.match(html, /aria-label=".+ rank emblem"/);
      assert(!html.includes("<svg"));
    }
  }
});

test("localized alt and redundant decorative imagery have appropriate semantics", () => {
  setLanguage("uk", null);
  assert.match(
    renderToStaticMarkup(<RankEmblem rank="BLACK_MOON" />),
    /Емблема рангу «Чорний місяць»/,
  );
  const decorative = renderToStaticMarkup(<RankEmblem rank="BLACK_MOON" decorative />);
  assert.match(decorative, /aria-hidden="true"/);
  assert(!decorative.includes('role="img"'));
  assert(!decorative.includes("aria-label"));
  setLanguage("en", null);
});

test("unknown and unassigned tiers show the uncalibrated emblem, never a rank's artwork", () => {
  setLanguage("en", null);
  for (const rank of [undefined, null, "FUTURE", "__proto__"]) {
    const html = renderToStaticMarkup(<RankEmblem rank={rank} />);
    assert.match(html, /Rank unassigned/);
    assert.match(html, /data-assigned="false"/);
    assert(html.includes(UNCALIBRATED_RANK_ASSET));
    assert(!/(shadow|crescent|half|full|eclipse|blackmoon|nova|destiny)\.png/.test(html));
    assert(!html.includes("data-rank="));
  }
});

test("a calibrating player shows the uncalibrated emblem and name instead of their tier", () => {
  setLanguage("en", null);
  const html = renderToStaticMarkup(<RankEmblem rank="ECLIPSE" calibrating />);
  assert.match(html, /data-calibrating="true"/);
  assert.match(html, /aria-label="Calibrating rank emblem"/);
  assert(html.includes(UNCALIBRATED_RANK_ASSET));
  assert(!html.includes("eclipse.png"), "an early rating never reads as an earned rank");
  setLanguage("uk", null);
  assert.match(renderToStaticMarkup(<RankEmblem rank="ECLIPSE" calibrating />), /Калібрування/);
  setLanguage("en", null);
});

test("Play identity calibrates until the player qualifies, then shows the assigned tier", () => {
  setLanguage("en", null);
  for (const ratedGames of [3, 27]) {
    const qualified = ratedGames >= 7;
    const html = renderToStaticMarkup(
      <CompetitiveIdentity
        rating={competitiveRatingFixture(1678, ratedGames)}
        minRatedGames={7}
        name="Max"
      />,
    );
    assert.equal(html.includes("eclipse.png"), qualified);
    assert.equal(html.includes(">Eclipse<"), qualified);
    assert.equal(html.includes(">Calibrating<"), !qualified);
    assert.equal(html.includes(UNCALIBRATED_RANK_ASSET), !qualified);
    assert.match(html, />1678</);
    assert(!html.includes("shadow.png"));
    assert.equal(html.includes('class="qualification-progress"'), !qualified);
  }
});

test("provisional/qualified identities never infer a rank from any numeric rating", () => {
  setLanguage("en", null);
  for (const ratedGames of [0, 27]) {
    for (const rank of ["FUTURE", "__proto__"]) {
      const html = renderToStaticMarkup(
        <CompetitiveIdentity
          rating={{ ...competitiveRatingFixture(2400, ratedGames), rankTier: rank }}
          minRatedGames={7}
          name="Max"
        />,
      );
      assert.match(html, /data-assigned="false"/);
      assert.match(html, ratedGames < 7 ? />Calibrating</ : /Rank unassigned/);
      assert(html.includes(UNCALIBRATED_RANK_ASSET));
      assert(!html.includes("Shadow"));
    }
  }
});
