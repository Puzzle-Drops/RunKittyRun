// PDROP Framework — Server-side lobby, networking, chat, pings, tick loop
// This file is the same for every PDROP game. Do not modify.

const crypto = require('crypto');

let wss = null;
let game = null;

// All connected clients: ws → { id, name, ws, lobbyId, ... }
const clients = new Map();

// All lobbies: id → lobby state
const lobbies = new Map();

// Player color palette
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

function uuid() {
    return crypto.randomUUID();
}

function send(ws, msg) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(msg));
    }
}

function broadcastToLobby(lobbyId, msg) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const data = JSON.stringify(msg);
    for (const p of lobby.players) {
        if (p.ws.readyState === 1) {
            p.ws.send(data);
        }
    }
}

function broadcastToTeam(lobbyId, team, msg) {
    const lobby = lobbies.get(lobbyId);
    if (!lobby) return;
    const data = JSON.stringify(msg);
    for (const p of lobby.players) {
        if (p.team === team && p.ws.readyState === 1) {
            p.ws.send(data);
        }
    }
}

function createSlots(mode, teamCount, maxPlayers) {
    const slots = [];
    if (mode === 'ffa') {
        for (let i = 0; i < maxPlayers; i++) {
            slots.push({ index: i, team: 0, state: 'open', player: null });
        }
    } else {
        const perTeam = Math.floor(maxPlayers / teamCount);
        for (let t = 0; t < teamCount; t++) {
            for (let i = 0; i < perTeam; i++) {
                slots.push({ index: slots.length, team: t, state: 'open', player: null });
            }
        }
    }
    return slots;
}

function getSlotColor(slot, mode, teamCount) {
    if (mode === 'ffa') {
        return COLORS[slot.index % COLORS.length];
    }
    return COLORS[slot.team % COLORS.length];
}

function getLobbyInfo(lobby) {
    return {
        id: lobby.id,
        name: lobby.name,
        host: lobby.host,
        gameType: game.id,
        mode: lobby.mode,
        teamCount: lobby.teamCount,
        state: lobby.state,
        playerCount: lobby.players.length,
        maxPlayers: game.maxPlayers,
        slots: lobby.slots.map(s => ({
            index: s.index,
            team: s.team,
            state: s.state,
            player: s.player ? {
                id: s.player.id,
                name: s.player.name,
                color: s.player.color,
                colorIndex: s.player.colorIndex,
                team: s.player.team,
                ready: s.player.ready,
            } : null,
        })),
    };
}

function findFirstOpenSlot(lobby, team) {
    if (team !== undefined) {
        return lobby.slots.find(s => s.state === 'open' && s.team === team) || null;
    }
    return lobby.slots.find(s => s.state === 'open') || null;
}

function assignPlayerToSlot(lobby, client, slot) {
    const colorIndex = slot.index;
    const color = getSlotColor(slot, lobby.mode, lobby.teamCount);

    client.lobbyId = lobby.id;
    client.team = slot.team;
    client.slot = slot.index;
    client.color = color;
    client.colorIndex = colorIndex;
    client.ready = false;

    slot.state = 'occupied';
    slot.player = client;

    if (!lobby.players.includes(client)) {
        lobby.players.push(client);
    }
}

function removePlayerFromLobby(client) {
    const lobby = lobbies.get(client.lobbyId);
    if (!lobby) return;

    const slot = lobby.slots.find(s => s.player && s.player.id === client.id);
    if (slot) {
        slot.state = 'open';
        slot.player = null;
    }

    lobby.players = lobby.players.filter(p => p.id !== client.id);

    // If lobby is empty, remove it
    if (lobby.players.length === 0) {
        if (lobby.tickInterval) clearInterval(lobby.tickInterval);
        lobbies.delete(lobby.id);
        return;
    }

    // If host left, transfer to next player
    if (lobby.host === client.id) {
        lobby.host = lobby.players[0].id;
        broadcastToLobby(lobby.id, {
            type: 'lobby_host_change',
            hostId: lobby.host,
        });
    }

    broadcastToLobby(lobby.id, {
        type: 'lobby_player_leave',
        playerId: client.id,
    });
    broadcastToLobby(lobby.id, {
        type: 'lobby_state',
        lobby: getLobbyInfo(lobby),
    });

    client.lobbyId = null;
    client.team = null;
    client.slot = null;
}

function startGame(lobby) {
    lobby.state = 'countdown';
    const playersData = lobby.players.map(p => ({
        id: p.id,
        name: p.name,
        team: p.team,
        color: p.color,
        colorIndex: p.colorIndex,
        slot: p.slot,
    }));

    if (game.init) {
        game.init(playersData, lobby.settings, lobby.mode, lobby.teamCount);
    }

    broadcastToLobby(lobby.id, {
        type: 'game_countdown',
        seconds: 3,
        players: playersData,
    });

    // Send initial game state so clients can render during countdown
    const initialState = game.getState ? game.getState() : null;
    if (initialState) {
        broadcastToLobby(lobby.id, { type: 'game_state', ...initialState });
    }

    let count = 3;
    const countdownInterval = setInterval(() => {
        count--;
        if (count > 0) {
            broadcastToLobby(lobby.id, { type: 'game_countdown', seconds: count });
        } else {
            clearInterval(countdownInterval);
            lobby.state = 'ingame';
            broadcastToLobby(lobby.id, { type: 'game_start' });
            startTickLoop(lobby);
        }
    }, 1000);
}

function startTickLoop(lobby) {
    const TICK_RATE = 20; // 20 ticks per second
    const TICK_MS = 1000 / TICK_RATE;

    lobby.tickInterval = setInterval(() => {
        if (lobby.state !== 'ingame') return;

        if (game.tick) game.tick(TICK_MS);

        // Relay game events (eliminations, etc.)
        if (game.getEvents) {
            const events = game.getEvents();
            for (const ev of events) {
                broadcastToLobby(lobby.id, ev);
            }
        }

        const state = game.getState ? game.getState() : null;
        if (state) {
            broadcastToLobby(lobby.id, { type: 'game_state', ...state });
        }

        const result = game.checkRoundOver ? game.checkRoundOver() : null;
        if (result) {
            lobby.state = 'postgame';
            clearInterval(lobby.tickInterval);
            lobby.tickInterval = null;
            broadcastToLobby(lobby.id, { type: 'game_round_over', ...result });
        }
    }, TICK_MS);
}

function handleMessage(client, data) {
    let msg;
    try {
        msg = JSON.parse(data);
    } catch (e) {
        return;
    }

    switch (msg.type) {
        case 'set_name':
            client.name = (msg.name || 'Player').substring(0, 20);
            send(client.ws, { type: 'welcome', id: client.id, name: client.name });
            break;

        case 'rejoin': {
            const lobby = lobbies.get(msg.lobbyId);
            if (!lobby) {
                send(client.ws, { type: 'rejoin_failed' });
                break;
            }
            // Find the old slot by old player id
            const oldSlot = lobby.slots.find(s => s.player && s.player.id === msg.oldId);
            if (!oldSlot) {
                // Player was already removed — try joining a fresh slot
                const openSlot = findFirstOpenSlot(lobby);
                if (!openSlot) {
                    send(client.ws, { type: 'rejoin_failed' });
                    break;
                }
                client.name = (msg.name || 'Player').substring(0, 20);
                assignPlayerToSlot(lobby, client, openSlot);
            } else {
                // Reconnect to existing slot — swap ws reference
                client.name = oldSlot.player.name;
                client.id = msg.oldId; // restore old id so game state matches
                client.lobbyId = lobby.id;
                client.team = oldSlot.team;
                client.slot = oldSlot.index;
                client.color = oldSlot.player.color;
                client.colorIndex = oldSlot.player.colorIndex;
                client.ready = oldSlot.player.ready;
                oldSlot.player = client;
                // Replace in players array
                lobby.players = lobby.players.filter(p => p.id !== msg.oldId);
                lobby.players.push(client);
            }

            send(client.ws, { type: 'welcome', id: client.id, name: client.name });
            send(client.ws, { type: 'lobby_joined', lobby: getLobbyInfo(lobby) });

            // If game is in progress, send current state
            if (lobby.state === 'ingame') {
                send(client.ws, { type: 'game_start' });
                const state = game.getState ? game.getState() : null;
                if (state) send(client.ws, { type: 'game_state', ...state });
            } else if (lobby.state === 'countdown') {
                send(client.ws, { type: 'game_countdown', seconds: 0 });
                const state = game.getState ? game.getState() : null;
                if (state) send(client.ws, { type: 'game_state', ...state });
            }

            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_list':
            send(client.ws, {
                type: 'lobby_list',
                lobbies: Array.from(lobbies.values()).map(getLobbyInfo),
            });
            break;

        case 'lobby_create': {
            const lobbyId = uuid();
            const mode = (msg.mode === 'teams' && game.supportedModes && game.supportedModes.includes('teams'))
                ? 'teams'
                : (game.defaultMode || 'ffa');
            const teamCount = mode === 'teams' ? (msg.teamCount || game.defaultTeamCount || 2) : 1;
            const lobby = {
                id: lobbyId,
                name: (msg.name || client.name + "'s Game").substring(0, 30),
                host: client.id,
                mode: mode,
                teamCount: teamCount,
                slots: createSlots(mode, teamCount, game.maxPlayers),
                state: 'lobby',
                settings: {},
                players: [],
                gameState: null,
                tickInterval: null,
            };
            lobbies.set(lobbyId, lobby);

            const slot = findFirstOpenSlot(lobby);
            if (slot) assignPlayerToSlot(lobby, client, slot);

            send(client.ws, { type: 'lobby_joined', lobby: getLobbyInfo(lobby) });
            broadcastToLobby(lobbyId, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_join': {
            const lobby = lobbies.get(msg.lobbyId);
            if (!lobby || lobby.state !== 'lobby') {
                send(client.ws, { type: 'lobby_error', error: 'Lobby not found or game in progress' });
                return;
            }
            const slot = findFirstOpenSlot(lobby);
            if (!slot) {
                send(client.ws, { type: 'lobby_error', error: 'Lobby is full' });
                return;
            }
            assignPlayerToSlot(lobby, client, slot);

            send(client.ws, { type: 'lobby_joined', lobby: getLobbyInfo(lobby) });
            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            broadcastToLobby(lobby.id, {
                type: 'chat_message',
                channel: 'system',
                text: client.name + ' has joined.',
            });
            break;
        }

        case 'lobby_leave': {
            removePlayerFromLobby(client);
            send(client.ws, { type: 'lobby_left' });
            break;
        }

        case 'lobby_team_change': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.mode !== 'teams') return;
            const targetTeam = msg.targetTeam;
            if (targetTeam < 0 || targetTeam >= lobby.teamCount) return;

            const newSlot = findFirstOpenSlot(lobby, targetTeam);
            if (!newSlot) return;

            // Remove from current slot
            const oldSlot = lobby.slots.find(s => s.player && s.player.id === client.id);
            if (oldSlot) {
                oldSlot.state = 'open';
                oldSlot.player = null;
            }

            assignPlayerToSlot(lobby, client, newSlot);
            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_move_slot': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.state !== 'lobby') return;
            const slotIdx = msg.slotIndex;
            const slot = lobby.slots[slotIdx];
            if (!slot || slot.state !== 'open') return;

            // Remove from current slot
            const oldSlot = lobby.slots.find(s => s.player && s.player.id === client.id);
            if (oldSlot) {
                oldSlot.state = 'open';
                oldSlot.player = null;
            }

            assignPlayerToSlot(lobby, client, slot);
            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_transfer_host': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.host !== client.id) return;
            const targetId = msg.targetId;
            const target = lobby.players.find(p => p.id === targetId);
            if (!target) return;

            lobby.host = targetId;
            broadcastToLobby(lobby.id, {
                type: 'lobby_host_change',
                hostId: lobby.host,
            });
            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            broadcastToLobby(lobby.id, {
                type: 'chat_message',
                channel: 'system',
                text: target.name + ' is now the host.',
            });
            break;
        }

        case 'lobby_slot_action': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.host !== client.id) return;
            const slotIdx = msg.slotIndex;
            const slot = lobby.slots[slotIdx];
            if (!slot) return;

            if (slot.state === 'occupied' && slot.player) {
                // Kick the player
                const kicked = slot.player;
                slot.state = 'open';
                slot.player = null;
                lobby.players = lobby.players.filter(p => p.id !== kicked.id);
                send(kicked.ws, { type: 'lobby_kicked' });
                kicked.lobbyId = null;
                kicked.team = null;
                kicked.slot = null;
            } else if (slot.state === 'open') {
                slot.state = 'closed';
            } else if (slot.state === 'closed') {
                slot.state = 'open';
            }

            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_ready': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby) return;
            client.ready = !client.ready;
            const slot = lobby.slots.find(s => s.player && s.player.id === client.id);
            if (slot && slot.player) slot.player.ready = client.ready;
            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_mode_change': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.host !== client.id || lobby.state !== 'lobby') return;
            const newMode = msg.mode;
            if (!game.supportedModes || !game.supportedModes.includes(newMode)) return;

            lobby.mode = newMode;
            const tc = parseInt(msg.teamCount) || game.defaultTeamCount || 2;
            lobby.teamCount = newMode === 'teams' ? Math.max(2, Math.min(4, tc)) : 1;
            lobby.slots = createSlots(lobby.mode, lobby.teamCount, game.maxPlayers);

            // Re-assign all players
            for (const p of lobby.players) {
                const slot = findFirstOpenSlot(lobby);
                if (slot) assignPlayerToSlot(lobby, p, slot);
            }

            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }

        case 'lobby_start': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.host !== client.id || lobby.state !== 'lobby') return;
            if (lobby.players.length < 1) return;
            startGame(lobby);
            break;
        }

        case 'chat': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby) return;
            const channel = msg.channel === 'all' ? 'all' : 'team';
            const text = (msg.text || '').substring(0, 300);
            if (!text.trim()) return;

            const chatMsg = {
                type: 'chat_message',
                playerId: client.id,
                playerName: client.name,
                playerColor: client.color,
                channel: channel,
                team: client.team,
                text: text,
            };

            if (channel === 'all' || lobby.mode === 'ffa') {
                broadcastToLobby(lobby.id, chatMsg);
            } else {
                broadcastToTeam(lobby.id, client.team, chatMsg);
            }
            break;
        }

        case 'ping': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.state !== 'ingame') return;

            const pingMsg = {
                type: 'ping',
                playerId: client.id,
                playerName: client.name,
                team: client.team,
                x: msg.x,
                y: msg.y,
                pingType: msg.pingType || 'normal',
            };

            if (lobby.mode === 'ffa') {
                // FFA: only visible to self
                send(client.ws, pingMsg);
            } else {
                broadcastToTeam(lobby.id, client.team, pingMsg);
            }
            break;
        }

        case 'game_input': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.state !== 'ingame') return;
            if (game.onInput) {
                game.onInput(client.id, msg.data);
            }
            break;
        }

        case 'lobby_rematch': {
            const lobby = lobbies.get(client.lobbyId);
            if (!lobby || lobby.state !== 'postgame') return;
            lobby.state = 'lobby';
            // Reset ready states
            for (const p of lobby.players) {
                p.ready = false;
                const slot = lobby.slots.find(s => s.player && s.player.id === p.id);
                if (slot && slot.player) slot.player.ready = false;
            }
            broadcastToLobby(lobby.id, { type: 'lobby_state', lobby: getLobbyInfo(lobby) });
            break;
        }
    }
}

function init(webSocketServer, gameModule) {
    wss = webSocketServer;
    game = gameModule;

    wss.on('connection', (ws) => {
        const client = {
            id: uuid(),
            name: 'Player',
            ws: ws,
            lobbyId: null,
            team: null,
            slot: null,
            color: null,
            colorIndex: null,
            ready: false,
        };
        clients.set(ws, client);

        send(ws, { type: 'connected', id: client.id });

        ws.on('message', (data) => {
            handleMessage(client, data.toString());
        });

        ws.on('close', () => {
            if (client.lobbyId) {
                removePlayerFromLobby(client);
            }
            clients.delete(ws);
        });
    });
}

module.exports = { init };
