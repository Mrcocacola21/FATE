import type { MatchLifecycle } from "../persistence/matchLifecycle";
import { MatchRecoveryRepository } from "../repositories/matchRecoveryRepository";
import { enqueueRoomCommand, fateRoomKey } from "../roomQueue";
import { getGameRoom } from "../store";
import { MatchRecoveryService } from "./matchRecoveryService";

export interface ActiveMatch {
  id: string;
  roomId: string;
  seat: "P1" | "P2";
  rejoinable: boolean;
}

/** Single backend owner. Startup is awaited before this service can receive traffic. */
export class ActiveMatchService {
  constructor(
    private readonly lifecycle: MatchLifecycle,
    private readonly logger: { info(data: object, message: string): void; error(data: object, message: string): void },
    private readonly repository = new MatchRecoveryRepository(),
    private readonly recovery = new MatchRecoveryService(),
  ) {}

  async resolve(userId: string, exceptRoomId?: string): Promise<ActiveMatch | null> {
    const matches = await this.repository.findUserActiveMatches(userId);
    for (const match of matches) {
      const seat = match.participants.find(p => p.userId === userId)?.seat;
      if (seat !== "P1" && seat !== "P2") continue;
      const result = await enqueueRoomCommand(fateRoomKey(match.roomId ?? match.id), async () => {
        if (!getGameRoom(match.roomId ?? "")) {
          // Drain this process's durable writes/projections before trying historical recovery.
          if (!(await this.lifecycle.prepareMissingRoom(match.id)))
            return { id: match.id, roomId: match.roomId ?? "", seat, rejoinable: false };
          const current = await this.repository.findActiveById(match.id);
          if (!current) return null;
          await this.recovery.recoverCandidate(current, this.lifecycle, this.logger);
          this.logger.info({ event: "stale_match_reconciled", matchId: match.id, roomId: match.roomId },
            "Missing active room reconciled using durable recovery");
        }
        const room = getGameRoom(match.roomId ?? "");
        if (!room || room.matchId !== match.id) return null;
        return { id: match.id, roomId: room.id, seat,
          rejoinable: !room.interruptionReason && room.state.phase !== "ended" };
      });
      if (result && result.roomId !== exceptRoomId) return result;
    }
    return null;
  }
}
