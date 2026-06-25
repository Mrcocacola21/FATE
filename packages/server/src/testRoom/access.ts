export interface TestRoomCapabilities {
  enabled: boolean;
  requiresToken: boolean;
}

export function getTestRoomCapabilities(): TestRoomCapabilities {
  const production = process.env.NODE_ENV === "production";
  const explicit = process.env.ENABLE_TEST_ROOMS;
  const enabled = production
    ? explicit === "true"
    : explicit !== "false";
  return {
    enabled,
    requiresToken: production,
  };
}

export function canCreateTestRoom(debugToken?: string): boolean {
  const capabilities = getTestRoomCapabilities();
  if (!capabilities.enabled) return false;
  if (!capabilities.requiresToken) return true;
  const expected = process.env.FATE_DEBUG_TOKEN;
  return (
    typeof expected === "string" &&
    expected.length > 0 &&
    typeof debugToken === "string" &&
    debugToken === expected
  );
}
