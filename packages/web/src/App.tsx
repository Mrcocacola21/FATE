import { useEffect, useState } from "react";
import type { GameAction, GameState, PlayerId } from "rules";
import { Board } from "./components/Board";
import { EventLog } from "./components/EventLog";
import { RightPanel } from "./components/RightPanel";
import { createGame, getGameView, sendAction } from "./api";
import { connectGameSocket, ServerMessage } from "./ws";
import { useGameStore } from "./store";

function getUnitAt(view: GameState, col: number, row: number) {
  return Object.values(view.units).find(
    (u) => u.position && u.position.col === col && u.position.row === row
  );
}

export default function App() {
  const {
    gameId,
    playerId,
    view,
    events,
    selectedUnitId,
    actionMode,
    placeUnitId,
    setConnection,
    setView,
    applyServerUpdate,
    setSelectedUnit,
    setActionMode,
    setPlaceUnitId,
    reset,
  } = useGameStore();

  const [gameInput, setGameInput] = useState("");
  const [playerChoice, setPlayerChoice] = useState<PlayerId>("P1");
  const [wsStatus, setWsStatus] = useState("disconnected");

  useEffect(() => {
    if (!gameId || !playerId) return;

    const socket = connectGameSocket(gameId, playerId, (msg: ServerMessage) => {
      if (msg.type === "stateSnapshot") {
        setView(msg.view);
      }
      if (msg.type === "stateUpdated") {
        applyServerUpdate(msg.view, msg.events, msg.logIndex);
      }
    });

    socket.onopen = () => setWsStatus("connected");
    socket.onclose = () => setWsStatus("disconnected");

    return () => {
      socket.close();
    };
  }, [gameId, playerId, applyServerUpdate, setView]);

  const handleCreate = async () => {
    const res = await createGame();
    setConnection(res.gameId, playerChoice);
    setView(res.views[playerChoice]);
    setGameInput(res.gameId);
  };

  const handleJoin = async () => {
    if (!gameInput) return;
    const res = await getGameView(gameInput, playerChoice);
    setConnection(res.gameId, playerChoice);
    setView(res.view);
  };

  const handleSendAction = async (action: GameAction) => {
    if (!gameId || !playerId) return;
    try {
      const res = await sendAction(gameId, playerId, action);
      applyServerUpdate(res.view, res.events, res.logIndex);
      setActionMode(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCellClick = (col: number, row: number) => {
    if (!view || !playerId) return;

    if (actionMode === "place" && placeUnitId) {
      handleSendAction({
        type: "placeUnit",
        unitId: placeUnitId,
        position: { col, row },
      });
      return;
    }

    if (!selectedUnitId) return;

    if (actionMode === "move") {
      handleSendAction({
        type: "move",
        unitId: selectedUnitId,
        to: { col, row },
      });
      return;
    }

    if (actionMode === "attack") {
      const target = getUnitAt(view, col, row);
      if (!target) return;
      handleSendAction({
        type: "attack",
        attackerId: selectedUnitId,
        defenderId: target.id,
      });
      return;
    }

    if (actionMode === "aoe") {
      handleSendAction({
        type: "useAbility",
        unitId: selectedUnitId,
        abilityId: "tricksterAoE",
        payload: { center: { col, row } },
      });
      return;
    }
  };

  if (!view || !playerId) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
        <div className="mx-auto max-w-xl rounded border border-slate-200 bg-white/80 p-6 shadow-sm">
          <h1 className="text-xl font-semibold">FATE Rules Console</h1>
          <p className="mt-2 text-sm text-slate-500">
            Create a game or join an existing room.
          </p>
          <div className="mt-6 space-y-4">
            <div className="flex gap-2">
              <input
                className="w-full rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                placeholder="Game ID"
                value={gameInput}
                onChange={(e) => setGameInput(e.target.value)}
              />
              <select
                className="rounded border border-slate-200 bg-white px-3 py-2 text-sm"
                value={playerChoice}
                onChange={(e) => setPlayerChoice(e.target.value as PlayerId)}
              >
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded bg-teal-500 px-4 py-2 text-sm font-semibold text-white"
                onClick={handleCreate}
              >
                Create Game
              </button>
              <button
                className="rounded bg-slate-200 px-4 py-2 text-sm"
                onClick={handleJoin}
              >
                Join Game
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-sky-50 to-emerald-50 p-6">
      <div className="grid gap-6 lg:grid-cols-[auto_360px]">
        <div className="rounded border border-slate-200 bg-white/80 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
            <div>Game: {gameId}</div>
            <div>Player: {playerId}</div>
            <div>WS: {wsStatus}</div>
            <button
              className="rounded bg-slate-200 px-2 py-1 text-[10px]"
              onClick={() => reset()}
            >
              Leave
            </button>
          </div>
          <Board
            view={view}
            playerId={playerId}
            selectedUnitId={selectedUnitId}
            onSelectUnit={(id) => {
              setSelectedUnit(id);
              setActionMode(null);
            }}
            onCellClick={handleCellClick}
          />
        </div>

        <div className="space-y-6">
          <RightPanel
            view={view}
            playerId={playerId}
            selectedUnitId={selectedUnitId}
            actionMode={actionMode}
            placeUnitId={placeUnitId}
            onSelectUnit={(id) => {
              setSelectedUnit(id);
              setActionMode(null);
            }}
            onSetActionMode={setActionMode}
            onSetPlaceUnit={setPlaceUnitId}
            onSendAction={handleSendAction}
          />
          <EventLog events={events} />
        </div>
      </div>
    </div>
  );
}
