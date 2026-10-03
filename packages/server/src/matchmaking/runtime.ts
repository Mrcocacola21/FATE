import { getDatabaseClient } from "../db/client";
import { getGameRoom, listGameRooms } from "../store";
import { RatingRepository } from "../repositories/ratingRepository";
import { RatingService } from "../services/ratingService";
import { MatchmakingService } from "../services/matchmakingService";
import type { MatchLifecycle } from "../persistence/matchLifecycle";

export function createMatchmakingService(
  lifecycle: MatchLifecycle,
  logger: ConstructorParameters<typeof MatchmakingService>[0]["logger"],
  ratings?: Pick<RatingService, "getPlayerRating">,
  activeMatch?: (userId: string) => Promise<boolean>,
): MatchmakingService {
  let ratingService = ratings;
  const loadRatings = async (ids: string[]) => {
    if (ratingService && !("getPlayerRatings" in ratingService))
      return new Map(await Promise.all(ids.map(async id => [id, (await ratingService!.getPlayerRating(id)).rating] as const)));
    const service = (ratingService ??= new RatingService(new RatingRepository(), logger)) as RatingService;
    return service.getPlayerRatings(ids);
  };
  const matchmaking = new MatchmakingService({
    logger,
    loadPlayer: (id) =>
      (ratingService ??= new RatingService(new RatingRepository(), logger)).getPlayerRating(id),
    hasPersistentActiveMatch:
      activeMatch ??
      (async (userId) =>
        !!(await getDatabaseClient().matchParticipant.findFirst({
          where: { userId, match: { status: "IN_PROGRESS" } },
          select: { id: true },
        }))),
    hasRuntimeMatch: (id, exceptRoomId) =>
      listGameRooms().some(
        (room) =>
          room.id !== exceptRoomId &&
          room.roomMode === "normal" &&
          room.state.phase !== "ended" &&
          (["P1", "P2"] as const).some(
            (seat) =>
              room.reservedUserIds?.[seat] === id ||
              (room.seatIdentities[seat]?.userId === id &&
                (!!room.seats[seat] || room.participantsLocked)),
          ),
      ),
    createPair: (attempt) => lifecycle.createMatchedRoom(attempt),
    resultIsUsable: (result, id) => {
      const room = getGameRoom(result.roomId);
      return !!room && room.state.phase !== "ended" && room.reservedUserIds?.[result.seat] === id;
    },
  });
  lifecycle.configureRatedLobbies(matchmaking.config, loadRatings);
  return matchmaking;
}
