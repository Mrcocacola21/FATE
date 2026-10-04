import assert from "node:assert/strict";
import test from "node:test";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { MemoryRouter } from "react-router";
import { MatchInterruptedNotice } from "../components/MatchInterruptedNotice";
import { useGameStore } from "../store";
import { setLanguage, translate } from "../i18n";
import { localizeServerText } from "../i18n/displayMetadata";

test("interrupted match notice is localized, links to Lobby and disappears when cleared", () => {
  const previous = useGameStore.getState();
  let rendered!: ReactTestRenderer;
  try {
    setLanguage("en", null);
    useGameStore.setState({ joinError: "MATCH_INTERRUPTED" });
    act(() => { rendered = create(<MemoryRouter><MatchInterruptedNotice /></MemoryRouter>); });
    const notice = rendered.root.findByProps({ role: "alert" });
    assert.equal(notice.findByType("p").children.join(""), "This match was interrupted by a server restart and cannot be resumed.");
    assert.equal(notice.findByType("a").props.href, "/lobby");
    act(() => setLanguage("uk", null));
    assert.equal(notice.findByType("p").children.join(""), translate("errors.matchInterrupted"));
    assert.equal(localizeServerText("MATCH_INTERRUPTED", translate), translate("errors.matchInterrupted"));
    act(() => useGameStore.setState({ joinError: null }));
    assert.equal(rendered.root.findAllByProps({ role: "alert" }).length, 0);
  } finally {
    act(() => rendered?.unmount());
    useGameStore.setState(previous, true);
    setLanguage("en", null);
  }
});
