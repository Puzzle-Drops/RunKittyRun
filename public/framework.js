// PDROP Framework — Client-side scaling, camera, chat, pings, scoreboard, tooltips, lobby UI
// This file is the same for every PDROP game. Do not modify.
// Supports both 2D and 3D games via GameDef.renderer ('2d' | '3d')

(function () {
    'use strict';

    // ── Constants ──────────────────────────────────────────────────
    const VIRTUAL_W = 1920;
    const VIRTUAL_H = 1080;

    const COLORS = [
        '#e74c3c', '#5dade2', '#6fcf70', '#f0c040',
        '#b880e0', '#e89040', '#40d8d0', '#e87090',
        '#a8e040', '#389090', '#e8a088', '#9898e0',
    ];
    const COLOR_NAMES = [
        'Red', 'Blue', 'Green', 'Gold',
        'Purple', 'Orange', 'Cyan', 'Pink',
        'Lime', 'Teal', 'Salmon', 'Lavender',
    ];

    // ── DOM References ────────────────────────────────────────────
    const container = document.getElementById('game-container');
    const canvas = document.getElementById('game-canvas');
    const ui = document.getElementById('ui');

    // ── Overlay Canvas (framework-owned, always 2D) ───────────────
    // Pings, ping wheel, and countdown render here — independent of
    // whether the game uses 2D or 3D on the main game canvas.
    const overlayCanvas = document.createElement('canvas');
    overlayCanvas.id = 'overlay-canvas';
    overlayCanvas.width = VIRTUAL_W;
    overlayCanvas.height = VIRTUAL_H;
    overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    container.insertBefore(overlayCanvas, ui);
    const overlayCtx = overlayCanvas.getContext('2d');

    // ── Renderer Mode ─────────────────────────────────────────────
    // Determined at game start from GameDef.renderer ('2d' | '3d')
    // In 2D mode: framework creates ctx on game canvas, passes to render()
    // In 3D mode: framework never touches game canvas context. Game owns it.
    let rendererMode = '2d'; // default, updated when GameDef is read
    let ctx = null;          // only set in 2D mode

    function initRendererMode() {
        rendererMode = (window.GameDef && window.GameDef.renderer === '3d') ? '3d' : '2d';
        if (rendererMode === '2d') {
            ctx = canvas.getContext('2d');
        }
        // In 3D mode, ctx stays null — game calls initRenderer to set up WebGL/Three.js
    }

    // ── Scaling ───────────────────────────────────────────────────
    function updateScale() {
        const s = container.offsetWidth / VIRTUAL_W;
        ui.style.zoom = s;
    }
    updateScale();
    window.addEventListener('resize', updateScale);

    // ── WebSocket ─────────────────────────────────────────────────
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}`);
    let localPlayerId = null;
    let localPlayerName = 'Player';
    let currentLobby = null;

    ws.addEventListener('open', () => {
        console.log('Connected to server');
    });

    ws.addEventListener('close', () => {
        console.log('Disconnected from server');
        showScreen('main-menu');
    });

    function wsSend(msg) {
        if (ws.readyState === 1) {
            ws.send(JSON.stringify(msg));
        }
    }

    // ── Game State ────────────────────────────────────────────────
    let gamePhase = 'menu'; // 'menu' | 'lobby' | 'countdown' | 'playing' | 'postgame'
    let gameState = null;
    let prevGameState = null;
    let stateTimestamp = 0;      // performance.now() when current state arrived
    let prevStateTimestamp = 0;  // performance.now() when previous state arrived
    const TICK_MS = 50;          // server sends at 20 ticks/sec = 50ms
    let countdownValue = 0;
    let countdownPlayers = null;

    // ── Camera ────────────────────────────────────────────────────
    function getWorldWidth() {
        return (window.GameDef && window.GameDef.worldWidth) || VIRTUAL_W;
    }
    function getWorldHeight() {
        return (window.GameDef && window.GameDef.worldHeight) || VIRTUAL_H;
    }
    function needsCamera() {
        return getWorldWidth() > VIRTUAL_W || getWorldHeight() > VIRTUAL_H;
    }

    const camera = {
        x: 0,
        y: 0,
        locked: false,
        lockTarget: null,
        snapTarget: null,
        spaceHeld: false,
        edgeScrollSpeed: 12,
        edgeScrollMargin: 40,
        zoom: 1,
        minZoom: 0.5,
        maxZoom: 2,
    };
    let mouseCanvasX = 0, mouseCanvasY = 0;

    function getViewW() { return VIRTUAL_W / camera.zoom; }
    function getViewH() { return VIRTUAL_H / camera.zoom; }

    function updateCamera() {
        const vw = getViewW();
        const vh = getViewH();

        if (camera.spaceHeld && camera.snapTarget) {
            camera.x = camera.snapTarget.x - vw / 2;
            camera.y = camera.snapTarget.y - vh / 2;
        } else if (camera.locked && camera.lockTarget) {
            camera.x = camera.lockTarget.x - vw / 2;
            camera.y = camera.lockTarget.y - vh / 2;
        }

        if (needsCamera()) {
            const ww = getWorldWidth();
            const wh = getWorldHeight();
            // Don't let viewport edge pass the opposite world edge
            camera.x = Math.max(-vw, Math.min(camera.x, ww));
            camera.y = Math.max(-vh, Math.min(camera.y, wh));
        } else {
            camera.x = 0;
            camera.y = 0;
        }
    }

    function handleEdgeScroll() {
        if (!needsCamera()) return;
        if (camera.locked || camera.spaceHeld) return;
        if (scoreboardOpen) return;
        if (gamePhase !== 'playing' && gamePhase !== 'countdown') return;

        const speed = camera.edgeScrollSpeed / camera.zoom;
        if (mouseCanvasX < camera.edgeScrollMargin) camera.x -= speed;
        if (mouseCanvasX > VIRTUAL_W - camera.edgeScrollMargin) camera.x += speed;
        if (mouseCanvasY < camera.edgeScrollMargin) camera.y -= speed;
        if (mouseCanvasY > VIRTUAL_H - camera.edgeScrollMargin) camera.y += speed;
    }

    // ── Screen Management ─────────────────────────────────────────
    function showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
        const screen = document.getElementById(screenId);
        if (screen) screen.classList.remove('hidden');
    }

    // ── Mute State ────────────────────────────────────────────────
    const muteState = {
        players: JSON.parse(localStorage.getItem('mutes') || '{}'),
        global: {
            hideAllPings: false,
            muteAllMessages: false,
            hideAllMessages: false,
            hideEnemyMessages: false,
        },
    };

    function saveMuteState() {
        localStorage.setItem('mutes', JSON.stringify(muteState.players));
    }

    // ── Chat ──────────────────────────────────────────────────────
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const chatChannelTag = document.getElementById('chat-channel-tag');
    const chatbox = document.querySelector('.chatbox');
    let chatFocused = false;
    let chatChannel = 'team';
    let chatFadeTimers = [];

    function openChat(channel) {
        chatFocused = true;
        chatbox.classList.add('chat-active');
        chatInput.style.display = '';
        chatInput.parentElement.style.display = '';
        chatInput.focus();
        if (channel) {
            chatChannel = channel;
        } else {
            chatChannel = (currentLobby && currentLobby.mode !== 'ffa') ? 'team' : 'all';
        }
        updateChatChannelTag();
        // Clear all pending fade timers and restore opacity
        for (const t of chatFadeTimers) clearTimeout(t);
        chatFadeTimers = [];
        chatMessages.querySelectorAll('.chat-msg').forEach(el => {
            el.style.transition = 'none';
            el.style.opacity = '1';
        });
    }

    function closeChat() {
        chatFocused = false;
        chatInput.blur();
        chatInput.value = '';
        chatbox.classList.remove('chat-active');
        // Restart fade timers for visible messages
        chatMessages.querySelectorAll('.chat-msg').forEach(el => {
            el.style.opacity = '1';
            const timer = setTimeout(() => {
                el.style.transition = 'opacity 1s';
                el.style.opacity = '0';
            }, 8000);
            chatFadeTimers.push(timer);
        });
    }

    function updateChatChannelTag() {
        if (!currentLobby || currentLobby.mode === 'ffa') {
            chatChannelTag.textContent = '[All]';
            chatChannel = 'all';
        } else {
            chatChannelTag.textContent = chatChannel === 'all' ? '[All]' : '[Team]';
        }
    }

    function sendChat() {
        const text = chatInput.value.trim();
        if (!text) { closeChat(); return; }
        wsSend({ type: 'chat', channel: chatChannel, text: text });
        chatInput.value = '';
        closeChat();
    }

    function shouldShowMessage(msg) {
        const g = muteState.global;
        const p = muteState.players[msg.playerId] || {};
        if (msg.channel === 'system') return 'normal';
        if (g.hideAllMessages) return 'hidden';
        if (p.hideMessages) return 'hidden';
        if (g.hideEnemyMessages && msg.channel === 'all' && currentLobby && msg.team !== getLocalPlayer()?.team) return 'hidden';
        if (g.muteAllMessages) return 'muted';
        if (p.muteMessages) return 'muted';
        return 'normal';
    }

    function addChatMessage(msg) {
        const visibility = shouldShowMessage(msg);
        if (visibility === 'hidden') return;

        const el = document.createElement('div');
        el.className = 'chat-msg' + (msg.channel === 'system' ? ' system' : '');

        if (msg.channel === 'system') {
            el.textContent = msg.text;
        } else if (visibility === 'muted') {
            const tag = msg.channel === 'all' ? '[All] ' : '[Team] ';
            el.innerHTML = `<span style="color: var(--text-dim)">${tag}[Muted]: \u00B7\u00B7\u00B7</span>`;
        } else {
            const tag = msg.channel === 'all' ? '[All] ' : '[Team] ';
            const color = msg.playerColor || '#fff';
            el.innerHTML = `<span style="color:rgba(255,255,255,0.45)">${tag}</span><span class="name" style="color:${color}">${escapeHtml(msg.playerName)}</span>: ${escapeHtml(msg.text)}`;
        }

        chatMessages.appendChild(el);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Auto-fade after 8 seconds if chat not focused
        if (!chatFocused) {
            el.style.opacity = '1';
            const timer = setTimeout(() => {
                el.style.transition = 'opacity 1s';
                el.style.opacity = '0';
            }, 8000);
            chatFadeTimers.push(timer);
        }
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ── Chat Key Handling ─────────────────────────────────────────
    const chatChannels = ['team', 'all'];

    function cycleChatChannel() {
        if (!currentLobby || currentLobby.mode === 'ffa') {
            chatChannel = 'all';
        } else {
            const idx = chatChannels.indexOf(chatChannel);
            chatChannel = chatChannels[(idx + 1) % chatChannels.length];
        }
        updateChatChannelTag();
    }

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendChat(); // sends message then closes
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeChat();
            } else if (e.key === 'Shift' || e.key === 'Tab') {
                e.preventDefault();
                cycleChatChannel();
            }
            e.stopPropagation();
        });

        chatInput.addEventListener('keyup', (e) => {
            e.stopPropagation();
        });

        chatInput.addEventListener('focus', () => { chatFocused = true; });
        chatInput.addEventListener('blur', () => { chatFocused = false; });
    }

    // ── Tooltip ───────────────────────────────────────────────────
    const tooltip = document.getElementById('tooltip');

    function showTooltip(html, mouseUIX, mouseUIY) {
        tooltip.innerHTML = html;
        tooltip.classList.remove('hidden');

        let tx = mouseUIX + 16;
        let ty = mouseUIY + 16;

        const zoomScale = parseFloat(ui.style.zoom) || 1;
        const rect = tooltip.getBoundingClientRect();
        const tipW = rect.width / zoomScale;
        const tipH = rect.height / zoomScale;

        if (tx + tipW > 1904) tx = mouseUIX - tipW - 8;
        if (ty + tipH > 1064) ty = mouseUIY - tipH - 8;

        tooltip.style.left = tx + 'px';
        tooltip.style.top = ty + 'px';
    }

    function hideTooltip() {
        tooltip.classList.add('hidden');
    }

    // data-tooltip delegation
    ui.addEventListener('mousemove', (e) => {
        const target = e.target.closest('[data-tooltip]');
        const zoomScale = parseFloat(ui.style.zoom) || 1;
        const uiX = e.clientX / zoomScale;
        const uiY = e.clientY / zoomScale;
        if (target) {
            showTooltip(target.getAttribute('data-tooltip'), uiX, uiY);
        } else if (!isOverCanvasEntity) {
            hideTooltip();
        }
    });

    // ── Scoreboard ────────────────────────────────────────────────
    let scoreboardOpen = false;
    const scoreboardBackdrop = document.getElementById('scoreboard-backdrop');
    const scoreboardPanel = document.getElementById('scoreboard-panel');

    function openScoreboard() {
        scoreboardOpen = true;
        if (scoreboardBackdrop) scoreboardBackdrop.classList.remove('hidden');
        renderScoreboard();
    }

    function closeScoreboard() {
        scoreboardOpen = false;
        if (scoreboardBackdrop) scoreboardBackdrop.classList.add('hidden');
        closeScoreboardContextMenu();
    }

    function renderScoreboard() {
        if (!scoreboardPanel || !currentLobby) return;
        const columns = (window.GameDef && window.GameDef.getScoreboardColumns) ? window.GameDef.getScoreboardColumns() : [];

        let html = '<div class="sb-title">Players</div>';
        const slots = currentLobby.slots.filter(s => s.state === 'occupied' && s.player);

        // Group by team if teams mode
        if (currentLobby.mode === 'teams') {
            for (let t = 0; t < currentLobby.teamCount; t++) {
                const teamSlots = slots.filter(s => s.team === t);
                if (teamSlots.length === 0) continue;
                html += `<div class="sb-team-header" style="color:${COLORS[t]}">${COLOR_NAMES[t]} Team</div>`;
                for (const slot of teamSlots) {
                    html += renderScoreboardRow(slot.player, columns);
                }
            }
        } else {
            for (const slot of slots) {
                html += renderScoreboardRow(slot.player, columns);
            }
        }

        // Global mute options
        html += '<div class="sb-global">';
        html += `<label><input type="checkbox" data-mute-global="hideAllPings" ${muteState.global.hideAllPings ? 'checked' : ''}> Hide all pings</label>`;
        html += `<label><input type="checkbox" data-mute-global="muteAllMessages" ${muteState.global.muteAllMessages ? 'checked' : ''}> Mute all messages</label>`;
        html += `<label><input type="checkbox" data-mute-global="hideAllMessages" ${muteState.global.hideAllMessages ? 'checked' : ''}> Hide all messages</label>`;
        html += `<label><input type="checkbox" data-mute-global="hideEnemyMessages" ${muteState.global.hideEnemyMessages ? 'checked' : ''}> Hide enemy messages</label>`;
        html += '</div>';

        scoreboardPanel.innerHTML = html;

        // Global mute checkbox listeners
        scoreboardPanel.querySelectorAll('[data-mute-global]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                muteState.global[e.target.dataset.muteGlobal] = e.target.checked;
            });
        });

        // Per-player right-click context menu
        scoreboardPanel.querySelectorAll('.sb-row').forEach(row => {
            row.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const playerId = row.dataset.playerId;
                if (playerId === localPlayerId) return; // can't mute yourself
                showScoreboardContextMenu(e, playerId);
            });
        });
    }

    function renderScoreboardRow(player, columns) {
        const isHost = currentLobby && currentLobby.host === player.id;
        const stats = (window.GameDef && window.GameDef.getPlayerStats) ? window.GameDef.getPlayerStats(player.id) : {};
        let html = `<div class="sb-row" data-player-id="${player.id}" data-tooltip='<div class="tip-title" style="color:${player.color}">${escapeHtml(player.name)}</div><div class="tip-desc">Right-click for options</div>'>`;
        html += `<span class="sb-color" style="background:${player.color}"></span>`;
        html += `<span class="sb-name" style="color:${player.color}">${escapeHtml(player.name)}</span>`;
        for (const col of columns) {
            const val = stats[col.key] !== undefined ? stats[col.key] : '';
            html += `<span class="sb-stat" style="width:${col.width}px">${val}</span>`;
        }
        html += '</div>';
        return html;
    }

    // ── Scoreboard Context Menu ──────────────────────────────────
    let sbContextMenu = null;

    function showScoreboardContextMenu(e, playerId) {
        closeScoreboardContextMenu();
        const zoomScale = parseFloat(ui.style.zoom) || 1;
        const uiX = e.clientX / zoomScale;
        const uiY = e.clientY / zoomScale;

        if (!muteState.players[playerId]) {
            muteState.players[playerId] = { mutePings: false, muteMessages: false, hideMessages: false };
        }
        const ps = muteState.players[playerId];

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = uiX + 'px';
        menu.style.top = uiY + 'px';
        menu.innerHTML = `
            <label class="ctx-item"><input type="checkbox" ${ps.mutePings ? 'checked' : ''}> Mute Pings</label>
            <label class="ctx-item"><input type="checkbox" ${ps.muteMessages ? 'checked' : ''}> Mute Messages</label>
            <label class="ctx-item"><input type="checkbox" ${ps.hideMessages ? 'checked' : ''}> Hide Messages</label>
        `;
        ui.appendChild(menu);
        sbContextMenu = menu;

        const checkboxes = menu.querySelectorAll('input[type="checkbox"]');
        checkboxes[0].addEventListener('change', (ev) => { ps.mutePings = ev.target.checked; saveMuteState(); });
        checkboxes[1].addEventListener('change', (ev) => { ps.muteMessages = ev.target.checked; saveMuteState(); });
        checkboxes[2].addEventListener('change', (ev) => { ps.hideMessages = ev.target.checked; saveMuteState(); });

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('mousedown', function handler(ev) {
                if (!menu.contains(ev.target)) {
                    closeScoreboardContextMenu();
                    document.removeEventListener('mousedown', handler);
                }
            });
        }, 0);
    }

    function closeScoreboardContextMenu() {
        if (sbContextMenu) {
            sbContextMenu.remove();
            sbContextMenu = null;
        }
    }

    // ── Ping System ───────────────────────────────────────────────
    let altHeld = false;
    let pingWheelOpen = false;
    let pingWheelX = 0, pingWheelY = 0;
    let pingWheelCanvasX = 0, pingWheelCanvasY = 0;
    let pingWheelAnim = 0;
    const activePings = [];
    let audioCtx = null;

    const PING_TYPES = {
        normal:   { color: '#4dc9f6', label: '',         duration: 180, freq: 880 },
        danger:   { color: '#ff4455', label: 'Danger',   duration: 240, freq: 440 },
        omw:      { color: '#4488ff', label: 'On My Way', duration: 200, freq: 660 },
        assist:   { color: '#44dd66', label: 'Assist',   duration: 200, freq: 550 },
        question: { color: '#ffcc22', label: 'Missing?', duration: 200, freq: 770 },
    };

    const WHEEL_RADIUS = 80;
    const WHEEL_INNER = 25;
    const WHEEL_DEADZONE = 18;

    const SLICES = [
        { type: 'danger',   angle: -Math.PI / 2 },
        { type: 'omw',      angle: 0 },
        { type: 'assist',   angle: Math.PI / 2 },
        { type: 'question', angle: Math.PI },
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

    function shouldShowPing(ping) {
        if (muteState.global.hideAllPings) return false;
        const p = muteState.players[ping.playerId] || {};
        if (p.mutePings) return false;
        return true;
    }

    function playPingSound(type) {
        try {
            if (!audioCtx) audioCtx = new AudioContext();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            const freq = PING_TYPES[type]?.freq || 880;
            osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(freq / 2, audioCtx.currentTime + 0.15);
            gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.2);
        } catch (e) { }
    }

    function sendPing(worldX, worldY, pingType) {
        wsSend({ type: 'ping', x: worldX, y: worldY, pingType: pingType });
    }

    function addPing(ping) {
        if (!shouldShowPing(ping)) return;
        const pt = PING_TYPES[ping.pingType] || PING_TYPES.normal;
        activePings.push({
            x: ping.x,
            y: ping.y,
            type: ping.pingType,
            color: pt.color,
            label: pt.label,
            life: pt.duration,
            maxLife: pt.duration,
            ripples: [{ delay: 0 }, { delay: 12 }, { delay: 24 }],
        });
        playPingSound(ping.pingType);
    }

    // ── Lobby UI Rendering ────────────────────────────────────────
    function getLocalPlayer() {
        if (!currentLobby) return null;
        const slot = currentLobby.slots.find(s => s.player && s.player.id === localPlayerId);
        return slot ? slot.player : null;
    }

    function renderLobby() {
        const lobbyContent = document.getElementById('lobby-content');
        if (!lobbyContent || !currentLobby) return;

        const isHost = currentLobby.host === localPlayerId;
        const localPlayer = getLocalPlayer();

        let html = '';

        // Server name
        html += `<div class="lobby-server-name">${escapeHtml(currentLobby.name)}</div>`;

        // Mode controls (host only)
        if (isHost && window.GameDef.supportedModes && window.GameDef.supportedModes.length > 1) {
            html += '<div class="lobby-mode-controls">';
            for (const mode of window.GameDef.supportedModes) {
                const active = currentLobby.mode === mode ? ' active' : '';
                html += `<button class="lobby-mode-btn${active}" data-mode="${mode}">${mode.toUpperCase()}</button>`;
            }
            if (currentLobby.mode === 'teams') {
                html += '<span class="lobby-team-count-label">Teams:</span>';
                for (let tc = 2; tc <= 4; tc++) {
                    const active = currentLobby.teamCount === tc ? ' active' : '';
                    html += `<button class="lobby-tc-btn${active}" data-tc="${tc}">${tc}</button>`;
                }
            }
            html += '</div>';
        }

        // Game settings (from GameDef.getSettings())
        if (window.GameDef && window.GameDef.getSettings) {
            const settingsDefs = window.GameDef.getSettings();
            if (settingsDefs && settingsDefs.length > 0) {
                html += '<div class="lobby-settings">';
                for (const s of settingsDefs) {
                    const currentVal = (currentLobby.settings && currentLobby.settings[s.key] !== undefined)
                        ? currentLobby.settings[s.key] : s.default;
                    html += '<div class="lobby-setting">';
                    html += `<span class="lobby-setting-label">${escapeHtml(s.label)}:</span>`;
                    if (s.type === 'select') {
                        html += '<div class="lobby-setting-options">';
                        for (const opt of s.options) {
                            const val = typeof opt === 'object' ? opt.value : opt;
                            const label = typeof opt === 'object' ? opt.label : opt;
                            const active = String(currentVal) === String(val) ? ' active' : '';
                            if (isHost) {
                                html += `<button class="lobby-setting-btn${active}" data-setting-key="${s.key}" data-setting-val="${val}">${escapeHtml(String(label))}</button>`;
                            } else {
                                html += `<span class="lobby-setting-btn${active}">${escapeHtml(String(label))}</span>`;
                            }
                        }
                        html += '</div>';
                    } else {
                        html += `<span class="lobby-setting-value">${escapeHtml(String(currentVal))}</span>`;
                    }
                    html += '</div>';
                }
                html += '</div>';
            }
        }

        // Slot panels
        if (currentLobby.mode === 'teams') {
            html += '<div class="lobby-teams">';
            for (let t = 0; t < currentLobby.teamCount; t++) {
                const teamSlots = currentLobby.slots.filter(s => s.team === t);
                html += `<div class="lobby-team-panel">`;
                html += `<div class="lobby-team-header" style="color:${COLORS[t]}" data-team="${t}" data-tooltip='<div class="tip-desc">Click to join ${COLOR_NAMES[t]} Team</div>'>${COLOR_NAMES[t]} Team</div>`;
                for (const slot of teamSlots) {
                    html += renderSlot(slot, isHost);
                }
                html += '</div>';
            }
            html += '</div>';
        } else {
            html += '<div class="lobby-ffa-panel">';
            html += '<div class="lobby-team-header" style="color:#fff">Players</div>';
            html += '<div class="lobby-ffa-slots">';
            for (const slot of currentLobby.slots) {
                html += renderSlot(slot, isHost);
            }
            html += '</div>';
            html += '</div>';
        }

        // Bottom controls
        html += '<div class="lobby-bottom">';
        if (localPlayer) {
            const readyClass = localPlayer.ready ? ' ready' : '';
            html += `<button class="lobby-ready-btn${readyClass}" id="btn-ready">${localPlayer.ready ? 'READY' : 'NOT READY'}</button>`;
        }
        if (isHost) {
            html += '<button class="lobby-start-btn" id="btn-start">START GAME</button>';
        }
        html += '<button class="lobby-leave-btn" id="btn-leave">LEAVE</button>';
        html += '</div>';

        lobbyContent.innerHTML = html;

        // Attach event listeners
        lobbyContent.querySelectorAll('.lobby-mode-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                wsSend({ type: 'lobby_mode_change', mode: btn.dataset.mode, teamCount: currentLobby.teamCount });
            });
        });
        lobbyContent.querySelectorAll('.lobby-tc-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                wsSend({ type: 'lobby_mode_change', mode: 'teams', teamCount: parseInt(btn.dataset.tc) });
            });
        });
        lobbyContent.querySelectorAll('.lobby-team-header[data-team]').forEach(hdr => {
            hdr.addEventListener('click', () => {
                wsSend({ type: 'lobby_team_change', targetTeam: parseInt(hdr.dataset.team) });
            });
        });
        lobbyContent.querySelectorAll('.lobby-slot[data-slot-action]').forEach(slot => {
            slot.addEventListener('click', () => {
                wsSend({ type: 'lobby_slot_action', slotIndex: parseInt(slot.dataset.slotAction) });
            });
        });
        lobbyContent.querySelectorAll('.lobby-slot[data-move-slot]').forEach(slot => {
            slot.addEventListener('click', () => {
                wsSend({ type: 'lobby_move_slot', slotIndex: parseInt(slot.dataset.moveSlot) });
            });
        });

        // Host transfer context menu on occupied slots
        if (isHost) {
            lobbyContent.querySelectorAll('.lobby-slot.occupied').forEach(slotEl => {
                slotEl.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    const slotData = currentLobby.slots.find(s =>
                        s.state === 'occupied' && s.player &&
                        slotEl.querySelector('.slot-name')?.textContent.includes(s.player.name)
                    );
                    if (!slotData || !slotData.player || slotData.player.id === localPlayerId) return;
                    showHostContextMenu(e, slotData.player);
                });
            });
        }

        // Settings buttons (host only)
        lobbyContent.querySelectorAll('.lobby-setting-btn[data-setting-key]').forEach(btn => {
            btn.addEventListener('click', () => {
                wsSend({ type: 'lobby_settings', key: btn.dataset.settingKey, value: btn.dataset.settingVal });
            });
        });

        const btnReady = document.getElementById('btn-ready');
        if (btnReady) btnReady.addEventListener('click', () => wsSend({ type: 'lobby_ready' }));

        const btnStart = document.getElementById('btn-start');
        if (btnStart) btnStart.addEventListener('click', () => wsSend({ type: 'lobby_start' }));

        const btnLeave = document.getElementById('btn-leave');
        if (btnLeave) btnLeave.addEventListener('click', () => wsSend({ type: 'lobby_leave' }));
    }

    function renderSlot(slot, isHost) {
        if (slot.state === 'occupied' && slot.player) {
            const p = slot.player;
            const isHostPlayer = currentLobby.host === p.id;
            const readyDot = p.ready ? '<span class="slot-ready">&#10003;</span>' : '';
            let tooltip = `<div class="tip-title" style="color:${p.color}">${escapeHtml(p.name)}</div>`;
            if (isHostPlayer) tooltip += '<div class="tip-desc">Host</div>';

            let html = `<div class="lobby-slot occupied" data-tooltip='${tooltip}'>`;
            html += `<span class="slot-color" style="background:${p.color}"></span>`;
            html += `<span class="slot-name" style="color:${p.color}">${escapeHtml(p.name)}</span>`;
            html += readyDot;

            if (isHost && p.id !== localPlayerId) {
                html += `<span class="slot-kick" data-slot-action="${slot.index}" title="Kick">&times;</span>`;
            }
            html += '</div>';
            return html;
        }

        if (slot.state === 'closed') {
            if (isHost) {
                return `<div class="lobby-slot closed" data-slot-action="${slot.index}" data-tooltip='<div class="tip-desc">Slot closed by host. Click to open.</div>'><span class="slot-icon">&times;</span> <span class="slot-label">[Closed]</span></div>`;
            }
            return `<div class="lobby-slot closed" data-tooltip='<div class="tip-desc">Slot closed by host</div>'><span class="slot-icon">&times;</span> <span class="slot-label">[Closed]</span></div>`;
        }

        // Open slot
        if (isHost) {
            return `<div class="lobby-slot open" data-slot-action="${slot.index}" data-tooltip='<div class="tip-desc">Click to close this slot</div>'><span class="slot-icon">&#9675;</span> <span class="slot-label">[Open]</span></div>`;
        }
        return `<div class="lobby-slot open" data-move-slot="${slot.index}" data-tooltip='<div class="tip-desc">Click to join this slot</div>'><span class="slot-icon">&#9675;</span> <span class="slot-label">[Open]</span></div>`;
    }

    // ── Host Context Menu ─────────────────────────────────────────
    let activeContextMenu = null;

    function showHostContextMenu(e, player) {
        closeHostContextMenu();
        const zoomScale = parseFloat(ui.style.zoom) || 1;
        const uiX = e.clientX / zoomScale;
        const uiY = e.clientY / zoomScale;

        const menu = document.createElement('div');
        menu.className = 'context-menu';
        menu.style.left = uiX + 'px';
        menu.style.top = uiY + 'px';
        menu.innerHTML = `<div class="ctx-item" data-action="transfer">Transfer Host</div>`;
        ui.appendChild(menu);
        activeContextMenu = menu;

        menu.querySelector('[data-action="transfer"]').addEventListener('click', () => {
            wsSend({ type: 'lobby_transfer_host', targetId: player.id });
            closeHostContextMenu();
        });

        // Close on next click anywhere
        setTimeout(() => {
            document.addEventListener('click', closeHostContextMenu, { once: true });
        }, 0);
    }

    function closeHostContextMenu() {
        if (activeContextMenu) {
            activeContextMenu.remove();
            activeContextMenu = null;
        }
    }

    // ── Server Browser ────────────────────────────────────────────
    function renderServerBrowser(lobbies) {
        const list = document.getElementById('server-list');
        if (!list) return;

        if (!lobbies || lobbies.length === 0) {
            list.innerHTML = '<div class="server-empty">No servers found. Create one!</div>';
            return;
        }

        let html = '';
        for (const l of lobbies) {
            html += `<div class="server-row" data-lobby-id="${l.id}">`;
            html += `<span class="server-name">${escapeHtml(l.name)}</span>`;
            html += `<span class="server-mode">${l.mode.toUpperCase()}</span>`;
            html += `<span class="server-players">${l.playerCount}/${l.maxPlayers}</span>`;
            html += `<span class="server-state">${l.state}</span>`;
            html += '</div>';
        }
        list.innerHTML = html;

        list.querySelectorAll('.server-row').forEach(row => {
            row.addEventListener('click', () => {
                wsSend({ type: 'lobby_join', lobbyId: row.dataset.lobbyId });
            });
        });
    }

    // ── Post-Game UI ──────────────────────────────────────────────
    function renderPostGame(result) {
        const pg = document.getElementById('postgame-content');
        if (!pg) return;

        let html = '<div class="pg-title">';
        if (result.winner) {
            html += `<span style="color:${result.winner.color || '#fff'}">${escapeHtml(result.winner.name || 'Unknown')}</span> wins!`;
        } else if (result.winnerTeam !== undefined && result.winnerTeam !== null) {
            html += `<span style="color:${COLORS[result.winnerTeam]}">${COLOR_NAMES[result.winnerTeam]} Team</span> wins!`;
        } else {
            html += 'Game Over';
        }
        html += '</div>';

        // Leaderboard
        if (result.stats && result.stats.length > 0) {
            html += '<div class="pg-leaderboard">';
            for (const p of result.stats) {
                const status = p.reachedGoal ? ' <span style="color:#f0c040">★ Finished</span>' :
                               p.alive ? '' : ' <span class="pg-dead">caught</span>';
                html += `<div class="pg-player-row">`;
                html += `<span class="pg-player-color" style="background:${p.color}"></span>`;
                html += `<span class="pg-player-name" style="color:${p.color}">${escapeHtml(p.name)}</span>`;
                html += status;
                html += `</div>`;
            }
            html += '</div>';
        }

        html += '<div class="pg-buttons">';
        html += '<button class="pg-btn" id="btn-rematch">REMATCH</button>';
        html += '<button class="pg-btn" id="btn-pg-leave">LEAVE</button>';
        html += '</div>';

        pg.innerHTML = html;

        document.getElementById('btn-rematch')?.addEventListener('click', () => {
            wsSend({ type: 'lobby_rematch' });
        });
        document.getElementById('btn-pg-leave')?.addEventListener('click', () => {
            wsSend({ type: 'lobby_leave' });
            showScreen('main-menu');
            gamePhase = 'menu';
        });
    }

    // ── WebSocket Message Handling ────────────────────────────────
    ws.addEventListener('message', (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }

        switch (msg.type) {
            case 'connected':
                localPlayerId = msg.id;
                // Initialize renderer mode from GameDef
                initRendererMode();
                // Try to rejoin previous session
                const prevSession = sessionStorage.getItem('pdrop_session');
                if (prevSession) {
                    try {
                        const s = JSON.parse(prevSession);
                        wsSend({ type: 'rejoin', oldId: s.playerId, lobbyId: s.lobbyId, name: s.name });
                    } catch (err) { }
                }
                break;

            case 'welcome':
                localPlayerId = msg.id;
                localPlayerName = msg.name;
                break;

            case 'lobby_list':
                renderServerBrowser(msg.lobbies);
                break;

            case 'lobby_joined':
                currentLobby = msg.lobby;
                gamePhase = 'lobby';
                showScreen('lobby-screen');
                renderLobby();
                sessionStorage.setItem('pdrop_session', JSON.stringify({
                    playerId: localPlayerId,
                    lobbyId: currentLobby.id,
                    name: localPlayerName,
                }));
                break;

            case 'lobby_state':
                currentLobby = msg.lobby;
                // If server returned to lobby (e.g. rematch), switch client back
                if (currentLobby.state === 'lobby' && gamePhase !== 'lobby') {
                    gamePhase = 'lobby';
                    showScreen('lobby-screen');
                    camera.zoom = 1;
                }
                if (gamePhase === 'lobby') renderLobby();
                break;

            case 'lobby_left':
                currentLobby = null;
                gamePhase = 'menu';
                showScreen('main-menu');
                sessionStorage.removeItem('pdrop_session');
                break;

            case 'lobby_kicked':
                currentLobby = null;
                gamePhase = 'menu';
                showScreen('main-menu');
                sessionStorage.removeItem('pdrop_session');
                break;

            case 'lobby_host_change':
                if (currentLobby) currentLobby.host = msg.hostId;
                if (gamePhase === 'lobby') renderLobby();
                break;

            case 'lobby_error':
                console.log('Lobby error:', msg.error);
                break;

            case 'rejoin_failed':
                sessionStorage.removeItem('pdrop_session');
                break;

            case 'game_countdown':
                gamePhase = 'countdown';
                countdownValue = msg.seconds;
                if (msg.players) countdownPlayers = msg.players;
                showScreen('game-screen');

                // Initialize 3D renderer if needed (first countdown triggers it)
                if (rendererMode === '3d' && window.GameDef && window.GameDef.initRenderer) {
                    window.GameDef.initRenderer(canvas);
                }

                if (window.GameDef && window.GameDef.onGameStart && msg.players) {
                    window.GameDef.onGameStart({ players: msg.players });
                }

                // Lock camera to own character on spawn
                camera.locked = true;
                break;

            case 'game_start':
                gamePhase = 'playing';
                countdownValue = 0;
                showScreen('game-screen');
                camera.locked = true;
                if (window.GameDef && window.GameDef.onGameStart) {
                    window.GameDef.onGameStart({ players: countdownPlayers || [] });
                }
                break;

            case 'game_state':
                prevGameState = gameState;
                prevStateTimestamp = stateTimestamp;
                gameState = msg;
                stateTimestamp = performance.now();
                break;

            case 'elimination':
                addChatMessage({
                    channel: 'system',
                    text: msg.killerName ? (msg.killerName + ' eliminated ' + msg.playerName) : (msg.playerName + ' was caught!'),
                });
                if (window.GameDef && window.GameDef.onElimination) {
                    window.GameDef.onElimination(msg);
                }
                break;

            case 'kitten_revived':
                addChatMessage({
                    channel: 'system',
                    text: msg.reviverName + ' revived ' + msg.playerName + '!',
                });
                if (window.GameDef && window.GameDef.onElimination) {
                    window.GameDef.onElimination(msg);
                }
                break;

            case 'kitten_reached_goal':
                addChatMessage({
                    channel: 'system',
                    text: msg.playerName + ' reached the goal!',
                });
                if (window.GameDef && window.GameDef.onElimination) {
                    window.GameDef.onElimination(msg);
                }
                break;

            case 'game_round_over':
                gamePhase = 'postgame';
                showScreen('postgame-screen');
                renderPostGame(msg);
                break;

            case 'chat_message':
                addChatMessage(msg);
                break;

            case 'ping':
                addPing(msg);
                break;
        }
    });

    // ── Input Handling ────────────────────────────────────────────
    document.addEventListener('keydown', (e) => {
        if (chatFocused) return;

        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                openChat('all');
            } else {
                openChat('team');
            }
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            if (scoreboardOpen) {
                closeScoreboard();
            } else if (gamePhase === 'playing' || gamePhase === 'countdown') {
                openScoreboard();
            }
            return;
        }

        if (e.key === 'Alt') {
            e.preventDefault();
            altHeld = true;
            return;
        }

        if (e.key === 'y' || e.key === 'Y') {
            if (!needsCamera()) return;
            if (!window.GameDef || !window.GameDef.getCameraLockTarget) return;
            const lp = getLocalPlayerFromState();
            if (!lp) return;
            const target = window.GameDef.getCameraLockTarget(lp);
            if (!target) return;
            camera.locked = !camera.locked;
            camera.lockTarget = target;
            if (camera.locked) {
                camera.x = target.x - getViewW() / 2;
                camera.y = target.y - getViewH() / 2;
            }
            return;
        }

        if (e.key === ' ') {
            e.preventDefault();
            if (!needsCamera()) return;
            if (!window.GameDef || !window.GameDef.getCameraSnapTarget) return;
            const lp = getLocalPlayerFromState();
            if (!lp) return;
            const target = window.GameDef.getCameraSnapTarget(lp);
            if (!target) return;
            camera.spaceHeld = true;
            camera.snapTarget = target;
            return;
        }

        // Pass to game
        if (gamePhase === 'playing' && !scoreboardOpen && window.GameDef && window.GameDef.onInput) {
            window.GameDef.onInput('keydown', { key: e.key, code: e.code });
        }
    });

    document.addEventListener('keyup', (e) => {
        if (e.key === 'Alt') {
            altHeld = false;
            if (pingWheelOpen) {
                pingWheelOpen = false;
                pingWheelAnim = 0;
            }
        }

        if (e.key === ' ') {
            if (!camera.spaceHeld) return;
            camera.spaceHeld = false;
            camera.snapTarget = null;
        }

        if (gamePhase === 'playing' && !chatFocused && !scoreboardOpen && window.GameDef && window.GameDef.onInput) {
            window.GameDef.onInput('keyup', { key: e.key, code: e.code });
        }
    });

    // ── Mouse Wheel Zoom ────────────────────────────────────────
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        if (gamePhase !== 'playing' && gamePhase !== 'countdown') return;

        const zoomStep = 0.1;
        const oldZoom = camera.zoom;
        if (e.deltaY < 0) {
            camera.zoom = Math.min(camera.maxZoom, camera.zoom + zoomStep);
        } else {
            camera.zoom = Math.max(camera.minZoom, camera.zoom - zoomStep);
        }

        // Zoom toward mouse position in world space
        if (camera.zoom !== oldZoom) {
            const worldMouseX = mouseCanvasX / oldZoom + camera.x;
            const worldMouseY = mouseCanvasY / oldZoom + camera.y;
            camera.x = worldMouseX - mouseCanvasX / camera.zoom;
            camera.y = worldMouseY - mouseCanvasY / camera.zoom;
        }
    }, { passive: false });

    // ── Mouse Input ───────────────────────────────────────────────
    let isOverCanvasEntity = false;

    container.addEventListener('mousemove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseCanvasX = (e.clientX - rect.left) * (VIRTUAL_W / rect.width);
        mouseCanvasY = (e.clientY - rect.top) * (VIRTUAL_H / rect.height);

        // Canvas entity tooltips
        isOverCanvasEntity = false;
        if ((gamePhase === 'playing' || gamePhase === 'countdown') && !chatFocused && !altHeld && !scoreboardOpen) {
            if (window.GameDef && window.GameDef.getEntityTooltip && gameState) {
                const worldX = mouseCanvasX / camera.zoom + camera.x;
                const worldY = mouseCanvasY / camera.zoom + camera.y;
                const entity = findEntityAt(worldX, worldY);
                if (entity) {
                    const html = window.GameDef.getEntityTooltip(entity);
                    if (html) {
                        const zoomScale = parseFloat(ui.style.zoom) || 1;
                        showTooltip(html, e.clientX / zoomScale, e.clientY / zoomScale);
                        isOverCanvasEntity = true;
                    }
                }
            }
        }
        if (!isOverCanvasEntity && !e.target.closest('[data-tooltip]')) {
            hideTooltip();
        }
    });

    function findEntityAt(worldX, worldY) {
        if (!gameState) return null;
        // Check players
        if (gameState.players) {
            for (const p of gameState.players) {
                if (!p.alive) continue;
                const dist = Math.hypot(worldX - p.x, worldY - p.y);
                if (dist < (p.radius || 18) + 8) {
                    return { type: 'player', ...p };
                }
            }
        }
        // Game-defined entity hit test
        if (window.GameDef && window.GameDef.findEntityAt) {
            return window.GameDef.findEntityAt(worldX, worldY);
        }
        return null;
    }

    // Suppress browser context menu on the entire page
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    });

    canvas.addEventListener('contextmenu', (e) => { e.preventDefault(); });

    // Right-click: send down/up events so games can support hold-to-move
    container.addEventListener('mousedown', (e) => {
        if (e.button === 2) {
            if (chatFocused || scoreboardOpen || altHeld) return;
            if (gamePhase !== 'playing') return;

            const worldX = mouseCanvasX / camera.zoom + camera.x;
            const worldY = mouseCanvasY / camera.zoom + camera.y;

            if (window.GameDef && window.GameDef.onInput) {
                window.GameDef.onInput('rightclick', { x: worldX, y: worldY });
                window.GameDef.onInput('rightmousedown', { x: worldX, y: worldY });
            }
        }
    });

    document.addEventListener('mouseup', (e) => {
        if (e.button === 2) {
            if (window.GameDef && window.GameDef.onInput) {
                window.GameDef.onInput('rightmouseup', {});
            }
        }
    });

    canvas.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return; // left click only

        if (altHeld && (gamePhase === 'playing' || gamePhase === 'countdown')) {
            // Start ping wheel
            pingWheelOpen = true;
            pingWheelCanvasX = mouseCanvasX;
            pingWheelCanvasY = mouseCanvasY;
            pingWheelX = mouseCanvasX / camera.zoom + camera.x;
            pingWheelY = mouseCanvasY / camera.zoom + camera.y;
            pingWheelAnim = 0;
            return;
        }

        if (gamePhase === 'playing' && !chatFocused && !scoreboardOpen && window.GameDef && window.GameDef.onInput) {
            const worldX = mouseCanvasX / camera.zoom + camera.x;
            const worldY = mouseCanvasY / camera.zoom + camera.y;
            window.GameDef.onInput('click', { x: worldX, y: worldY, canvasX: mouseCanvasX, canvasY: mouseCanvasY });
        }
    });

    canvas.addEventListener('mouseup', (e) => {
        if (e.button !== 0) return;

        if (pingWheelOpen) {
            const slice = getWheelSlice(pingWheelCanvasX, pingWheelCanvasY, mouseCanvasX, mouseCanvasY);
            const pingType = slice ? slice.type : 'normal';
            sendPing(pingWheelX, pingWheelY, pingType);
            pingWheelOpen = false;
            pingWheelAnim = 0;
            return;
        }
    });

    // ── Helper: Get local player from game state ──────────────────
    function getLocalPlayerFromState() {
        if (!gameState || !gameState.players) return null;
        return gameState.players.find(p => p.id === localPlayerId) || null;
    }

    // ── Ping Rendering (on overlay canvas) ────────────────────────
    function renderPings(oc) {
        for (let i = activePings.length - 1; i >= 0; i--) {
            const p = activePings[i];
            p.life--;
            if (p.life <= 0) { activePings.splice(i, 1); continue; }

            const age = p.maxLife - p.life;
            const fadeIn = Math.min(1, age / 10);
            const fadeOut = Math.min(1, p.life / 30);
            const alpha = fadeIn * fadeOut;

            const sx = p.x - camera.x;
            const sy = p.y - camera.y;

            // Ripples
            for (const r of p.ripples) {
                const rippleAge = age - r.delay;
                if (rippleAge < 0 || rippleAge > 50) continue;
                const t = rippleAge / 50;
                const radius = 10 + t * 55;
                const rippleAlpha = (1 - t) * 0.4 * alpha;
                oc.beginPath();
                oc.arc(sx, sy, radius, 0, Math.PI * 2);
                oc.strokeStyle = p.color;
                oc.globalAlpha = rippleAlpha;
                oc.lineWidth = 2;
                oc.stroke();
            }

            // Glow
            const glowR = 30 + Math.sin(age * 0.08) * 5;
            const grad = oc.createRadialGradient(sx, sy, 0, sx, sy, glowR);
            grad.addColorStop(0, p.color);
            grad.addColorStop(1, 'transparent');
            oc.globalAlpha = 0.25 * alpha;
            oc.fillStyle = grad;
            oc.beginPath();
            oc.arc(sx, sy, glowR, 0, Math.PI * 2);
            oc.fill();

            // Background circle
            oc.globalAlpha = 0.7 * alpha;
            oc.fillStyle = '#12141a';
            oc.beginPath();
            oc.arc(sx, sy, 18, 0, Math.PI * 2);
            oc.fill();
            oc.strokeStyle = p.color;
            oc.lineWidth = 2;
            oc.stroke();

            // Icon
            oc.globalAlpha = alpha;
            oc.fillStyle = p.color;
            oc.font = 'bold 16px Rajdhani';
            oc.textAlign = 'center';
            oc.textBaseline = 'middle';
            const bounce = age < 15 ? Math.sin(age / 15 * Math.PI) * 4 : 0;
            if (p.type === 'danger') {
                oc.fillText('!', sx, sy - bounce);
            } else if (p.type === 'omw') {
                oc.fillText('▼', sx, sy - bounce);
            } else if (p.type === 'assist') {
                oc.fillText('+', sx, sy - bounce);
            } else if (p.type === 'question') {
                oc.fillText('?', sx, sy - bounce);
            } else {
                oc.beginPath();
                oc.arc(sx, sy - bounce, 6, 0, Math.PI * 2);
                oc.fill();
            }

            // Label
            if (p.label) {
                oc.globalAlpha = alpha;
                oc.fillStyle = p.color;
                oc.font = 'bold 11px Consolas';
                oc.textAlign = 'center';
                oc.fillText(p.label, sx, sy + 30);
            }
        }
        oc.globalAlpha = 1;
    }

    // ── Ping Wheel Rendering (on overlay canvas) ──────────────────
    function renderPingWheel(oc) {
        if (!pingWheelOpen) return;

        pingWheelAnim = Math.min(pingWheelAnim + 1, 8);
        const t = pingWheelAnim / 8;
        const ease = 1 - Math.pow(1 - t, 3);
        const r = WHEEL_RADIUS * ease;
        const inner = WHEEL_INNER * ease;

        const cx = pingWheelCanvasX;
        const cy = pingWheelCanvasY;

        // Dim overlay
        oc.globalAlpha = 0.3 * ease;
        oc.fillStyle = '#000';
        oc.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);

        const hoveredSlice = getWheelSlice(cx, cy, mouseCanvasX, mouseCanvasY);

        // Ring background
        oc.globalAlpha = 0.85 * ease;
        oc.fillStyle = '#12141a';
        oc.beginPath();
        oc.arc(cx, cy, r + 4, 0, Math.PI * 2);
        oc.fill();

        // Slices
        for (let i = 0; i < SLICES.length; i++) {
            const s = SLICES[i];
            const startAngle = s.angle - Math.PI / 4;
            const endAngle = s.angle + Math.PI / 4;
            const isHovered = hoveredSlice && hoveredSlice.type === s.type;
            const pt = PING_TYPES[s.type];

            oc.beginPath();
            oc.arc(cx, cy, r, startAngle, endAngle);
            oc.arc(cx, cy, inner, endAngle, startAngle, true);
            oc.closePath();

            if (isHovered) {
                const grad = oc.createRadialGradient(cx, cy, inner, cx, cy, r);
                grad.addColorStop(0, 'rgba(0,0,0,0.3)');
                grad.addColorStop(1, pt.color + '40');
                oc.fillStyle = grad;
                oc.globalAlpha = 0.9 * ease;
            } else {
                oc.fillStyle = 'rgba(30,30,40,0.8)';
                oc.globalAlpha = 0.7 * ease;
            }
            oc.fill();

            oc.strokeStyle = isHovered ? pt.color : 'rgba(255,255,255,0.15)';
            oc.lineWidth = isHovered ? 2 : 1;
            oc.globalAlpha = ease;
            oc.stroke();

            // Slice icon
            const midR = (r + inner) / 2;
            const ix = cx + Math.cos(s.angle) * midR;
            const iy = cy + Math.sin(s.angle) * midR;
            const iconSize = isHovered ? 16 : 13;
            oc.globalAlpha = isHovered ? ease : 0.6 * ease;
            oc.fillStyle = pt.color;
            oc.font = `bold ${iconSize}px Rajdhani`;
            oc.textAlign = 'center';
            oc.textBaseline = 'middle';
            if (s.type === 'danger') oc.fillText('!', ix, iy);
            else if (s.type === 'omw') oc.fillText('▼', ix, iy);
            else if (s.type === 'assist') oc.fillText('+', ix, iy);
            else if (s.type === 'question') oc.fillText('?', ix, iy);
        }

        // Center dot
        oc.globalAlpha = ease;
        oc.fillStyle = !hoveredSlice ? '#4dc9f6' : '#333';
        oc.beginPath();
        oc.arc(cx, cy, 8, 0, Math.PI * 2);
        oc.fill();

        // Drag line
        if (hoveredSlice) {
            const pt = PING_TYPES[hoveredSlice.type];
            const dx = mouseCanvasX - cx;
            const dy = mouseCanvasY - cy;
            const dist = Math.min(Math.hypot(dx, dy), r);
            const angle = Math.atan2(dy, dx);
            oc.beginPath();
            oc.moveTo(cx, cy);
            oc.lineTo(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
            oc.strokeStyle = pt.color;
            oc.lineWidth = 2;
            oc.globalAlpha = 0.6 * ease;
            oc.stroke();

            // Label outside ring
            const labelX = cx + Math.cos(hoveredSlice.angle) * (r + 24);
            const labelY = cy + Math.sin(hoveredSlice.angle) * (r + 24);
            oc.globalAlpha = ease;
            oc.fillStyle = pt.color;
            oc.font = 'bold 13px Rajdhani';
            oc.textAlign = 'center';
            oc.textBaseline = 'middle';
            oc.fillText(pt.label || 'Ping', labelX, labelY);
        }

        oc.globalAlpha = 1;
    }

    // ── Countdown Rendering (on overlay canvas) ───────────────────
    function renderCountdown(oc) {
        if (gamePhase !== 'countdown' || countdownValue <= 0) return;
        oc.globalAlpha = 0.8;
        oc.fillStyle = '#fff';
        oc.font = '700 120px Rajdhani';
        oc.textAlign = 'center';
        oc.textBaseline = 'middle';
        oc.fillText(countdownValue.toString(), VIRTUAL_W / 2, VIRTUAL_H / 2);
        oc.globalAlpha = 1;
    }

    // ── Interpolation ────────────────────────────────────────────
    function getInterpolatedState(now) {
        if (!gameState) return null;
        if (!prevGameState || !prevStateTimestamp) return gameState;

        const elapsed = now - stateTimestamp;
        const interval = stateTimestamp - prevStateTimestamp;
        if (interval <= 0) return gameState;
        const t = Math.min(1 + elapsed / interval, 2);

        const lerped = { ...gameState };

        // Lerp players
        if (gameState.players && prevGameState.players) {
            const prevMap = {};
            for (const p of prevGameState.players) prevMap[p.id] = p;

            lerped.players = gameState.players.map(p => {
                const prev = prevMap[p.id];
                if (!prev) return p;
                // Lerp angle via shortest arc
                let da = p.angle - prev.angle;
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;
                return {
                    ...p,
                    x: prev.x + (p.x - prev.x) * t,
                    y: prev.y + (p.y - prev.y) * t,
                    angle: prev.angle + da * t,
                };
            });
        }

        // Lerp dogs (if present)
        if (gameState.dogs && prevGameState.dogs) {
            const prevMap = {};
            for (const d of prevGameState.dogs) prevMap[d.id] = d;

            lerped.dogs = gameState.dogs.map(d => {
                const prev = prevMap[d.id];
                if (!prev) return d;
                let da = d.angle - prev.angle;
                while (da > Math.PI) da -= 2 * Math.PI;
                while (da < -Math.PI) da += 2 * Math.PI;
                return {
                    ...d,
                    x: prev.x + (d.x - prev.x) * t,
                    y: prev.y + (d.y - prev.y) * t,
                    angle: prev.angle + da * t,
                };
            });
        }

        // Lerp arrows (legacy support for Arrow-style games)
        if (gameState.arrows && prevGameState.arrows) {
            const prevMap = {};
            for (const a of prevGameState.arrows) prevMap[a.id] = a;

            lerped.arrows = gameState.arrows.map(a => {
                const prev = prevMap[a.id];
                if (!prev) return a;
                return {
                    ...a,
                    x: prev.x + (a.x - prev.x) * t,
                    y: prev.y + (a.y - prev.y) * t,
                };
            });
        }

        return lerped;
    }

    // ── Main Render Loop ──────────────────────────────────────────
    let lastTimestamp = 0;

    function gameLoop(timestamp) {
        const dt = timestamp - lastTimestamp;
        lastTimestamp = timestamp;

        if (gamePhase === 'playing' || gamePhase === 'countdown') {
            // Compute interpolated state for smooth rendering
            const renderState = getInterpolatedState(performance.now());

            // Update camera lock/snap targets from interpolated state
            if (window.GameDef && renderState) {
                const lp = renderState.players ? renderState.players.find(p => p.id === localPlayerId) : null;
                if (lp) {
                    if (camera.locked && window.GameDef.getCameraLockTarget) {
                        const target = window.GameDef.getCameraLockTarget(lp);
                        if (target) {
                            camera.lockTarget = target;
                        } else {
                            camera.locked = false;
                            camera.lockTarget = null;
                        }
                    }
                    if (camera.spaceHeld && window.GameDef.getCameraSnapTarget) {
                        camera.snapTarget = window.GameDef.getCameraSnapTarget(lp);
                    }
                }
            }

            handleEdgeScroll();
            updateCamera();

            // ── Game rendering (mode-dependent) ──
            if (rendererMode === '2d') {
                // 2D MODE: Framework manages canvas transforms, passes ctx
                ctx.setTransform(1, 0, 0, 1, 0, 0);
                ctx.fillStyle = '#12141a';
                ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
                ctx.setTransform(camera.zoom, 0, 0, camera.zoom, 0, 0);

                if (window.GameDef && window.GameDef.render) {
                    window.GameDef.render(ctx, camera, renderState);
                }
            } else {
                // 3D MODE: Game handles its own rendering entirely
                // Framework just calls render(camera, state) — no ctx
                if (window.GameDef && window.GameDef.render) {
                    window.GameDef.render(camera, renderState);
                }
            }

            // ── Overlay rendering (always 2D, on overlay canvas) ──
            overlayCtx.clearRect(0, 0, VIRTUAL_W, VIRTUAL_H);

            // Pings render in zoomed world space
            overlayCtx.setTransform(camera.zoom, 0, 0, camera.zoom, 0, 0);
            renderPings(overlayCtx);

            // Ping wheel and countdown render in screen space
            overlayCtx.setTransform(1, 0, 0, 1, 0, 0);
            renderPingWheel(overlayCtx);
            renderCountdown(overlayCtx);

        } else if (gamePhase === 'menu' || gamePhase === 'lobby') {
            // Ambient dark background (only in 2D mode or if game hasn't initialized 3D)
            if (rendererMode === '2d' && ctx) {
                ctx.fillStyle = '#12141a';
                ctx.fillRect(0, 0, VIRTUAL_W, VIRTUAL_H);
            }
        }

        requestAnimationFrame(gameLoop);
    }
    requestAnimationFrame(gameLoop);

    // ── Main Menu Button Wiring ───────────────────────────────────
    const btnCreate = document.getElementById('btn-create');
    const btnBrowse = document.getElementById('btn-browse');
    const nameInput = document.getElementById('name-input');

    // Restore saved name
    const savedName = localStorage.getItem('pdrop_name');
    if (savedName && nameInput) nameInput.value = savedName;

    function getAndSaveName() {
        const name = nameInput ? nameInput.value.trim() || 'Player' : 'Player';
        localStorage.setItem('pdrop_name', name);
        return name;
    }

    if (btnCreate) {
        btnCreate.addEventListener('click', () => {
            const name = getAndSaveName();
            wsSend({ type: 'set_name', name: name });
            wsSend({ type: 'lobby_create', name: name + "'s Game" });
        });
    }

    if (btnBrowse) {
        btnBrowse.addEventListener('click', () => {
            const name = getAndSaveName();
            wsSend({ type: 'set_name', name: name });
            wsSend({ type: 'lobby_list' });
            showScreen('browser-screen');
        });
    }

    const btnBrowserBack = document.getElementById('btn-browser-back');
    if (btnBrowserBack) {
        btnBrowserBack.addEventListener('click', () => {
            showScreen('main-menu');
        });
    }

    const btnRefresh = document.getElementById('btn-refresh');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            wsSend({ type: 'lobby_list' });
        });
    }

    // ── Loading Screen ─────────────────────────────────────────────
    // If GameDef defines preload(), show a loading screen while assets load.
    // Games without preload() skip this entirely.
    // Wait for all scripts to finish executing before checking for preload.
    // DOMContentLoaded fires after all synchronous scripts have run.
    window.addEventListener('DOMContentLoaded', function initLoadingScreen() {
        const loadingEl = document.getElementById('loading-screen');
        const loadingBar = document.getElementById('loading-bar');
        const loadingStatus = document.getElementById('loading-status');

        if (!loadingEl) return;

        if (!window.GameDef || !window.GameDef.preload) {
            // No preload needed — hide loading screen immediately
            loadingEl.classList.add('hidden');
            return;
        }

        // Animate the bar as a progress indicator
        let progress = 0;
        const progressInterval = setInterval(() => {
            // Ease toward 90% while loading (never hits 100 until done)
            progress += (90 - progress) * 0.05;
            if (loadingBar) loadingBar.style.width = progress + '%';
        }, 100);

        if (loadingStatus) loadingStatus.textContent = 'Loading models...';

        window.GameDef.preload().then(() => {
            clearInterval(progressInterval);
            if (loadingBar) loadingBar.style.width = '100%';
            if (loadingStatus) loadingStatus.textContent = 'Ready!';

            setTimeout(() => {
                loadingEl.classList.add('fade-out');
                setTimeout(() => loadingEl.classList.add('hidden'), 500);
            }, 300);
        }).catch((err) => {
            console.error('Preload failed:', err);
            clearInterval(progressInterval);
            if (loadingStatus) loadingStatus.textContent = 'Failed to load assets. Continuing...';
            setTimeout(() => {
                loadingEl.classList.add('fade-out');
                setTimeout(() => loadingEl.classList.add('hidden'), 500);
            }, 1500);
        });
    });

    // ── Expose for game.js ────────────────────────────────────────
    window.PDROP = {
        wsSend,
        camera,
        getLocalPlayerId: () => localPlayerId,
        getLocalPlayerFromState,
        getGameState: () => gameState,
        getGamePhase: () => gamePhase,
        getCurrentLobby: () => currentLobby,
        COLORS,
        COLOR_NAMES,
        VIRTUAL_W,
        VIRTUAL_H,
        getWorldWidth,
        getWorldHeight,
        getViewW,
        getViewH,
        showTooltip,
        hideTooltip,
        escapeHtml,
        rendererMode: () => rendererMode,
        getCanvas: () => canvas,
        getOverlayCanvas: () => overlayCanvas,
    };

})();
