import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ProfileRank } from "./ProfileRank";
import { competitiveApi } from "../play/api";
import { competitiveRatingFixture } from "../ranks/testFixtures";
import { setLanguage } from "../i18n";

test("profile reuses Full medal for provisional players and safely changes identity", async () => {
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
      renderer = create(<ProfileRank userId="first" />);
    });
    assert.match(JSON.stringify(renderer.toJSON()), /full\.png/);
    assert.match(JSON.stringify(renderer.toJSON()), /Full/);
    assert.match(JSON.stringify(renderer.toJSON()), /Provisional/);
    const switchMode = (label: string) =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.includes(label))!
        .props.onClick();
    act(() => switchMode("Draft"));
    assert.match(JSON.stringify(renderer.toJSON()), /half\.png/);
    assert.match(JSON.stringify(renderer.toJSON()), /900/);
    act(() => switchMode("Classic"));
    assert.match(JSON.stringify(renderer.toJSON()), /destiny\.png/);
    assert.match(JSON.stringify(renderer.toJSON()), /Ranked/);
    act(() => switchMode("Standard"));
    await act(async () => renderer.update(<ProfileRank userId="second" />));
    const output = JSON.stringify(renderer.toJSON());
    assert.match(output, /destiny\.png/);
    assert.match(output, /2150/);
    assert(!output.includes("full.png"));
  } finally {
    act(() => renderer?.unmount());
    competitiveApi.ratings = rating;
    competitiveApi.config = config;
  }
});
