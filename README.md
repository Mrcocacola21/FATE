# FATE

A TypeScript monorepo with a deterministic rules engine, an authoritative Fastify server, and a Vite + React client.

## Packages

- `packages/rules` - deterministic game engine (authoritative state updates).
- `packages/server` - Fastify + WebSocket game server.
- `packages/web` - React client UI.

## Development

```bash
npm install
npm run dev
```

This runs:
- `rules` in TypeScript watch mode (emits `dist/`)
- `server` on `http://localhost:3000`
- `web` on `http://localhost:5173`

### Dev flow: two tabs in the same room

- Open `http://localhost:5173`
- Create a room in the Lobby and copy the room id
- Join as P1 in the first tab
- Open a second tab and join the same room as P2 (or spectator)

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
```

## Server API

- `POST /api/games` - create a game
  - body: `{ "seed"?: number, "arenaId"?: string }`
- `GET /api/games/:id?playerId=P1|P2` - get player-specific state view
- `POST /api/games/:id/actions?playerId=P1|P2` - submit a `GameAction`
- `GET /api/games/:id/log` - action log
- `GET /api/health` - health check
- `GET /rooms` - list room summaries
- `POST /rooms` - create a room (returns `roomId`)

## WebSocket

- `GET /ws`
  - client -> server:
    - `{ type: "joinRoom", roomId, requestedRole, name? }`
    - `{ type: "leaveRoom" }`
    - `{ type: "action", action }`
    - `{ type: "requestMoveOptions", unitId }`
  - server -> client:
    - `{ type: "joinAccepted", roomId, role, connId }`
    - `{ type: "joinRejected", reason, message }`
    - `{ type: "roomState", roomId, room }`
    - `{ type: "actionResult", ok, events, error?, logIndex? }`
    - `{ type: "moveOptions", unitId, roll, legalTo }`
    - `{ type: "error", message }`

## Notes

- The server is authoritative: the client only sends `GameAction` intents.
- Per-player visibility is enforced by `makePlayerView` (exported from `rules`).
- Avoid running Vite with `--host 0.0.0.0` unless you explicitly need LAN access.
