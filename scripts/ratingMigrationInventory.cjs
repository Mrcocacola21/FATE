// Read-only preflight for a deliberate global-to-mode cutover. Never logs URLs/PII.
const { PrismaClient } = require("@prisma/client");
const configured = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!configured) throw new Error("DIRECT_URL or DATABASE_URL is required for read-only inventory");
const url = new URL(configured);
url.searchParams.set("connect_timeout", "3");
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
async function main() {
  const inventory = await db.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      const [counts] = await tx.$queryRaw`SELECT
      (SELECT COUNT(*)::int FROM "User") AS users,
      (SELECT COUNT(*)::int FROM "Rating") AS ratings,
      (SELECT COUNT(*)::int FROM "RatingHistory") AS histories,
      (SELECT COUNT(*)::int FROM "RatingHistory" WHERE "matchId" IS NULL) AS orphanHistories,
      (SELECT COUNT(*)::int FROM "Match" WHERE "isRated" AND status = 'FINISHED') AS finishedRatedMatches,
      (SELECT COUNT(*)::int FROM "Match" WHERE "isRated" AND status = 'FINISHED' AND "ratingProcessedAt" IS NULL) AS pendingRatedMatches`;
      const modes = await tx.$queryRaw`SELECT "gameMode", COUNT(*)::int AS matches
      FROM "Match" WHERE "isRated" AND status = 'FINISHED' GROUP BY "gameMode" ORDER BY "gameMode"`;
      const [coverage] = await tx.$queryRaw`SELECT COUNT(*)::int AS processedWithIncompleteHistory
      FROM "Match" m WHERE m."ratingProcessedAt" IS NOT NULL AND
        (SELECT COUNT(*) FROM "RatingHistory" h WHERE h."matchId" = m.id AND h."ratedGameNumber" IS NOT NULL) <> 2`;
      return {
        counts,
        modes,
        coverage,
        policy: "fresh independent ladders; archive global state/history",
        replayCaveat:
          "Counts cannot prove completeness. Deleted matches, unnumbered foundation history and missing cross-player commit ordering prevent unconditional reconstruction.",
      };
    },
    { timeout: 10000 },
  );
  console.log(JSON.stringify(inventory, null, 2));
}
main()
  .catch((error) => {
    // Prisma errors may embed credentials; expose only a safe code and generic text.
    console.error(
      JSON.stringify({
        error: error.code || "INVENTORY_UNAVAILABLE",
        message: "Read-only database inventory could not complete; no migration was applied.",
      }),
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
