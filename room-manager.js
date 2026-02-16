/**
 * 格点战争 — 房间管理器 (Firebase Realtime Database)
 */

let currentRoom = null;     // { code, ref, myPlayer, myName, stateUnsub }
let stateListener = null;   // Firebase onValue unsubscribe
let pendingGameType = null; // 'local', 'ai', or 'online'
let selectedGameMode = 'classic'; // 'classic' or 'competitive'

// ===== Screen helpers =====
function showScreen(id) {
    ['start-screen', 'lobby-screen', 'game-screen'].forEach(s => {
        document.getElementById(s).style.display = s === id ? 'flex' : 'none';
    });
}

function showLobbyStep(id) {
    ['lobby-nick', 'lobby-wait', 'lobby-join'].forEach(s => {
        document.getElementById(s).style.display = s === id ? 'block' : 'none';
    });
    document.getElementById('lobby-error').style.display = 'none';
}

function lobbyError(msg) {
    const el = document.getElementById('lobby-error');
    el.textContent = msg;
    el.style.display = 'block';
}

// ===== Mode Selection =====
function showModeSelect(gameType) {
    pendingGameType = gameType;
    document.getElementById('mode-select-overlay').style.display = 'flex';
}

function closeModeSelect() {
    document.getElementById('mode-select-overlay').style.display = 'none';
    pendingGameType = null;
}

function confirmModeSelect(mode) {
    selectedGameMode = mode;
    document.getElementById('mode-select-overlay').style.display = 'none';
    switch (pendingGameType) {
        case 'local':
            startLocalGame();
            break;
        case 'ai':
            startAIGame();
            break;
        case 'online':
            showLobby();
            break;
    }
    pendingGameType = null;
}

// ===== Navigation =====
function showLobby() {
    showScreen('lobby-screen');
    showLobbyStep('lobby-nick');
    document.getElementById('nick-input').value = '';
    document.getElementById('room-code-input').value = '';
}

function lobbyBack() {
    cleanupRoom();
    showScreen('start-screen');
}

// ===== Room creation =====
function generateRoomCode() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

async function createRoom() {
    const name = document.getElementById('nick-input').value.trim();
    if (!name) { lobbyError('请输入昵称'); return; }

    const code = generateRoomCode();
    const roomRef = database.ref('pointwar_rooms/' + code);

    try {
        // Check if room already exists
        const snap = await roomRef.get();
        if (snap.exists()) {
            lobbyError('房间号冲突，请重试');
            return;
        }

        await roomRef.set({
            meta: {
                status: 'waiting',
                hostName: name,
                guestName: '',
                createdAt: Date.now(),
                gameMode: selectedGameMode
            },
            state: null
        });

        // Set disconnect cleanup
        roomRef.onDisconnect().remove();

        currentRoom = { code, ref: roomRef, myPlayer: 1, myName: name };

        document.getElementById('room-code-text').textContent = code;
        showLobbyStep('lobby-wait');

        // Listen for guest joining
        roomRef.child('meta/status').on('value', (snap) => {
            if (snap.val() === 'playing') {
                // Guest joined! Start game
                roomRef.child('meta/guestName').get().then(gSnap => {
                    const guestName = gSnap.val() || '玩家二';
                    startOnlineGame(1, name, guestName, code, selectedGameMode);
                });
            }
        });

    } catch (err) {
        lobbyError('创建房间失败: ' + err.message);
    }
}

function showJoinInput() {
    const name = document.getElementById('nick-input').value.trim();
    if (!name) { lobbyError('请输入昵称'); return; }

    currentRoom = { code: null, ref: null, myPlayer: 2, myName: name };
    showLobbyStep('lobby-join');
    document.getElementById('room-code-input').focus();
}

async function joinRoom() {
    const code = document.getElementById('room-code-input').value.trim();
    if (code.length !== 4) { lobbyError('请输入4位房间号'); return; }

    const roomRef = database.ref('pointwar_rooms/' + code);

    try {
        const snap = await roomRef.get();
        if (!snap.exists()) {
            lobbyError('房间不存在');
            return;
        }

        const data = snap.val();
        if (data.meta.status !== 'waiting') {
            lobbyError('房间已在游戏中');
            return;
        }

        const myName = currentRoom.myName;
        const hostName = data.meta.hostName;
        const roomGameMode = data.meta.gameMode || 'classic';

        await roomRef.child('meta').update({
            status: 'playing',
            guestName: myName
        });

        currentRoom.code = code;
        currentRoom.ref = roomRef;

        startOnlineGame(2, myName, hostName, code, roomGameMode);

    } catch (err) {
        lobbyError('加入失败: ' + err.message);
    }
}

// ===== Start online game =====
function startOnlineGame(myPlayer, myName, opponentName, roomCode, gameMode) {
    showScreen('game-screen');
    document.getElementById('online-badge').style.display = 'inline-block';

    const p1Name = myPlayer === 1 ? myName : opponentName;
    const p2Name = myPlayer === 1 ? opponentName : myName;

    game = new PointWarGame({
        onlineMode: true,
        myPlayer: myPlayer,
        roomCode: roomCode,
        p1Name: p1Name,
        p2Name: p2Name,
        gameMode: gameMode || 'classic'
    });

    // Listen for remote state changes
    const roomRef = database.ref('pointwar_rooms/' + roomCode);
    stateListener = roomRef.child('state').on('value', (snap) => {
        const state = snap.val();
        if (state && game) {
            game.applyRemoteState(state);
        }
    });
}

// ===== State sync =====
function pushGameState(roomCode, state) {
    if (!roomCode) return;
    const roomRef = database.ref('pointwar_rooms/' + roomCode);
    roomRef.child('state').set(state);
}

// ===== Cleanup =====
function cleanupRoom() {
    if (stateListener && currentRoom && currentRoom.code) {
        const roomRef = database.ref('pointwar_rooms/' + currentRoom.code);
        roomRef.child('state').off('value', stateListener);
        stateListener = null;
    }
    if (currentRoom && currentRoom.ref) {
        currentRoom.ref.onDisconnect().cancel();
        // If host leaves during waiting, delete room
        if (currentRoom.myPlayer === 1) {
            currentRoom.ref.remove().catch(() => { });
        }
    }
    currentRoom = null;
}

// ===== Local game =====
function startLocalGame() {
    showScreen('game-screen');
    document.getElementById('online-badge').style.display = 'none';
    game = new PointWarGame({ onlineMode: false, gameMode: selectedGameMode });
}

function startAIGame() {
    showScreen('game-screen');
    document.getElementById('online-badge').style.display = 'none';
    game = new PointWarGame({
        onlineMode: false,
        aiMode: true,
        p1Name: '🤖 AI',
        p2Name: '你',
        gameMode: selectedGameMode
    });
}

function backToMenu() {
    document.getElementById('gameover').style.display = 'none';
    cleanupRoom();
    showScreen('start-screen');
    game = null;
}
