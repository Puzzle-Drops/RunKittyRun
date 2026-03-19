// PDROP Arrow — Client-side game code

(function () {
    'use strict';

    const WORLD_WIDTH = 3200;
    const WORLD_HEIGHT = 2400;
    const GRID_SIZE = 80;

    // Obstacles (must match server)
    const obstacles = [
        { x: 800, y: 600, w: 120, h: 200 },
        { x: 2000, y: 400, w: 200, h: 120 },
        { x: 1400, y: 1200, w: 160, h: 160 },
        { x: 600, y: 1600, w: 200, h: 100 },
        { x: 2400, y: 1800, w: 120, h: 220 },
    ];

    // Border walls
    const walls = [
        { x: 0, y: 0, w: WORLD_WIDTH, h: 20 },
        { x: 0, y: WORLD_HEIGHT - 20, w: WORLD_WIDTH, h: 20 },
        { x: 0, y: 0, w: 20, h: WORLD_HEIGHT },
        { x: WORLD_WIDTH - 20, y: 0, w: 20, h: WORLD_HEIGHT },
    ];

    const allWalls = walls.concat(obstacles);

    window.GameDef = {
        // Required
        id: 'pdrop-arrow',
        name: 'PDROP Arrow',
        maxPlayers: 12,

        // Optional properties
        supportedModes: ['teams', 'ffa'],
        defaultMode: 'ffa',
        defaultTeamCount: 2,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,

        getCameraLockTarget(localPlayer) {
            if (localPlayer && localPlayer.alive) {
                return { x: localPlayer.x, y: localPlayer.y };
            }
            return null;
        },

        getCameraSnapTarget(localPlayer) {
            if (localPlayer && localPlayer.alive) {
                return { x: localPlayer.x, y: localPlayer.y };
            }
            return null;
        },

        onGameStart(initialState) {
            // Clear kill feed and alive count
            const kf = document.getElementById('kill-feed');
            if (kf) kf.innerHTML = '';
        },

        onElimination(msg) {
            // Add to kill feed
            const kf = document.getElementById('kill-feed');
            if (!kf) return;
            const entry = document.createElement('div');
            entry.className = 'kill-entry';
            entry.innerHTML = `<span style="color:${msg.killerColor}">${esc(msg.killerName)}</span>`
                + `<span class="arrow-icon">\u279C</span>`
                + `<span style="color:${msg.playerColor}">${esc(msg.playerName)}</span>`;
            kf.appendChild(entry);
            // Fade after 5 seconds
            setTimeout(() => {
                entry.style.opacity = '0';
                setTimeout(() => entry.remove(), 1000);
            }, 5000);
        },

        render(ctx, camera, gameState) {
            if (!gameState) return;

            const cx = camera.x;
            const cy = camera.y;
            const zoom = camera.zoom || 1;
            const vw = 1920 / zoom;
            const vh = 1080 / zoom;

            // Background
            ctx.fillStyle = '#12141a';
            ctx.fillRect(0, 0, vw, vh);

            // Grid
            ctx.strokeStyle = 'rgba(255,255,255,0.025)';
            ctx.lineWidth = 1;
            const startCol = Math.floor(cx / GRID_SIZE);
            const endCol = Math.ceil((cx + vw) / GRID_SIZE);
            const startRow = Math.floor(cy / GRID_SIZE);
            const endRow = Math.ceil((cy + vh) / GRID_SIZE);
            for (let c = startCol; c <= endCol; c++) {
                const sx = c * GRID_SIZE - cx;
                ctx.beginPath();
                ctx.moveTo(sx, 0);
                ctx.lineTo(sx, vh);
                ctx.stroke();
            }
            for (let r = startRow; r <= endRow; r++) {
                const sy = r * GRID_SIZE - cy;
                ctx.beginPath();
                ctx.moveTo(0, sy);
                ctx.lineTo(vw, sy);
                ctx.stroke();
            }

            // Walls and obstacles
            for (const w of allWalls) {
                const sx = w.x - cx;
                const sy = w.y - cy;
                ctx.fillStyle = 'rgba(255,255,255,0.06)';
                ctx.fillRect(sx, sy, w.w, w.h);
                ctx.strokeStyle = 'rgba(255,255,255,0.1)';
                ctx.lineWidth = 1;
                ctx.strokeRect(sx, sy, w.w, w.h);
            }

            // Player shadows
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const sx = p.x - cx;
                const sy = p.y - cy;
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.beginPath();
                ctx.ellipse(sx, sy + 12, p.radius + 2, p.radius * 0.5, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // Arrows with trails
            for (const a of gameState.arrows) {
                const sx = a.x - cx;
                const sy = a.y - cy;
                const fadeAlpha = Math.min(1, a.life / 20);

                // Trail (3 positions behind)
                for (let t = 3; t >= 1; t--) {
                    const tx = sx - Math.cos(a.angle) * t * 10;
                    const ty = sy - Math.sin(a.angle) * t * 10;
                    ctx.globalAlpha = (0.3 - t * 0.08) * fadeAlpha;
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.moveTo(tx - Math.cos(a.angle) * 6, ty - Math.sin(a.angle) * 6);
                    ctx.lineTo(tx + Math.cos(a.angle) * 6, ty + Math.sin(a.angle) * 6);
                    ctx.stroke();
                }

                // Arrow body
                ctx.globalAlpha = 0.8 * fadeAlpha;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(sx - Math.cos(a.angle) * 8, sy - Math.sin(a.angle) * 8);
                ctx.lineTo(sx + Math.cos(a.angle) * 8, sy + Math.sin(a.angle) * 8);
                ctx.stroke();
                ctx.globalAlpha = 1;
            }

            // Player bodies and direction indicators
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const sx = p.x - cx;
                const sy = p.y - cy;

                // Body circle
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(sx, sy, p.radius, 0, Math.PI * 2);
                ctx.fill();

                // Direction wedge
                const wedgeLen = p.radius + 6;
                const wedgeAngle = 0.35;
                ctx.fillStyle = lightenColor(p.color, 0.3);
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.lineTo(
                    sx + Math.cos(p.angle - wedgeAngle) * wedgeLen,
                    sy + Math.sin(p.angle - wedgeAngle) * wedgeLen
                );
                ctx.lineTo(
                    sx + Math.cos(p.angle) * (wedgeLen + 4),
                    sy + Math.sin(p.angle) * (wedgeLen + 4)
                );
                ctx.lineTo(
                    sx + Math.cos(p.angle + wedgeAngle) * wedgeLen,
                    sy + Math.sin(p.angle + wedgeAngle) * wedgeLen
                );
                ctx.closePath();
                ctx.fill();

                // Shoot cooldown arc
                if (p.shootCooldown > 0) {
                    const cooldownPct = p.shootCooldown / 30;
                    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
                    ctx.lineWidth = 3;
                    ctx.beginPath();
                    ctx.arc(sx, sy, p.radius + 4, p.angle - Math.PI, p.angle - Math.PI + (1 - cooldownPct) * Math.PI * 2);
                    ctx.stroke();
                }
            }

            // Player name labels (drawn last so they're on top)
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const sx = p.x - cx;
                const sy = p.y - cy;

                ctx.font = '600 22px Rajdhani';
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillText(p.name, sx + 1, sy - p.radius - 9);
                ctx.fillStyle = '#fff';
                ctx.fillText(p.name, sx, sy - p.radius - 10);
            }

            // Update alive count HUD
            updateAliveCount(gameState);
        },

        onInput(inputType, data) {
            if (inputType === 'rightclick') {
                window.PDROP.wsSend({
                    type: 'game_input',
                    data: { type: 'move', x: data.x, y: data.y },
                });
            }

            if (inputType === 'keydown' && (data.key === 'q' || data.key === 'Q')) {
                const lp = window.PDROP.getLocalPlayerFromState();
                if (!lp || !lp.alive) return;
                const cam = window.PDROP.camera;
                const rect = document.getElementById('game-canvas').getBoundingClientRect();
                // mouseCanvasX/Y aren't directly exposed, compute angle from player to cursor
                // Use the last known mouse canvas position via PDROP
                const z = cam.zoom || 1;
                const mouseWorldX = mouseCanvasX / z + cam.x;
                const mouseWorldY = mouseCanvasY / z + cam.y;
                const angle = Math.atan2(mouseWorldY - lp.y, mouseWorldX - lp.x);
                window.PDROP.wsSend({
                    type: 'game_input',
                    data: { type: 'shoot', angle: angle },
                });
            }
        },

        getScoreboardColumns() {
            return [
                { key: 'kills', label: 'K', width: 50 },
                { key: 'status', label: 'Status', width: 80 },
            ];
        },

        getPlayerStats(playerId) {
            const gs = window.PDROP.getGameState();
            if (!gs || !gs.players) return { kills: 0, status: '' };
            const p = gs.players.find(pl => pl.id === playerId);
            if (!p) return { kills: 0, status: '' };
            return {
                kills: p.kills || 0,
                status: p.alive ? 'Alive' : 'Dead',
            };
        },

        getEntityTooltip(entity) {
            if (entity.type === 'player') {
                const status = entity.alive ? 'Alive' : 'Eliminated';
                return `<div class="tip-title" style="color: ${entity.color}">${esc(entity.name)}</div>`
                     + `<div class="tip-desc">${status}</div>`;
            }
            if (entity.type === 'obstacle') {
                return `<div class="tip-desc">Wall &mdash; blocks arrows</div>`;
            }
            return null;
        },

        getResults(finalState) {
            return finalState;
        },
    };

    // Track mouse canvas position for shoot angle calculation
    let mouseCanvasX = 0, mouseCanvasY = 0;
    const canvas = document.getElementById('game-canvas');
    document.getElementById('game-container').addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseCanvasX = (e.clientX - rect.left) * (1920 / rect.width);
        mouseCanvasY = (e.clientY - rect.top) * (1080 / rect.height);
    });

    function lightenColor(hex, amount) {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const nr = Math.min(255, r + (255 - r) * amount);
        const ng = Math.min(255, g + (255 - g) * amount);
        const nb = Math.min(255, b + (255 - b) * amount);
        return `rgb(${Math.round(nr)},${Math.round(ng)},${Math.round(nb)})`;
    }

    function esc(str) {
        return window.PDROP.escapeHtml(str);
    }

    function updateAliveCount(gameState) {
        const el = document.getElementById('alive-count');
        if (!el || !gameState || !gameState.players) return;

        const lobby = window.PDROP.getCurrentLobby();
        const isTeams = lobby && lobby.mode === 'teams';

        if (isTeams) {
            // Show per-team alive counts
            const teamCounts = {};
            for (const p of gameState.players) {
                if (teamCounts[p.team] === undefined) teamCounts[p.team] = { alive: 0, total: 0 };
                teamCounts[p.team].total++;
                if (p.alive) teamCounts[p.team].alive++;
            }
            let html = '';
            const COLORS = window.PDROP.COLORS;
            const NAMES = window.PDROP.COLOR_NAMES;
            for (const t of Object.keys(teamCounts).sort()) {
                const tc = teamCounts[t];
                const dimmed = tc.alive === 0 ? 'opacity:0.35;' : '';
                if (html) html += '&nbsp;&nbsp;&nbsp;';
                html += `<span style="color:${COLORS[t]};${dimmed}">${NAMES[t]}: ${tc.alive}</span>`;
            }
            el.innerHTML = html;
        } else {
            const alive = gameState.players.filter(p => p.alive).length;
            el.textContent = alive + ' player' + (alive !== 1 ? 's' : '') + ' alive';
        }
    }

})();
