# Run Kitty Run! (RKR!) — PDROP Game Design Document

A multiplayer top-down pseudo-3D maze survival game. Players control kittens racing through a dangerous spiral maze filled with patrolling dogs. Reach the center goal zone to win — but one touch from a dog means death. Step on the black ground between corridors and you die too. Teammates can revive you.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Tech & Deployment](#2-tech--deployment)
3. [Project Structure](#3-project-structure)
4. [Game Rules](#4-game-rules)
5. [The Maze](#5-the-maze)
6. [Player Character (Kitten)](#6-player-character-kitten)
7. [Dogs (Enemies)](#7-dogs-enemies)
8. [Controls](#8-controls)
9. [Camera](#9-camera)
10. [Death & Revival](#10-death--revival)
11. [Win Conditions](#11-win-conditions)
12. [Lobby Configuration](#12-lobby-configuration)
13. [Game Flow](#13-game-flow)
14. [Networking](#14-networking)
15. [HUD & UI](#15-hud--ui)
16. [Visual Style (Pseudo-3D)](#16-visual-style-pseudo-3d)
17. [Constants](#17-constants)

---

## 1. Overview

| Property | Value |
|----------|-------|
| Game ID | `rkr` |
| Name | Run Kitty Run! |
| Max Players | 12 |
| Modes | FFA, Teams (2, 3, or 4 teams) |
| Win Condition | First player/team to reach the center goal |
| Perspective | Top-down pseudo-3D (MOBA-style camera) |
| World Size | 4800 × 4800 |

Players are kittens. The maze is a rectangular spiral that winds from the outer edges inward to a central goal zone. The corridors between safe zones are patrolled by dogs. One touch from a dog = death. Stepping off the path onto the black void ground = death. Teammates (or any player in FFA) can revive dead players by walking over their death marker. The first player or team to reach the center goal zone wins.

In FFA mode, all players are effectively on the same team — anyone can revive anyone. The race is individual: first kitten to the center wins.

---

## 2. Tech & Deployment

Identical to the PDROP Arrow example. Node.js + Express + `ws`. No build step. Railway auto-deploy. See `CLAUDE.md` for details.

---

## 3. Project Structure

```
PDROP-Framework/
├── CLAUDE.md
├── package.json                     ← UNCHANGED
├── server.js                        ← One-line change: require('./game/rkr')
│
├── server/
│   └── framework.js                 ← UNCHANGED
│
├── game/
│   └── rkr.js                       ← NEW: Server game logic + maze + dogs + constants
│
├── public/
│   ├── index.html                   ← MODIFIED: Replace game CSS/DOM sections
│   ├── framework.js                 ← UNCHANGED
│   └── game.js                      ← NEW: Client GameDef + pseudo-3D rendering
│
└── docs/
    ├── pdrop-framework.md
    ├── pdrop-arrow-design.md
    └── rkr-design.md                ← This file
```

---

## 4. Game Rules

### 4.1 Core Loop

1. All kittens spawn in the starting safe zone (top-left corner of the maze)
2. Right-click to move through the maze corridors
3. Avoid dogs patrolling the danger zones
4. **Stay on the path** — the black ground between corridors is lethal
5. Reach the center goal zone to win (or help your whole team reach it)
6. If a dog touches you or you step on the void, you die — a teammate must revive you

### 4.2 Two Ways to Die

1. **Dog collision** — a patrolling dog touches your kitten
2. **Void ground** — your kitten touches the black ground outside of safe zones, danger zones, or the goal zone

Both result in the same death mechanic (see §10). The void ground replaces traditional walls — there are no solid barriers that block movement. Instead, the boundary between corridors is a lethal gap that kills on contact.

### 4.3 FFA Mode

All players can revive each other (everyone is effectively allied). The race is individual: first kitten to step into the center goal zone wins.

### 4.4 Teams Mode

Teams of 2–4 players race against each other. Only teammates can revive each other. Win condition depends on lobby setting (see §11).

### 4.5 No Combat

There is no player-vs-player combat. Players cannot attack each other or the dogs. The only threats are the dogs and the void ground. Players help each other (or their team) survive.

---

## 5. The Maze

### 5.1 Layout Concept

The maze is a rectangular clockwise spiral winding inward from the outer edge to a central goal zone. The overall structure:

- **Start zone** (safe) at the top-left corner — where all players spawn
- **Corridors** (danger) — long rectangular passages patrolled by dogs
- **Safe zones** — small areas at each turn of the spiral where dogs cannot enter, no void ground
- **Goal zone** — the center of the spiral, the finish line
- **Void** — all ground that is not a zone. Black, lethal on contact.

The spiral makes roughly 7 turns from the outside to the center, creating approximately 7 corridors of decreasing length. Each corridor is a danger zone. Each turn is a safe zone. Everything else is void.

### 5.2 World Dimensions

```
WORLD_WIDTH  = 4800
WORLD_HEIGHT = 4800
```

Square world. The maze fills the entire space. The gap between corridors (the void strips) is WALL_THICKNESS (20px).

### 5.3 Zone Types

| Zone Type | In-Game Look | Dogs? | Lethal? | Description |
|-----------|-------------|-------|---------|-------------|
| `safe` | Warm green grass | No | No | Rest areas at spiral turns. Dogs cannot enter. |
| `danger` | Sandy/dirt ground | Yes | No | Corridors between safe zones. Dogs patrol here. |
| `goal` | Golden glow | No | No | Center of the spiral. Stepping in = reaching the goal. |
| `void` | Black/dark | No | **Yes** | Everything outside the zones. Instant death on contact. |

### 5.4 Maze Construction

The maze is defined as a series of rectangular zones. Each zone has:

```js
{
    id: 'zone_0',
    type: 'safe',        // 'safe' | 'danger' | 'goal'
    x: 0, y: 0,         // top-left corner
    w: 400, h: 400,     // dimensions
    dogCount: 0,         // how many dogs spawn here (0 for safe/goal)
    order: 0,            // sequence in the spiral (0 = start, last = goal)
}
```

Any world coordinate that does not fall inside any zone is void ground. There are no explicit wall objects — the void IS the wall. The server checks each tick whether a kitten's position is inside a valid zone. If not, the kitten dies.

### 5.5 Spiral Construction Parameters

```
WALL_THICKNESS   = 20       // gap width between corridors (void strip)
CORRIDOR_WIDTH   = 400      // width of each corridor (and safe zone)
```

The spiral is built ring by ring from outside in. Each ring consists of 4 corridors (top, right, bottom, left) with safe zones at each corner transition. As rings shrink inward, corridor lengths decrease. The innermost area is the goal zone.

### 5.6 Zone Ordering

Zones are numbered sequentially following the spiral path from start to goal:

```
Zone 0:  Start (safe) — top-left corner
Zone 1:  Top corridor (danger) — runs right
Zone 2:  Safe zone — top-right corner
Zone 3:  Right corridor (danger) — runs down
Zone 4:  Safe zone — bottom-right corner
Zone 5:  Bottom corridor (danger) — runs left
Zone 6:  Safe zone — bottom-left corner
Zone 7:  Left corridor (danger) — runs up (partial, leaves gap for next ring entrance)
Zone 8:  Safe zone — transition into ring 2
Zone 9:  Top corridor ring 2 (danger) — shorter
...continues inward...
Zone N:  Goal (center)
```

Each danger zone gets progressively shorter as the spiral tightens.

### 5.7 Void Collision (Lethal Ground)

The server checks every tick whether each living kitten is inside a valid zone. The check:

```js
function isInAnyZone(x, y) {
    for (const zone of zones) {
        if (x >= zone.x && x <= zone.x + zone.w &&
            y >= zone.y && y <= zone.y + zone.h) {
            return true;
        }
    }
    return false;
}

// In tick():
for (const player of players) {
    if (!player.alive) continue;
    if (!isInAnyZone(player.x, player.y)) {
        killPlayer(player);  // stepped on void
    }
}
```

**Movement clamping:** The server does NOT clamp kitten movement to zone boundaries. Instead, the kitten moves freely — but if they end up in the void, they die. This means you CAN walk off the edge of a corridor into the void, and you WILL die. Players must be careful near edges.

**Dogs** are different — dogs are constrained to their assigned zone boundaries (they never enter void). See §7.4.

---

## 6. Player Character (Kitten)

### 6.1 Appearance (Pseudo-3D)

Top-down view with depth cues:

1. **Shadow** — dark ellipse on the ground beneath the kitten
2. **Body** — a rounded shape in the player's color, slightly oval (wider than tall to suggest a cat body from above)
3. **Ears** — two small triangles at the front of the body
4. **Tail** — a curved line trailing behind based on movement direction
5. **Eyes** — two small dots near the front
6. **Name label** — white text with shadow above the character

### 6.2 Player State (Server)

```js
{
    id: 'uuid',
    name: 'Whiskers',
    team: 0,
    color: '#e74c3c',
    colorIndex: 0,
    x: 200,               // world position
    y: 200,
    targetX: 200,          // move-to target
    targetY: 200,
    angle: 0,              // facing direction
    speed: KITTEN_SPEED,   // pixels per tick (from constants)
    alive: true,
    radius: 16,            // collision radius
    deathX: null,          // where they died (for revive marker)
    deathY: null,
    reachedGoal: false,    // true once they step into the goal zone
    invulnTicks: 0,        // countdown after revive
}
```

### 6.3 Movement

Identical to PDROP Arrow — right-click sets a target, kitten moves toward it at constant speed each tick. Server-authoritative. Kitten stops on arrival.

**No path clamping.** The kitten moves in a straight line toward its target. If that line crosses void ground, the kitten will die when it enters the void. Players must click targets that keep them on the path. The server does NOT prevent movement into void — it just kills on contact.

---

## 7. Dogs (Enemies)

### 7.1 Dog Properties

```js
{
    id: 'dog_0',
    zoneId: 'zone_1',     // which danger zone this dog belongs to
    x: 500,
    y: 200,
    angle: 0,
    speed: DOG_SPEED,      // pixels per tick (from constants)
    radius: 18,            // collision radius
    state: 'idle',         // 'idle' | 'walking'
    idleTimer: 0,          // ticks remaining in idle state
    waypoints: [],         // current path (array of {x, y} points)
    waypointIndex: 0,      // which waypoint we're heading to
}
```

### 7.2 Dog AI (State Machine)

Dogs have two states:

**Idle:**
- Stand in place for a random duration between DOG_IDLE_MIN and DOG_IDLE_MAX ticks (2–20 seconds)
- The idle duration is re-rolled each time. This is the **agitation** mechanic — the randomness of 2–20 seconds means some dogs idle briefly and move frequently (agitated), while others rest longer (calm). Over time, the unpredictable mix creates dynamic danger.
- When timer expires, generate a random walk path within the zone and transition to Walking

**Walking:**
- Follow a generated path of 2–4 waypoints within the zone
- Move toward each waypoint in sequence at DOG_SPEED
- When the final waypoint is reached (distance < speed), transition back to Idle
- Path is NOT a straight line — multiple waypoints create curved, meandering movement

### 7.3 Dog Path Generation

When a dog finishes idling, it generates a new path:

1. Pick 2–4 random walkable points within the dog's assigned zone (with margin for dog radius)
2. Store as waypoints array
3. Dog walks to waypoint[0], then waypoint[1], then waypoint[2], etc.
4. On reaching the final waypoint, return to idle

This creates naturalistic wandering — dogs meander through corridors rather than beelining back and forth. Combined with the 2–20 second idle variance, some dogs feel restless and hyperactive while others are lazy.

```js
function generateDogPath(dog, zone) {
    const numWaypoints = DOG_WAYPOINTS_MIN +
        Math.floor(Math.random() * (DOG_WAYPOINTS_MAX - DOG_WAYPOINTS_MIN + 1));
    const margin = dog.radius + 4;
    const waypoints = [];
    for (let i = 0; i < numWaypoints; i++) {
        waypoints.push({
            x: zone.x + margin + Math.random() * (zone.w - margin * 2),
            y: zone.y + margin + Math.random() * (zone.h - margin * 2),
        });
    }
    dog.waypoints = waypoints;
    dog.waypointIndex = 0;
}
```

### 7.4 Dog Zone Boundaries

Each dog is assigned to a specific danger zone. Unlike kittens, dogs are **hard-clamped** to their zone — they cannot leave, and their waypoints are always generated within bounds. Dogs never enter safe zones, the goal zone, or the void.

### 7.5 Dog Count Per Zone — Difficulty Scaling

Dogs per zone starts at a base count for the first (outermost) danger zone and decreases by LESS_DOGS_PER_ZONE for each subsequent danger zone in the spiral. Since corridors get shorter as you go inward, fewer dogs maintains similar density pressure.

**Constants:**

```js
DOGS_PER_ZONE_EASY   = 20    // base for outermost danger zone on Easy
DOGS_PER_ZONE_MEDIUM = 25    // base for outermost danger zone on Medium
DOGS_PER_ZONE_HARD   = 30    // base for outermost danger zone on Hard
LESS_DOGS_PER_ZONE   = 1     // subtract this many per subsequent danger zone
MIN_DOGS_PER_ZONE    = 2     // floor — even smallest zones get some dogs
```

**Formula:** `dogsInZone(dangerIndex) = max(MIN_DOGS_PER_ZONE, base - (dangerIndex * LESS_DOGS_PER_ZONE))`

Where `dangerIndex` is 0 for the first danger zone, 1 for the second, etc. (only counting danger zones, not safe zones).

**Example (Easy, 7 danger zones):**

| Danger Zone | Dogs |
|-------------|------|
| 1st (outermost, longest) | 20 |
| 2nd | 19 |
| 3rd | 18 |
| 4th | 17 |
| 5th | 16 |
| 6th | 15 |
| 7th (innermost, shortest) | 14 |

### 7.6 Dog Appearance (Pseudo-3D)

- **Shadow** — dark ellipse, slightly larger than kittens
- **Body** — brown/dark rounded shape, slightly larger than kittens
- **Ears** — floppy ear shapes (drooping to sides, distinct from kitten pointed ears)
- **Snout** — small protruding shape at front
- **Tail** — short wagging indicator
- **Color** — all dogs share the same brown/tan color scheme. No player colors.

### 7.7 Dog-Kitten Collision

Checked server-side every tick:

```js
for (const dog of dogs) {
    for (const player of players) {
        if (!player.alive) continue;
        if (player.reachedGoal) continue;
        if (player.invulnTicks > 0) continue;  // recently revived
        const dist = Math.hypot(dog.x - player.x, dog.y - player.y);
        if (dist < dog.radius + player.radius) {
            killPlayer(player);
        }
    }
}
```

---

## 8. Controls

| Input | Action |
|-------|--------|
| Right-click (on game world) | Move kitten to clicked position |
| `Y` | Toggle camera lock to kitten |
| `Space` | Snap camera to kitten |
| Mouse wheel | Zoom in/out |
| Mouse to screen edge | Edge scroll (when camera unlocked) |
| `Enter` | Chat (team) |
| `Shift + Enter` | Chat (all) |
| `Escape` | Scoreboard |
| `Alt + Click` | Ping |

No abilities, no attacks, no special actions. Pure movement and survival.

### 8.1 Input While Dead

Dead players cannot move (right-click does nothing). Camera switches to free mode — dead players can free-cam anywhere and use pings to scout/communicate for living teammates. Chat still works. Y and Space have no lock target.

### 8.2 Input After Reaching Goal

Players who have reached the goal zone stop moving. Their kitten is shown in the goal area. Camera switches to free mode so they can spectate and help guide teammates via pings. They can chat and ping.

---

## 9. Camera

Uses the framework camera system identically to PDROP Arrow.

```js
getCameraLockTarget(localPlayer) {
    if (localPlayer && localPlayer.alive && !localPlayer.reachedGoal) {
        return { x: localPlayer.x, y: localPlayer.y };
    }
    return null;
}

getCameraSnapTarget(localPlayer) {
    if (localPlayer && localPlayer.alive && !localPlayer.reachedGoal) {
        return { x: localPlayer.x, y: localPlayer.y };
    }
    return null;
}
```

| Player State | Y (lock) | Space (jump) | Edge Scroll |
|-------------|----------|-------------|-------------|
| Alive & running | Locks to kitten | Jumps to kitten | When unlocked |
| Dead | Disabled | Disabled | Always (free-cam spectating) |
| Reached Goal | Disabled | Disabled | Always (free-cam spectating) |

Camera starts Y-locked on spawn. On death or goal reached, switches to free camera.

---

## 10. Death & Revival

### 10.1 Two Causes of Death

1. **Dog collision** — a patrolling dog's radius overlaps the kitten's radius
2. **Void contact** — the kitten's position falls outside any valid zone

Both trigger the same death flow.

### 10.2 Death Flow

When a kitten dies:

1. Server sets `player.alive = false`
2. Server stores `player.deathX = player.x`, `player.deathY = player.y`
3. Server clears movement target (stop processing movement)
4. Broadcast event: `{ type: 'kitten_caught', playerId, playerName, playerColor }`
5. Client hides the kitten sprite and shows a **death marker** — a pulsing circle in the player's color at the death position

**Void death note:** If a kitten dies in the void, the death marker appears at the void position. Teammates must walk to the edge of a corridor near the marker to revive — the revive radius (40px) extends far enough that a teammate can stand at the edge of a zone and still reach a death marker slightly into the void.

### 10.3 Death Marker

The death marker is rendered as:
- A circle on the ground in the player's color (semi-transparent, pulsing gently)
- A small paw print icon in the center
- Visible to all players at all times

### 10.4 Revival

When a **living teammate** (or any living player in FFA) moves close enough to a death marker:

1. Server checks: `dist(livingPlayer, deathMarker) < REVIVE_RADIUS`
2. Server sets `deadPlayer.alive = true`
3. **Revived player respawns at the reviver's position** (not the death marker) — this prevents instant re-death if the marker is in the void or next to a dog
4. Server clears deathX/deathY
5. Brief invulnerability: REVIVE_INVULN_TICKS (2 ticks = 0.1 seconds)
6. Broadcast event: `{ type: 'kitten_revived', playerId, playerName, reviverId, reviverName }`

### 10.5 Revival Rules

- **FFA:** Any living player can revive any dead player
- **Teams:** Only living teammates can revive dead teammates
- **Self-revive:** Not possible. You need someone else.
- **Revive radius:** REVIVE_RADIUS constant (40px)
- **Invulnerability after revive:** REVIVE_INVULN_TICKS (2 ticks = 0.1 seconds). Just enough to prevent same-frame re-collision, not a meaningful safety window. Getting revived near dogs is still very dangerous.

---

## 11. Win Conditions

### 11.1 Reaching the Goal

When a kitten steps into the center goal zone (server checks each tick):

```js
if (isInZone(player, goalZone) && !player.reachedGoal) {
    player.reachedGoal = true;
    broadcast({ type: 'kitten_reached_goal', playerId, playerName, playerColor });
}
```

The kitten remains visible in the goal zone but stops moving. They cannot leave.

### 11.2 FFA Win Condition

**First player** to reach the goal wins. Instant win — the game ends immediately.

### 11.3 Teams Win Conditions

The host selects one of two modes in the lobby settings:

**First In:** The first team to have **any one** player reach the goal wins. Same as FFA but team-based — if Player A (Team Red) reaches the goal, Team Red wins immediately.

**All In:** The first team to have **all members** in the goal wins. This means:
- Every team member must reach the goal zone
- Dead teammates count as NOT in the goal — they must be revived first, then make it to the center
- A team cannot win with dead members
- This creates a critical strategic decision: rush ahead alone, or stay together and protect each other?

### 11.4 Edge Case: Total Wipe

If all players (FFA) or all members of every team are dead simultaneously with no one alive to perform revives, the game is a stalemate. The server detects this and ends the round with no winner.

---

## 12. Lobby Configuration

### 12.1 GameDef Properties

```js
{
    id: 'rkr',
    name: 'Run Kitty Run!',
    maxPlayers: 12,
    supportedModes: ['ffa', 'teams'],
    defaultMode: 'ffa',
    defaultTeamCount: 2,
    worldWidth: 4800,
    worldHeight: 4800,
}
```

### 12.2 Custom Settings

| Setting | Options | Default | Description |
|---------|---------|---------|-------------|
| Difficulty | Easy / Medium / Hard | Easy | Controls base dogs per zone (20 / 25 / 30) |
| Win Mode | First In / All In | First In | Teams only — does one player or all need to reach the goal? |

These are rendered as dropdown selectors in the lobby UI. Host-only controls. The framework passes `settings` through to the game module.

In FFA mode, the Win Mode setting is hidden (always First In).

### 12.3 Scoreboard Columns

```js
getScoreboardColumns() {
    return [
        { key: 'status', label: 'Status', width: 100 },
    ];
}

getPlayerStats(playerId) {
    // Status: "Running" | "Caught!" | "Finished!"
}
```

---

## 13. Game Flow

```
LOBBY
  ├── Players join, pick teams, host sets difficulty + win mode
  ├── Host starts game
  ▼
COUNTDOWN (3 seconds)
  ├── "3... 2... 1... RUN!" overlay
  ├── Players see the maze, their spawn position, and all the dogs
  ├── Movement disabled
  ├── Camera locked to kitten
  ▼
PLAYING
  ├── Right-click to move through the maze
  ├── Avoid dogs and void ground
  ├── Revive teammates
  ├── Race to the center goal zone
  ▼
ROUND OVER
  ├── Winner announced
  ├── Show who reached the goal, who was caught
  ▼
POST GAME
  ├── Results: winner, stats
  ├── [Rematch] → returns to lobby
  ├── [Leave] → main menu
```

---

## 14. Networking

### 14.1 State Broadcast

Every tick (20/sec), the server broadcasts:

```js
{
    type: 'game_state',
    players: [
        { id, name, team, color, colorIndex, x, y, angle, alive, radius,
          deathX, deathY, reachedGoal, invulnTicks }
    ],
    dogs: [
        { id, x, y, angle, radius, state }
    ],
}
```

The maze layout (zones) is sent once at game start as part of the countdown message, since it never changes during a round:

```js
{
    type: 'game_countdown',
    seconds: 3,
    players: [...],
    maze: {
        zones: [...],   // array of { id, type, x, y, w, h, order }
    },
}
```

### 14.2 Client → Server Messages

| Type | Payload | When |
|------|---------|------|
| `move` | `{ x, y }` | Right-click on world |

That's it. No shooting, no abilities. Just movement.

### 14.3 Events

| Event | Payload | When |
|-------|---------|------|
| `kitten_caught` | `{ playerId, playerName, playerColor }` | Dog catches kitten or kitten steps on void |
| `kitten_revived` | `{ playerId, playerName, reviverId, reviverName }` | Teammate revives kitten |
| `kitten_reached_goal` | `{ playerId, playerName, playerColor }` | Kitten enters goal zone |

---

## 15. HUD & UI

### 15.1 Status Bar (Top Center)

Shows race progress: how many players/teams are running, caught, or finished.

**FFA:** `3 running · 1 caught · 1 finished`

**Teams:** Per-team status with colors.

### 15.2 Event Feed (Top Right)

Shows recent events (replaces kill feed from Arrow):

```
Whiskers was caught!
Mittens revived Whiskers!
Shadow reached the goal!
```

Entries fade after 5 seconds.

### 15.3 Personal Status (Bottom Center, above chat)

If dead: `You were caught! Waiting for revival...`
If finished: `You made it! Cheering on teammates...`

---

## 16. Visual Style (Pseudo-3D)

### 16.1 Ground — Zone Surfaces

- **Safe zones:** Warm green grass. Subtle texture variation (canvas noise pattern), not flat color. Feels cozy and sheltered.
- **Danger zones:** Sandy/dirt ground — warm tan/beige with subtle texture. Feels exposed and dangerous.
- **Goal zone:** Golden/glowing ground. Subtle pulsing radial glow effect. Feels like a beacon pulling you in.
- **Void (lethal ground):** Very dark — near black (`#0a0a0f`) with a subtle dark texture or faint ominous pattern. Feels like an abyss. A faint edge glow (dark red or dark purple) along the border where zones meet void, hinting at the danger.

### 16.2 Zone Borders

Since there are no physical walls, the transition between walkable zones and void is visually critical:

- **Edge highlighting:** A subtle bright border (1-2px) along zone edges where they meet void, so players can clearly see the boundary
- **Void glow:** A faint dark gradient emanating from the void toward the zone edge, creating a "don't go there" visual cue
- **Safe zone borders:** A slightly warmer/brighter edge where safe zones meet danger zones, marking the transition

### 16.3 Dogs

Brown/tan colored. Slightly larger than kittens. Floppy ears distinguish them from the pointy-eared kittens. When idle, they face a random direction with a subtle body bob ("sniffing"). When walking, they face their movement direction. Meandering movement (following waypoints) looks natural.

### 16.4 Kittens

Player-colored body. Pointy ears. A small curved tail. Eyes visible as two dots. When moving, a subtle walking animation. The player's color is the dominant body color. White/light chest marking for visual interest.

### 16.5 Death Marker

A semi-transparent circle in the player's color, gently pulsing (scale + alpha oscillation). A small paw print icon in the center. Visible to all players at all times. Renders on top of void ground so teammates can see where to go for revival.

### 16.6 Rendering Order (Bottom to Top)

1. Void ground fill (dark, covers entire world)
2. Zone ground fills (green / tan / gold, painted on top of void)
3. Zone edge borders and void glow effects
4. Faint grid overlay on walkable zones
5. Death markers
6. Entity shadows (dogs, kittens)
7. Dog bodies
8. Kitten bodies
9. Name labels
10. Invulnerability shimmer (brief flash after revive)
11. Pings

### 16.7 Fog of War

No fog of war. All dogs and players are visible at all times (within the camera viewport). The maze is fully revealed from the start. The challenge is navigation and timing, not information.

Dead players can free-cam and use pings to scout for living teammates — this is intentional team strategy.

---

## 17. Constants

All gameplay-tuning values live in a constants block at the top of `game/rkr.js`:

```js
// ── World ──
const WORLD_WIDTH = 4800;
const WORLD_HEIGHT = 4800;
const WALL_THICKNESS = 20;       // void gap between corridors
const CORRIDOR_WIDTH = 400;      // width of corridors and safe zones

// ── Kitten ──
const KITTEN_SPEED = 5;          // pixels per tick (100 px/sec)
const KITTEN_RADIUS = 16;

// ── Dogs ──
const DOG_SPEED = 4;             // pixels per tick (80 px/sec)
const DOG_RADIUS = 18;
const DOG_IDLE_MIN = 40;         // min idle ticks (2 seconds)
const DOG_IDLE_MAX = 400;        // max idle ticks (20 seconds)
const DOG_WAYPOINTS_MIN = 2;     // min waypoints per walk path
const DOG_WAYPOINTS_MAX = 4;     // max waypoints per walk path

// ── Dog Counts ──
const DOGS_PER_ZONE_EASY = 20;   // base for outermost danger zone
const DOGS_PER_ZONE_MEDIUM = 25;
const DOGS_PER_ZONE_HARD = 30;
const LESS_DOGS_PER_ZONE = 1;    // subtract per subsequent danger zone
const MIN_DOGS_PER_ZONE = 2;     // floor

// ── Revival ──
const REVIVE_RADIUS = 40;        // how close to revive
const REVIVE_INVULN_TICKS = 2;   // 0.1 seconds — just prevents same-frame re-kill

// ── Spawn ──
const SPAWN_SPREAD = 30;         // spread players within start zone
```

### 17.1 Speed Feel Reference

| px/tick | px/sec | Feel |
|---------|--------|------|
| 3 | 60 | Very slow, tactical |
| 4 | 80 | Dog patrol speed — deliberate |
| 5 | 100 | Kitten default — slightly faster than dogs |
| 7 | 140 | Sprint (not used, available for future power-ups) |

Kittens being slightly faster than dogs means you can outrun a dog in open space — but in tight corridors with multiple dogs, you can get boxed in. The danger isn't any single dog, it's the density and unpredictable timing.

### 17.2 Dog Agitation Feel

The DOG_IDLE_MIN (2s) to DOG_IDLE_MAX (20s) range creates a wide spread of dog behavior:
- A dog that rolls 2 seconds idle feels hyperactive — constantly on the move
- A dog that rolls 20 seconds idle feels lazy — sits still for a long time then suddenly moves
- With 15–20 dogs in a zone, the distribution creates a chaotic, dynamic field of movement
- This IS the agitation mechanic — no separate meter needed. The randomness is the danger.

---

## Appendix A: Maze Zone Data

The maze is generated programmatically. The generator starts from the outer ring and works inward. Each ring of the spiral adds 4 corridors and 4 safe zones (except the last partial ring). The algorithm:

1. Start with the full 4800×4800 space
2. Place the outermost ring: top corridor, right corridor, bottom corridor, left corridor (leaving a gap for the next ring's entrance). Safe zones at each corner.
3. Shrink the working area inward by CORRIDOR_WIDTH + WALL_THICKNESS on each side
4. Repeat until the remaining space is too small for another ring
5. The remaining center space becomes the goal zone

The maze layout is **deterministic** — same world size and corridor width always produces the same maze. No randomization of the map itself. Only the dogs' idle durations and walk paths are random.

---

## Appendix B: Resolved Design Decisions

| Question | Decision |
|----------|----------|
| Dog speed vs kitten speed | Kittens faster (5 vs 4). Outrun in straight line, boxed in by multiples. |
| Dog agitation | 2–20 second random idle range. Wide variance = unpredictable. No chase/alert mechanic. |
| Dog movement paths | Multi-waypoint (2–4 points). Meandering, not straight lines. |
| Revive invulnerability | 0.1 seconds (2 ticks). Prevents same-frame re-kill only. Still dangerous. |
| Dead player vision | Free-cam + pings enabled. Intentional team scouting strategy. |
| Walls | No physical walls. Void ground is lethal on contact. Replaces barriers. |
| All In win mode | Dead teammates must be revived. Team cannot win with dead members. |
| Revive spawn position | Revived player appears at reviver's position, not death marker. |
