# PDROP Arrow — Example PDROP Game

A simple top-down multiplayer arena game built as a reference implementation of the PDROP Framework. Players move, shoot arrows, and try to eliminate each other. One hit = one kill.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech & Deployment](#2-tech--deployment)
3. [Project Structure](#3-project-structure)
4. [Game Rules](#4-game-rules)
5. [Player Character](#5-player-character)
6. [Controls](#6-controls)
7. [Arrows](#7-arrows)
8. [World & Arena](#8-world--arena)
9. [Camera](#9-camera)
10. [Lobby Configuration](#10-lobby-configuration)
11. [Game Flow](#11-game-flow)
12. [Networking](#12-networking)
13. [HUD](#13-hud)
14. [Visual Style](#14-visual-style)

---

## 1. Overview

| Property | Value |
|----------|-------|
| Game ID | `pdrop-arrow` |
| Name | PDROP Arrow |
| Max Players | 12 |
| Modes | FFA, Teams (2, 3, or 4 teams) |
| Slots Per Team | 3 (teams) or 12 (FFA) |
| Win Condition | Last player/team standing |
| Perspective | Top-down with pseudo-3D characters |
| World Size | 3200 × 2400 |

This is intentionally simple. The entire game logic — movement, arrows, collision, elimination — fits in a single file. It exists to prove out the framework: lobby, chat, pings, scoreboard, camera, tooltips all working together.

---

## 2. Tech & Deployment

| Layer | Detail |
|-------|--------|
| Client | Single `index.html` — plain JS, no build step |
| Server | Single `server.js` — Node.js + Express + `ws` |
| Hosting | GitHub repo → Railway deployment |
| Domain | Railway provides HTTPS URL automatically |

### 2.1 Repository Layout

```
pdrop-arrow/
├── CLAUDE.md
├── package.json
├── server.js                        ← Entry point: wires framework to game
├── server/
│   └── framework.js                 ← Lobby, slots, chat, ping routing, tick loop
├── game/
│   └── arrow.js                     ← Server-side game logic (this file)
├── public/
│   ├── index.html                   ← HTML shell + all CSS
│   ├── framework.js                 ← Client framework (scaling, camera, chat, etc.)
│   └── game.js                      ← Client game code (GameDef, rendering, input)
└── docs/
    ├── pdrop-framework.md
    └── pdrop-arrow-design.md
```

`package.json` declares `express` and `ws` as dependencies. `server.js` is a thin entry point that requires the framework and the game module, wires them together, and starts listening. The framework files handle all shared infrastructure. The game files (`game/arrow.js` and `public/game.js`) contain only arrow-specific logic.

### 2.2 Railway Deployment

Railway detects `package.json`, runs `npm install`, and starts with the `start` script.

```json
{
    "name": "pdrop-arrow",
    "scripts": {
        "start": "node server.js"
    },
    "dependencies": {
        "express": "^4.18.0",
        "ws": "^8.16.0"
    }
}
```

The server listens on `process.env.PORT` (Railway provides this) and handles both HTTP (Express static files) and WebSocket upgrades on the same port.

```js
const PORT = process.env.PORT || 3000;
server.listen(PORT);
```

### 2.3 WebSocket URL

The client connects to the WebSocket at the same origin the page was served from:

```js
const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
const ws = new WebSocket(`${protocol}//${location.host}`);
```

No hardcoded URLs. Works locally (`ws://localhost:3000`) and on Railway (`wss://pdrop-arrow.up.railway.app`) without any config.

---

## 3. Project Structure

### 3.1 Server Side

**`server.js`** — Entry point. Requires `server/framework.js` and `game/arrow.js`, creates the Express + WS server, and starts listening on `process.env.PORT`.

**`server/framework.js`** — Framework server code (same for every game):
- Express serves `public/` as static files
- WebSocket connection management
- Lobby state: servers, slots, teams, ready state
- Chat routing (team/all filtering)
- Ping routing (team filtering, rate limiting)
- Game tick loop shell (calls into game module each tick)
- Standard message handling (lobby, chat, ping)

**`game/arrow.js`** — Game-specific server code (delete/replace for new games):
- Player state: positions, facing, alive/dead, cooldowns
- Arrow state: positions, velocities, lifetimes
- Movement computation (move toward target each tick)
- Arrow spawning and collision detection
- Wall/obstacle collision
- Elimination and win condition checking
- Spawn point assignment
- Exposes hooks: `init()`, `tick()`, `onInput()`, `getState()`, `checkRoundOver()`

### 3.2 Client Side

**`public/index.html`** — Shared file. Contains the framework structure (`#game-container`, `<canvas>`, `#ui` div, framework CSS) plus game-specific CSS and any game DOM elements like HUD. Framework and game sections are separated by comments.

**`public/framework.js`** — Framework client code (same for every game):
- 1920×1080 scaling system (CSS zoom)
- Camera system (Y-lock, Space-jump, edge scroll)
- Chat UI (Enter/Shift+Enter, message rendering, mute filtering)
- Ping system (Alt+Click wheel, rendering, audio)
- Scoreboard overlay (Escape, full-screen backdrop, right-click mute menu)
- Tooltip system (positioning, `data-tooltip` delegation)
- Lobby UI (main menu, server browser, lobby screen, slot panels)
- Game state rendering loop (calls into GameDef)
- Input routing (filters framework inputs, passes game inputs to GameDef)

**`public/game.js`** — Game-specific client code (delete/replace for new games):
- `window.GameDef` object with all hooks
- Arena rendering (grid, walls, obstacles)
- Player rendering (body, shadow, direction indicator, name label)
- Arrow rendering (with trails)
- HUD elements (kill feed, alive count, cooldown indicator)
- Input handling (right-click move, Q shoot)
- Camera lock/snap target definitions
- Scoreboard column definitions
- Entity tooltip definitions

---

## 4. Game Rules

### 4.1 Core Loop

1. Players spawn in the arena
2. Right-click to move, Q to shoot an arrow
3. One arrow hit = eliminated
4. Last player (FFA) or last team with players alive wins the round

### 4.2 Elimination

- A player hit by an enemy arrow is immediately eliminated
- Eliminated players become spectators — camera switches to free mode, edge scrolling enabled
- Eliminated players can still chat and ping
- Friendly fire is **off** — arrows from teammates pass through you

### 4.3 Win Condition

**FFA:** Last player alive wins.

**Teams:** A team is eliminated when all its members are eliminated. Last team with at least one player alive wins.

### 4.4 Rounds

A game is a single round. After a winner is determined, the game enters post-game state. From there, players can rematch (returns to lobby) or leave.

---

## 5. Player Character

### 5.1 Appearance

Top-down pseudo-3D character. Drawn on the canvas as a simple layered shape:

1. **Shadow** — A dark ellipse on the ground beneath the character
2. **Body** — A filled circle in the player's team/FFA color
3. **Direction indicator** — A small triangle or wedge on the body's edge showing the direction the player is facing (toward their last move target or mouse)
4. **Name label** — Player name drawn above the character in 600 weight 22px Rajdhani, white with a dark shadow for readability

### 5.2 Player State (Server)

```js
const player = {
    id: 'uuid',
    name: 'Aelric',
    team: 0,
    color: '#e74c3c',
    x: 400,                 // world position
    y: 300,
    targetX: 400,           // move-to target
    targetY: 300,
    angle: 0,               // facing direction (radians)
    speed: 7,               // pixels per tick
    alive: true,
    radius: 18,             // collision radius
};
```

### 5.3 Movement

Players move toward their move target at a constant speed. When they arrive (distance < speed), they stop. Movement is computed server-side.

```js
// Server tick
const dx = player.targetX - player.x;
const dy = player.targetY - player.y;
const dist = Math.hypot(dx, dy);
if (dist > player.speed) {
    player.x += (dx / dist) * player.speed;
    player.y += (dy / dist) * player.speed;
    player.angle = Math.atan2(dy, dx);
}
```

### 5.4 Facing

The player faces toward their move target while moving. When stationary and the player presses Q to shoot, they face the mouse direction. The angle is used for the direction indicator on the character.

---

## 6. Controls

All controls reference the framework's standard bindings. Game-specific controls:

| Input | Action |
|-------|--------|
| Right-click (on game world) | Move to clicked position |
| `Q` | Shoot arrow toward mouse position |

Combined with framework controls:

| Input | Action |
|-------|--------|
| `Enter` | Open chat (team) |
| `Shift + Enter` | Open chat (all) |
| `Tab` / `Shift` (in chat) | Cycle channel (Team ↔ All) |
| `Escape` | Scoreboard |
| `Alt` + Click/Drag | Ping system |
| `Y` | Toggle camera lock to player character |
| `Space` | Snap camera to player character |
| Mouse wheel | Zoom in/out |

### 6.1 Input While Dead

After elimination, right-click and Q do nothing (no movement, no shooting). Camera switches to free mode — the player can edge-scroll to spectate. `Y` and `Space` no longer have a target. Chat, pings, and scoreboard still work.

---

## 7. Arrows

### 7.1 Arrow Properties

```js
const arrow = {
    id: 'uuid',
    ownerId: 'player-uuid',
    team: 0,                // owner's team (for friendly fire check)
    x: 500,                 // current position
    y: 300,
    angle: 1.2,             // direction (radians)
    speed: 12,              // pixels per tick
    radius: 5,              // collision radius
    life: 120,              // ticks remaining (despawns at 0)
    maxLife: 120,            // for fade calculation
};
```

### 7.2 Arrow Behavior

- Arrows travel in a straight line at constant speed
- No gravity, no arc — this is top-down
- Arrows despawn after 120 ticks (~6 seconds at 20 ticks/sec)
- Arrows despawn on collision with a wall or an enemy player
- Arrows pass through the shooter and their teammates (no friendly fire)

### 7.3 Collision Detection

Server checks every tick:

```js
for (const arrow of arrows) {
    for (const player of players) {
        if (!player.alive) continue;
        if (player.id === arrow.ownerId) continue;           // can't hit yourself
        if (player.team === arrow.team && arrow.team !== null) continue;  // no friendly fire

        const dist = Math.hypot(arrow.x - player.x, arrow.y - player.y);
        if (dist < arrow.radius + player.radius) {
            // Hit!
            player.alive = false;
            arrow.life = 0;     // remove arrow
            broadcast({ type: 'elimination', playerId: player.id, killerId: arrow.ownerId });
        }
    }
}
```

### 7.4 Arrow Rendering

Drawn on the canvas as a small elongated shape (line or thin triangle) in white or a light tint, rotated to match `arrow.angle`. A subtle trail effect: draw 2–3 fading copies behind the arrow at previous positions.

### 7.5 Shoot Cooldown

Players can shoot once every **30 ticks** (1.5 seconds). The server tracks the cooldown per player and ignores shoot commands that arrive too early. The client shows a subtle cooldown indicator on the player's character (a small arc that fills around the direction indicator).

---

## 8. World & Arena

### 8.1 Dimensions

```js
const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;
```

The arena is larger than the viewport (1920×1080), so the camera system is needed. Players can see roughly half the arena at once.

### 8.2 Arena Layout

A simple rectangular arena with walls around the border and a few obstacles inside.

**Border walls:** Solid rectangles at the edges. Players and arrows cannot pass through. Arrows despawn on wall collision.

**Obstacles:** 4–6 rectangular blocks scattered in the arena. These block arrows but players can walk around them. Obstacles provide cover and create tactical positioning.

```js
const obstacles = [
    { x: 800, y: 600, w: 120, h: 200 },
    { x: 2000, y: 400, w: 200, h: 120 },
    { x: 1400, y: 1200, w: 160, h: 160 },
    { x: 600, y: 1600, w: 200, h: 100 },
    { x: 2400, y: 1800, w: 120, h: 220 },
];
```

The specific layout is fixed (not randomized). This keeps it predictable and avoids the need for a map system.

### 8.3 Spawn Points

Players spawn at predefined positions based on their team/slot:

**Teams:** Each team has a cluster of spawn points in a different corner of the arena.

| Team | Corner | Spawn Area |
|------|--------|-----------|
| Red (0) | Top-left | (200–600, 200–500) |
| Blue (1) | Top-right | (2600–3000, 200–500) |
| Green (2) | Bottom-left | (200–600, 1900–2200) |
| Gold (3) | Bottom-right | (2600–3000, 1900–2200) |

**FFA:** Players spawn at evenly spaced positions around the arena perimeter.

### 8.4 Wall Collision (Movement)

Players cannot walk through walls or obstacles. The server clamps player position after each move step:

```js
// After moving, check against all walls/obstacles
for (const wall of walls) {
    // Push player out of wall if overlapping
    // Simple AABB vs circle resolution
}
```

### 8.5 Wall Collision (Arrows)

Arrows are destroyed on contact with any wall or obstacle. Check after each arrow position update:

```js
for (const wall of walls) {
    if (pointInRect(arrow.x, arrow.y, wall)) {
        arrow.life = 0;  // despawn
    }
}
```

### 8.6 Ground

The arena floor is rendered as a subtle grid (same style as the framework demo — faint lines every 80px, `rgba(255,255,255,0.025)`) over the dark background (`#12141a`). Walls and obstacles are drawn as slightly lighter filled rectangles with a subtle border.

---

## 9. Camera

PDROP Arrow uses the framework camera system with both Y-lock and Space-jump.

### 9.1 GameDef Camera Hooks

```js
getCameraLockTarget(localPlayer) {
    // Y-lock targets the player's own character
    if (localPlayer.alive) {
        return { x: localPlayer.x, y: localPlayer.y };
    }
    return null;  // dead players can't lock
}

getCameraSnapTarget(localPlayer) {
    // Space-jump also targets the player's own character
    if (localPlayer.alive) {
        return { x: localPlayer.x, y: localPlayer.y };
    }
    return null;  // dead players can't snap
}
```

### 9.2 Camera Behavior by State

| Player State | Y (lock) | Space (jump) | Edge Scroll | Default |
|-------------|----------|-------------|-------------|---------|
| Alive | Locks to character | Jumps to character | When unlocked | Locked on spawn |
| Eliminated | Disabled (no target) | Disabled (no target) | Always available | Free camera |

On spawn, the camera starts Y-locked to the player's character. When eliminated, `camera.locked` is set to `false` and the player gets free camera for spectating.

---

## 10. Lobby Configuration

### 10.1 GameDef Properties

```js
const GameDef = {
    id: 'pdrop-arrow',
    name: 'PDROP Arrow',
    maxPlayers: 12,
    supportedModes: ['teams', 'ffa'],
    defaultMode: 'ffa',
    defaultTeamCount: 2,
    worldWidth: 3200,
    worldHeight: 2400,

    settings: {
        // No game-specific settings for the example game.
        // The framework handles mode, team count, and slots.
    },
};
```

### 10.2 Lobby Scenarios

The framework computes slots per team from `maxPlayers / teamCount`.

**FFA (default):** Single pool of up to 12 slots. Each player gets a unique color.

```
┌─ Players ────────────────────────────┐
│ ● Aelric (Host)    ● Tamsin         │
│ ● Wren             ● [Open]         │
│ ● [Open]           ✕ [Closed]       │
└──────────────────────────────────────┘
```

**2 Teams:** 12 / 2 = 6 slots per team. Host can close slots for smaller games.

```
┌─ Red Team ──────────┐  ┌─ Blue Team ─────────┐
│ ● Aelric (Host)     │  │ ● Tamsin            │
│ ● Wren              │  │ ● [Open]            │
│ ● [Open]            │  │ ● [Open]            │
└──────────────────────┘  └──────────────────────┘
```

**3 Teams:** 12 / 3 = 4 slots per team.

**4 Teams:** 12 / 4 = 3 slots per team.

### 10.3 Scoreboard Columns

```js
getScoreboardColumns() {
    return [
        { key: 'kills',  label: 'K', width: 50 },
        { key: 'status', label: 'Status', width: 80 },
    ];
}

getPlayerStats(playerId) {
    return {
        kills: playerKills[playerId] || 0,
        status: players[playerId].alive ? 'Alive' : 'Dead',
    };
}
```

### 10.4 Entity Tooltips

```js
getEntityTooltip(entity) {
    if (entity.type === 'player') {
        const status = entity.alive ? 'Alive' : 'Eliminated';
        return `<div class="tip-title" style="color: ${entity.color}">${entity.name}</div>`
             + `<div class="tip-desc">${status}</div>`;
    }
    if (entity.type === 'obstacle') {
        return `<div class="tip-desc">Wall — blocks arrows</div>`;
    }
    return null;
}
```

---

## 11. Game Flow

### 11.1 State Machine

```
LOBBY
  ├── Players join, pick teams/FFA
  ├── Host starts game
  ▼
COUNTDOWN (3 seconds)
  ├── "3... 2... 1..." overlay
  ├── Players see arena, can look around
  ├── Movement and shooting disabled
  ▼
PLAYING
  ├── Right-click to move, Q to shoot
  ├── Eliminated players become spectators
  ├── Chat + pings active
  ▼
ROUND OVER
  ├── Winner announced (player name or team name)
  ├── 5-second delay
  ▼
POST GAME
  ├── Results: winner, kill counts
  ├── [Rematch] → returns to lobby
  ├── [Leave] → main menu
```

### 11.2 Countdown

When the host starts the game, a 3-second countdown plays. During countdown:

- Players can see the arena and their spawn position
- Camera starts Y-locked to their character
- Movement and shooting are disabled
- Chat works
- A large centered "3... 2... 1... GO!" text fades in and out on the DOM overlay

### 11.3 Round Over Detection

Server checks after every elimination:

```js
function checkRoundOver() {
    if (mode === 'ffa') {
        const alive = players.filter(p => p.alive);
        if (alive.length <= 1) {
            return { winner: alive[0] || null };
        }
    } else {
        const aliveTeams = new Set(players.filter(p => p.alive).map(p => p.team));
        if (aliveTeams.size <= 1) {
            return { winnerTeam: [...aliveTeams][0] ?? null };
        }
    }
    return null;  // game continues
}
```

### 11.4 Post-Game Screen

A DOM overlay showing:

- "**[Winner Name] wins!**" or "**Red Team wins!**"
- Kill leaderboard (sorted by kills, all players)
- Two buttons: **Rematch** and **Leave**
- Chat still active

---

## 12. Networking

### 12.1 Server Tick Rate

The server runs at **20 ticks per second** (50ms per tick). Every tick the server:

1. Processes queued client inputs (move commands, shoot commands)
2. Updates player positions (movement toward targets)
3. Updates arrow positions
4. Checks arrow–player collisions
5. Checks arrow–wall collisions
6. Checks round-over condition
7. Broadcasts game state to all clients

### 12.2 Client → Server Messages

| Type | Payload | When |
|------|---------|------|
| `move` | `{ x, y }` | Right-click on world |
| `shoot` | `{ angle }` | Q key pressed |
| `chat` | `{ channel, text }` | Chat message |
| `ping` | `{ x, y, pingType }` | Alt+Click ping |
| `lobby_*` | *(framework messages)* | Lobby actions |

Movement sends the world-space target position. Shooting sends the angle (computed from player position to mouse position on the client, but the server uses the server-side player position + client angle to spawn the arrow).

### 12.3 Server → Client Messages

| Type | Payload | Frequency |
|------|---------|-----------|
| `state` | `{ players: [...], arrows: [...] }` | Every tick (20/sec) |
| `elimination` | `{ playerId, killerId }` | On kill |
| `round_over` | `{ winner, stats }` | Once |
| `countdown` | `{ seconds }` | 3, 2, 1, 0 |
| `chat` | `{ playerId, channel, text }` | On message |
| `ping` | `{ playerId, x, y, pingType }` | On ping (team-filtered) |
| `lobby_*` | *(framework messages)* | Lobby updates |

### 12.4 State Broadcast Format

The `state` message is the core of the network model. Sent 20 times per second, it contains every player position and every active arrow. The client doesn't simulate — it just renders whatever the server says.

```js
{
    type: 'state',
    players: [
        { id, x, y, angle, alive, color, name, team },
        ...
    ],
    arrows: [
        { id, x, y, angle, life, maxLife },
        ...
    ],
}
```

### 12.5 Client Rendering

The client stores the previous and current game state along with timestamps. On each render frame, it linearly interpolates player and arrow positions between the two states based on elapsed time. This smooths out the 20 tick/sec updates to 60fps rendering. The interpolated state is used for rendering and camera only — input logic uses the raw authoritative state.

### 12.6 Input Validation (Server)

The server validates all client input:

- **Move:** Target must be within world bounds. Clamp if not.
- **Shoot:** Player must be alive. Cooldown must have elapsed. Arrow spawns at the server's known player position (not the client's claimed position).
- **Ping:** Rate limited to 3 active pings per player. Team-filtered before broadcast.
- **Chat:** Standard framework filtering. Channel must be valid.

---

## 13. HUD

Minimal HUD elements drawn in the DOM overlay:

### 13.1 Kill Feed (Top-Right)

A small feed showing recent eliminations. Each entry fades after 5 seconds.

```
Aelric ─── ➤ ──→ Tamsin
Wren ─── ➤ ──→ Dusk
```

Format: `[Killer] → [Victim]` with both names in their player/team colors.

### 13.2 Alive Count (Top-Center)

Shows how many players/teams remain.

**FFA:** `4 players alive`

**Teams:** `Red: 2  Blue: 1  Green: 0` (with color indicators, eliminated teams dimmed)

### 13.3 Shoot Cooldown (On Character)

A subtle arc drawn around the player's direction indicator on the canvas. Fills clockwise over the cooldown duration. Not a DOM element — rendered on the canvas as part of the player character.

---

## 14. Visual Style

The game uses the framework's standard dark aesthetic.

### 14.1 Colors

- **Background:** `#12141a`
- **Grid:** `rgba(255,255,255,0.025)` lines every 80px
- **Walls/Obstacles:** `rgba(255,255,255,0.06)` fill with `rgba(255,255,255,0.1)` border
- **Players:** Team/FFA color from the framework palette (§10 of framework doc)
- **Arrows:** White (`#fff`) at 0.8 alpha, trail at 0.3 fading to 0
- **Shadows:** `rgba(0,0,0,0.3)` ellipses under characters

### 14.2 Player Character Detail

```
     ╭──╮          ← name label (white, shadow)
     │  │
   ╭─┴──┴─╮
   │      │        ← body circle (team color, r=18)
   │  ▶   │        ← direction wedge (lighter tint)
   ╰──────╯
    ╭────╮         ← shadow ellipse (dark, below body)
    ╰────╯
```

### 14.3 Arena Rendering Order

Bottom to top:

1. Background fill (`#12141a`)
2. Ground grid
3. Obstacle fills and borders
4. Player shadows
5. Arrows (with trails)
6. Player bodies and direction indicators
7. Player name labels
8. Pings (framework renders these)
9. Ping wheel (if open)

---

## Appendix: Implementation Notes for Claude Code

This section is for the AI building the project.

### File Count

Six code files total: `server.js` (entry point), `server/framework.js`, `game/arrow.js`, `public/index.html`, `public/framework.js`, `public/game.js`. Plus `package.json`.

Framework files (`server/framework.js`, `public/framework.js`) are identical across all PDROP games. `index.html` is shared — it contains framework structure and game-specific CSS/markup separated by comments. Game files (`game/arrow.js`, `public/game.js`) are the only things fully replaced.

### Server Architecture

The server manages multiple lobbies (servers in framework terminology). Each lobby has its own game state. A single Node.js process handles all lobbies. Structure:

```js
const lobbies = new Map();  // id → lobby state

// Each lobby:
{
    id, name, host, mode, teamCount, slots, state, settings,
    players: [],      // connected players
    gameState: null,  // null in lobby, populated in game
    tickInterval: null,
}
```

### What To Build First

1. **Server entry + framework skeleton** — `server.js` entry point, `server/framework.js` accepts WS connections, manages lobbies. `game/arrow.js` is a stub exporting the required hooks.
2. **Client shell + scaling** — `index.html` with 1920×1080 container, canvas, `#ui` overlay, CSS, script tags. `public/framework.js` handles resize/zoom. `public/game.js` is a stub `window.GameDef`.
3. **Lobby** — Create/join server, slot system, team panels, ready toggle. Framework files handle all of this.
4. **Chat** — Enter for team, Shift+Enter for all. All in framework files. Working in lobby.
5. **Game start + countdown** — Host starts, 3-2-1 countdown. Framework manages state transition, `game/arrow.js` provides `init()` with spawn logic.
6. **Camera** — Y-lock, Space-jump, edge scroll. In `public/framework.js`, `public/game.js` provides `getCameraLockTarget()` / `getCameraSnapTarget()`.
7. **Movement** — Right-click to move. `public/game.js` sends `move` input, `game/arrow.js` processes in `tick()`, state broadcast renders it.
8. **Arrows** — Q to shoot toward cursor. `game/arrow.js` handles spawning, collision, elimination.
9. **Win condition + post-game** — `checkRoundOver()` in `game/arrow.js`, results screen in framework using `getResults()`.
10. **Pings** — Alt+Click wheel. Entirely in framework files, no game code needed.
11. **Scoreboard + mute** — Escape overlay. Framework handles it, `public/game.js` provides `getScoreboardColumns()` and `getPlayerStats()`.
12. **Tooltips + HUD** — Framework tooltip system, `public/game.js` provides `getEntityTooltip()`. Kill feed and alive count rendered by `public/game.js`.

### Railway Notes

- `process.env.PORT` must be used — Railway assigns the port
- WebSocket upgrade happens on the same HTTP server
- No need for CORS — everything is same-origin
- Railway auto-deploys on push to the connected GitHub branch
