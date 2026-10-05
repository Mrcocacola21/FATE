// Explicit ownership for legacy server suites. Their filenames and assertions stay intact.
export const serverUnit = [
  "databaseFoundation.test.ts", "view.test.ts", "markerProjection.test.ts",
  "matchResult.test.ts", "matchSnapshot.test.ts", "replay.test.ts",
  "matchmaking.test.ts", "adminUiRating.test.ts",
];
export const serverContract = [
  "deployment.test.ts", "auth.test.ts", "apiErrors.test.ts", "admin.test.ts",
  "audit.test.ts", "profile.test.ts", "hardening.test.ts", "matchHistory.test.ts",
  "playerStatistics.test.ts", "rating.test.ts", "rankTiers.test.ts",
  "leaderboard.test.ts", "matchAction.test.ts", "matchRecovery.test.ts",
  "replayApi.test.ts", "testRoom.test.ts", "openapi.test.ts",
];
export const serverWs = [
  "matchLifecycle.test.ts", "matchTypes.test.ts", "lobby.test.ts",
  "matchmaking.ws.test.ts", "authenticatedMultiplayer.test.ts", "ws.smoke.ts",
  "testRoom.ws.test.ts", "modes.test.ts",
];
// Recovery integration includes actual sockets against a fresh runtime and real PostgreSQL.
export const databaseWs = ["matchRecovery.integration.test.ts", "realtime.integration.test.ts"];
