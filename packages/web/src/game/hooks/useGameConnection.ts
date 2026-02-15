import { useGameStore } from "../../store";

export function useGameConnection() {
  const connectionStatus = useGameStore((state) => state.connectionStatus);
  const joined = useGameStore((state) => state.joined);
  const roomId = useGameStore((state) => state.roomId);
  const role = useGameStore((state) => state.role);
  const connect = useGameStore((state) => state.connect);
  const joinRoom = useGameStore((state) => state.joinRoom);
  const leaveRoom = useGameStore((state) => state.leaveRoom);

  return {
    connectionStatus,
    joined,
    roomId,
    role,
    connect,
    joinRoom,
    leaveRoom,
  };
}
