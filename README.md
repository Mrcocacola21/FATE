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

Optional local env file (not required for dev):
- Copy `.env.example` to `.env` if you want to pin API/WS URLs.

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

## Environment variables (web)

The frontend reads these at build time. In production builds they are required and the build will fail fast if missing:

- `VITE_API_URL` (example: `https://your-render-app.onrender.com`)
- `VITE_WS_URL` (example: `wss://your-render-app.onrender.com/ws`)

Local defaults are provided in `.env.example`.

## Assets (Figure Arts + Tokens)

Recommended formats:
- WEBP preferred (best size/quality).
- PNG allowed (if transparency is needed).
- Token transparency: use WEBP/PNG with alpha.

Suggested sizes:
- Full art: 1024x1536 (2:3) or 1200x1800.
- Token: 256x256 or 512x512 square.

File naming rules (must match `figureId`):
- `packages/web/src/assets/figures/<figureId>.webp`
- `packages/web/src/assets/tokens/<figureId>.webp`

Tips:
- Try to keep full art under ~300-600 KB if possible.
- Assets under `src/assets` are bundled by Vite; if we need user uploads later, move them to `/public` or external storage.

## Server API

- `GET /` - basic server info
- `GET /health` - health check
- `GET /api/health` - health check (legacy)
- `POST /api/games` - create a game
  - body: `{ "seed"?: number, "arenaId"?: string }`
- `GET /api/games/:id?playerId=P1|P2` - get player-specific state view
- `POST /api/games/:id/actions?playerId=P1|P2` - submit a `GameAction`
- `GET /api/games/:id/log` - action log
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

## Render deploy (server)

Render can build from the repo root.

- Build command:
  - `npm install && npm run -w rules build && npm run -w server build`
- Start command:
  - `npm run -w server start`

Environment variables:
- `PORT` (Render sets this automatically)
- `WEB_ORIGIN` (optional; set to your Vercel URL to lock CORS)
- `NODE_VERSION=22` (optional)

Notes:
- The server binds to `0.0.0.0` and uses `PORT`.
- WebSockets are available at `wss://<render-host>/ws`.

## Vercel deploy (web)

Recommended Vercel settings:
- Framework preset: Vite
- Root Directory: `packages/web`
- Install Command: `npm install --prefix ../..`
- Build Command: `cd ../.. && npm run -w web build`
- Output Directory: `dist`

Environment variables (required for production builds):
- `VITE_API_URL=https://<render-server>.onrender.com`
- `VITE_WS_URL=wss://<render-server>.onrender.com/ws`

## Common pitfalls

- "Failed to fetch" in production usually means `VITE_API_URL` points to localhost.
- WS connection failures usually mean `VITE_WS_URL` should be `wss://.../ws` in production.
- CORS errors usually mean `WEB_ORIGIN` is missing or incorrect on Render.

## Quick verify

- Open the Vercel site, check Network tab: `/rooms` should hit your Render domain.
- Confirm WebSocket connects successfully (`wss://<render-host>/ws`).
- Visit `https://<render-host>/health` and see `{ ok: true }`.

## Notes

- The server is authoritative: the client only sends `GameAction` intents.
- Per-player visibility is enforced by `makePlayerView` (exported from `rules`).
- Avoid running Vite with `--host 0.0.0.0` unless you explicitly need LAN access.
