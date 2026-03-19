# Creating a New PDROP Game

Step-by-step guide for building a new game on the PDROP Framework. You start with the framework already working (lobby, chat, pings, scoreboard, camera, tooltips) and only write game-specific code.

---

## What You're Replacing

Only **four touchpoints** change between games:

| File | What To Do |
|------|-----------|
| `game/arrow.js` | Delete. Write a new `game/yourgame.js` with server-side game logic. |
| `public/game.js` | Delete. Write a new one with `window.GameDef` hooks. |
| `public/index.html` | Keep the framework sections (marked `<!-- Framework DOM -->`). Replace the game sections (marked `<!-- Game DOM -->`). Replace the game CSS section. |
| `server.js` | Change one line: `require('./game/arrow')` → `require('./game/yourgame')` |

**Never touch:** `server/framework.js`, `public/framework.js`, `package.json`

---

## Step 1: Design Your Game

Write a design doc in `docs/yourgame-design.md`. At minimum, cover:

- What the game is (one paragraph)
- Player controls (what inputs do what)
- Game rules (win condition, elimination, rounds)
- World size (1920×1080 if it fits on screen, larger if you need camera)
- What the server needs to track (positions, projectiles, scores, etc.)
- What the client needs to render

---

## Step 2: Server Game Module

Create `game/yourgame.js`. Only three properties are required:

```js
module.exports = {
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,
};
```

That's a valid game module. The framework will run — lobby works, chat works, you can start a game. It just won't do anything in-game because there are no hooks.

Add hooks as you need them:

```js
module.exports = {
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,

    // Optional — only add what your game uses
    supportedModes: ['ffa', 'teams'],   // default: ['ffa']
    defaultMode: 'ffa',
    defaultTeamCount: 2,

    // Called when host starts the game. Set up your world state here.
    init(players, settings, mode, teamCount) {
        // players is an array of { id, name, team, color, colorIndex, slot }
        // Store them, assign spawn positions, etc.
    },

    // Called every server tick (50ms = 20 ticks/sec).
    // This is your game loop. Move entities, check collisions, update state.
    tick(dt) {
    },

    // Called when a player sends game input (movement, shoot, ability, etc.)
    onInput(playerId, message) {
        // message is whatever the client sent via game_input
        // e.g. { type: 'move', x: 500, y: 300 }
    },

    // Called every tick to get state for broadcast to clients.
    // Return an object — it gets sent as-is to all clients.
    getState() {
        return {
            players: [ /* positions, health, etc. */ ],
            // add whatever else clients need to render
        };
    },

    // Called after each tick to check if the game is over.
    // Return null to keep playing, or { winner/winnerTeam, stats } to end.
    checkRoundOver() {
        return null;
    },

    // Optional: return pending events (kills, pickups, etc.) that need
    // to be broadcast separately from state. Called each tick.
    getEvents() {
        return [];
    },
};
```

### Key Rules for Server Logic

- **Server is authoritative.** Never trust client positions or state. Client sends intent ("I want to move here"), server decides what actually happens.
- **Validate all input.** Check that the player is alive, cooldowns have elapsed, targets are in bounds.
- **Tick rate is 20/sec.** Design your speeds in "pixels per tick." 5 pixels/tick = 100 pixels/sec.

---

## Step 3: Client Game Code

Create `public/game.js`. Minimum viable:

```js
window.GameDef = {
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,
};
```

That gives you a game that connects, has a working lobby, but shows a blank canvas. Add hooks as you build:

```js
window.GameDef = {
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,
    worldWidth: 3200,       // omit for no camera (defaults to 1920)
    worldHeight: 2400,      // omit for no camera (defaults to 1080)

    // Camera: what does Y-lock follow? Return { x, y } or null.
    getCameraLockTarget(localPlayer) {
        if (localPlayer && localPlayer.alive) {
            return { x: localPlayer.x, y: localPlayer.y };
        }
        return null; // null = Y does nothing
    },

    // Camera: what does Space-jump to? Return { x, y } or null.
    getCameraSnapTarget(localPlayer) {
        return this.getCameraLockTarget(localPlayer); // often the same
    },

    // Render the game world. Called every frame (~60fps).
    // ctx = canvas 2d context, camera = { x, y }, gameState = last server state
    render(ctx, camera, gameState) {
        if (!gameState) return;
        const cx = camera.x;
        const cy = camera.y;

        // Draw your game here.
        // Convert world coords to screen: screenX = worldX - cx
    },

    // Handle game-specific input. Framework filters out chat/ping/scoreboard first.
    // inputType: 'rightclick', 'leftclick', 'keydown', 'keyup'
    // data: { x, y } for clicks (world coords), { key } for keys
    onInput(inputType, data) {
        if (inputType === 'rightclick') {
            window.PDROP.wsSend({
                type: 'game_input',
                data: { type: 'move', x: data.x, y: data.y },
            });
        }
    },

    // Scoreboard stat columns (optional)
    getScoreboardColumns() {
        return [
            { key: 'score', label: 'Score', width: 80 },
        ];
    },

    getPlayerStats(playerId) {
        const gs = window.PDROP.getGameState();
        const p = gs?.players?.find(pl => pl.id === playerId);
        return { score: p?.score || 0 };
    },

    // Tooltip when hovering game entities (optional)
    getEntityTooltip(entity) {
        return null; // return HTML string to show a tooltip
    },

    // Called when elimination events arrive (optional)
    onElimination(msg) {
        // msg: { playerId, playerName, playerColor, killerId, killerName, killerColor }
    },

    // Post-game results (optional)
    getResults(finalState) {
        return finalState;
    },
};
```

### Framework API Available to Game Code

The framework exposes `window.PDROP` with these helpers:

| Method | Purpose |
|--------|---------|
| `PDROP.wsSend(msg)` | Send a message to the server |
| `PDROP.getGameState()` | Get the latest game state from server |
| `PDROP.getLocalPlayerId()` | Get the local player's ID |
| `PDROP.getLocalPlayerFromState()` | Get the local player's data from game state |
| `PDROP.getCurrentLobby()` | Get current lobby info |
| `PDROP.camera` | Camera state object `{ x, y, locked, ... }` |
| `PDROP.escapeHtml(str)` | Escape HTML for safe rendering |
| `PDROP.COLORS` | The 12-color palette array |
| `PDROP.COLOR_NAMES` | Color name strings array |

---

## Step 4: Game CSS and DOM in index.html

Open `public/index.html`. Find the sections marked with comments:

```html
<!-- ── Game CSS (replace for new games) ── -->
```

```html
<!-- ── Game DOM (replace for new games) ── -->
```

Replace those sections with your game's styles and HUD elements. Keep everything marked `<!-- Framework -->` untouched.

Common game DOM elements: kill feed, score display, round timer, ability cooldown indicators.

---

## Step 5: Wire It Up

In `server.js`, change the require:

```js
const game = require('./game/yourgame');
```

Test: `npm start`, open `localhost:3000`, create a lobby, start a game.

---

## Speed Reference

Movement speed in pixels per tick (20 ticks/sec):

| px/tick | px/sec | Feel |
|---------|--------|------|
| 3 | 60 | Very slow, tactical |
| 5 | 100 | Walking pace |
| 7 | 140 | Default / brisk |
| 10 | 200 | Fast, action game |
| 15 | 300 | Very fast, dodging game |

For reference, the PDROP Arrow example uses `speed: 7`, arrow speed `10`.

---

## Interpolation

The server sends state 20 times per second but the client renders at ~60fps. Without interpolation, entities jump every 50ms. The framework handles basic linear interpolation between the last two states if the game provides position data in the standard format (`{ x, y }` on player/entity objects in `getState()`).

If you see stutter, make sure your state objects include `x` and `y` — the framework interpolates those automatically.

---

## Checklist

- [ ] Design doc in `docs/`
- [ ] `game/yourgame.js` with server hooks
- [ ] `public/game.js` with `window.GameDef`
- [ ] Game CSS/DOM sections in `index.html`
- [ ] `server.js` require path updated
- [ ] Test locally with multiple browser tabs
- [ ] Push to GitHub → Railway deploys automatically
