// Run Kitty Run! — Server-side game logic

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════

// ── World ──
const WORLD_WIDTH = 4800;
const WORLD_HEIGHT = 4800;
const WALL_THICKNESS = 20;
const CORRIDOR_WIDTH = 400;

// ── Kitten ──
const KITTEN_SPEED = 15;
const KITTEN_RADIUS = 16;

// ── Dogs ──
const DOG_SPEED_EASY = 8;
const DOG_SPEED_MEDIUM = 9;
const DOG_SPEED_HARD = 10;
const DOG_RADIUS = 25;
const DOG_IDLE_MIN = 40;       // 2 seconds
const DOG_IDLE_MAX = 400;      // 20 seconds
const DOG_WAYPOINTS_MIN = 2;
const DOG_WAYPOINTS_MAX = 4;

// ── Dog Counts Per Zone ──
const DOGS_PER_ZONE_EASY = 30;
const DOGS_PER_ZONE_MEDIUM = 40;
const DOGS_PER_ZONE_HARD = 50;
const LESS_DOGS_PER_ZONE = 1;
const MIN_DOGS_PER_ZONE = 5;

// ── Revival ──
const REVIVE_RADIUS = 40;
const REVIVE_INVULN_TICKS = 2; // 0.1 seconds

// ── Spawn ──
const SPAWN_SPREAD = 30;


// ═══════════════════════════════════════════════════════════════
// GAME STATE
// ═══════════════════════════════════════════════════════════════

let players = {};
let dogs = [];
let zones = [];
let goalZone = null;
let mode = 'ffa';
let teamCount = 1;
let difficulty = 'easy';
let winMode = 'firstin';

// ── Spatial Grid for Collision ──
const GRID_CELL_SIZE = 200;
const GRID_COLS = Math.ceil(WORLD_WIDTH / GRID_CELL_SIZE);
const GRID_ROWS = Math.ceil(WORLD_HEIGHT / GRID_CELL_SIZE);
let dogGrid = []; // array of arrays, indexed by cell

function buildDogGrid() {
    dogGrid = new Array(GRID_COLS * GRID_ROWS);
    for (let i = 0; i < dogGrid.length; i++) dogGrid[i] = [];
    for (const dog of dogs) {
        const col = Math.min(Math.floor(dog.x / GRID_CELL_SIZE), GRID_COLS - 1);
        const row = Math.min(Math.floor(dog.y / GRID_CELL_SIZE), GRID_ROWS - 1);
        if (col >= 0 && row >= 0) dogGrid[row * GRID_COLS + col].push(dog);
    }
}

function getDogsNear(x, y, radius) {
    const result = [];
    const minCol = Math.max(0, Math.floor((x - radius) / GRID_CELL_SIZE));
    const maxCol = Math.min(GRID_COLS - 1, Math.floor((x + radius) / GRID_CELL_SIZE));
    const minRow = Math.max(0, Math.floor((y - radius) / GRID_CELL_SIZE));
    const maxRow = Math.min(GRID_ROWS - 1, Math.floor((y + radius) / GRID_CELL_SIZE));
    for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
            const cell = dogGrid[r * GRID_COLS + c];
            for (let i = 0; i < cell.length; i++) result.push(cell[i]);
        }
    }
    return result;
}
let pendingEvents = [];
let nextDogId = 0;


// ═══════════════════════════════════════════════════════════════
// MAZE GENERATION
// ═══════════════════════════════════════════════════════════════

function generateMaze(diff) {
    const result = [];
    const step = CORRIDOR_WIDTH + WALL_THICKNESS;
    let order = 0;
    let dangerIdx = 0;

    const base = diff === 'hard' ? DOGS_PER_ZONE_HARD :
                 diff === 'medium' ? DOGS_PER_ZONE_MEDIUM :
                 DOGS_PER_ZONE_EASY;

    function getDogCount() {
        const count = Math.max(MIN_DOGS_PER_ZONE, base - dangerIdx * LESS_DOGS_PER_ZONE);
        dangerIdx++;
        return count;
    }

    let r = 0;
    while (true) {
        const L = r * step;
        const T = r * step;
        const R = WORLD_WIDTH - r * step;
        const B = WORLD_HEIGHT - r * step;
        const CW = CORRIDOR_WIDTH;

        // Ring must have room for two corners + at least 1px of corridor
        if (R - L <= 2 * CW) break;

        // ── TL Safe zone (start for r=0, entry for r>0) ──
        result.push({
            id: `z${order}`, type: 'safe',
            x: L, y: T, w: CW, h: CW,
            order: order++, dogCount: 0,
        });

        // ── Top corridor (danger) ──
        result.push({
            id: `z${order}`, type: 'danger',
            x: L + CW, y: T, w: R - L - 2 * CW, h: CW,
            order: order++, dogCount: getDogCount(),
        });

        // ── TR Safe zone ──
        result.push({
            id: `z${order}`, type: 'safe',
            x: R - CW, y: T, w: CW, h: CW,
            order: order++, dogCount: 0,
        });

        // ── Right corridor (danger) ──
        result.push({
            id: `z${order}`, type: 'danger',
            x: R - CW, y: T + CW, w: CW, h: B - T - 2 * CW,
            order: order++, dogCount: getDogCount(),
        });

        // ── BR Safe zone ──
        result.push({
            id: `z${order}`, type: 'safe',
            x: R - CW, y: B - CW, w: CW, h: CW,
            order: order++, dogCount: 0,
        });

        // ── Bottom corridor (danger) ──
        result.push({
            id: `z${order}`, type: 'danger',
            x: L + CW, y: B - CW, w: R - L - 2 * CW, h: CW,
            order: order++, dogCount: getDogCount(),
        });

        // ── BL Safe zone ──
        result.push({
            id: `z${order}`, type: 'safe',
            x: L, y: B - CW, w: CW, h: CW,
            order: order++, dogCount: 0,
        });

        // ── Left corridor (danger) — partial, leaves entrance to next ring ──
        const nextRingTop = (r + 1) * step;
        const leftTop = nextRingTop + CW;
        const leftBottom = B - CW;

        if (leftBottom > leftTop) {
            result.push({
                id: `z${order}`, type: 'danger',
                x: L, y: leftTop, w: CW, h: leftBottom - leftTop,
                order: order++, dogCount: getDogCount(),
            });
        }

        // ── Connection safe zone (bridges ring r to ring r+1 or goal) ──
        // Wider than normal (CW + WALL_THICKNESS) to bridge the void gap
        result.push({
            id: `z${order}`, type: 'safe',
            x: L, y: nextRingTop, w: CW + WALL_THICKNESS, h: CW,
            order: order++, dogCount: 0,
        });

        r++;
    }

    // ── Goal zone (center of the spiral) ──
    const gL = r * step;
    const gT = r * step;
    const gR = WORLD_WIDTH - r * step;
    const gB = WORLD_HEIGHT - r * step;

    let goal = null;
    if (gR > gL && gB > gT) {
        goal = {
            id: `z${order}`, type: 'goal',
            x: gL, y: gT, w: gR - gL, h: gB - gT,
            order: order++, dogCount: 0,
        };
        result.push(goal);
    }

    return { zones: result, goalZone: goal };
}


// ═══════════════════════════════════════════════════════════════
// ZONE HELPERS
// ═══════════════════════════════════════════════════════════════

function pointInZone(x, y, zone) {
    return x >= zone.x && x <= zone.x + zone.w &&
           y >= zone.y && y <= zone.y + zone.h;
}

// Zone grid for fast spatial lookups
const ZONE_GRID_SIZE = 100;
let zoneGrid = null;
let zoneGridCols = 0, zoneGridRows = 0;

function buildZoneGrid() {
    zoneGridCols = Math.ceil(WORLD_WIDTH / ZONE_GRID_SIZE);
    zoneGridRows = Math.ceil(WORLD_HEIGHT / ZONE_GRID_SIZE);
    zoneGrid = new Uint8Array(zoneGridCols * zoneGridRows); // 0 = void, 1 = zone
    for (const z of zones) {
        const minC = Math.max(0, Math.floor(z.x / ZONE_GRID_SIZE));
        const maxC = Math.min(zoneGridCols - 1, Math.floor((z.x + z.w) / ZONE_GRID_SIZE));
        const minR = Math.max(0, Math.floor(z.y / ZONE_GRID_SIZE));
        const maxR = Math.min(zoneGridRows - 1, Math.floor((z.y + z.h) / ZONE_GRID_SIZE));
        for (let r = minR; r <= maxR; r++) {
            for (let c = minC; c <= maxC; c++) {
                zoneGrid[r * zoneGridCols + c] = 1;
            }
        }
    }
}

function isInAnyZone(x, y) {
    // Fast grid check first
    if (zoneGrid) {
        const c = Math.floor(x / ZONE_GRID_SIZE);
        const r = Math.floor(y / ZONE_GRID_SIZE);
        if (c < 0 || c >= zoneGridCols || r < 0 || r >= zoneGridRows) return false;
        if (zoneGrid[r * zoneGridCols + c] === 0) return false;
    }
    // Precise check
    for (const z of zones) {
        if (pointInZone(x, y, z)) return true;
    }
    return false;
}

function getZoneAt(x, y) {
    for (const z of zones) {
        if (pointInZone(x, y, z)) return z;
    }
    return null;
}


// ═══════════════════════════════════════════════════════════════
// DOG AI
// ═══════════════════════════════════════════════════════════════

function spawnDogs() {
    dogs = [];
    nextDogId = 0;

    for (const zone of zones) {
        if (zone.type !== 'danger' || zone.dogCount <= 0) continue;

        const margin = DOG_RADIUS + 4;
        for (let i = 0; i < zone.dogCount; i++) {
            const x = zone.x + margin + Math.random() * Math.max(1, zone.w - margin * 2);
            const y = zone.y + margin + Math.random() * Math.max(1, zone.h - margin * 2);

            const dog = {
                id: nextDogId++,
                zoneId: zone.id,
                x: x,
                y: y,
                angle: Math.random() * Math.PI * 2,
                speed: difficulty === 'hard' ? DOG_SPEED_HARD : difficulty === 'medium' ? DOG_SPEED_MEDIUM : DOG_SPEED_EASY,
                radius: DOG_RADIUS,
                state: 'idle',
                idleTimer: randomIdleTime(),
                waypoints: [],
                waypointIndex: 0,
            };
            dogs.push(dog);
        }
    }
}

function randomIdleTime() {
    return DOG_IDLE_MIN + Math.floor(Math.random() * (DOG_IDLE_MAX - DOG_IDLE_MIN));
}

function generateDogPath(dog) {
    const zone = zones.find(z => z.id === dog.zoneId);
    if (!zone) return;

    const numWaypoints = DOG_WAYPOINTS_MIN +
        Math.floor(Math.random() * (DOG_WAYPOINTS_MAX - DOG_WAYPOINTS_MIN + 1));
    const margin = DOG_RADIUS + 4;
    const waypoints = [];

    const minX = zone.x + margin;
    const maxX = zone.x + zone.w - margin;
    const minY = zone.y + margin;
    const maxY = zone.y + zone.h - margin;

    for (let i = 0; i < numWaypoints; i++) {
        waypoints.push({
            x: minX + Math.random() * Math.max(1, maxX - minX),
            y: minY + Math.random() * Math.max(1, maxY - minY),
        });
    }

    dog.waypoints = waypoints;
    dog.waypointIndex = 0;
    dog.state = 'walking';
}

function tickDogs() {
    for (const dog of dogs) {
        if (dog.state === 'idle') {
            dog.idleTimer--;
            if (dog.idleTimer <= 0) {
                generateDogPath(dog);
            }
        } else if (dog.state === 'walking') {
            if (dog.waypointIndex >= dog.waypoints.length) {
                // Finished path, go idle
                dog.state = 'idle';
                dog.idleTimer = randomIdleTime();
                continue;
            }

            const wp = dog.waypoints[dog.waypointIndex];
            const dx = wp.x - dog.x;
            const dy = wp.y - dog.y;
            const dist = Math.hypot(dx, dy);

            if (dist <= dog.speed) {
                // Reached waypoint
                dog.x = wp.x;
                dog.y = wp.y;
                dog.waypointIndex++;
            } else {
                dog.x += (dx / dist) * dog.speed;
                dog.y += (dy / dist) * dog.speed;
                dog.angle = Math.atan2(dy, dx);
            }

            // Clamp to zone bounds
            const zone = zones.find(z => z.id === dog.zoneId);
            if (zone) {
                const m = dog.radius;
                dog.x = Math.max(zone.x + m, Math.min(dog.x, zone.x + zone.w - m));
                dog.y = Math.max(zone.y + m, Math.min(dog.y, zone.y + zone.h - m));
            }
        }
    }
}


// ═══════════════════════════════════════════════════════════════
// PLAYER HELPERS
// ═══════════════════════════════════════════════════════════════

function killPlayer(player) {
    if (!player.alive) return;
    player.alive = false;
    player.deathX = player.x;
    player.deathY = player.y;
    player.targetX = player.x;
    player.targetY = player.y;

    pendingEvents.push({
        type: 'elimination',
        playerId: player.id,
        playerName: player.name,
        playerColor: player.color,
        killerId: null,
        killerName: '',
        killerColor: '#fff',
    });
}

function revivePlayer(deadPlayer, reviver) {
    deadPlayer.alive = true;
    deadPlayer.x = reviver.x;
    deadPlayer.y = reviver.y;
    deadPlayer.targetX = reviver.x;
    deadPlayer.targetY = reviver.y;
    deadPlayer.deathX = null;
    deadPlayer.deathY = null;
    deadPlayer.invulnTicks = REVIVE_INVULN_TICKS;

    pendingEvents.push({
        type: 'kitten_revived',
        playerId: deadPlayer.id,
        playerName: deadPlayer.name,
        playerColor: deadPlayer.color,
        reviverId: reviver.id,
        reviverName: reviver.name,
        reviverColor: reviver.color,
    });
}


// ═══════════════════════════════════════════════════════════════
// SPAWN
// ═══════════════════════════════════════════════════════════════

function getSpawnPositions(count) {
    // All players spawn in zone 0 (the start safe zone)
    const startZone = zones[0];
    if (!startZone) return [];

    const cx = startZone.x + startZone.w / 2;
    const cy = startZone.y + startZone.h / 2;
    const positions = [];

    for (let i = 0; i < count; i++) {
        const angle = (i / count) * Math.PI * 2;
        const spread = Math.min(SPAWN_SPREAD, startZone.w / 3);
        positions.push({
            x: cx + Math.cos(angle) * spread,
            y: cy + Math.sin(angle) * spread,
        });
    }
    return positions;
}


// ═══════════════════════════════════════════════════════════════
// MODULE EXPORTS
// ═══════════════════════════════════════════════════════════════

module.exports = {
    // Required
    id: 'rkr',
    name: 'Run Kitty Run!',
    maxPlayers: 12,

    // Optional properties
    supportedModes: ['ffa', 'teams'],
    defaultMode: 'ffa',
    defaultTeamCount: 2,
    defaultSettings: { difficulty: 'easy', winMode: 'firstin' },

    init(playerList, settings, gameMode, gameTeamCount) {
        mode = gameMode;
        teamCount = gameTeamCount;
        difficulty = (settings && settings.difficulty) || 'easy';
        winMode = (settings && settings.winMode) || 'firstin';
        players = {};
        pendingEvents = [];

        // Generate maze
        const mazeData = generateMaze(difficulty);
        zones = mazeData.zones;
        goalZone = mazeData.goalZone;
        buildZoneGrid();

        // Spawn players
        const spawns = getSpawnPositions(playerList.length);
        playerList.forEach((p, i) => {
            const sp = spawns[i] || { x: 200, y: 200 };
            players[p.id] = {
                id: p.id,
                name: p.name,
                team: p.team,
                color: p.color,
                colorIndex: p.colorIndex,
                x: sp.x,
                y: sp.y,
                targetX: sp.x,
                targetY: sp.y,
                angle: 0,
                speed: KITTEN_SPEED,
                alive: true,
                radius: KITTEN_RADIUS,
                deathX: null,
                deathY: null,
                reachedGoal: false,
                invulnTicks: 0,
            };
        });

        // Spawn dogs
        spawnDogs();
    },

    tick(dt) {
        // ── Move kittens ──
        for (const p of Object.values(players)) {
            if (!p.alive || p.reachedGoal) continue;

            // Tick invulnerability
            if (p.invulnTicks > 0) p.invulnTicks--;

            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.hypot(dx, dy);

            if (dist > p.speed) {
                p.x += (dx / dist) * p.speed;
                p.y += (dy / dist) * p.speed;
                p.angle = Math.atan2(dy, dx);
            } else if (dist > 0.1) {
                // Snap to target when close enough
                p.x = p.targetX;
                p.y = p.targetY;
            }

            // Check void death (not in any zone)
            if (!isInAnyZone(p.x, p.y)) {
                killPlayer(p);
                continue;
            }

            // Check if reached goal
            if (goalZone && pointInZone(p.x, p.y, goalZone) && !p.reachedGoal) {
                p.reachedGoal = true;
                p.targetX = p.x;
                p.targetY = p.y;
                pendingEvents.push({
                    type: 'kitten_reached_goal',
                    playerId: p.id,
                    playerName: p.name,
                    playerColor: p.color,
                });
            }
        }

        // ── Move dogs ──
        tickDogs();

        // ── Build spatial grid for collision ──
        buildDogGrid();

        // ── Dog-kitten collision (spatial grid) ──
        for (const p of Object.values(players)) {
            if (!p.alive || p.reachedGoal || p.invulnTicks > 0) continue;
            const checkRadius = p.radius + DOG_RADIUS;
            const nearbyDogs = getDogsNear(p.x, p.y, checkRadius + GRID_CELL_SIZE);
            for (const dog of nearbyDogs) {
                const dx = dog.x - p.x, dy = dog.y - p.y;
                if (dx * dx + dy * dy < (dog.radius + p.radius) * (dog.radius + p.radius)) {
                    killPlayer(p);
                    break;
                }
            }
        }

        // ── Revival check (single pass to build lists) ──
        const deadPlayers = [];
        const alivePlayers = [];
        for (const p of Object.values(players)) {
            if (!p.alive && p.deathX !== null) deadPlayers.push(p);
            else if (p.alive && !p.reachedGoal) alivePlayers.push(p);
        }

        const reviveRadiusSq = REVIVE_RADIUS * REVIVE_RADIUS;
        for (const dead of deadPlayers) {
            for (const alive of alivePlayers) {
                if (mode !== 'ffa' && dead.team !== alive.team) continue;
                const dx = alive.x - dead.deathX, dy = alive.y - dead.deathY;
                if (dx * dx + dy * dy < reviveRadiusSq) {
                    revivePlayer(dead, alive);
                    break;
                }
            }
        }
    },

    onInput(playerId, message) {
        const p = players[playerId];
        if (!p || !p.alive || p.reachedGoal) return;

        if (message.type === 'move') {
            // Clamp target to world bounds
            p.targetX = Math.max(0, Math.min(WORLD_WIDTH, message.x));
            p.targetY = Math.max(0, Math.min(WORLD_HEIGHT, message.y));
        } else if (message.type === 'stop') {
            // Stop in place using server's authoritative position
            p.targetX = p.x;
            p.targetY = p.y;
        }
    },

    getState() {
        return {
            players: Object.values(players).map(p => ({
                id: p.id,
                name: p.name,
                team: p.team,
                color: p.color,
                colorIndex: p.colorIndex,
                x: Math.round(p.x),
                y: Math.round(p.y),
                targetX: Math.round(p.targetX),
                targetY: Math.round(p.targetY),
                angle: Math.round(p.angle * 100) / 100,
                alive: p.alive,
                radius: p.radius,
                deathX: p.deathX !== null ? Math.round(p.deathX) : null,
                deathY: p.deathY !== null ? Math.round(p.deathY) : null,
                reachedGoal: p.reachedGoal,
                invulnTicks: p.invulnTicks,
            })),
            dogs: dogs.map(d => ({
                id: d.id,
                x: Math.round(d.x),
                y: Math.round(d.y),
                angle: Math.round(d.angle * 100) / 100,
                s: d.state === 'idle' ? 0 : 1,
            })),
        };
    },

    getEvents() {
        const events = pendingEvents.slice();
        pendingEvents = [];
        return events;
    },

    checkRoundOver() {
        const allPlayers = Object.values(players);
        if (allPlayers.length === 0) return null;

        // ── FFA: first to goal wins ──
        if (mode === 'ffa') {
            const winner = allPlayers.find(p => p.reachedGoal);
            if (winner) {
                return { winner: { name: winner.name, color: winner.color }, stats: getStats() };
            }

            // Stalemate check: everyone dead
            const anyAlive = allPlayers.some(p => p.alive);
            if (!anyAlive) {
                return { winner: null, stats: getStats() };
            }
        }

        // ── Teams ──
        if (mode === 'teams') {
            for (let t = 0; t < teamCount; t++) {
                const teamPlayers = allPlayers.filter(p => p.team === t);
                if (teamPlayers.length === 0) continue;

                if (winMode === 'firstin') {
                    // Any player on the team reached goal = team wins
                    if (teamPlayers.some(p => p.reachedGoal)) {
                        return { winnerTeam: t, stats: getStats() };
                    }
                } else {
                    // All In: every team member must be alive AND in goal
                    const allInGoal = teamPlayers.every(p => p.reachedGoal);
                    if (allInGoal) {
                        return { winnerTeam: t, stats: getStats() };
                    }
                }
            }

            // Stalemate: every team has all members dead
            let allTeamsDead = true;
            for (let t = 0; t < teamCount; t++) {
                const teamPlayers = allPlayers.filter(p => p.team === t);
                if (teamPlayers.some(p => p.alive)) {
                    allTeamsDead = false;
                    break;
                }
            }
            if (allTeamsDead) {
                return { winnerTeam: null, stats: getStats() };
            }
        }

        return null; // game continues
    },
};


// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════

function getStats() {
    return Object.values(players).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        team: p.team,
        alive: p.alive,
        reachedGoal: p.reachedGoal,
    }));
}
