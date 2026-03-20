# PDROP Framework

A standardized framework for building simple HTML/JS multiplayer games with a shared UI toolkit, networking layer, and camera system. Every game built on this framework inherits the same lobby, chat, tooltip, ping, and rendering infrastructure — only the game logic changes.

---

## Table of Contents

1. [Tech Stack](#1-tech-stack)
2. [Core Architecture](#2-core-architecture)
3. [Rendering & Scaling (1920×1080)](#3-rendering--scaling-1920×1080)
4. [Typography](#4-typography)
5. [Camera System](#5-camera-system)
6. [Chat System](#6-chat-system)
7. [Ping System](#7-ping-system)
8. [Scoreboard & Mute System](#8-scoreboard--mute-system)
9. [Tooltip System](#9-tooltip-system)
10. [Player Identity & Colors](#10-player-identity--colors)
11. [Lobby & Server System](#11-lobby--server-system)
12. [Game Lifecycle](#12-game-lifecycle)

---

## 1. Tech Stack

| Layer | Technology |
|-------|-----------|
| Client | HTML5 Canvas (1920×1080, scaled to viewport), plain JS |
| Server | Node.js + Express + WebSocket (`ws`) |
| Build | None — no bundler, no transpiler, no framework |

Everything is vanilla. A game is a single `.html` file for the client and a single `.js` file for the server. No build step.

---

## 2. Core Architecture

Every PDROP game is a single HTML page with three layers inside one container:

```
<div id="game-container">           ← 1920×1080, centered, CSS-scaled to viewport
    <canvas id="game-canvas"        ← Game world (sprites, terrain, entities)
            width="1920"
            height="1080">
    </canvas>
    <div id="ui">                   ← DOM overlay (chat, tooltips, HUD, lobby)
        <!-- All UI lives here -->
    </div>
</div>
```

**Layers:**

| Layer | Element | Purpose | Scaling Method |
|-------|---------|---------|----------------|
| World | `<canvas>` | Game rendering — sprites, shapes, canvas-drawn text | CSS stretch (width/height: 100%) |
| UI | `<div id="ui">` | Chat, tooltips, HUD, lobby screens, menus | CSS `zoom` (crisp text at all sizes) |

The canvas handles the game world. The DOM overlay handles all interactive UI. Both share the same 1920×1080 coordinate space but scale independently so canvas art stretches while DOM text re-rasterizes and stays sharp.

### Framework vs Game Code

The codebase is split into **framework files** and **game files**:

| Side | Framework File | Game File |
|------|---------------|-----------|
| Server | `server/framework.js` — lobby, slots, chat, pings, tick loop | `game/*.js` — game logic, collision, win conditions |
| Client | `public/framework.js` — scaling, camera, chat UI, pings, scoreboard, tooltips, lobby UI | `public/game.js` — `GameDef` hooks, rendering, input, HUD |
| HTML/CSS | `public/index.html` — shell, framework CSS, `<script>` tags | `public/index.html` — also holds game-specific CSS and any game DOM |

`index.html` is shared territory. It contains the framework structure (container, canvas, `#ui` overlay, framework CSS) and also game-specific CSS and any extra game markup. When starting a new game, you keep the framework parts and replace the game parts. The framework sections are clearly commented.

**To start a new game from this repo:**

1. In `index.html` — remove game-specific CSS and DOM (marked with comments), keep framework structure
2. Delete `game/arrow.js` — write a new server game module with the same hook interface
3. Delete `public/game.js` — write a new `window.GameDef` with only the hooks you need
4. Change the require path in `server.js`

Three framework files are never touched: `server/framework.js`, `public/framework.js`, and `package.json`.

---

## 3. Rendering & Scaling (1920×1080)

All games target a fixed **1920×1080 virtual resolution**. The framework scales this to fit any viewport with black letterboxing on the short axis.

### 3.1 Game Container

```css
#game-container {
    position: absolute;
    width: 1920px;
    height: 1080px;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    transform-origin: center center;
}

/* Viewport narrower than 16:9 — width constrains */
@media (max-aspect-ratio: 16/9) {
    #game-container { width: 100vw; height: calc(100vw * 9 / 16); }
}

/* Viewport wider than 16:9 — height constrains */
@media (min-aspect-ratio: 16/9) {
    #game-container { height: 100vh; width: calc(100vh * 16 / 9); }
}
```

### 3.2 Canvas Layer

The canvas has a fixed internal buffer of 1920×1080 pixels. All drawing (`ctx.arc()`, `ctx.fillText()`, etc.) uses that coordinate space. CSS stretches the buffer to fill the container.

```css
#game-canvas {
    display: block;
    width: 100%;
    height: 100%;
    background: #12141a;
}
```

### 3.3 DOM UI Overlay (Crisp Text via CSS Zoom)

The `#ui` div is always 1920×1080 in CSS. You author UI elements in that coordinate space (e.g., a chatbox at `bottom: 16px; left: 16px; width: 480px`). On load and every resize, the overlay is zoom-scaled to match the container:

```css
#ui {
    position: absolute;
    top: 0; left: 0;
    width: 1920px;
    height: 1080px;
    z-index: 10;
    pointer-events: none;
}

#ui > * { pointer-events: auto; }
```

```js
function updateScale() {
    const s = document.getElementById('game-container').offsetWidth / 1920;
    document.getElementById('ui').style.zoom = s;
}
updateScale();
window.addEventListener('resize', updateScale);
```

### 3.4 Why `zoom` Instead of `transform: scale()`

| Property | Behavior | Text Quality |
|----------|----------|-------------|
| `transform: scale(s)` | Renders at 1920×1080, then scales the bitmap | **Blurry** — scaling a pre-rendered image |
| `zoom: s` | Browser renders directly at the target size | **Crisp** — rasterized at final pixel size |

`zoom` is non-standard but supported in Chrome, Edge, Safari, and Firefox 126+. This covers effectively all modern browsers.

### 3.5 Pointer Events

The overlay has `pointer-events: none` so clicks fall through to the canvas. Each child element (chatbox, buttons, panels) gets `pointer-events: auto` back via `#ui > *`. This means the canvas handles world interaction (right-click, click-to-move, etc.) while DOM elements handle their own input.

### 3.6 Screen-to-World Coordinate Conversion

When the canvas needs to interpret mouse input, convert screen coordinates to the 1920×1080 canvas space:

```js
canvas.addEventListener('click', function (e) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left) * (1920 / rect.width);
    const canvasY = (e.clientY - rect.top) * (1080 / rect.height);
});
```

When a camera is active, subtract the camera offset after this conversion to get world coordinates.

---

## 4. Typography

All PDROP games use a single font family for both DOM UI and canvas-drawn text.

### 4.1 Font: Rajdhani

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap"
      rel="stylesheet">
```

```css
html, body {
    font-family: 'Rajdhani', sans-serif;
}
```

Canvas text:
```js
ctx.font = '600 22px Rajdhani';
```

### 4.2 Standard Weights

| Weight | Use |
|--------|-----|
| 400 | Body text, descriptions |
| 500 | Chat messages, labels |
| 600 | Player names, headings, canvas labels |
| 700 | Emphasis, titles, important HUD values |

### 4.3 Standard Sizes (in 1920×1080 Space)

| Context | Size |
|---------|------|
| Chat messages | 20px |
| Chat input | 20px |
| HUD labels | 18px |
| HUD values / large | 24–28px |
| Tooltips | 18–20px |
| Canvas player names | 22px (ctx.font) |
| Lobby headings | 32–40px |
| Ping labels | 11px (canvas, bold Consolas — exception to Rajdhani) |

---

## 5. Camera System

Top-down RTS-style camera, similar to League of Legends. The camera defines a viewport into a larger world. The canvas renders a zoomed window into the world — the camera controls which slice you see.

### 5.1 Camera State

```js
const camera = {
    x: 0,                  // world X of the viewport's top-left corner
    y: 0,                  // world Y of the viewport's top-left corner
    locked: false,         // whether camera is persistently locked to lockTarget
    lockTarget: null,      // entity the camera follows when locked (game-defined)
    snapTarget: null,      // point of interest Space jumps to (game-defined)
    spaceHeld: false,      // true while Space is held down
    edgeScrollSpeed: 12,   // pixels per frame when edge scrolling
    edgeScrollMargin: 40,  // pixel band at screen edge that triggers scrolling
    zoom: 1,               // current zoom level (1 = default)
    minZoom: 0.5,          // maximum zoom out
    maxZoom: 2,            // maximum zoom in
};
```

The effective viewport size in world units is `1920 / zoom` × `1080 / zoom`. Screen-to-world conversion: `worldX = screenX / zoom + camera.x`.

### 5.2 Camera Inputs

Three input types:

| Key | Action | Behavior |
|-----|--------|----------|
| `Y` | Toggle camera lock | Toggles `camera.locked` on/off. Camera follows `lockTarget` continuously until toggled off. **Game-defined — some games disable this entirely.** |
| `Space` | Snap to point of interest | Camera snaps to `snapTarget` and stays there on release. Does **not** change `camera.locked` state. |
| Mouse wheel | Zoom in/out | Scroll up to zoom in, scroll down to zoom out. Zooms toward cursor position. Range: 0.5× to 2×. |

### 5.3 Y — Camera Lock Toggle

`Y` toggles persistent lock. The camera stays centered on `lockTarget` every frame until the player presses `Y` again. Games define what `lockTarget` is, or can disable the `Y` toggle entirely by not providing one.

**When it makes sense:** Games where the player controls a single entity (MOBA champion, character in an arena). Lock target = the player's unit.

**When it doesn't:** Games where the player manages many things (RTS, tower defense). There's no single entity to lock onto, so `Y` does nothing — `getCameraLockTarget()` returns `null`.

```js
function onKeyDown_Y() {
    if (!GameDef.getCameraLockTarget) return;         // game doesn't support lock
    const target = GameDef.getCameraLockTarget(localPlayer);
    if (!target) return;                               // no valid target

    camera.locked = !camera.locked;
    camera.lockTarget = target;
    if (camera.locked) {
        camera.x = target.x - 960;
        camera.y = target.y - 540;
    }
}
```

### 5.4 Space — Snap to Point of Interest

`Space` snaps the camera to the game's defined point of interest (`snapTarget`). While held, the camera follows the target. On release, the camera **stays** at the new position. It does **not** change `camera.locked` state.

Every game defines a snap target. It's often the same as the lock target, but doesn't have to be:

| Game Type | `lockTarget` (Y) | `snapTarget` (Space) |
|-----------|-------------------|----------------------|
| MOBA | Player's champion | Player's champion |
| RTS | *(disabled)* | Player's base / HQ |
| Tower Defense | *(disabled)* | Main tower / spawn |
| Arena FFA | Player's character | Player's character |

```js
function onKeyDown_Space() {
    const target = GameDef.getCameraSnapTarget(localPlayer);
    if (!target) return;
    camera.spaceHeld = true;
    camera.snapTarget = target;
}

function onKeyUp_Space() {
    if (!camera.spaceHeld) return;
    camera.spaceHeld = false;
    camera.snapTarget = null;
}
```

### 5.5 Edge Scrolling

When the camera is free (not locked, Space not held), moving the mouse into the edge band scrolls the camera:

```js
function handleEdgeScroll(mouseCanvasX, mouseCanvasY) {
    if (camera.locked || camera.spaceHeld) return;

    if (mouseCanvasX < camera.edgeScrollMargin)          camera.x -= camera.edgeScrollSpeed;
    if (mouseCanvasX > 1920 - camera.edgeScrollMargin)   camera.x += camera.edgeScrollSpeed;
    if (mouseCanvasY < camera.edgeScrollMargin)           camera.y -= camera.edgeScrollSpeed;
    if (mouseCanvasY > 1080 - camera.edgeScrollMargin)   camera.y += camera.edgeScrollSpeed;
}
```

### 5.6 World-to-Screen Conversion

When drawing entities on the canvas, subtract the camera offset:

```js
function worldToScreen(worldX, worldY) {
    return {
        x: worldX - camera.x,
        y: worldY - camera.y
    };
}
```

When interpreting mouse clicks on the canvas, add the camera offset (accounting for zoom):

```js
function screenToWorld(screenX, screenY) {
    return {
        x: screenX / camera.zoom + camera.x,
        y: screenY / camera.zoom + camera.y
    };
}
```

### 5.7 Camera Update (Per Frame)

```js
function updateCamera() {
    const vw = 1920 / camera.zoom;
    const vh = 1080 / camera.zoom;

    // Space snap takes priority
    if (camera.spaceHeld && camera.snapTarget) {
        camera.x = camera.snapTarget.x - vw / 2;
        camera.y = camera.snapTarget.y - vh / 2;
    }
    // Y-lock (persistent follow)
    else if (camera.locked && camera.lockTarget) {
        camera.x = camera.lockTarget.x - vw / 2;
        camera.y = camera.lockTarget.y - vh / 2;
    }

    // Clamp — don't let viewport edge pass the opposite world edge
    camera.x = Math.max(-vw, Math.min(camera.x, worldWidth));
    camera.y = Math.max(-vh, Math.min(camera.y, worldHeight));
}
```

### 5.7.1 Zoom

Mouse wheel zooms in/out, centered on the cursor position:

```js
container.addEventListener('wheel', (e) => {
    const oldZoom = camera.zoom;
    camera.zoom = clamp(camera.zoom + (e.deltaY < 0 ? 0.1 : -0.1), 0.5, 2);
    // Zoom toward mouse in world space
    const worldMouseX = mouseCanvasX / oldZoom + camera.x;
    const worldMouseY = mouseCanvasY / oldZoom + camera.y;
    camera.x = worldMouseX - mouseCanvasX / camera.zoom;
    camera.y = worldMouseY - mouseCanvasY / camera.zoom;
});
```

The zoom is applied as a canvas transform before game rendering. HUD elements (ping wheel, countdown) render in screen space after the transform is reset.

### 5.8 Game-Defined Camera Hooks

```js
GameDef.getCameraLockTarget(localPlayer) {
    // Return entity for Y-lock, or null to disable Y-lock in this game
    return localPlayer.champion;   // MOBA
    return null;                   // RTS — no lock
}

GameDef.getCameraSnapTarget(localPlayer) {
    // Return point of interest for Space-jump
    return localPlayer.champion;   // MOBA — same as lock
    return localPlayer.base;       // RTS — jump to base
}
```

### 5.9 Minimap (Optional, Game-Defined)

Games may include a minimap in the DOM overlay. Clicking the minimap sets camera position. The framework does not mandate minimap implementation but the coordinate conversion is straightforward:

```js
// minimapX/Y = (camera.x / worldWidth) * minimapWidth
// clicking minimap: camera.x = (clickX / minimapWidth) * worldWidth - 960
```

---

## 6. Chat System

A persistent chatbox anchored to the bottom-left of the 1920×1080 UI overlay. Supports two channels: **Team** and **All**.

### 6.1 Controls

| Action | Key | Behavior |
|--------|-----|----------|
| Open chat (**Team**) | `Enter` | Opens chat input focused, set to Team channel. |
| Open chat (**All**) | `Shift + Enter` | Opens chat input focused, set to All channel. |
| Send message | `Enter` (while chat focused) | Sends message on the current channel and closes chat. |
| Cycle channel | `Tab` or `Shift` (while chat focused) | Cycles between Team and All channel. |
| Close chat without sending | `Escape` (while chat focused) | Closes input, returns focus to game. |

In **FFA** mode, there is no team channel — chat always sends to All regardless of channel selection.

### 6.2 Chat Message Types

| Type | Prefix | Visibility | Color |
|------|--------|-----------|-------|
| Team | `[Team]` | Your team only | Player's color |
| All | `[All]` | Everyone | Player's color |
| System | None | Everyone | Dim italic (`rgba(255,255,255,0.35)`) |

### 6.3 Message Format

```
[Channel] PlayerName: message text
```

System messages have no prefix or player name:
```
Player3 has joined the game.
Wren has been eliminated.
```

### 6.4 Chat DOM Structure

```html
<div class="chatbox">
    <div class="chat-messages" id="chat-messages">
        <!-- Messages rendered here -->
    </div>
    <div class="chat-input-row">
        <span class="chat-channel-tag" id="chat-channel-tag">[Team]</span>
        <input class="chat-input" id="chat-input" type="text"
               placeholder="Press Enter to chat..." />
    </div>
</div>
```

### 6.5 Chat Behavior

- Chat displays the last ~8 messages (scrollable if needed).
- Messages fade after a timeout when chat is not focused (game-configurable, default 8 seconds).
- When chat input is focused, all messages remain visible.
- While typing, game input (WASD, abilities, etc.) is suppressed.
- The channel tag (`[Team]` or `[All]`) updates live as the player holds or releases `Shift`.
- Messages are filtered through the mute/hide system before rendering (see §8). Muted messages show as `[Muted]: ···`. Hidden messages are not rendered at all.

### 6.6 Chat CSS

```css
.chatbox {
    position: absolute;
    bottom: 16px;
    left: 16px;
    width: 480px;
    background: rgba(10, 12, 18, 0.88);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.chat-messages {
    padding: 14px 16px;
    max-height: 280px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.chat-msg {
    font-size: 20px;
    font-weight: 500;
    line-height: 1.3;
    color: rgba(255, 255, 255, 0.7);
}

.chat-msg .name { font-weight: 700; }
.chat-msg.system { color: rgba(255, 255, 255, 0.35); font-style: italic; }

.chat-channel-tag {
    padding: 10px 8px 10px 14px;
    font-size: 20px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.5);
    font-family: 'Rajdhani', sans-serif;
}

.chat-input-row {
    display: flex;
    align-items: center;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.chat-input {
    flex: 1;
    background: rgba(255, 255, 255, 0.04);
    border: none;
    padding: 10px 14px;
    font-family: 'Rajdhani', sans-serif;
    font-size: 20px;
    font-weight: 500;
    color: #fff;
    outline: none;
}

.chat-input::placeholder { color: rgba(255, 255, 255, 0.2); }
```

### 6.7 FFA vs Team Chat

In **Free-For-All** mode, there is no team channel. `Enter` sends to All. The `[Team]` tag is hidden. `Shift+Enter` is unused.

In **Team** mode, the default channel is Team. `Shift+Enter` switches to All for that message.

---

## 7. Ping System

Pings are visual markers placed on the game world to communicate with allies. **Pings are team-only — they are only visible to players on your team** (or only to yourself in FFA).

### 7.1 Ping Types

| Type | Color | Icon | Label | Duration (frames) | Sound Freq |
|------|-------|------|-------|--------------------|------------|
| Normal | `#4dc9f6` | Filled circle | *(none)* | 180 | 880 Hz |
| Danger | `#ff4455` | Triangle with `!` | "Danger" | 240 | 440 Hz |
| On My Way | `#4488ff` | Downward arrow | "On My Way" | 200 | 660 Hz |
| Assist | `#44dd66` | Shield with `+` | "Assist" | 200 | 550 Hz |
| Missing? | `#ffcc22` | `?` character | "Missing?" | 200 | 770 Hz |

### 7.2 Controls

| Action | Input | Result |
|--------|-------|--------|
| Ping hint | Hold `Alt` | Crosshair cursor follows mouse, signaling ping mode |
| Normal ping | `Alt` + Click (quick, no drag) | Drops a normal blue circle ping at click position |
| Open ping wheel | `Alt` + Click and Drag | Wheel appears at click origin |
| Select from wheel | Release mouse on a slice | Fires the selected ping type at the wheel's origin |
| Cancel wheel | Release `Alt` before releasing mouse | Wheel closes, no ping |

### 7.3 Ping Wheel Layout

The wheel appears centered on the click origin. Four slices surround a center dead zone:

```
              ┌─────────┐
              │ Danger  │
              │  (red)  │
         ┌────┤         ├────┐
         │    └────┬────┘    │
         │ Missing?│ On My   │
         │ (yellow)│  Way    │
         │         │ (blue)  │
         └────┬────┴────┬────┘
              │ Assist  │
              │ (green) │
              └─────────┘
```

| Direction | Slice |
|-----------|-------|
| Up (drag up) | Danger |
| Right (drag right) | On My Way |
| Down (drag down) | Assist |
| Left (drag left) | Missing? |
| Center (no drag / within dead zone) | Normal |

### 7.4 Ping Wheel Parameters

```js
const WHEEL_RADIUS = 80;     // outer radius in canvas pixels
const WHEEL_INNER = 25;      // inner dead zone radius
const WHEEL_DEADZONE = 18;   // distance from center before a slice is selected
```

Slice selection uses angle from center — the wheel is divided into four 90° quadrants. If the mouse is within `WHEEL_DEADZONE` pixels of center on release, it fires a normal ping.

### 7.5 Wheel Slice Detection

```js
const SLICES = [
    { type: 'danger',   angle: -Math.PI / 2 },   // up
    { type: 'omw',      angle: 0 },               // right
    { type: 'assist',   angle: Math.PI / 2 },     // down
    { type: 'question', angle: Math.PI },          // left
];

function getWheelSlice(wheelX, wheelY, mouseX, mouseY) {
    const dx = mouseX - wheelX;
    const dy = mouseY - wheelY;
    if (Math.hypot(dx, dy) < WHEEL_DEADZONE) return null;

    const angle = Math.atan2(dy, dx);
    let best = null, bestDot = -Infinity;
    for (const s of SLICES) {
        const dot = Math.cos(angle - s.angle);
        if (dot > bestDot) { bestDot = dot; best = s; }
    }
    return best;
}
```

### 7.6 Ping Object

```js
const ping = {
    x: 0,              // world X
    y: 0,              // world Y
    type: 'danger',    // ping type key
    life: 240,         // frames remaining
    maxLife: 240,      // total duration
    spawnFrame: 0,     // frame when created
    playerId: 'uuid',  // who pinged
    team: 0,           // team of the pinger (for visibility filtering)
    ripples: [         // staggered ring animations
        { delay: 0 },
        { delay: 12 },
        { delay: 24 },
    ],
};
```

### 7.7 Ping Rendering

Each ping renders in layers (bottom to top):

1. **Ripples** — 3 expanding rings, staggered by 12 frames each. Each ring expands from radius 10 to 65 over 50 frames, fading out as it grows.
2. **Glow** — A radial gradient centered on the ping, pulsing gently (`30 + sin(frame * 0.08) * 5` radius). Alpha 0.25.
3. **Background circle** — A solid dark circle (r=18) with a colored stroke, alpha 0.7.
4. **Icon** — The type-specific icon drawn inside the background circle with a slight bounce on spawn (sinusoidal, decays over 15 frames).
5. **Label** — For non-normal pings, the type label is drawn below the icon in bold 11px Consolas.

**Fade timing:** Pings fade in over 10 frames and fade out over the last 30 frames. The combined alpha is `fadeIn * fadeOut`.

### 7.8 Ping Audio

Each ping plays a short sine tone on creation. The oscillator starts at the type's frequency and ramps down to half over 150ms, with gain fading from 0.12 to near-zero over 200ms.

```js
const PING_FREQ = {
    normal: 880,
    danger: 440,
    omw: 660,
    assist: 550,
    question: 770,
};
```

Audio is created on demand via `AudioContext`. The first ping after page load initializes the context (required by browser autoplay policy — a user gesture triggers it).

### 7.9 Ping Wheel Rendering

When the wheel is open:

1. **Dim overlay** — A semi-transparent black fill over the entire canvas (`rgba(0,0,0,0.3)`), animated in with the wheel.
2. **Ring background** — Dark circle at `WHEEL_RADIUS + 4`.
3. **Four slices** — Arc segments between `WHEEL_INNER` and `WHEEL_RADIUS`. The hovered slice gets a colored radial gradient fill; others are dark. Hovered slice border uses the type's color.
4. **Slice icons** — Drawn at the midpoint of each slice arc. Hovered icon is larger (16px vs 13px) and full opacity.
5. **Hovered label** — The selected type's label appears outside the ring.
6. **Center dot** — Highlighted blue when no slice is selected (indicating normal ping), dark otherwise.
7. **Drag line** — A line from center toward the mouse, capped at `WHEEL_RADIUS`, colored by the hovered type.

**Animation:** The wheel eases in over 8 frames using a cubic ease-out (`1 - (1 - t)^3`). Both `WHEEL_RADIUS` and `WHEEL_INNER` scale from 0 to full during this animation.

### 7.10 Ping Visibility & Networking

Pings are **team-only**. The server validates this:

- Client sends: `{ type: 'ping', x, y, pingType }`
- Server attaches the sender's team and broadcasts **only to teammates**.
- In FFA, pings are local only (visible to the pinger themselves — games can override this).

Pings also appear in the chat log as a system-style message: `[Ping] PlayerName: Danger` (visible only to the same recipients as the ping itself).

After passing team filtering, pings are additionally filtered through the mute system (see §8). A player's pings can be individually muted via the scoreboard, or all pings can be hidden globally.

### 7.11 Ping Rate Limiting

To prevent spam, a player can have at most **3 active pings** at a time. Creating a 4th removes the oldest. The server enforces this — excessive ping messages are dropped.

---

## 8. Scoreboard & Mute System

Pressing `Escape` during a game opens the **scoreboard overlay** — a full player list with per-player mute/hide controls and global filter options. This is the central place for managing what you see and hear from other players.

### 8.1 Opening & Closing

| Action | Key | Behavior |
|--------|-----|----------|
| Open scoreboard | `Escape` | Overlay appears, game input paused (camera/abilities), chat still works |
| Close scoreboard | `Escape` | Overlay closes, game input resumes |

The scoreboard is a DOM panel in the `#ui` overlay. While open, it renders a **full-screen backdrop** (`pointer-events: auto`) that consumes all clicks and mouse input, preventing them from reaching the canvas beneath. Edge scrolling, movement commands, and shoot commands are all blocked. The game continues running underneath — players can still be hit, arrows still fly — but the local player cannot act. Chat still works.

```css
.scoreboard-backdrop {
    position: absolute;
    top: 0; left: 0;
    width: 1920px;
    height: 1080px;
    background: rgba(0, 0, 0, 0.5);
    pointer-events: auto;          /* consumes all clicks */
    z-index: 50;
}
```

### 8.2 Scoreboard Layout

The scoreboard shows all players in the game, grouped by team (or a single list in FFA). Each row displays:

```
┌─ Scoreboard ───────────────────────────────────────────────────┐
│                                                                │
│  Red Team                                                      │
│  ● Aelric (Host)       K: 5  D: 2  A: 3        [score data]  │
│  ● Wren                K: 3  D: 4  A: 1        [score data]  │
│                                                                │
│  Blue Team                                                     │
│  ● Tamsin              K: 4  D: 3  A: 2        [score data]  │
│  ● Dusk                K: 2  D: 5  A: 4        [score data]  │
│                                                                │
│  ┌─ Global ───────────────────────────────────┐                │
│  │ ☐ Hide all pings    ☐ Hide enemy messages  │                │
│  │ ☐ Mute all messages ☐ Hide all messages    │                │
│  └────────────────────────────────────────────┘                │
└────────────────────────────────────────────────────────────────┘
```

The stat columns (K/D/A, score, etc.) are **game-defined** — the framework provides the player rows and mute controls; the game injects whatever stats it tracks.

### 8.3 Per-Player Context Menu

**Right-clicking a player row** opens a small context menu with mute/hide options:

| Option | Effect |
|--------|--------|
| **Mute Pings** | That player's pings no longer appear on your screen |
| **Mute Messages** | That player's chat messages render in a muted style (dimmed, name replaced with "[Muted]") — you see that a message was sent but not its content |
| **Hide Messages** | That player's chat messages are completely removed from your chat — you never see them at all |

These are **client-side only** — the server still delivers the messages, but the client filters them before rendering.

A checkmark or toggle indicator shows the current state of each option. Options are independent — you can mute pings but not messages, or any combination.

### 8.4 Muted vs Hidden Messages

The distinction between "mute" and "hide" is intentional:

| Mode | What You See | Use Case |
|------|-------------|----------|
| **Normal** | `[All] Dusk: anyone want to trade?` | Default |
| **Muted** | `[All] [Muted]: ···` | You know they're talking but don't see content. Reduces toxicity without losing awareness. |
| **Hidden** | *(nothing — message is not rendered at all)* | Fully removes the player from your chat experience. |

Muted messages use the `--text-dim` color and replace the player name with `[Muted]`. The message body is replaced with `···` (three centered dots). The channel tag still shows so you know whether it was team or all chat.

### 8.5 Global Options

At the bottom of the scoreboard, a row of global toggle checkboxes:

| Option | Effect |
|--------|--------|
| **Hide All Pings** | No pings from any player (including allies) appear on your screen. Your own pings still fire and are sent to teammates. |
| **Mute All Messages** | All chat messages from all players render in muted style. System messages are unaffected. |
| **Hide All Messages** | All chat messages from all players are hidden entirely. System messages are unaffected. |
| **Hide Enemy Messages** | All `[All]` chat messages from players on other teams are hidden. Team messages and system messages are unaffected. In FFA, this hides all messages from all other players. |

Global options override per-player settings. If "Mute All Messages" is on, individually un-muting a player has no effect until the global is turned off.

### 8.6 Filter Priority

When multiple filters apply, the most restrictive one wins:

```
Hidden (global) > Hidden (per-player) > Muted (global) > Muted (per-player) > Normal
```

For pings:
```
Hide All Pings (global) > Mute Pings (per-player) > Normal
```

### 8.7 Mute State

```js
const muteState = {
    // Per-player settings (keyed by player ID)
    players: {
        'player-uuid': {
            mutePings: false,
            muteMessages: false,     // show as muted style
            hideMessages: false,     // remove entirely
        },
    },

    // Global settings
    global: {
        hideAllPings: false,
        muteAllMessages: false,
        hideAllMessages: false,
        hideEnemyMessages: false,
    },
};
```

### 8.8 Applying Filters

**Chat messages** — checked before rendering each message:

```js
function shouldShowMessage(msg) {
    const g = muteState.global;
    const p = muteState.players[msg.playerId] || {};

    // System messages are never filtered
    if (msg.type === 'system') return 'normal';

    // Global hide
    if (g.hideAllMessages) return 'hidden';

    // Per-player hide
    if (p.hideMessages) return 'hidden';

    // Hide enemy messages (all-chat from other teams)
    if (g.hideEnemyMessages && msg.channel === 'all' && msg.team !== localPlayer.team) return 'hidden';

    // Global mute
    if (g.muteAllMessages) return 'muted';

    // Per-player mute
    if (p.muteMessages) return 'muted';

    return 'normal';
}
```

**Pings** — checked before rendering each ping:

```js
function shouldShowPing(ping) {
    if (muteState.global.hideAllPings) return false;
    const p = muteState.players[ping.playerId] || {};
    if (p.mutePings) return false;
    return true;
}
```

### 8.9 Persistence

Mute state is stored in `localStorage` keyed by player ID. If you mute someone, they stay muted across games and sessions. Global options reset each session (not persisted).

```js
// Save per-player mutes
localStorage.setItem('mutes', JSON.stringify(muteState.players));

// Load on connect
muteState.players = JSON.parse(localStorage.getItem('mutes') || '{}');
```

### 8.10 Game-Defined Scoreboard Stats

The framework renders the player rows and mute controls. The game provides stat columns via a hook:

```js
GameDef.getScoreboardColumns() {
    return [
        { key: 'kills',   label: 'K', width: 50 },
        { key: 'deaths',  label: 'D', width: 50 },
        { key: 'assists', label: 'A', width: 50 },
        { key: 'score',   label: 'Score', width: 80 },
    ];
}

GameDef.getPlayerStats(playerId) {
    return { kills: 5, deaths: 2, assists: 3, score: 1500 };
}
```

### 8.11 Networking

Mute/hide is entirely client-side. No messages are sent to the server when a player mutes someone. The server continues to deliver all messages and pings to all valid recipients — the client simply chooses not to render them.

---

## 9. Tooltip System

Tooltips appear when hovering over interactive elements — both canvas entities (players, items, structures) and DOM UI elements (buttons, icons, lobby slots, scoreboard rows). A single shared tooltip div is repositioned on hover.

### 9.1 Tooltip Container

A single tooltip `<div>` lives in the `#ui` overlay:

```html
<div id="tooltip" class="tooltip hidden"></div>
```

There is only ever one tooltip visible at a time. Calling `showTooltip()` replaces the current content.

### 9.2 Tooltip CSS

```css
.tooltip {
    position: absolute;
    z-index: 100;
    background: rgba(10, 12, 18, 0.94);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 6px;
    padding: 10px 14px;
    font-size: 18px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
    line-height: 1.4;
    max-width: 360px;
    pointer-events: none;
    white-space: pre-line;
    transition: opacity 0.1s ease;
}

.tooltip.hidden {
    opacity: 0;
    visibility: hidden;
}

.tooltip .tip-title {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
}

.tooltip .tip-desc {
    color: rgba(255, 255, 255, 0.55);
}

.tooltip .tip-stat {
    color: #5dade2;
    font-weight: 600;
}

.tooltip .tip-key {
    display: inline-block;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 3px;
    padding: 0 5px;
    font-size: 15px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.7);
    margin-left: 6px;
    vertical-align: middle;
}

.tooltip .tip-divider {
    border: none;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    margin: 6px 0;
}
```

### 9.3 Tooltip Positioning

The tooltip follows the mouse in the 1920×1080 UI coordinate space. It is offset slightly from the cursor and clamped to stay within bounds:

```js
function showTooltip(html, mouseUIX, mouseUIY) {
    const tip = document.getElementById('tooltip');
    tip.innerHTML = html;
    tip.classList.remove('hidden');

    let tx = mouseUIX + 16;
    let ty = mouseUIY + 16;

    const rect = tip.getBoundingClientRect();
    const zoomScale = document.getElementById('ui').style.zoom || 1;
    const tipW = rect.width / zoomScale;
    const tipH = rect.height / zoomScale;

    if (tx + tipW > 1904) tx = mouseUIX - tipW - 8;
    if (ty + tipH > 1064) ty = mouseUIY - tipH - 8;

    tip.style.left = tx + 'px';
    tip.style.top = ty + 'px';
}

function hideTooltip() {
    document.getElementById('tooltip').classList.add('hidden');
}
```

### 9.4 DOM Element Tooltips (data-tooltip)

Any DOM element in the `#ui` overlay can show a tooltip by adding a `data-tooltip` attribute with HTML content. A single delegated listener handles all of them:

```js
document.getElementById('ui').addEventListener('mousemove', function (e) {
    const target = e.target.closest('[data-tooltip]');
    if (target) {
        showTooltip(target.getAttribute('data-tooltip'), mouseUIX, mouseUIY);
    } else if (!isOverCanvasEntity) {
        hideTooltip();
    }
});
```

This means tooltips work automatically on any element — lobby slots, scoreboard rows, HUD buttons, settings toggles — just by adding the attribute.

### 9.5 Canvas Entity Tooltips

For game-world entities (players, items, NPCs), the framework's container mousemove handler checks if the mouse is over an entity in world space (accounting for zoom) and calls `showTooltip()` with game-defined content. Tooltips are suppressed during chat focus, ping mode (Alt held), and when scoreboard is open.

```js
const worldPos = screenToWorld(canvasMouseX, canvasMouseY); // accounts for zoom
const entity = findEntityAt(worldPos.x, worldPos.y);
if (entity) {
    showTooltip(GameDef.getEntityTooltip(entity), uiMouseX, uiMouseY);
} else {
    hideTooltip();
}
```

The framework handles positioning and display; the game provides the HTML via `GameDef.getEntityTooltip()`.

### 9.6 Standard Tooltip Content Patterns

The framework uses tooltips across its own systems. These are the standard patterns so every game looks consistent. Games can use these same building blocks for their own tooltips.

**Lobby — Slot (hover an occupied slot):**

```html
<div class="tip-title" style="color: #e74c3c">Aelric</div>
<div class="tip-desc">Host</div>
```

**Lobby — Open Slot (hover an empty slot):**

```html
<div class="tip-desc">Click to join this slot</div>
```

**Lobby — Closed Slot:**

```html
<div class="tip-desc">Slot closed by host</div>
```

**Lobby — Team Header (hover the clickable team name):**

```html
<div class="tip-desc">Click to join Red Team</div>
```

**Scoreboard — Player Row (hover, before right-clicking):**

```html
<div class="tip-title" style="color: #5dade2">Tamsin</div>
<div class="tip-desc">Right-click for options</div>
```

**HUD Button (e.g., inventory, settings):**

```html
<div class="tip-title">Inventory</div>
<div class="tip-desc">Open your inventory <span class="tip-key">I</span></div>
```

The `tip-key` class renders a small keycap badge inline — use it whenever a tooltip references a hotkey.

**Ping Wheel Slice (while wheel is open, not a DOM tooltip — rendered on canvas):**

Ping wheel labels are drawn directly on the canvas (see §7.9), not via the DOM tooltip system. This is because the wheel is a canvas-rendered overlay and needs to animate with the wheel.

**Game Entity (game-defined, but following the pattern):**

```html
<div class="tip-title" style="color: #6fcf70">Iron Ore</div>
<hr class="tip-divider">
<div class="tip-desc">A chunk of raw iron. Can be smelted into bars.</div>
<div class="tip-stat">Value: 12g</div>
```

The `tip-divider` is a subtle horizontal rule for separating title from body content in richer tooltips.

### 9.7 Tooltip Behavior Rules

- **Show delay:** None. Tooltips appear immediately on hover. Games can add a delay for canvas entities if desired, but framework UI tooltips are instant.
- **Hide:** Tooltip hides immediately when the mouse leaves the target element or entity.
- **No click interaction:** Tooltips have `pointer-events: none`. They never block clicks.
- **Scoreboard override:** When the scoreboard is open and a right-click context menu is showing, tooltips are suppressed (the context menu takes priority).
- **Chat input:** While the chat input is focused, canvas entity tooltips are suppressed (typing shouldn't trigger world hovers). DOM tooltips on UI elements still work.
- **Ping mode:** While holding Alt (ping mode active), canvas entity tooltips are suppressed so the crosshair is unobstructed.

---

## 10. Player Identity & Colors

Every player in a game has an assigned color. Colors are used for the player's name in chat, their entity on the canvas, and team identification.

### 10.1 Player Color Palette

A fixed set of 12 distinct colors. Red is player 1. The first 2/4/6 are optimized for team games, and all 12 work for FFA.

| Slot | Name | Hex | CSS Class | Primary Use |
|------|------|-----|-----------|-------------|
| 0 | Red | `#e74c3c` | `.color-red` | Team 1 / Player 1 |
| 1 | Blue | `#5dade2` | `.color-blue` | Team 2 / Player 2 |
| 2 | Green | `#6fcf70` | `.color-green` | Team 3 / Player 3 |
| 3 | Gold | `#f0c040` | `.color-gold` | Team 4 / Player 4 |
| 4 | Purple | `#b880e0` | `.color-purple` | Player 5 |
| 5 | Orange | `#e89040` | `.color-orange` | Player 6 |
| 6 | Cyan | `#40d8d0` | `.color-cyan` | Player 7 |
| 7 | Pink | `#e87090` | `.color-pink` | Player 8 |
| 8 | Lime | `#a8e040` | `.color-lime` | Player 9 |
| 9 | Teal | `#389090` | `.color-teal` | Player 10 |
| 10 | Salmon | `#e8a088` | `.color-salmon` | Player 11 |
| 11 | Lavender | `#9898e0` | `.color-lavender` | Player 12 |

### 10.2 Team Assignments

In team modes, teams are assigned from the top of the color palette:

- **2 Teams**: Red vs Blue
- **3 Teams**: Red vs Blue vs Green
- **4 Teams**: Red vs Blue vs Green vs Gold

Players on the same team share the team color for their name in chat and their entity outline/indicator on the canvas. Individual player distinction within a team is handled by the game (e.g., different character sprites, numbered labels).

### 10.3 FFA Assignments

In FFA, each player gets a unique color from the palette in join order (slot 0 through 11). Max 12 players per game.

### 10.4 Player Object

```js
const player = {
    id: 'uuid',
    name: 'Aelric',
    colorIndex: 0,              // index into the color palette
    color: '#e74c3c',           // resolved hex
    team: null,                 // null in FFA, team index in team mode
    slot: 0,                    // lobby slot index
    ready: false,
};
```

---

## 11. Lobby & Server System

Before a game starts, players gather in a lobby. The lobby is a DOM screen rendered in the `#ui` overlay (the canvas can show an ambient background or be blank).

### 11.1 Flow

```
Main Menu → Server Browser / Create Server → Lobby → Game
                                                ↓
                                           Post-Game → Lobby (rematch) or Main Menu
```

### 11.2 Server

A server represents a running game instance. Servers are created by a host player and run on the Node.js backend via Express + WebSocket (`ws`).

```js
const server = {
    id: 'uuid',
    name: 'Aelric\'s Game',
    host: 'player-uuid',       // player who created it
    gameType: 'capture-flag',  // game-specific identifier
    mode: 'teams',             // 'teams' | 'ffa'
    teamCount: 2,              // only relevant in team mode
    slots: [],                 // array of slot objects (see 11.5)
    state: 'lobby',            // 'lobby' | 'ingame' | 'postgame'
    settings: {},              // game-specific settings
};
```

### 11.3 Server Browser

A list of available servers. Shows:

- Server name
- Host name
- Game type
- Player count (e.g., `4/8`)
- Mode (Teams / FFA)
- State (Lobby / In Game)

Players can join servers in `lobby` state (and optionally `ingame` if the game supports mid-game join). Joining places the player in the first open slot (see 11.5).

### 11.4 Lobby Screen

Once in a lobby, players see:

- **Team panels** (in team mode) or a single player panel (FFA) showing all slots
- **Settings panel** (host only) — game-specific options (map, round count, etc.)
- **Ready toggle** — players mark ready; host starts when all are ready (or overrides)
- **Chat** — lobby uses the same chatbox, team chat works if teams are assigned

### 11.5 Slot System

The lobby is organized around **slots**, not a raw player list. Each team (or the FFA pool) has a fixed number of slots. Every slot has a state:

| Slot State | Meaning |
|------------|---------|
| `open` | Empty, anyone can join by clicking it or clicking the team header |
| `occupied` | A player is in this slot |
| `closed` | Blocked — no one can join. Reduces the team/game size. |

```js
const slot = {
    index: 0,               // slot number within the team
    team: 0,                // team index (0 in FFA)
    state: 'open',          // 'open' | 'occupied' | 'closed'
    player: null,           // player object if occupied, null otherwise
};
```

**Example:** A 3-team game with 3 slots per team = 9 total slots. The host can close slots to create asymmetric teams (e.g., 3v2v2 by closing one slot on teams 2 and 3).

### 11.6 Lobby Layout (Team Mode)

Teams are displayed as columns (or stacked panels on narrow layouts). Each team panel has a clickable header and a list of slots below it.

```
┌─ Red Team ──────────┐  ┌─ Blue Team ─────────┐  ┌─ Green Team ────────┐
│ ● Aelric (Host)     │  │ ● Tamsin            │  │ ● Wren              │
│ ● [Open]            │  │ ● Dusk              │  │ ✕ [Closed]          │
│ ● [Open]            │  │ ● [Open]            │  │ ✕ [Closed]          │
└──────────────────────┘  └──────────────────────┘  └──────────────────────┘
```

**Clicking a team header** (e.g., "Blue Team") moves you to the first open slot on that team. If no slots are open, nothing happens.

**In FFA mode**, a single panel with all slots:

```
┌─ Players ────────────────────────────┐
│ ● Aelric (Host)    ● Tamsin         │
│ ● Wren             ● [Open]         │
│ ✕ [Closed]         ✕ [Closed]       │
└──────────────────────────────────────┘
```

### 11.7 Host Controls

The host (server creator) can:

- **Change game settings** — map, round time, score limit, etc.
- **Switch mode** — Teams ↔ FFA (resets slot assignments)
- **Set slot state** — Click a slot to cycle its state. This is how the host kicks players — setting an occupied slot to open ejects the player from the lobby.
- **Start the game** — with or without all players ready
- **Transfer host** — right-click a player → Transfer Host

Non-host players can only:
- Click a team header to switch teams (if an open slot exists)
- Toggle their own ready state
- Chat

### 11.8 Slot State Transitions

```
open ──(player joins)──→ occupied
occupied ──(player leaves)──→ open
occupied ──(host clicks)──→ open          ← kicks the player
open ──(host clicks)──→ closed
closed ──(host clicks)──→ open
```

The host clicking a slot cycles its state contextually:
- **Occupied slot** → ejects the player, slot becomes `open`
- **Open slot** → becomes `closed`
- **Closed slot** → becomes `open`

### 11.9 Networking

The server runs on **Node.js + Express + WebSocket (`ws`)**. Express serves the static HTML/JS client. The `ws` library handles real-time communication.

```js
// Server-side structure
const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));    // serves the client HTML/JS

wss.on('connection', (ws) => {
    // handle messages, assign to lobby, etc.
});

server.listen(3000);
```

Messages are JSON strings sent over WebSocket. The framework provides message schemas for lobby and chat; game-specific messages are passed through opaquely.

### 11.10 Standard Message Types

| Channel | Type | Direction | Payload |
|---------|------|-----------|---------|
| `lobby` | `player_join` | Server → All | `{ player, slotIndex }` |
| `lobby` | `player_leave` | Server → All | `{ playerId, slotIndex }` |
| `lobby` | `team_change` | Client → Server | `{ targetTeam }` |
| `lobby` | `slot_update` | Server → All | `{ slotIndex, state, player }` |
| `lobby` | `settings_change` | Host → Server → All | `{ settings }` |
| `lobby` | `ready_toggle` | Client → Server → All | `{ playerId, ready }` |
| `lobby` | `game_start` | Host → Server → All | `{}` |
| `chat` | `message` | Client → Server → Recipients | `{ playerId, channel, text }` |
| `game` | `ping` | Client → Server → Teammates | `{ x, y, pingType }` |
| `game` | *(game-defined)* | Varies | Game-specific payloads |

---

## 12. Game Lifecycle

```
PAGE LOAD
  ├── Framework initializes (scaling, WebSocket, UI)
  ├── Loading screen shown (if GameDef.preload() exists)
  ├── Assets load in background (models, textures, etc.)
  ├── Loading screen fades out → main menu appears
  ▼
LOBBY
  ├── Players join slots, pick teams
  ├── Host configures game settings (if GameDef.getSettings() defined)
  ├── Host starts game
  ▼
COUNTDOWN (3s)
  ├── 3D renderer initialized (if renderer === '3d')
  ├── World scene built
  ├── Camera snaps to starting position
  ▼
IN GAME
  ├── Game loop runs (update → render)
  ├── Chat available (Team + All)
  ├── Ping system active (Alt + Click)
  ├── Camera system active (Y lock, Space jump, edge scroll)
  ├── Scoreboard available (Escape)
  ├── Tooltips active
  ▼
POST GAME
  ├── Results screen (winner, stats)
  ├── Chat still available
  ├── Options: Rematch (return to lobby) / Leave (main menu)
```

### 12.1 Loading Screen & Asset Preloading

The framework provides a built-in loading screen for games that need to load assets (3D models, textures, etc.) before the player reaches the main menu.

**How it works:**
1. After all scripts load, the framework checks for `GameDef.preload()`
2. If defined, it shows a loading screen with an animated progress bar
3. Calls `preload()` which must return a `Promise`
4. When the promise resolves, the loading screen fades out
5. If `preload()` is not defined, the loading screen is skipped entirely

```js
// In GameDef — return a Promise that resolves when all assets are ready
preload() {
    return Promise.all([
        loadModels(),    // load GLB/GLTF models
        loadTextures(),  // load texture images
    ]);
},
```

The loading screen HTML (`#loading-screen`) is part of `index.html` inside `#game-container`. It uses z-index 200 to overlay everything.

### 12.2 Renderer Modes

The framework supports two renderer modes:

| Mode | Set via | Canvas ownership | render() signature |
|------|---------|-----------------|-------------------|
| `'2d'` (default) | `GameDef.renderer = '2d'` | Framework creates 2D context, applies camera transforms | `render(ctx, camera, gameState)` |
| `'3d'` | `GameDef.renderer = '3d'` | Game owns the canvas (Three.js WebGL) | `render(camera, gameState)` |

**3D mode:** The game must define `initRenderer(canvasEl)` which is called once during countdown. The game creates its own Three.js renderer, scene, and camera on the provided canvas element. The framework still handles the overlay canvas for pings, countdown, and UI.

```js
// 3D game example
window.GameDef = {
    renderer: '3d',
    // ...
    initRenderer(canvasEl) {
        renderer3d = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true });
        renderer3d.setSize(1920, 1080, false);
        scene = new THREE.Scene();
        camera3d = new THREE.PerspectiveCamera(50, 1920/1080, 10, 8000);
        // ... lights, scene setup
    },
    render(fwCamera, gameState) {
        // Map framework camera to 3D camera position
        // Reconcile entities, update animations
        // renderer3d.render(scene, camera3d);
    },
};
```

### 12.3 3D Models & Textures

For 3D games using Three.js, models and textures should be preloaded during the loading screen so they're ready before any game starts.

**Loading GLB/GLTF Models:**

```js
// Load a model and extract animations
function loadModel(path, texturePath, normalPath) {
    return new Promise((resolve, reject) => {
        const loader = new THREE.GLTFLoader();
        loader.load(path, (gltf) => {
            const model = gltf.scene;

            // Apply textures
            const diffuse = new THREE.TextureLoader().load(texturePath);
            diffuse.flipY = false;
            const normal = new THREE.TextureLoader().load(normalPath);
            normal.flipY = false;

            model.traverse((child) => {
                if (child.isSkinnedMesh || child.isMesh) {
                    child.material = new THREE.MeshStandardMaterial({
                        map: diffuse,
                        normalMap: normal,
                        roughness: 0.7,
                        metalness: 0.05,
                        skinning: child.isSkinnedMesh,
                    });
                }
            });

            // Compute scale factor from bounding box
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(model);
            const size = new THREE.Vector3();
            box.getSize(size);
            const scaleFactor = TARGET_HEIGHT / size.y;

            resolve({ model, animations: gltf.animations, scaleFactor });
        }, undefined, reject);
    });
}
```

**Loading Textures for Ground/Terrain:**

```js
function loadTextureAsync(path) {
    return new Promise((resolve, reject) => {
        new THREE.TextureLoader().load(path, (tex) => {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            resolve(tex);
        }, undefined, reject);
    });
}
```

**Cloning Models with Animations:**

Use `THREE.SkeletonUtils.clone()` for skinned meshes (skeletal animation). Regular `clone()` won't preserve bone bindings.

```js
const instance = THREE.SkeletonUtils.clone(template);
const mixer = new THREE.AnimationMixer(instance);
const idleAction = mixer.clipAction(findAnimation(animations, 'Idle01'));
const runAction = mixer.clipAction(findAnimation(animations, 'Run_Forward'));
idleAction.play();
```

**Animation State Management:**

Track current animation per entity and crossfade between states:

```js
if (shouldRun && currentAnim !== 'run') {
    idleAction.fadeOut(0.2);
    runAction.reset().fadeIn(0.2).play();
    currentAnim = 'run';
} else if (!shouldRun && currentAnim !== 'idle') {
    runAction.fadeOut(0.2);
    idleAction.reset().fadeIn(0.2).play();
    currentAnim = 'idle';
}
```

For one-shot animations (death, emotes), use `setLoop(THREE.LoopOnce)` and `clampWhenFinished = true`.

**File Organization:**

```
public/
├── models/
│   ├── cat/
│   │   ├── Cat.glb              ← Skinned mesh with animations
│   │   ├── T_Cat_Gr_D.png       ← Diffuse texture
│   │   └── T_Cat_N.png          ← Normal map
│   └── wolf/
│       ├── Wolf.glb
│       ├── T_Wolf_Gr_D.png
│       └── T_Wolf_N.png
└── Textures/
    ├── Summer_Grass_A.png        ← Ground textures
    ├── Summer_Flowers.png
    └── ...
```

### Converting FBX Models to GLB

The framework uses GLB (binary glTF) format for 3D models because browsers can load them directly via Three.js's GLTFLoader. Source models often come as FBX files (common in Unity/Unreal asset packs). Here's how to convert:

**Using Blender (recommended):**

1. Open Blender → File → Import → FBX (.fbx)
2. Select the FBX file (e.g., `Cat.fbx`)
3. In the import settings, check "Automatic Bone Orientation" if animations look wrong
4. File → Export → glTF 2.0 (.glb/.gltf)
5. Set format to "glTF Binary (.glb)" for a single file
6. Under "Include", check: Animations, Skinning
7. Export to `public/models/creature-name/CreatureName.glb`

**Using an online converter:**

Sites like [glTF Viewer](https://gltf-viewer.donmccurdy.com/) or `fbx2gltf` CLI can also convert. Make sure animations are included.

**Texture maps to export alongside the GLB:**

| Map | Suffix | Purpose |
|-----|--------|---------|
| Diffuse | `_D.png` | Base color |
| Normal | `_N.png` | Surface detail / lighting |
| AO | `_AO.png` | Ambient occlusion (optional) |
| Emissive | `_E.png` | Glow/emission (optional) |
| Metallic/Roughness | `_MR.png` | PBR properties (optional) |

Copy the texture PNGs into the same folder as the GLB. At minimum you need the diffuse (`_D.png`) and normal (`_N.png`) maps.

**Required CDN Scripts (add before framework.js):**

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"></script>
<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js"></script>
```

### 12.4 Lobby Settings

Games can define configurable settings that the host can change in the lobby before starting. The framework handles all UI rendering and networking automatically.

**Server module** — declare defaults:

```js
module.exports = {
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,
    defaultSettings: { difficulty: 'easy', mapSize: 'medium' },

    init(playerList, settings, mode, teamCount) {
        // settings.difficulty, settings.mapSize, etc.
    },
};
```

**Client GameDef** — declare the UI schema:

```js
getSettings() {
    return [
        {
            key: 'difficulty',       // matches server settings key
            label: 'Difficulty',     // displayed in lobby
            type: 'select',          // 'select' = button group
            default: 'easy',
            options: [
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
            ],
        },
    ];
},
```

The framework renders settings between the mode controls and player slots. Only the host can change them. All players see the current values. Settings are stored in `lobby.settings` and passed to `game.init()` on game start.

### 12.5 Game Loop

The render loop runs at the browser's refresh rate (typically 60fps). To smooth out the 20 tick/sec server updates, the framework interpolates entity positions between the previous and current server states.

```js
function gameLoop(timestamp) {
    const dt = timestamp - lastTimestamp;
    lastTimestamp = timestamp;

    const renderState = getInterpolatedState(performance.now());
    updateCamera(renderState);  // camera follow / edge scroll (uses lerped positions)
    render(ctx, renderState);   // draw world offset by camera
    renderPings(ctx);           // draw active pings over world
    requestAnimationFrame(gameLoop);
}
```

The interpolation lerps `x`, `y`, and `angle` (using shortest-arc) for players and dogs/entities. All other properties (alive, color, etc.) use the latest server state. Input logic always uses the raw authoritative state, not the interpolated one.

### 12.6 Game-Defined Hooks

Each game defines a `GameDef` object. Only `id`, `name`, and `maxPlayers` are required. Everything else has sensible defaults — if you don't define a hook, the framework skips it or uses the default behavior.

```js
const GameDef = {
    // ── Required ──────────────────────────────────────────────
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,

    // ── Optional properties (defaults shown) ──────────────────
    renderer: '2d',                     // '2d' or '3d'
    supportedModes: ['ffa'],            // 'teams', 'ffa', or both
    defaultMode: 'ffa',
    defaultTeamCount: 2,                // only used if mode is 'teams'
    worldWidth: 1920,                   // default = viewport size (no camera needed)
    worldHeight: 1080,

    // ── Optional hooks (all default to no-op / null) ──────────
    //    Framework checks if these exist before calling them.
    //    Only implement what your game needs.

    preload() {},                           // Return Promise. Load assets before main menu.
    getSettings() {},                       // Return setting definitions for lobby UI.
    initRenderer(canvasEl) {},              // 3D only: set up WebGL renderer.
    getCameraLockTarget(localPlayer) {},    // Y-lock target. Omit = Y does nothing.
    getCameraSnapTarget(localPlayer) {},    // Space-jump target. Omit = Space does nothing.
    getScoreboardColumns() {},              // Extra stat columns. Omit = just player names.
    getPlayerStats(playerId) {},            // Stats per player. Omit = no stats.
    getEntityTooltip(entity) {},            // Canvas entity tooltips. Omit = no entity tooltips.
    onGameStart(initialState) {},           // Called on countdown and game start.
    render(ctx_or_camera, gameState) {},    // Draw the game world (signature varies by renderer).
    onInput(inputType, data) {},            // Handle game-specific input.
    onElimination(msg) {},                  // Handle elimination/revival events.
    getResults() {},                        // Post-game results. Omit = generic "Game Over".
};
```

**Framework hook-calling pattern:**

```js
// Framework always guards optional hooks
if (GameDef.getCameraLockTarget) {
    const target = GameDef.getCameraLockTarget(localPlayer);
    // ...
}
```

**Input types passed to onInput:**
- `'rightclick'` — single right-click, `data: { x, y }` (world coords)
- `'rightmousedown'` — right button pressed, `data: { x, y }`
- `'rightmouseup'` — right button released, `data: {}`
- `'click'` — left click, `data: { x, y }` (world coords)
- `'keydown'` / `'keyup'` — keyboard, `data: { key, code }`

**Slot calculation:** The framework computes slots from `maxPlayers` and the lobby's current `teamCount`. In team mode, slots per team = `Math.floor(maxPlayers / teamCount)`. In FFA, all slots are in one pool. No need to specify `slotsPerTeam`.

**Camera auto-detection:** If `worldWidth` and `worldHeight` are both 1920×1080 (the default), the framework disables edge scrolling and camera movement entirely — the world fits on screen. Games with larger worlds just set bigger values.

---

## Appendix A: Standard CSS Variables

```css
:root {
    --bg-panel: rgba(10, 12, 18, 0.88);
    --border-subtle: rgba(255, 255, 255, 0.08);
    --border-light: rgba(255, 255, 255, 0.12);
    --text-primary: rgba(255, 255, 255, 0.85);
    --text-secondary: rgba(255, 255, 255, 0.55);
    --text-dim: rgba(255, 255, 255, 0.35);
    --text-input-bg: rgba(255, 255, 255, 0.04);

    --color-red: #e74c3c;
    --color-blue: #5dade2;
    --color-green: #6fcf70;
    --color-gold: #f0c040;
    --color-purple: #b880e0;
    --color-orange: #e89040;
    --color-cyan: #40d8d0;
    --color-pink: #e87090;
    --color-lime: #a8e040;
    --color-teal: #389090;
    --color-salmon: #e8a088;
    --color-lavender: #9898e0;
}
```

## Appendix B: Project Structure

```
my-pdrop-game/
├── CLAUDE.md
├── package.json                     ← FRAMEWORK — express + ws
├── server.js                        ← Entry point (change game require path)
│
├── server/
│   └── framework.js                 ← FRAMEWORK — never changes
│
├── game/
│   └── mygame.js                    ← GAME — delete and replace
│
├── public/
│   ├── index.html                   ← SHARED — framework structure + game CSS/markup
│   ├── framework.js                 ← FRAMEWORK — never changes
│   └── game.js                      ← GAME — delete and replace
│
└── docs/
    ├── pdrop-framework.md
    └── mygame-design.md
```

**To swap games:** Replace `game/mygame.js`, `public/game.js`, and the game-specific sections of `index.html`. Change the require path in `server.js`. Framework files (`server/framework.js`, `public/framework.js`, `package.json`) are never touched.

## Appendix C: Base HTML Boilerplate

`index.html` contains the framework structure and game-specific content together, separated by comments.

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>PDROP Game</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap"
          rel="stylesheet">
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { width: 100%; height: 100%; overflow: hidden; background: #000;
                     font-family: 'Rajdhani', sans-serif; }

        /* ── Framework CSS (do not modify) ── */
        /* scaling, chat, tooltip, scoreboard, lobby, etc. */
        /* ... */

        /* ── Game CSS (replace for new games) ── */
        /* ... */
    </style>
</head>
<body>
    <div id="game-container">
        <canvas id="game-canvas" width="1920" height="1080"></canvas>
        <div id="ui">
            <!-- ── Framework DOM (do not modify) ── -->
            <div class="chatbox"><!-- ... --></div>
            <div id="tooltip" class="tooltip hidden"></div>
            <!-- lobby screens, scoreboard backdrop, etc. -->

            <!-- ── Game DOM (replace for new games) ── -->
            <!-- game-specific HUD elements, etc. -->
        </div>
    </div>

    <script src="framework.js"></script>
    <script src="game.js"></script>
</body>
</html>
```

**A minimal `game.js`** (for starting a new game from scratch):

```js
// Only id, name, and maxPlayers are required.
// All hooks are optional — only implement what you need.
window.GameDef = {
    id: 'my-game',
    name: 'My Game',
    maxPlayers: 8,
};
```

That's a valid game definition. The framework will run with sensible defaults: FFA mode, no camera movement (world = viewport), empty scoreboard stats, no entity tooltips, generic post-game screen.

## Appendix D: Controls Reference

| Key | Context | Action |
|-----|---------|--------|
| `Escape` | Game | Open/close scoreboard (player list, mute controls) |
| `Enter` | Game / Lobby | Open chat (team channel) |
| `Shift + Enter` | Game / Lobby | Open chat (all channel) |
| `Enter` | Chat focused | Send message and close chat |
| `Tab` / `Shift` | Chat focused | Cycle chat channel (Team ↔ All) |
| `Escape` | Chat focused | Close chat without sending |
| `Alt` (hold) | Game | Show ping crosshair |
| `Alt` + Click | Game | Normal ping |
| `Alt` + Click + Drag | Game | Open ping wheel, release to fire |
| Right-click player row | Scoreboard open | Per-player mute/hide menu |
| `Y` | Game (if game supports lock) | Toggle camera lock on/off |
| `Space` | Game | Snap camera to point of interest (stays on release) |
| Mouse wheel | Game | Zoom in/out (0.5× to 2×) |
| Mouse to screen edge | Game (camera free) | Edge scroll camera |
