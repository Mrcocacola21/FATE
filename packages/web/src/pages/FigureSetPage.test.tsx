import assert from "node:assert/strict";
import test, { after } from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { HERO_REGISTRY_LIST } from "rules";
import { FigureSetPage } from "./FigureSetPage";
import { HeroDetails } from "../figures/HeroDetails";
import { FigureSetAbilityCard } from "../components/abilities/FigureSetAbilityCard";
import { HERO_CATALOG, BASE_HERO_IDS } from "../figures/catalog";
import { BASE_CLASSES } from "../figures/types";
import { exportFigureSetState, importFigureSetState, resetToBaseState } from "../figures/storage";
import { setLanguage } from "../i18n";

const originals = new Map(
  ["window", "document", "localStorage", "fetch"].map((key) => [
    key,
    Object.getOwnPropertyDescriptor(globalThis, key),
  ]),
);
const values = new Map<string, string>();
function install(key: string, value: unknown) {
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
}
after(() => {
  for (const [key, descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
async function mount(
  options: { fail?: boolean; pending?: boolean; stored?: Record<string, string> } = {},
) {
  values.clear();
  if (options.stored)
    values.set(
      "FATE_FIGURE_SET_SELECTION_V1",
      JSON.stringify({ version: 1, selection: options.stored }),
    );
  install("window", { setTimeout, clearTimeout });
  install("document", { documentElement: {}, addEventListener() {}, removeEventListener() {} });
  install("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  });
  install("fetch", async () => {
    if (options.pending) return new Promise(() => undefined);
    if (options.fail) throw new Error("Offline");
    return { ok: true, json: async () => HERO_REGISTRY_LIST };
  });
  setLanguage("en", null);
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<FigureSetPage />);
  });
  return renderer;
}
const node = (renderer: ReactTestRenderer, id: string) =>
  renderer.root.findByProps({ "data-testid": id });
const click = (renderer: ReactTestRenderer, id: string) =>
  act(() => node(renderer, id).props.onClick());
const cards = (renderer: ReactTestRenderer) =>
  renderer.root
    .findAllByType("button")
    .filter((button) => button.props.className === "figure-hero-card");
const selection = () => JSON.parse(values.get("FATE_FIGURE_SET_SELECTION_V1")!).selection;
const inspected = (renderer: ReactTestRenderer) =>
  node(renderer, "hero-details").props["data-hero-id"];
function search(renderer: ReactTestRenderer, value: string) {
  act(() =>
    renderer.root.findByProps({ id: "figure-search" }).props.onChange({ target: { value } }),
  );
}
function unmount(renderer: ReactTestRenderer) {
  act(() => renderer.unmount());
}

test("initial load shows seven slots, canonical class order and the saved first-class hero", async () => {
  const renderer = await mount({ stored: { ...BASE_HERO_IDS, assassin: "frisk" } });
  try {
    const buttons = renderer.root.findAllByType("button");
    assert.deepEqual(
      buttons
        .filter((button) => button.props["data-testid"]?.startsWith("class-"))
        .map((button) => button.props["data-testid"]),
      BASE_CLASSES.map((slot) => `class-${slot}`),
    );
    assert.equal(
      buttons.filter((button) => button.props["data-testid"]?.startsWith("loadout-")).length,
      7,
    );
    assert.equal(inspected(renderer), "frisk");
    assert.equal(node(renderer, "select-hero").props.disabled, true);
  } finally {
    unmount(renderer);
  }
});

test("each class filters candidates and opens its current loadout hero", async () => {
  const renderer = await mount();
  try {
    for (const slot of BASE_CLASSES) {
      click(renderer, `class-${slot}`);
      assert.equal(inspected(renderer), BASE_HERO_IDS[slot]);
      assert.deepEqual(
        cards(renderer).map((card) => card.props["data-testid"]),
        HERO_CATALOG.filter((hero) => hero.mainClass === slot).map((hero) => `hero-${hero.id}`),
      );
    }
  } finally {
    unmount(renderer);
  }
});

test("inspection does not persist; explicit selection changes only the hero's class", async () => {
  const renderer = await mount();
  try {
    click(renderer, "hero-frisk");
    assert.equal(inspected(renderer), "frisk");
    assert.equal(values.has("FATE_FIGURE_SET_SELECTION_V1"), false);
    click(renderer, "select-hero");
    assert.deepEqual(selection(), { ...BASE_HERO_IDS, assassin: "frisk" });
    assert.equal(node(renderer, "select-hero").props.disabled, true);
    assert(
      node(renderer, "hero-frisk")
        .findByProps({ className: "figure-selected" })
        .children.includes("Selected"),
    );
  } finally {
    unmount(renderer);
  }
});

test("global search matches IDs, names and classes; cross-class selection retains query and browse class", async () => {
  const renderer = await mount();
  try {
    search(renderer, "frisk");
    assert.equal(cards(renderer).length, 1);
    search(renderer, "papyrus");
    assert.equal(cards(renderer).length, 1);
    click(renderer, "hero-papyrus");
    assert.equal(inspected(renderer), "papyrus");
    click(renderer, "select-hero");
    assert.deepEqual(selection(), { ...BASE_HERO_IDS, spearman: "papyrus" });
    assert.equal(renderer.root.findByProps({ id: "figure-search" }).props.value, "papyrus");
    assert.equal(node(renderer, "class-assassin").props["aria-pressed"], true);
    search(renderer, "");
    assert(
      cards(renderer).every(
        (card) =>
          HERO_CATALOG.find((hero) => `hero-${hero.id}` === card.props["data-testid"])
            ?.mainClass === "assassin",
      ),
    );
    search(renderer, "Archer");
    assert.equal(
      cards(renderer).length,
      HERO_CATALOG.filter((hero) => hero.mainClass === "archer").length,
    );
    search(renderer, "no-such-hero");
    assert.equal(cards(renderer).length, 0);
    assert.match(JSON.stringify(renderer.toJSON()), /No heroes match/);
  } finally {
    unmount(renderer);
  }
});

test("loadout slots open the right class and hero; per-slot reset preserves unrelated slots", async () => {
  const renderer = await mount({
    stored: { ...BASE_HERO_IDS, assassin: "frisk", spearman: "papyrus" },
  });
  try {
    for (const slot of BASE_CLASSES) {
      click(renderer, `loadout-${slot}`);
      assert.equal(node(renderer, `class-${slot}`).props["aria-pressed"], true);
      assert.equal(
        inspected(renderer),
        slot === "assassin" ? "frisk" : slot === "spearman" ? "papyrus" : BASE_HERO_IDS[slot],
      );
    }
    click(renderer, "loadout-spearman");
    click(renderer, "reset-slot");
    assert.deepEqual(selection(), { ...BASE_HERO_IDS, assassin: "frisk" });
    assert.equal(inspected(renderer), "base-spearman");
  } finally {
    unmount(renderer);
  }
});

test("reset-all waits for confirmation and cancel preserves the loadout", async () => {
  const renderer = await mount({ stored: { ...BASE_HERO_IDS, assassin: "frisk" } });
  const open = () =>
    act(() =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.props.className === "text-danger")!
        .props.onClick(),
    );
  try {
    open();
    assert.equal(selection().assassin, "frisk");
    act(() =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.includes("Cancel"))!
        .props.onClick(),
    );
    assert.equal(selection().assassin, "frisk");
    open();
    click(renderer, "confirm-reset");
    assert.deepEqual(selection(), BASE_HERO_IDS);
    assert.equal(inspected(renderer), "base-assassin");
  } finally {
    unmount(renderer);
  }
});

test("details render canonical metadata and abilities for every selectable hero", async () => {
  const renderer = await mount();
  try {
    for (const hero of HERO_CATALOG) {
      search(renderer, hero.id);
      click(renderer, `hero-${hero.id}`);
      const metadata = HERO_REGISTRY_LIST.find((entry) => entry.id === hero.id)!;
      assert(metadata, hero.id);
      assert.equal(renderer.root.findByType(HeroDetails).props.metadata, metadata);
      assert.deepEqual(
        renderer.root.findAllByType(FigureSetAbilityCard).map((card) => card.props.ability),
        metadata.abilities,
      );
      assert.equal(node(renderer, "hero-details").props["aria-label"], hero.name);
    }
  } finally {
    unmount(renderer);
  }
});

test("metadata loading and error remain localized to details; retry recovers", async () => {
  let renderer = await mount({ pending: true });
  assert.match(JSON.stringify(renderer.toJSON()), /Loading heroes/);
  assert(cards(renderer).length > 0);
  unmount(renderer);
  renderer = await mount({ fail: true });
  try {
    assert.match(JSON.stringify(renderer.toJSON()), /Unable to load hero details/);
    install("fetch", async () => ({ ok: true, json: async () => HERO_REGISTRY_LIST }));
    await act(async () =>
      renderer.root
        .findAllByType("button")
        .find((button) => button.children.includes("Retry"))!
        .props.onClick(),
    );
    assert.doesNotMatch(JSON.stringify(renderer.toJSON()), /Unable to load hero details/);
    assert(renderer.root.findByType(HeroDetails).props.metadata);
  } finally {
    unmount(renderer);
  }
});

test("legacy export round trips and invalid class imports are rejected", () => {
  const state = { ...resetToBaseState(), selection: { ...BASE_HERO_IDS, assassin: "frisk" } };
  const imported = importFigureSetState(exportFigureSetState(state), HERO_CATALOG);
  assert(imported.ok);
  assert.deepEqual(imported.state.selection, state.selection);
  assert.equal(imported.state.version, 1);
  assert.equal(importFigureSetState(JSON.stringify(state.selection), HERO_CATALOG).ok, true);
  assert.equal(importFigureSetState("broken", HERO_CATALOG).ok, false);
  assert.equal(
    importFigureSetState(JSON.stringify({ ...state.selection, knight: "frisk" }), HERO_CATALOG).ok,
    false,
  );
});
