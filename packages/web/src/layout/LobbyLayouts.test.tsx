import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LobbyLayout } from "./LobbyLayouts";

function renderLobbyAt(width: number) {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { innerWidth: width },
  });

  try {
    return renderToStaticMarkup(
      <LobbyLayout>
        <span>Lobby content</span>
      </LobbyLayout>,
    );
  } finally {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, "window");
    }
  }
}

test("Lobby shell renders the mobile layout at 390px", () => {
  const markup = renderLobbyAt(390);
  assert.match(markup, /data-testid="mobile-lobby-layout"/);
  assert.doesNotMatch(markup, /data-testid="desktop-lobby-layout"/);
});

test("Lobby shell renders the desktop layout at 1024px", () => {
  const markup = renderLobbyAt(1024);
  assert.match(markup, /data-testid="desktop-lobby-layout"/);
  assert.doesNotMatch(markup, /data-testid="mobile-lobby-layout"/);
});
