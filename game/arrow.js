// PDROP Arrow — Server-side game logic

const WORLD_WIDTH = 3200;
const WORLD_HEIGHT = 2400;

// Game state
let players = {};
let arrows = [];
let mode = 'ffa';
let teamCount = 1;
let pendingEvents = [];

// Spawn areas per team (corners)
const TEAM_SPAWNS = [
    { minX: 200, maxX: 600, minY: 200, maxY: 500 },   // Red — top-left
    { minX: 2600, maxX: 3000, minY: 200, maxY: 500 },  // Blue — top-right
    { minX: 200, maxX: 600, minY: 1900, maxY: 2200 },  // Green — bottom-left
    { minX: 2600, maxX: 3000, minY: 1900, maxY: 2200 }, // Gold — bottom-right
];

// Obstacles (fixed layout)
const obstacles = [
    { x: 800, y: 600, w: 120, h: 200 },
    { x: 2000, y: 400, w: 200, h: 120 },
    { x: 1400, y: 1200, w: 160, h: 160 },
    { x: 600, y: 1600, w: 200, h: 100 },
    { x: 2400, y: 1800, w: 120, h: 220 },
];

// Border walls
const walls = [
    { x: 0, y: 0, w: WORLD_WIDTH, h: 20 },             // top
    { x: 0, y: WORLD_HEIGHT - 20, w: WORLD_WIDTH, h: 20 }, // bottom
    { x: 0, y: 0, w: 20, h: WORLD_HEIGHT },             // left
    { x: WORLD_WIDTH - 20, y: 0, w: 20, h: WORLD_HEIGHT }, // right
];

const allWalls = walls.concat(obstacles);

function getFFASpawnPositions(count) {
    // Evenly spaced around an ellipse centered in the arena
    const positions = [];
    const cx = WORLD_WIDTH / 2;
    const cy = WORLD_HEIGHT / 2;
    const rx = WORLD_WIDTH / 2 - 200; // horizontal radius with margin
    const ry = WORLD_HEIGHT / 2 - 200; // vertical radius with margin

    for (let i = 0; i < count; i++) {
        // Start from the left, go clockwise
        const angle = (i / count) * Math.PI * 2 - Math.PI;
        positions.push({
            x: cx + Math.cos(angle) * rx,
            y: cy + Math.sin(angle) * ry,
        });
    }
    return positions;
}

function getTeamSpawnPosition(team, indexInTeam) {
    const area = TEAM_SPAWNS[team] || TEAM_SPAWNS[0];
    // Spread players within the team's area
    const cols = 3;
    const row = Math.floor(indexInTeam / cols);
    const col = indexInTeam % cols;
    const spacingX = (area.maxX - area.minX) / Math.max(cols, 1);
    const spacingY = (area.maxY - area.minY) / Math.max(2, 1);
    return {
        x: area.minX + spacingX * (col + 0.5),
        y: area.minY + spacingY * (row + 0.5),
    };
}

module.exports = {
    // Required
    id: 'pdrop-arrow',
    name: 'PDROP Arrow',
    maxPlayers: 12,

    // Optional properties
    supportedModes: ['teams', 'ffa'],
    defaultMode: 'ffa',
    defaultTeamCount: 2,

    init(playerList, settings, gameMode, gameTeamCount) {
        mode = gameMode;
        teamCount = gameTeamCount;
        players = {};
        arrows = [];
        pendingEvents = [];

        if (mode === 'ffa') {
            const spawns = getFFASpawnPositions(playerList.length);
            playerList.forEach((p, i) => {
                const sp = spawns[i];
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
                    speed: 7,
                    alive: true,
                    radius: 18,
                    shootCooldown: 0,
                    kills: 0,
                };
            });
        } else {
            // Teams mode — track index per team for spawn placement
            const teamIndices = {};
            playerList.forEach((p) => {
                if (teamIndices[p.team] === undefined) teamIndices[p.team] = 0;
                const sp = getTeamSpawnPosition(p.team, teamIndices[p.team]);
                teamIndices[p.team]++;
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
                    speed: 7,
                    alive: true,
                    radius: 18,
                    shootCooldown: 0,
                    kills: 0,
                };
            });
        }
    },

    tick(dt) {
        // Movement
        for (const p of Object.values(players)) {
            if (!p.alive) continue;
            const dx = p.targetX - p.x;
            const dy = p.targetY - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist > p.speed) {
                p.x += (dx / dist) * p.speed;
                p.y += (dy / dist) * p.speed;
                p.angle = Math.atan2(dy, dx);
            }

            // Clamp to walls/obstacles
            clampPlayerToWalls(p);

            // Tick cooldown
            if (p.shootCooldown > 0) p.shootCooldown--;
        }

        // Arrow movement + collision
        for (let i = arrows.length - 1; i >= 0; i--) {
            const a = arrows[i];
            a.x += Math.cos(a.angle) * a.speed;
            a.y += Math.sin(a.angle) * a.speed;
            a.life--;

            // Wall collision
            if (pointInAnyWall(a.x, a.y)) {
                a.life = 0;
            }

            // Player collision
            if (a.life > 0) {
                for (const p of Object.values(players)) {
                    if (!p.alive) continue;
                    if (p.id === a.ownerId) continue;
                    if (p.team === a.team && a.team !== null && mode === 'teams') continue;
                    const d = Math.hypot(a.x - p.x, a.y - p.y);
                    if (d < a.radius + p.radius) {
                        p.alive = false;
                        a.life = 0;
                        // Track kill
                        const killer = players[a.ownerId];
                        if (killer) killer.kills++;
                        pendingEvents.push({
                            type: 'elimination',
                            playerId: p.id,
                            playerName: p.name,
                            playerColor: p.color,
                            killerId: a.ownerId,
                            killerName: killer ? killer.name : '',
                            killerColor: killer ? killer.color : '#fff',
                        });
                        break;
                    }
                }
            }

            if (a.life <= 0) {
                arrows.splice(i, 1);
            }
        }
    },

    onInput(playerId, message) {
        const p = players[playerId];
        if (!p || !p.alive) return;

        if (message.type === 'move') {
            p.targetX = Math.max(20, Math.min(WORLD_WIDTH - 20, message.x));
            p.targetY = Math.max(20, Math.min(WORLD_HEIGHT - 20, message.y));
        }

        if (message.type === 'shoot') {
            if (p.shootCooldown > 0) return;
            p.shootCooldown = 30; // 1.5 seconds at 20 ticks/sec
            p.angle = message.angle;
            arrows.push({
                id: Math.random().toString(36).substr(2, 9),
                ownerId: p.id,
                team: p.team,
                x: p.x + Math.cos(message.angle) * (p.radius + 6),
                y: p.y + Math.sin(message.angle) * (p.radius + 6),
                angle: message.angle,
                speed: 12,
                radius: 5,
                life: 120,
                maxLife: 120,
            });
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
                x: p.x,
                y: p.y,
                angle: p.angle,
                alive: p.alive,
                radius: p.radius,
                shootCooldown: p.shootCooldown,
                kills: p.kills,
            })),
            arrows: arrows.map(a => ({
                id: a.id,
                x: a.x,
                y: a.y,
                angle: a.angle,
                life: a.life,
                maxLife: a.maxLife,
            })),
        };
    },

    getEvents() {
        const events = pendingEvents.slice();
        pendingEvents = [];
        return events;
    },

    checkRoundOver() {
        const alivePlayers = Object.values(players).filter(p => p.alive);
        if (mode === 'ffa') {
            if (alivePlayers.length <= 1) {
                return { winner: alivePlayers[0] || null, stats: getStats() };
            }
        } else {
            const aliveTeams = new Set(alivePlayers.map(p => p.team));
            if (aliveTeams.size <= 1) {
                return { winnerTeam: [...aliveTeams][0] ?? null, stats: getStats() };
            }
        }
        return null;
    },
};

function getStats() {
    return Object.values(players).map(p => ({
        id: p.id,
        name: p.name,
        color: p.color,
        team: p.team,
        kills: p.kills,
        alive: p.alive,
    }));
}

function clampPlayerToWalls(p) {
    for (const w of allWalls) {
        const closestX = Math.max(w.x, Math.min(p.x, w.x + w.w));
        const closestY = Math.max(w.y, Math.min(p.y, w.y + w.h));
        const dx = p.x - closestX;
        const dy = p.y - closestY;
        const dist = Math.hypot(dx, dy);
        if (dist < p.radius && dist > 0) {
            const overlap = p.radius - dist;
            p.x += (dx / dist) * overlap;
            p.y += (dy / dist) * overlap;
        }
    }
}

function pointInAnyWall(x, y) {
    for (const w of allWalls) {
        if (x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h) {
            return true;
        }
    }
    return false;
}
