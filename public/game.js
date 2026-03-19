// Run Kitty Run! — Client-side game code

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // CONSTANTS (mirrored from server for rendering)
    // ═══════════════════════════════════════════════════════════

    const WORLD_WIDTH = 4800;
    const WORLD_HEIGHT = 4800;
    const WALL_THICKNESS = 20;
    const CORRIDOR_WIDTH = 400;
    const KITTEN_RADIUS = 16;
    const DOG_RADIUS = 18;
    const GRID_SIZE = 80;

    // ═══════════════════════════════════════════════════════════
    // MAZE GENERATION (same algorithm as server)
    // ═══════════════════════════════════════════════════════════

    function generateMazeClient() {
        const result = [];
        const step = CORRIDOR_WIDTH + WALL_THICKNESS;
        let order = 0;

        let r = 0;
        while (true) {
            const L = r * step;
            const T = r * step;
            const R = WORLD_WIDTH - r * step;
            const B = WORLD_HEIGHT - r * step;
            const CW = CORRIDOR_WIDTH;

            if (R - L <= 2 * CW) break;

            result.push({ type: 'safe', x: L, y: T, w: CW, h: CW, order: order++ });
            result.push({ type: 'danger', x: L + CW, y: T, w: R - L - 2 * CW, h: CW, order: order++ });
            result.push({ type: 'safe', x: R - CW, y: T, w: CW, h: CW, order: order++ });
            result.push({ type: 'danger', x: R - CW, y: T + CW, w: CW, h: B - T - 2 * CW, order: order++ });
            result.push({ type: 'safe', x: R - CW, y: B - CW, w: CW, h: CW, order: order++ });
            result.push({ type: 'danger', x: L + CW, y: B - CW, w: R - L - 2 * CW, h: CW, order: order++ });
            result.push({ type: 'safe', x: L, y: B - CW, w: CW, h: CW, order: order++ });

            const nextRingTop = (r + 1) * step;
            const leftTop = nextRingTop + CW;
            const leftBottom = B - CW;
            if (leftBottom > leftTop) {
                result.push({ type: 'danger', x: L, y: leftTop, w: CW, h: leftBottom - leftTop, order: order++ });
            }

            result.push({ type: 'safe', x: L, y: nextRingTop, w: CW + WALL_THICKNESS, h: CW, order: order++ });
            r++;
        }

        const gL = r * step, gT = r * step;
        const gR = WORLD_WIDTH - r * step, gB = WORLD_HEIGHT - r * step;
        if (gR > gL && gB > gT) {
            result.push({ type: 'goal', x: gL, y: gT, w: gR - gL, h: gB - gT, order: order++ });
        }

        return result;
    }

    // ═══════════════════════════════════════════════════════════
    // CLIENT STATE
    // ═══════════════════════════════════════════════════════════

    let mazeZones = [];
    let mouseCanvasX = 0, mouseCanvasY = 0;
    let frameTick = 0;

    const canvas = document.getElementById('game-canvas');
    document.getElementById('game-container').addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseCanvasX = (e.clientX - rect.left) * (1920 / rect.width);
        mouseCanvasY = (e.clientY - rect.top) * (1080 / rect.height);
    });

    // ═══════════════════════════════════════════════════════════
    // COLOR PALETTE
    // ═══════════════════════════════════════════════════════════

    const COLORS = {
        void: '#08080e',
        voidEdge: 'rgba(80, 20, 30, 0.4)',
        safeGround: '#2a5e1e',
        safeLight: '#347228',
        safeBorder: 'rgba(100, 200, 80, 0.3)',
        dangerGround: '#7a6535',
        dangerLight: '#8a7545',
        dangerBorder: 'rgba(200, 150, 60, 0.3)',
        goalGround: '#8a7020',
        goalGlow: 'rgba(220, 180, 40, 0.15)',
        goalBorder: 'rgba(255, 220, 80, 0.5)',
        grid: 'rgba(255, 255, 255, 0.018)',
        dogBody: '#8B6914',
        dogDark: '#6B4E10',
        dogLight: '#A88030',
        dogNose: '#222',
    };

    // ═══════════════════════════════════════════════════════════
    // DRAWING HELPERS
    // ═══════════════════════════════════════════════════════════

    function drawKitten(ctx, x, y, angle, color, radius, invuln) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 5, radius + 3, radius * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tail (behind body)
        const tailWag = Math.sin(frameTick * 0.15) * 0.3;
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-radius * 0.7, 0);
        ctx.quadraticCurveTo(
            -radius * 1.4, -radius * 0.4 + tailWag * radius,
            -radius * 1.1, -radius * 0.9 + tailWag * radius
        );
        ctx.stroke();

        // Body (oval)
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 0, radius, radius * 0.72, 0, 0, Math.PI * 2);
        ctx.fill();

        // Lighter chest
        ctx.fillStyle = lightenColor(color, 0.35);
        ctx.beginPath();
        ctx.ellipse(radius * 0.15, 0, radius * 0.4, radius * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();

        // Left ear
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(radius * 0.3, -radius * 0.55);
        ctx.lineTo(radius * 0.95, -radius * 1.1);
        ctx.lineTo(radius * 0.75, -radius * 0.35);
        ctx.closePath();
        ctx.fill();
        // Inner ear
        ctx.fillStyle = lightenColor(color, 0.5);
        ctx.beginPath();
        ctx.moveTo(radius * 0.45, -radius * 0.55);
        ctx.lineTo(radius * 0.85, -radius * 0.9);
        ctx.lineTo(radius * 0.7, -radius * 0.4);
        ctx.closePath();
        ctx.fill();

        // Right ear
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(radius * 0.3, radius * 0.55);
        ctx.lineTo(radius * 0.95, radius * 1.1);
        ctx.lineTo(radius * 0.75, radius * 0.35);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = lightenColor(color, 0.5);
        ctx.beginPath();
        ctx.moveTo(radius * 0.45, radius * 0.55);
        ctx.lineTo(radius * 0.85, radius * 0.9);
        ctx.lineTo(radius * 0.7, radius * 0.4);
        ctx.closePath();
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(radius * 0.45, -radius * 0.2, 3, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(radius * 0.45, radius * 0.2, 3, 0, Math.PI * 2);
        ctx.fill();
        // Pupils
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(radius * 0.48, -radius * 0.2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(radius * 0.48, radius * 0.2, 1.5, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = lightenColor(color, 0.6);
        ctx.beginPath();
        ctx.arc(radius * 0.7, 0, 2, 0, Math.PI * 2);
        ctx.fill();

        // Invuln shimmer
        if (invuln > 0) {
            ctx.globalAlpha = 0.4 + Math.sin(frameTick * 0.5) * 0.2;
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.ellipse(0, 0, radius + 4, radius * 0.8 + 4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        }

        ctx.restore();
    }

    function drawDog(ctx, x, y, angle, radius, isIdle) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);

        const bob = isIdle ? Math.sin(frameTick * 0.08) * 2 : 0;

        // Shadow
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.beginPath();
        ctx.ellipse(0, 6, radius + 4, radius * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();

        // Tail stub
        ctx.strokeStyle = COLORS.dogBody;
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-radius * 0.7, 0);
        ctx.lineTo(-radius * 1.0, -radius * 0.3 + Math.sin(frameTick * 0.2) * 3);
        ctx.stroke();

        // Body (larger oval)
        ctx.fillStyle = COLORS.dogBody;
        ctx.beginPath();
        ctx.ellipse(0, bob, radius, radius * 0.75, 0, 0, Math.PI * 2);
        ctx.fill();

        // Darker back stripe
        ctx.fillStyle = COLORS.dogDark;
        ctx.beginPath();
        ctx.ellipse(-radius * 0.15, bob - radius * 0.1, radius * 0.5, radius * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();

        // Floppy left ear
        ctx.fillStyle = COLORS.dogDark;
        ctx.beginPath();
        ctx.ellipse(radius * 0.3, -radius * 0.7 + bob, radius * 0.3, radius * 0.5, -0.3, 0, Math.PI * 2);
        ctx.fill();

        // Floppy right ear
        ctx.beginPath();
        ctx.ellipse(radius * 0.3, radius * 0.7 + bob, radius * 0.3, radius * 0.5, 0.3, 0, Math.PI * 2);
        ctx.fill();

        // Snout
        ctx.fillStyle = COLORS.dogLight;
        ctx.beginPath();
        ctx.ellipse(radius * 0.65, bob, radius * 0.35, radius * 0.28, 0, 0, Math.PI * 2);
        ctx.fill();

        // Nose
        ctx.fillStyle = COLORS.dogNose;
        ctx.beginPath();
        ctx.arc(radius * 0.85, bob, 3, 0, Math.PI * 2);
        ctx.fill();

        // Eyes
        ctx.fillStyle = '#222';
        ctx.beginPath();
        ctx.arc(radius * 0.4, -radius * 0.2 + bob, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(radius * 0.4, radius * 0.2 + bob, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    function drawDeathMarker(ctx, x, y, color) {
        const pulse = 0.8 + Math.sin(frameTick * 0.06) * 0.2;
        const alphaBase = 0.4 + Math.sin(frameTick * 0.06) * 0.15;

        // Outer glow
        ctx.globalAlpha = alphaBase * 0.3;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 30 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Inner circle
        ctx.globalAlpha = alphaBase;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.globalAlpha = alphaBase + 0.2;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, 18 * pulse, 0, Math.PI * 2);
        ctx.stroke();

        // Paw print icon (simplified)
        ctx.globalAlpha = alphaBase + 0.1;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y + 2, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x - 5, y - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x + 5, y - 4, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, y - 7, 2.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = 1;
    }

    function lightenColor(hex, amount) {
        let r, g, b;
        if (hex.startsWith('#')) {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        } else {
            return hex;
        }
        r = Math.min(255, r + (255 - r) * amount);
        g = Math.min(255, g + (255 - g) * amount);
        b = Math.min(255, b + (255 - b) * amount);
        return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
    }

    function esc(str) {
        return window.PDROP.escapeHtml(str);
    }

    // ═══════════════════════════════════════════════════════════
    // ZONE RENDERING
    // ═══════════════════════════════════════════════════════════

    function drawZones(ctx, cx, cy, vw, vh) {
        // Void background (already filled by framework, but ensure coverage)
        ctx.fillStyle = COLORS.void;
        ctx.fillRect(0, 0, vw, vh);

        // Draw each zone
        for (const z of mazeZones) {
            const sx = z.x - cx;
            const sy = z.y - cy;

            // Cull off-screen zones
            if (sx + z.w < 0 || sx > vw || sy + z.h < 0 || sy > vh) continue;

            // Zone fill
            if (z.type === 'safe') {
                ctx.fillStyle = COLORS.safeGround;
                ctx.fillRect(sx, sy, z.w, z.h);
                // Subtle lighter patches
                ctx.fillStyle = COLORS.safeLight;
                for (let px = 0; px < z.w; px += 40) {
                    for (let py = 0; py < z.h; py += 40) {
                        if ((px + py + z.x + z.y) % 80 < 40) {
                            ctx.fillRect(sx + px, sy + py, 20, 20);
                        }
                    }
                }
            } else if (z.type === 'danger') {
                ctx.fillStyle = COLORS.dangerGround;
                ctx.fillRect(sx, sy, z.w, z.h);
                ctx.fillStyle = COLORS.dangerLight;
                for (let px = 0; px < z.w; px += 60) {
                    for (let py = 0; py < z.h; py += 60) {
                        if ((px + py + z.x) % 120 < 60) {
                            ctx.fillRect(sx + px, sy + py, 30, 30);
                        }
                    }
                }
            } else if (z.type === 'goal') {
                // Golden base
                ctx.fillStyle = COLORS.goalGround;
                ctx.fillRect(sx, sy, z.w, z.h);
                // Pulsing glow
                const glowAlpha = 0.08 + Math.sin(frameTick * 0.04) * 0.05;
                const gcx = sx + z.w / 2;
                const gcy = sy + z.h / 2;
                const gr = Math.max(z.w, z.h) * 0.6;
                const grad = ctx.createRadialGradient(gcx, gcy, 0, gcx, gcy, gr);
                grad.addColorStop(0, `rgba(255, 220, 60, ${glowAlpha + 0.1})`);
                grad.addColorStop(1, 'transparent');
                ctx.fillStyle = grad;
                ctx.fillRect(sx, sy, z.w, z.h);
            }

            // Zone border (edge highlight)
            let borderColor = COLORS.safeBorder;
            if (z.type === 'danger') borderColor = COLORS.dangerBorder;
            if (z.type === 'goal') borderColor = COLORS.goalBorder;
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1.5;
            ctx.strokeRect(sx + 0.5, sy + 0.5, z.w - 1, z.h - 1);
        }
    }

    function drawGrid(ctx, cx, cy, vw, vh) {
        ctx.strokeStyle = COLORS.grid;
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
    }


    // ═══════════════════════════════════════════════════════════
    // HUD UPDATES
    // ═══════════════════════════════════════════════════════════

    function updateStatusBar(gameState) {
        const el = document.getElementById('status-bar');
        if (!el || !gameState || !gameState.players) return;

        const lobby = window.PDROP.getCurrentLobby();
        const isTeams = lobby && lobby.mode === 'teams';

        const running = gameState.players.filter(p => p.alive && !p.reachedGoal).length;
        const caught = gameState.players.filter(p => !p.alive).length;
        const finished = gameState.players.filter(p => p.reachedGoal).length;

        if (isTeams) {
            const teamData = {};
            const TCOLORS = window.PDROP.COLORS;
            const TNAMES = window.PDROP.COLOR_NAMES;
            for (const p of gameState.players) {
                if (!teamData[p.team]) teamData[p.team] = { running: 0, caught: 0, finished: 0 };
                if (p.reachedGoal) teamData[p.team].finished++;
                else if (!p.alive) teamData[p.team].caught++;
                else teamData[p.team].running++;
            }
            let html = '';
            for (const t of Object.keys(teamData).sort()) {
                const td = teamData[t];
                if (html) html += '&nbsp;&nbsp;|&nbsp;&nbsp;';
                html += `<span style="color:${TCOLORS[t]}">${TNAMES[t]}</span>: `;
                html += `${td.running} running`;
                if (td.caught > 0) html += ` · ${td.caught} caught`;
                if (td.finished > 0) html += ` · ${td.finished} finished`;
            }
            el.innerHTML = html;
        } else {
            let parts = [];
            if (running > 0) parts.push(`${running} running`);
            if (caught > 0) parts.push(`${caught} caught`);
            if (finished > 0) parts.push(`${finished} finished`);
            el.textContent = parts.join(' · ');
        }
    }

    function updatePersonalStatus(gameState) {
        const el = document.getElementById('personal-status');
        if (!el || !gameState) return;
        const lp = gameState.players?.find(p => p.id === window.PDROP.getLocalPlayerId());
        if (!lp) { el.textContent = ''; return; }

        if (!lp.alive) {
            el.textContent = '☠ You were caught! Waiting for revival...';
            el.style.color = lp.color;
        } else if (lp.reachedGoal) {
            el.textContent = '★ You made it! Cheering on teammates...';
            el.style.color = '#f0c040';
        } else {
            el.textContent = '';
        }
    }


    // ═══════════════════════════════════════════════════════════
    // GAMEDEF
    // ═══════════════════════════════════════════════════════════

    window.GameDef = {
        id: 'rkr',
        name: 'Run Kitty Run!',
        maxPlayers: 12,
        supportedModes: ['ffa', 'teams'],
        defaultMode: 'ffa',
        defaultTeamCount: 2,
        worldWidth: WORLD_WIDTH,
        worldHeight: WORLD_HEIGHT,

        getCameraLockTarget(localPlayer) {
            if (localPlayer && localPlayer.alive && !localPlayer.reachedGoal) {
                return { x: localPlayer.x, y: localPlayer.y };
            }
            return null;
        },

        getCameraSnapTarget(localPlayer) {
            if (localPlayer && localPlayer.alive && !localPlayer.reachedGoal) {
                return { x: localPlayer.x, y: localPlayer.y };
            }
            return null;
        },

        onGameStart(initialState) {
            // Generate maze client-side (deterministic, same as server)
            mazeZones = generateMazeClient();
            // Clear event feed
            const ef = document.getElementById('event-feed');
            if (ef) ef.innerHTML = '';
            const ps = document.getElementById('personal-status');
            if (ps) ps.textContent = '';
        },

        onElimination(msg) {
            // The framework sends 'elimination' events — show in event feed
            const ef = document.getElementById('event-feed');
            if (!ef) return;

            let text = '';
            if (msg.type === 'kitten_revived') {
                text = `<span style="color:${msg.reviverColor}">${esc(msg.reviverName)}</span> revived <span style="color:${msg.playerColor}">${esc(msg.playerName)}</span>!`;
            } else if (msg.type === 'kitten_reached_goal') {
                text = `<span style="color:${msg.playerColor}">${esc(msg.playerName)}</span> reached the goal! ★`;
            } else {
                // Default elimination (caught)
                text = `<span style="color:${msg.playerColor}">${esc(msg.playerName)}</span> was caught!`;
            }

            const entry = document.createElement('div');
            entry.className = 'event-entry';
            entry.innerHTML = text;
            ef.appendChild(entry);
            setTimeout(() => {
                entry.style.opacity = '0';
                setTimeout(() => entry.remove(), 1000);
            }, 5000);
        },

        render(ctx, camera, gameState) {
            if (!gameState) return;
            frameTick++;

            const cx = camera.x;
            const cy = camera.y;
            const zoom = camera.zoom || 1;
            const vw = 1920 / zoom;
            const vh = 1080 / zoom;

            // ── 1. Void background ──
            ctx.fillStyle = COLORS.void;
            ctx.fillRect(0, 0, vw, vh);

            // ── 2. Zone ground fills ──
            drawZones(ctx, cx, cy, vw, vh);

            // ── 3. Grid ──
            drawGrid(ctx, cx, cy, vw, vh);

            // ── 4. Death markers ──
            for (const p of gameState.players) {
                if (p.alive || p.deathX === null) continue;
                const sx = p.deathX - cx;
                const sy = p.deathY - cy;
                if (sx < -50 || sx > vw + 50 || sy < -50 || sy > vh + 50) continue;
                drawDeathMarker(ctx, sx, sy, p.color);
            }

            // ── 5. Dog shadows ──
            if (gameState.dogs) {
                for (const d of gameState.dogs) {
                    const sx = d.x - cx;
                    const sy = d.y - cy;
                    if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;
                    ctx.fillStyle = 'rgba(0,0,0,0.2)';
                    ctx.beginPath();
                    ctx.ellipse(sx, sy + 6, DOG_RADIUS + 4, DOG_RADIUS * 0.4, 0, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // ── 6. Kitten shadows ──
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const sx = p.x - cx;
                const sy = p.y - cy;
                if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.beginPath();
                ctx.ellipse(sx, sy + 5, KITTEN_RADIUS + 3, KITTEN_RADIUS * 0.4, 0, 0, Math.PI * 2);
                ctx.fill();
            }

            // ── 7. Dogs ──
            if (gameState.dogs) {
                for (const d of gameState.dogs) {
                    const sx = d.x - cx;
                    const sy = d.y - cy;
                    if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;
                    drawDog(ctx, sx, sy, d.angle, DOG_RADIUS, d.s === 0);
                }
            }

            // ── 8. Kittens ──
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const sx = p.x - cx;
                const sy = p.y - cy;
                if (sx < -40 || sx > vw + 40 || sy < -40 || sy > vh + 40) continue;
                drawKitten(ctx, sx, sy, p.angle, p.color, p.radius || KITTEN_RADIUS, p.invulnTicks || 0);
            }

            // ── 9. Name labels ──
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const sx = p.x - cx;
                const sy = p.y - cy;
                if (sx < -60 || sx > vw + 60 || sy < -60 || sy > vh + 60) continue;

                const r = p.radius || KITTEN_RADIUS;
                ctx.font = '600 20px Rajdhani';
                // Shadow
                ctx.fillStyle = 'rgba(0,0,0,0.5)';
                ctx.fillText(p.name, sx + 1, sy - r - 11);
                // Text
                ctx.fillStyle = '#fff';
                ctx.fillText(p.name, sx, sy - r - 12);

                // Goal star
                if (p.reachedGoal) {
                    ctx.fillStyle = '#f0c040';
                    ctx.font = '700 16px Rajdhani';
                    ctx.fillText('★ SAFE', sx, sy - r - 28);
                }
            }

            // ── 10. HUD updates ──
            updateStatusBar(gameState);
            updatePersonalStatus(gameState);
        },

        onInput(inputType, data) {
            if (inputType === 'rightclick') {
                window.PDROP.wsSend({
                    type: 'game_input',
                    data: { type: 'move', x: data.x, y: data.y },
                });
            }
        },

        getScoreboardColumns() {
            return [
                { key: 'status', label: 'Status', width: 100 },
            ];
        },

        getPlayerStats(playerId) {
            const gs = window.PDROP.getGameState();
            if (!gs || !gs.players) return { status: '' };
            const p = gs.players.find(pl => pl.id === playerId);
            if (!p) return { status: '' };
            if (p.reachedGoal) return { status: '★ Finished' };
            if (!p.alive) return { status: '☠ Caught' };
            return { status: 'Running' };
        },

        getEntityTooltip(entity) {
            if (entity.type === 'player') {
                const status = entity.reachedGoal ? 'Reached the goal!' :
                               entity.alive ? 'Running' : 'Caught!';
                return `<div class="tip-title" style="color: ${entity.color}">${esc(entity.name)}</div>`
                     + `<div class="tip-desc">${status}</div>`;
            }
            return null;
        },

        getResults(finalState) {
            return finalState;
        },
    };

})();
