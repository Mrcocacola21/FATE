# FATE

A TypeScript monorepo with a deterministic rules engine, an authoritative Fastify server, and a Vite + React client.

## Packages

- `packages/rules` – deterministic game engine (authoritative state updates).
- `packages/server` – Fastify + WebSocket game server.
- `packages/web` – React client UI.

## Development

```bash
npm install
npm run dev
```

This runs:
- `rules` in TypeScript watch mode (emits `dist/`)
- `server` on `http://localhost:3000`
- `web` on `http://localhost:5173`

## Build

```bash
npm run build
```

## Tests

```bash
npm run test
```

## Server API

- `POST /api/games` – create a game
  - body: `{ "seed"?: number, "arenaId"?: string }`
- `GET /api/games/:id?playerId=P1|P2` – get player-specific state view
- `POST /api/games/:id/actions?playerId=P1|P2` – submit a `GameAction`
- `GET /api/games/:id/log` – action log
- `GET /api/health` – health check

## WebSocket

- `GET /ws/games/:id?playerId=P1|P2`
  - initial message: `{ type: "stateSnapshot" }`
  - updates: `{ type: "stateUpdated" }`

## Notes

- The server is authoritative: the client only sends `GameAction` intents.
- Per-player visibility is enforced by `makePlayerView` (exported from `rules`).
