import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CompetitiveIdentity } from "../pages/PlayPage";
import { parseCompetitiveRating, createCompetitiveApi } from "../play/api";
import { createApiClient } from "../api/client";
import { formatCompetitiveRating } from "./rankProgress";
import { competitiveRatingFixture } from "./testFixtures";
import { setLanguage } from "../i18n";

test("provisional Full at 1200 or initial 1500 keeps its real medal and qualification", () => {
  setLanguage("en", null);
  for (const rating of [1200, 1500]) {
    const html = renderToStaticMarkup(
      <CompetitiveIdentity
        rating={competitiveRatingFixture(rating, 2)}
        minRatedGames={5}
        name="Max"
      />,
    );
    assert.match(html, /full\.png/);
    assert.match(html, />Full</);
    assert.match(html, /Provisional/);
    assert.match(html, /2 \/ 5/);
    assert.match(html, /class="qualification-progress"/);
    assert(!html.includes("Rank unassigned"));
  }
});

test("Play Black Moon starts at precisely 1750 and consumes backend progress unchanged", () => {
  setLanguage("en", null);
  const rating = competitiveRatingFixture(1750, 27);
  rating.rankProgress.progress = 0.42; // UI must use the wire value, not derive it from rating.
  const html = renderToStaticMarkup(
    <CompetitiveIdentity rating={rating} minRatedGames={5} name="Max" />,
  );
  assert.match(html, /blackmoon\.png/);
  assert.match(html, />Black Moon</);
  assert.match(html, />1750</);
  assert.match(html, /value="0.42"/);
  assert.match(html, /100 rating to Nova/);
  assert(!html.includes("eclipse.png"));
});

test("Shadow has distance only, Destiny has Max Rank and uncapped rating", () => {
  setLanguage("en", null);
  const shadow = renderToStaticMarkup(
    <CompetitiveIdentity rating={competitiveRatingFixture(100, 27)} minRatedGames={5} name="Max" />,
  );
  assert.match(shadow, /250 rating to Crescent/);
  assert(!shadow.includes("<progress"));
  const destiny = renderToStaticMarkup(
    <CompetitiveIdentity
      rating={competitiveRatingFixture(2150, 27)}
      minRatedGames={5}
      name="Max"
    />,
  );
  assert.match(destiny, /destiny\.png/);
  assert.match(destiny, /Max rank/);
  assert.match(destiny, />2150</);
  assert(!destiny.includes("<progress"));
  assert(!destiny.includes("rating to"));
});

test("integer floor cannot visually cross a tier threshold; distance rounds up", () => {
  setLanguage("en", null);
  assert.equal(formatCompetitiveRating(1999.7), 1999);
  assert.equal(formatCompetitiveRating(-0.3), -1);
  const html = renderToStaticMarkup(
    <CompetitiveIdentity
      rating={competitiveRatingFixture(1999.7, 27)}
      minRatedGames={5}
      name="Max"
    />,
  );
  assert.match(html, /nova\.png/);
  assert.match(html, />1999</);
  assert.match(html, /1 rating to Destiny/);
});

test("rating decoder preserves precise rank data, rejects corrupt/missing state, retains future tier safely", () => {
  const rating = competitiveRatingFixture(1678.42, 24);
  assert.deepEqual(parseCompetitiveRating(rating), rating);
  assert.equal(parseCompetitiveRating({ ...rating, rankTier: "FUTURE" }).rankTier, "FUTURE");
  for (const patch of [
    { rating: NaN },
    { rating: Infinity },
    { rankTier: null },
    { rankTier: undefined },
    { rankProgress: null },
    { rankProgress: { ...rating.rankProgress, progress: 1.1 } },
    { rankProgress: { ...rating.rankProgress, ratingToNext: -1 } },
    { rankProgress: { ...rating.rankProgress, isMaxRank: true } },
  ])
    assert.throws(() => parseCompetitiveRating({ ...rating, ...patch }), /INVALID_RESPONSE/);
});

test("public profile rating/config reads need no authenticated session or bearer token", async () => {
  const requested: string[] = [];
  const api = createCompetitiveApi(
    createApiClient("http://localhost", async (url, init) => {
      requested.push(String(url));
      assert.equal(new Headers(init?.headers).has("Authorization"), false);
      return new Response(
        JSON.stringify(
          String(url).endsWith("/config")
            ? { minRatedGames: 5 }
            : competitiveRatingFixture(1500, 2),
        ),
      );
    }),
  );
  assert.equal((await api.rating("public-player")).rankTier, "FULL");
  assert.equal(await api.config(), 5);
  assert.equal(requested.length, 2);
});
