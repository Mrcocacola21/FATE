import assert from "node:assert/strict";
import test from "node:test";
import { act, create } from "react-test-renderer";
import { setLanguage } from "../i18n";
import { PageTransitionSetting } from "./PageTransitionSetting";
import { getPageTransition, parsePageTransition, setPageTransition } from "./pageTransition";

test("an unknown or missing stored value means the page turn", () => {
  assert.equal(parsePageTransition("simple"), "simple");
  assert.equal(parsePageTransition("turn"), "turn");
  assert.equal(parsePageTransition(null), "turn");
  assert.equal(parsePageTransition("fancy"), "turn");
});

test("the setting is a radio group that switches between the page turn and the plain fade", () => {
  setLanguage("en", null);
  setPageTransition("turn");
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(<PageTransitionSetting />);
  });
  try {
    const group = renderer.root.findByProps({ role: "radiogroup" });
    const radios = group.findAllByProps({ role: "radio" });
    assert.deepEqual(
      radios.map((radio) => [radio.children.join(""), radio.props["aria-checked"]]),
      [
        ["Page turn", true],
        ["Simple", false],
      ],
    );
    act(() => radios[1].props.onClick());
    assert.equal(getPageTransition(), "simple");
    assert.equal(group.findAllByProps({ role: "radio" })[1].props["aria-checked"], true);
    act(() =>
      group.findAllByProps({ role: "radio" })[1].props.onKeyDown({
        key: "ArrowRight",
        preventDefault() {},
        currentTarget: { parentElement: null },
      }),
    );
    assert.equal(getPageTransition(), "turn");
  } finally {
    act(() => renderer.unmount());
    setPageTransition("turn");
  }
});
