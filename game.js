/**
 * 格点战争 (Grid War) - 核心游戏逻辑
 */
class PointWarGame {
    constructor(options = {}) {
        this.COLS = 5;
        this.ROWS = 3;
        this.NODE_SIZE = 72;
        this.SPACING = 115;
        this.BASE_HP = 50;
        this.INITIAL_RESERVES = 6;

        // Online mode settings
        this.onlineMode = options.onlineMode || false;
        this.myPlayer = options.myPlayer || 0; // 1 or 2 in online mode
        this.roomCode = options.roomCode || null;
        this.p1Name = options.p1Name || '玩家一';
        this.p2Name = options.p2Name || '玩家二';

        this.init();
    }

    init() {
        this.grid = [];
        this.players = {
            1: { reserves: this.INITIAL_RESERVES, farmCount: 0, hp: this.BASE_HP },
            2: { reserves: this.INITIAL_RESERVES, farmCount: 0, hp: this.BASE_HP }
        };
        this.currentPlayer = 1;
        this.turn = 1;
        this.phase = 'action';
        this.turnAction = null; // 'move' or 'place' for multi-action turns
        this.selectedCell = null;
        this.targetCell = null;
        this.amountCallback = null;
        this.currentAmount = 1;
        this.maxAmount = 1;
        this.minAmount = 0.5;
        this.gameOver = false;
        this.winner = null;
        this.isFirstTurn = true; // Skip income on first turn (players start with 6)
        this.log = [];

        this.initGrid();
        this.buildBoard();
        this.render();
    }

    initGrid() {
        for (let r = 0; r < this.ROWS; r++) {
            this.grid[r] = [];
            for (let c = 0; c < this.COLS; c++) {
                // troops = unmoved (can be moved), movedTroops = already moved this turn
                this.grid[r][c] = { owner: 0, troops: 0, movedTroops: 0 };
            }
        }
    }

    totalTroops(cell) { return cell.troops + cell.movedTroops; }

    // Reset all movedTroops back to troops for a player at the start of their turn
    resetMovedTroops(playerNum) {
        for (let r = 0; r < this.ROWS; r++)
            for (let c = 0; c < this.COLS; c++) {
                const cell = this.grid[r][c];
                if (cell.owner === playerNum) {
                    cell.troops += cell.movedTroops;
                    cell.movedTroops = 0;
                }
            }
    }

    // ===== Farm Bonus Calculation =====
    calculateFarmBonus(farmCount) {
        let bonus = 0, consumed = 0, groupIdx = 0;
        while (true) {
            const groupSize = groupIdx < 3 ? groupIdx + 1 : 4;
            if (consumed + groupSize <= farmCount) {
                consumed += groupSize;
                bonus++;
                groupIdx++;
            } else break;
        }
        return bonus;
    }

    getNextFarmGroup(farmCount) {
        let consumed = 0, groupIdx = 0;
        while (true) {
            const groupSize = groupIdx < 3 ? groupIdx + 1 : 4;
            if (consumed + groupSize <= farmCount) {
                consumed += groupSize;
                groupIdx++;
            } else {
                return { groupSize, progress: farmCount - consumed };
            }
        }
    }

    // ===== Income =====
    getIncomeBreakdown(playerNum) {
        const base = 1;
        let middle = 0;
        const midCol = Math.floor(this.COLS / 2); // column 2 (center)
        for (let r = 0; r < this.ROWS; r++)
            if (this.grid[r][midCol].owner === playerNum) middle += 0.5;
        const farm = this.calculateFarmBonus(this.players[playerNum].farmCount);
        return { base, middle, farm, total: base + middle + farm };
    }

    calculateIncome(playerNum) {
        const inc = this.getIncomeBreakdown(playerNum);
        this.players[playerNum].reserves += inc.total;
        this.showIncomeToast(playerNum, inc);
        return inc;
    }

    // ===== Damage from enemy troops on deployment cells =====
    applyDamage(playerNum) {
        const depCol = playerNum === 1 ? 0 : this.COLS - 1;
        const opponent = playerNum === 1 ? 2 : 1;
        let totalDamage = 0;
        for (let r = 0; r < this.ROWS; r++) {
            const cell = this.grid[r][depCol];
            if (cell.owner === opponent) {
                totalDamage += this.totalTroops(cell);
            }
        }
        if (totalDamage > 0) {
            this.players[playerNum].hp = Math.max(0, this.players[playerNum].hp - totalDamage);
            this.addLog(`⚔️ 玩家${this.pName(playerNum)}大本营受到 ${this.fmt(totalDamage)} 点伤害！剩余 ${this.fmt(this.players[playerNum].hp)} HP`);
            const panel = document.getElementById(`panel-p${playerNum}`);
            panel.classList.add('damage-flash');
            setTimeout(() => panel.classList.remove('damage-flash'), 600);

            if (this.players[playerNum].hp <= 0) {
                this.winner = opponent;
                this.gameOver = true;
                this.phase = 'game_over';
            }
        }
    }

    // ===== Board Building =====
    buildBoard() {
        const container = document.getElementById('board-container');
        const bw = (this.COLS - 1) * this.SPACING + this.NODE_SIZE;
        const bh = (this.ROWS - 1) * this.SPACING + this.NODE_SIZE;
        container.style.width = bw + 'px';
        container.style.height = bh + 'px';

        const svg = document.getElementById('edges');
        svg.setAttribute('width', bw);
        svg.setAttribute('height', bh);
        svg.innerHTML = '';
        const half = this.NODE_SIZE / 2;

        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                const cx = c * this.SPACING + half;
                const cy = r * this.SPACING + half;
                if (c < this.COLS - 1) this.addEdge(svg, cx, cy, (c + 1) * this.SPACING + half, cy);
                if (r < this.ROWS - 1) this.addEdge(svg, cx, cy, cx, (r + 1) * this.SPACING + half);
            }
        }

        const grid = document.getElementById('grid');
        grid.innerHTML = '';
        for (let r = 0; r < this.ROWS; r++) {
            for (let c = 0; c < this.COLS; c++) {
                const node = document.createElement('div');
                node.className = 'node';
                node.dataset.row = r;
                node.dataset.col = c;
                node.style.left = c * this.SPACING + 'px';
                node.style.top = r * this.SPACING + 'px';
                node.style.width = this.NODE_SIZE + 'px';
                node.style.height = this.NODE_SIZE + 'px';
                const span = document.createElement('span');
                span.className = 'troop-count';
                node.appendChild(span);
                const statusSpan = document.createElement('span');
                statusSpan.className = 'troop-status';
                node.appendChild(statusSpan);
                node.addEventListener('click', () => this.handleCellClick(r, c));
                grid.appendChild(node);
            }
        }
    }

    addEdge(svg, x1, y1, x2, y2) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.classList.add('edge');
        svg.appendChild(line);
    }

    // ===== Online Mode: Turn Check =====
    isMyTurn() {
        if (!this.onlineMode) return true;
        return this.currentPlayer === this.myPlayer;
    }

    // ===== Cell Click Handling =====
    handleCellClick(row, col) {
        if (this.gameOver) return;
        if (!this.isMyTurn()) { this.showMessage('⏳ 等待对手操作…'); return; }
        const cell = this.grid[row][col];

        switch (this.phase) {
            case 'move_source':
                // Only unmoved troops (cell.troops) can be selected
                if (cell.owner === this.currentPlayer && cell.troops > 0) {
                    this.selectedCell = { row, col };
                    this.phase = 'move_target';
                    this.showMessage(`选择移动目标（可动兵力: ${this.fmt(cell.troops)}）`);
                    this.render();
                } else if (cell.owner === this.currentPlayer && cell.movedTroops > 0) {
                    this.showMessage('⚠️ 该格兵力已移动过，不能再次移动');
                } else {
                    this.showMessage('⚠️ 请选择你拥有且有未移动兵力的格子');
                }
                break;

            case 'move_target':
                if (this.isAdjacent(this.selectedCell.row, this.selectedCell.col, row, col)) {
                    this.targetCell = { row, col };
                    const max = this.grid[this.selectedCell.row][this.selectedCell.col].troops; // only unmoved
                    this.showAmountSelector('选择移动兵力数量', 0.5, max, (amt) => this.executeMove(amt));
                } else {
                    this.showMessage('⚠️ 请选择相邻的格子');
                }
                break;

            case 'place_target': {
                const depCol = this.currentPlayer === 1 ? 0 : this.COLS - 1;
                if (col === depCol && (cell.owner === this.currentPlayer || cell.owner === 0)) {
                    this.targetCell = { row, col };
                    const max = this.players[this.currentPlayer].reserves;
                    this.showAmountSelector('选择放置兵力数量', 0.5, max, (amt) => this.executePlace(amt));
                } else {
                    this.showMessage('⚠️ 请选择你放兵区内的可用格子（虚线标记）');
                }
                break;
            }
        }
    }

    // ===== Action Handlers =====
    handleAction(action) {
        if (this.phase !== 'action' || this.gameOver) return;
        if (!this.isMyTurn()) { this.showMessage('⏳ 等待对手操作…'); return; }

        switch (action) {
            case 'move': {
                let hasMovable = false;
                for (let r = 0; r < this.ROWS; r++)
                    for (let c = 0; c < this.COLS; c++)
                        if (this.grid[r][c].owner === this.currentPlayer && this.grid[r][c].troops > 0)
                            hasMovable = true;
                if (!hasMovable) { this.showMessage('⚠️ 没有可移动的兵力！'); return; }
                this.turnAction = 'move';
                this.phase = 'move_source';
                this.showMessage('选择要移动的兵力所在格子（闪烁的格子）');
                this.render();
                break;
            }
            case 'place': {
                if (this.players[this.currentPlayer].reserves < 0.5) {
                    this.showMessage('⚠️ 后备兵力不足！');
                    return;
                }
                const depCol = this.currentPlayer === 1 ? 0 : this.COLS - 1;
                let hasAvail = false;
                for (let r = 0; r < this.ROWS; r++) {
                    const cell = this.grid[r][depCol];
                    if (cell.owner === this.currentPlayer || cell.owner === 0) hasAvail = true;
                }
                if (!hasAvail) { this.showMessage('⚠️ 放兵区被敌方占据！'); return; }
                this.turnAction = 'place';
                this.phase = 'place_target';
                this.showMessage('选择放兵区内的格子部署兵力（虚线格子）');
                this.render();
                break;
            }
            case 'farm':
                this.players[this.currentPlayer].farmCount++;
                const bonus = this.calculateFarmBonus(this.players[this.currentPlayer].farmCount);
                const fg = this.getNextFarmGroup(this.players[this.currentPlayer].farmCount);
                this.addLog(`🌾 玩家${this.pName(this.currentPlayer)}屯田 (加成: +${bonus}/回合, 进度: ${fg.progress}/${fg.groupSize})`);
                this.pushAndNextTurn(); // farm ends turn immediately
                break;
        }
    }

    // ===== Execute Actions =====
    executeMove(amount) {
        const src = this.grid[this.selectedCell.row][this.selectedCell.col];
        const tgt = this.grid[this.targetCell.row][this.targetCell.col];
        const tgtDesc = `(${this.targetCell.row},${this.targetCell.col})`;

        // Subtract from unmoved troops
        src.troops -= amount;
        if (src.troops <= 0.001) src.troops = 0;
        // If source cell is now empty (no troops of any kind), clear owner
        if (this.totalTroops(src) <= 0.001) { src.troops = 0; src.movedTroops = 0; src.owner = 0; }

        if (tgt.owner === this.currentPlayer || tgt.owner === 0) {
            // Friendly or empty — moved troops go to movedTroops
            tgt.movedTroops += amount;
            tgt.owner = this.currentPlayer;
            this.addLog(`🗡️ 玩家${this.pName(this.currentPlayer)}移动 ${this.fmt(amount)} 兵力到 ${tgtDesc}`);
        } else {
            // Combat: attacker amount vs defender totalTroops
            const defTotal = this.totalTroops(tgt);
            if (amount > defTotal) {
                const remain = amount - defTotal;
                this.addLog(`⚔️ 战斗！${this.fmt(amount)} vs ${this.fmt(defTotal)} → 玩家${this.pName(this.currentPlayer)}胜，剩余 ${this.fmt(remain)}`);
                tgt.troops = 0;
                tgt.movedTroops = remain;
                tgt.owner = this.currentPlayer;
            } else if (amount < defTotal) {
                const remain = defTotal - amount;
                this.addLog(`⚔️ 战斗！${this.fmt(amount)} vs ${this.fmt(defTotal)} → 防御方胜，剩余 ${this.fmt(remain)}`);
                tgt.troops = remain;
                tgt.movedTroops = 0;
            } else {
                this.addLog(`⚔️ 战斗！${this.fmt(amount)} vs ${this.fmt(defTotal)} → 两败俱伤！`);
                tgt.troops = 0;
                tgt.movedTroops = 0;
                tgt.owner = 0;
            }
        }

        this.selectedCell = null;
        this.targetCell = null;
        // Return to move_source for more moves
        this.phase = 'move_source';
        this.showMessage('继续选择要移动的兵力，或点击「结束回合」');
        this.render();
    }

    executePlace(amount) {
        const tgt = this.grid[this.targetCell.row][this.targetCell.col];
        this.players[this.currentPlayer].reserves -= amount;
        tgt.troops += amount;
        tgt.owner = this.currentPlayer;
        this.addLog(`🏰 玩家${this.pName(this.currentPlayer)}放置 ${this.fmt(amount)} 兵力`);
        this.targetCell = null;
        // Return to place_target for more placements
        this.phase = 'place_target';
        if (this.players[this.currentPlayer].reserves < 0.5) {
            this.showMessage('后备兵力已用完，点击「结束回合」');
        } else {
            this.showMessage('继续选择放兵区格子部署，或点击「结束回合」');
        }
        this.render();
    }

    // Called when player clicks "End Turn" button
    endCurrentTurn() {
        this.turnAction = null;
        this.pushAndNextTurn();
    }

    // Push state and advance turn
    pushAndNextTurn() {
        this.nextTurn();
        if (this.onlineMode) {
            pushGameState(this.roomCode, this.getState());
        }
    }

    // ===== Turn Management =====
    nextTurn() {
        // Switch player
        this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
        if (this.currentPlayer === 1) this.turn++;

        // Reset moved troops for the new current player
        this.resetMovedTroops(this.currentPlayer);

        // Handle first turn: player 2's first turn also skips income
        if (this.isFirstTurn && this.currentPlayer === 2) {
            this.phase = 'action';
            this.selectedCell = null;
            this.targetCell = null;
            this.render();
            return;
        }
        if (this.isFirstTurn && this.currentPlayer === 1) {
            this.isFirstTurn = false;
        }

        // Apply damage
        this.applyDamage(this.currentPlayer);
        if (this.gameOver) {
            this.endGame();
            this.render();
            return;
        }

        // Income
        this.calculateIncome(this.currentPlayer);
        this.phase = 'action';
        this.selectedCell = null;
        this.targetCell = null;
        this.render();
    }

    endGame() {
        document.getElementById('winner-text').textContent = `玩家${this.pName(this.winner)}获胜！`;
        document.getElementById('winner-detail').textContent = `在第 ${this.turn} 回合摧毁了对方大本营`;
        document.getElementById('gameover').style.display = 'flex';
    }

    // ===== Amount Selector =====
    showAmountSelector(title, min, max, callback) {
        this.minAmount = min;
        this.maxAmount = max;
        this.currentAmount = Math.min(1, max);
        this.amountCallback = callback;
        document.getElementById('modal-title').textContent = title;
        document.getElementById('amount-value').textContent = this.fmt(this.currentAmount);
        document.getElementById('modal').style.display = 'flex';
    }

    adjustAmount(delta) {
        this.currentAmount = Math.max(this.minAmount,
            Math.min(this.maxAmount, +(this.currentAmount + delta).toFixed(1)));
        document.getElementById('amount-value').textContent = this.fmt(this.currentAmount);
    }

    setMaxAmount() {
        this.currentAmount = this.maxAmount;
        document.getElementById('amount-value').textContent = this.fmt(this.currentAmount);
    }

    confirmAmount() {
        document.getElementById('modal').style.display = 'none';
        if (this.amountCallback) {
            const cb = this.amountCallback;
            this.amountCallback = null;
            cb(this.currentAmount);
        }
    }

    cancelAmount() {
        document.getElementById('modal').style.display = 'none';
        this.amountCallback = null;
        this.cancelAction();
    }

    cancelAction() {
        // During multi-action, cancel goes back to source selection, not action choice
        if (this.turnAction === 'move') {
            this.phase = 'move_source';
            this.selectedCell = null;
            this.targetCell = null;
            this.showMessage('选择要移动的兵力，或点击「结束回合」');
        } else if (this.turnAction === 'place') {
            this.phase = 'place_target';
            this.selectedCell = null;
            this.targetCell = null;
            this.showMessage('选择放兵区格子，或点击「结束回合」');
        } else {
            this.phase = 'action';
            this.selectedCell = null;
            this.targetCell = null;
        }
        this.render();
    }

    // ===== Rendering =====
    render() {
        document.querySelectorAll('.node').forEach(node => {
            const r = +node.dataset.row, c = +node.dataset.col;
            const cell = this.grid[r][c];
            node.className = 'node';

            if (cell.owner === 1) node.classList.add('player1');
            else if (cell.owner === 2) node.classList.add('player2');
            else node.classList.add('neutral');

            if (c === 0) node.classList.add('deploy-p1');
            if (c === this.COLS - 1) node.classList.add('deploy-p2');
            if (c > 0 && c < this.COLS - 1) node.classList.add('middle');

            if (this.selectedCell && this.selectedCell.row === r && this.selectedCell.col === c)
                node.classList.add('selected');

            if (this.phase === 'move_target' && this.selectedCell &&
                this.isAdjacent(this.selectedCell.row, this.selectedCell.col, r, c))
                node.classList.add('valid-target');

            // Only cells with unmoved troops pulse as selectable
            if (this.phase === 'move_source' && cell.owner === this.currentPlayer && cell.troops > 0)
                node.classList.add('selectable');

            if (this.phase === 'place_target') {
                const depCol = this.currentPlayer === 1 ? 0 : this.COLS - 1;
                if (c === depCol && (cell.owner === this.currentPlayer || cell.owner === 0))
                    node.classList.add('valid-target');
            }

            // Display total troops
            const total = this.totalTroops(cell);
            node.querySelector('.troop-count').textContent = total > 0 ? this.fmt(total) : '';
            // Show moved status indicator
            const statusEl = node.querySelector('.troop-status');
            if (cell.movedTroops > 0 && cell.owner === this.currentPlayer) {
                statusEl.textContent = `🔒${this.fmt(cell.movedTroops)}`;
                statusEl.style.display = 'block';
            } else {
                statusEl.textContent = '';
                statusEl.style.display = 'none';
            }
        });

        for (let p = 1; p <= 2; p++) {
            const pn = `p${p}`;
            const inc = this.getIncomeBreakdown(p);
            const fg = this.getNextFarmGroup(this.players[p].farmCount);
            document.getElementById(`${pn}-reserves`).textContent = this.fmt(this.players[p].reserves);
            document.getElementById(`${pn}-income`).textContent = this.fmt(inc.total);
            document.getElementById(`${pn}-farm`).textContent = this.players[p].farmCount;
            document.getElementById(`${pn}-farmbonus`).textContent = '+' + this.calculateFarmBonus(this.players[p].farmCount);
            document.getElementById(`${pn}-farm-progress`).textContent = `${fg.progress}/${fg.groupSize}`;
            document.getElementById(`${pn}-hp`).textContent = this.fmt(this.players[p].hp);
            document.getElementById(`${pn}-hp-bar`).style.width = Math.max(0, (this.players[p].hp / this.BASE_HP) * 100) + '%';
            document.getElementById(`panel-${pn}`).classList.toggle('active', this.currentPlayer === p);
        }

        document.getElementById('turn-number').textContent = `回合 ${this.turn}`;
        const cp = document.getElementById('current-player');
        cp.textContent = `玩家${this.pName(this.currentPlayer)}的回合`;
        cp.className = `p${this.currentPlayer}`;

        const actions = document.getElementById('actions');
        const subActions = document.getElementById('sub-actions');
        const isMyTurn = this.isMyTurn();

        if (this.phase === 'action') {
            if (isMyTurn) {
                actions.style.display = 'flex';
                subActions.style.display = 'none';
                this.showMessage('选择本回合行动');
            } else {
                actions.style.display = 'none';
                subActions.style.display = 'none';
                this.showMessage('⏳ 等待对手操作…');
            }
        } else if (this.phase === 'game_over') {
            actions.style.display = 'none';
            subActions.style.display = 'none';
        } else {
            actions.style.display = 'none';
            subActions.style.display = 'flex';
        }
    }

    showMessage(text) {
        document.getElementById('message').textContent = text;
    }

    showIncomeToast(playerNum, inc) {
        const container = document.getElementById('board-container');
        const toast = document.createElement('div');
        toast.className = 'income-toast';
        let parts = [`基础+${inc.base}`];
        if (inc.middle > 0) parts.push(`领地+${this.fmt(inc.middle)}`);
        if (inc.farm > 0) parts.push(`屯田+${inc.farm}`);
        toast.textContent = `玩家${this.pName(playerNum)}: ${parts.join(' ')} = +${this.fmt(inc.total)}`;
        toast.style.left = playerNum === 1 ? '25%' : '75%';
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 1800);
    }

    // ===== Utilities =====
    isAdjacent(r1, c1, r2, c2) { return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1; }
    fmt(n) { return n % 1 === 0 ? String(n) : n.toFixed(1); }
    pName(p) { return p === 1 ? this.p1Name : this.p2Name; }

    addLog(msg) {
        this.log.push(`[回合${this.turn}] ${msg}`);
        console.log(this.log[this.log.length - 1]);
    }

    restart() {
        document.getElementById('gameover').style.display = 'none';
        if (this.onlineMode) {
            // In online mode, restart not supported — go back to menu
            backToMenu();
            return;
        }
        this.init();
    }

    // ===== State Serialization (for online sync) =====
    getState() {
        return {
            grid: this.grid.map(row => row.map(c => ({ owner: c.owner, troops: c.troops, movedTroops: c.movedTroops }))),
            players: JSON.parse(JSON.stringify(this.players)),
            currentPlayer: this.currentPlayer,
            turn: this.turn,
            isFirstTurn: this.isFirstTurn,
            gameOver: this.gameOver || false,
            winner: this.winner || 0, // 0 = no winner (Firebase rejects null/undefined)
            log: this.log.slice(-20) // Keep last 20 entries
        };
    }

    loadState(state) {
        for (let r = 0; r < this.ROWS; r++)
            for (let c = 0; c < this.COLS; c++)
                this.grid[r][c] = state.grid[r][c];
        this.players[1] = state.players[1] || state.players['1'];
        this.players[2] = state.players[2] || state.players['2'];
        this.currentPlayer = state.currentPlayer;
        this.turn = state.turn;
        this.isFirstTurn = state.isFirstTurn;
        this.gameOver = state.gameOver || false;
        this.winner = state.winner || null; // 0 → null
        this.log = state.log || [];
        this.phase = this.gameOver ? 'game_over' : 'action';
        this.turnAction = null;
        this.selectedCell = null;
        this.targetCell = null;
    }

    applyRemoteState(state) {
        if (!state || !state.grid) return;
        // Only apply when it becomes my turn or game is over
        // This naturally ignores echoes of our own push (which have opponent as currentPlayer)
        if (state.currentPlayer !== this.myPlayer && !state.gameOver) return;

        this.loadState(state);
        if (this.gameOver) {
            this.endGame();
        }
        this.render();
    }
}

// ===== Global =====
let game;
