# PDROP Framework

A multiplayer HTML5 game framework with lobby, chat, pings, camera, scoreboard, tooltips, and 1920×1080 scaling. Ships with **PDROP Arrow** as an example game.

## Project Structure

```
PDROP-Framework/
├── CLAUDE.md                        ← You are here
├── package.json
├── server.js                        ← Entry point (change game require path for new games)
│
├── server/
│   └── framework.js                 ← FRAMEWORK — never changes
│
├── game/
│   └── arrow.js                     ← GAME — delete and replace for new games
│
├── public/
│   ├── index.html                   ← SHARED — framework structure + game CSS/markup
│   ├── framework.js                 ← FRAMEWORK — never changes
│   └── game.js                      ← GAME — delete and replace for new games
│
└── docs/
    ├── pdrop-framework.md           ← Framework spec (scaling, camera, chat, pings, lobby, etc.)
    ├── pdrop-arrow-design.md        ← Arrow example game design doc
    └── new-game-guide.md            ← Step-by-step guide for creating a new game
```

## Creating a New Game

See `docs/new-game-guide.md` for the full walkthrough. The short version:

1. Delete `game/arrow.js` → write `game/yourgame.js` (server hooks)
2. Delete `public/game.js` → write a new one with `window.GameDef` (client hooks)
3. In `index.html`, replace the `<!-- Game CSS -->` and `<!-- Game DOM -->` sections
4. In `server.js`, change `require('./game/arrow')` → `require('./game/yourgame')`

**Never touch:** `server/framework.js`, `public/framework.js`, `package.json`

Only 3 properties are required in a game module: `id`, `name`, `maxPlayers`. All hooks are optional — the framework checks before calling. A blank game with just those 3 properties will boot with a working lobby, chat, and empty canvas.

## Framework vs Game Files

| File | Role | Changes between games? |
|------|------|----------------------|
| `server/framework.js` | Lobby, slots, chat, ping routing, tick loop | **Never** |
| `public/framework.js` | Scaling, camera, chat UI, pings, scoreboard, tooltips, lobby UI | **Never** |
| `package.json` | express + ws dependencies | **Never** |
| `game/arrow.js` | Arrow server logic | **Delete and replace** |
| `public/game.js` | Arrow client code (GameDef, rendering, input) | **Delete and replace** |
| `public/index.html` | Framework structure + game CSS/DOM | **Partially** — keep framework, swap game sections |
| `server.js` | Entry point | **One line** — the game require path |

## Docs Reference

| Document | What It Covers |
|----------|---------------|
| `docs/pdrop-framework.md` | Full framework spec: 1920×1080 scaling, CSS zoom, camera (Y-lock/Space-jump), chat (Enter/Shift+Enter), pings (Alt+Click wheel), scoreboard & mute (Escape), tooltips, player colors, lobby slots, GameDef hooks |
| `docs/pdrop-arrow-design.md` | Arrow example: rules, controls, arena, networking, visuals |
| `docs/new-game-guide.md` | Step-by-step guide for creating a new game from scratch |

## Tech Stack

- **Client:** `public/index.html` + `public/framework.js` + `public/game.js` — plain JS, HTML5 Canvas, no bundler
- **Server:** `server.js` + `server/framework.js` + `game/arrow.js` — Node.js + Express + `ws`
- **Deployment:** GitHub → Railway (auto-deploy on push)

## Key Conventions

- **No build tools.** Plain `.html` and `.js`. Client uses `<script>` tags. Server uses `require()`.
- **Server authoritative.** Server owns all game state. Clients send inputs, receive state, render.
- **Fixed 1920×1080.** Everything authored in that coordinate space. CSS zoom handles viewport fitting.
- **Single font.** Rajdhani from Google Fonts. 400/500/600/700.
- **Player colors.** Red = slot 0 / Team 1. Blue = slot 1 / Team 2. 12-color palette.
- **Port from environment.** `process.env.PORT || 3000`.
- **WebSocket on same server.** Client connects to `location.host`.
- **Scoreboard consumes clicks.** Full-screen backdrop blocks canvas when Escape is open.

## Testing Locally

```bash
npm install
npm start
# Open http://localhost:3000 in multiple browser tabs to test multiplayer
```

## Deploying to Railway

Push to the connected GitHub branch. Railway auto-detects `package.json`, runs `npm install`, and starts with `npm start`. HTTPS and WSS are handled automatically.
