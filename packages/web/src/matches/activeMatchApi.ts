import { authClient } from "../auth/authStore";
import { ApiError, isRecord } from "../api/client";

export interface ActiveMatch {
  id: string;
  roomId: string;
  seat: "P1" | "P2";
  rejoinable: boolean;
}
export const activeMatchApi = {
  get: () => authClient.request("/api/matches/active", (value): ActiveMatch | null => {
    if (!isRecord(value)) throw new ApiError("INVALID_RESPONSE");
    const match = value.match;
    if (match === null) return null;
    if (!isRecord(match) || typeof match.id !== "string" || typeof match.roomId !== "string" ||
      !["P1", "P2"].includes(String(match.seat)) || typeof match.rejoinable !== "boolean")
      throw new ApiError("INVALID_RESPONSE");
    return { id: match.id, roomId: match.roomId, seat: match.seat as "P1" | "P2", rejoinable: match.rejoinable };
  }),
};
