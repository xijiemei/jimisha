const Net = {
    peer: null,
    conn: null,
    connections: [],
    isHost: false,
    mpPlayers: [],
    roomId: '',
    roomName: '',
    suppressHostClose: false,
    MAX_PLAYERS: 5,
    targetPlayers: 5,
    battleMode: 'classic',
    broadcastTimer: null,
    broadcastDelay: 50,
    config: {
        debug: 1,
        config: {
            iceServers: [
                { urls: "stun:stun.relay.metered.ca:80" },
                { urls: "turn:global.relay.metered.ca:80", username: "ad60583412217f8af430d3b0", credential: "Au7tJr1/DnuwhcYz" },
                { urls: "turn:global.relay.metered.ca:80?transport=tcp", username: "ad60583412217f8af430d3b0", credential: "Au7tJr1/DnuwhcYz" },
                { urls: "turn:global.relay.metered.ca:443", username: "ad60583412217f8af430d3b0", credential: "Au7tJr1/DnuwhcYz" },
                { urls: "turns:global.relay.metered.ca:443?transport=tcp", username: "ad60583412217f8af430d3b0", credential: "Au7tJr1/DnuwhcYz" }
            ]
        }
    },

    setupMP: function() {
        Game.showScreen('screen-mp-login');
        this.setStatus('net-status', '不填猫窝 ID 会自动生成短 ID，也可以自己设置。');
    },

    createRoom: function() {
        if (!this.ensurePeerReady()) return;
        this.resetSession();

        let name = this.getPlayerName();
        if (!name) {
            this.setStatus('net-status', '请先填写自己的名字。', 'danger');
            return;
        }
        let roomName = this.getRoomName();
        let desiredId = this.getDesiredRoomId();
        if (!desiredId) desiredId = this.generateRoomId();
        this.setStatus('net-status', `正在建立猫窝 ${desiredId}...`, 'warn');

        this.peer = new Peer(desiredId, this.config);
        this.bindPeerEvents(this.peer);
        this.peer.on('open', id => {
            this.isHost = true;
            this.roomId = id;
            this.roomName = roomName;
            this.battleMode = this.getBattleMode();
            this.targetPlayers = this.getTargetPlayers();
            Game.battleMode = this.battleMode;
            Game.mode = 'MP';
            Game.myId = 0;
            this.mpPlayers = [{ id: 0, name, peerId: id, ready: false, isHost: true, online: true }];
            Game.showScreen('screen-mp-lobby');
            this.setLobbyRoomInfo(id, roomName, true);
            this.setStatus('lobby-status', '猫窝已建好，等朋友加入后就能发车。', 'success');
            this.updateLobby();
            this.peer.on('connection', c => this.bindHostConnection(c));
        });
    },

    joinRoom: function() {
        if (!this.ensurePeerReady()) return;

        let name = this.getPlayerName();
        if (!name) {
            this.setStatus('net-status', '请先填写自己的名字。', 'danger');
            return;
        }
        let hostId = this.sanitizeRoomId(document.getElementById('mp-room-id').value || '');
        if (!hostId) {
            this.setStatus('net-status', '请输入猫窝 ID。', 'danger');
            return;
        }

        this.resetSession();
        this.setStatus('net-status', '正在钻进猫窝...', 'warn');
        this.peer = new Peer(null, this.config);
        this.bindPeerEvents(this.peer);
        this.peer.on('open', id => {
            this.conn = this.peer.connect(hostId, { reliable: true });
            this.bindClientConnection(this.conn, name, id);
        });
    },

    bindHostConnection: function(c) {
        this.connections = this.connections.filter(old => old !== c);
        this.connections.push(c);
        c.on('data', d => this.handleHostData(c, d));
        c.on('close', () => this.handleGuestLeft(c, '连接断开'));
        c.on('error', () => this.handleGuestLeft(c, '连接异常'));
    },

    bindClientConnection: function(c, name, peerId) {
        c.on('open', () => {
            this.suppressHostClose = false;
            c.send({ type: 'JOIN', name, peerId });
            this.setStatus('net-status', '已连上猫窝，等待房主确认...', 'warn');
        });
        c.on('data', d => this.handleClientData(d));
        c.on('close', () => this.handleHostDisconnected());
        c.on('error', err => {
            this.setStatus('net-status', this.formatPeerError(err), 'danger');
            this.handleHostDisconnected();
        });
    },

    bindPeerEvents: function(peer) {
        peer.on('error', err => {
            let msg = this.formatPeerError(err);
            this.setAllStatus(msg, 'danger');
            if (!this.isHost) this.showBlockingNotice('联机失败', msg);
        });
        peer.on('disconnected', () => {
            this.setAllStatus('中转站连接不稳定，正在保留当前房间。', 'warn');
        });
    },

    handleHostData: function(c, d) {
        if (!d || typeof d.type !== 'string') return;
        let p = this.mpPlayers.find(x => x.peerId === c.peer);

        if (d.type === 'JOIN') {
            this.acceptJoin(c, d);
            return;
        }

        if (!p || p.online === false) return;

        if (d.type === 'SELECT_HERO') {
            this.acceptHeroSelection(c, p, d.heroId);
        } else if (d.type === 'ACT') {
            let gamePlayer = Game.gameState.players.find(gp => gp.peerId === c.peer);
            if (Game.gameState.teamMode) {
                let team = (Game.gameState.teams || []).find(t => t.peerId === c.peer);
                gamePlayer = Game.gameState.players.find(gp => gp.id === team?.activeId) || Game.gameState.players.find(gp => gp.teamId === team?.id) || gamePlayer;
            }
            if (gamePlayer && Game.handleActionInternal(gamePlayer, d.payload || {})) {
                this.scheduleBroadcast();
                return;
            }
            else this.send(c, { type: 'NOTICE', message: '现在还不能这样出牌。', tone: 'warn' });
        } else if (d.type === 'RESP') {
            let gamePlayer = Game.gameState.players.find(gp => gp.peerId === c.peer);
            if (Game.gameState.teamMode && Game.gameState.pendingAction) {
                let team = (Game.gameState.teams || []).find(t => t.peerId === c.peer);
                let target = Game.gameState.players.find(gp => gp.id === Game.gameState.pendingAction.targetId);
                if (team && target && target.teamId === team.id) gamePlayer = target;
            }
            if (gamePlayer) {
                Game.resolveResponse(gamePlayer.id, d.choice);
                this.scheduleBroadcast();
            }
        }
    },

    handleClientData: function(d) {
        if (!d || typeof d.type !== 'string') return;

        if (d.type === 'JOIN_OK') {
            Game.mode = 'MP';
            this.roomId = d.roomId || '';
            this.roomName = d.roomName || '猫窝';
            Game.showScreen('screen-mp-lobby');
            this.setLobbyRoomInfo(d.roomId || '已连接', this.roomName, false);
            this.setStatus('lobby-status', '已进入猫窝，等待房主开始。', 'success');
        } else if (d.type === 'JOIN_DENIED') {
            let reason = d.reason || '加入失败。';
            this.setStatus('net-status', reason, 'danger');
            let oldConn = this.conn;
            this.conn = null;
            this.suppressHostClose = true;
            if (oldConn) oldConn.close();
            setTimeout(() => { this.suppressHostClose = false; }, 100);
            Game.showScreen('screen-mp-login');
        } else if (d.type === 'NOTICE') {
            this.setAllStatus(d.message || '', d.tone || 'warn');
        } else if (d.type === 'HERO_REJECT') {
            this.setHeroWaitMessage(d.reason || '这个猫将已经被领养了，换一只吧。', true);
        } else if (d.type === 'LOBBY') {
            this.mpPlayers = d.players || [];
            this.roomName = d.roomName || this.roomName || '猫窝';
            this.targetPlayers = d.targetPlayers || this.targetPlayers || 5;
            this.battleMode = d.battleMode || 'classic';
            Game.battleMode = this.battleMode;
            if (d.roomId) this.roomId = d.roomId;
            this.setLobbyRoomInfo(this.roomId || '已连接', this.roomName, false);
            let active = document.querySelector('.screen.active')?.id;
            if (active === 'screen-mp-login' || active === 'screen-mp-lobby') Game.showScreen('screen-mp-lobby');
            this.updateLobbyUI();
            document.getElementById('host-controls').style.display = 'none';
            document.getElementById('guest-msg').style.display = 'block';
            let me = this.mpPlayers.find(p => this.peer && p.peerId === this.peer.id);
            if (me) Game.myId = me.id;
        } else if (d.type === 'GOTO_SELECT') {
            Game.mode = 'MP';
            this.battleMode = d.battleMode || this.battleMode || 'classic';
            Game.battleMode = this.battleMode;
            Game.selectedHeroId = null;
            Game.selectedHeroIds = [];
            Game.renderHeroSelect();
            this.updateSelectCountUI(d.count || 0);
            this.setHeroWaitMessage('选好猫将后，等待所有玩家准备。', false);
        } else if (d.type === 'SELECT_COUNT') {
            this.updateSelectCountUI(d.count || 0);
        } else if (d.type === 'GAME') {
            Game.gameState = d.state;
            Game.showScreen('screen-game');
            if (Game.gameState.teamMode) {
                let team = (Game.gameState.teams || []).find(t => this.peer && t.peerId === this.peer.id);
                if (team) Game.myTeamId = team.id;
            } else {
                let me = Game.gameState.players.find(p => this.peer && p.peerId === this.peer.id);
                if (me) Game.myId = me.id;
            }
            Game.renderGame(Game.gameState);
        }
    },

    acceptJoin: function(c, d) {
        if (Game.gameState.started) {
            this.send(c, { type: 'JOIN_DENIED', reason: '这局已经开始了，请下一局再加入。' });
            return;
        }
        if (this.mpPlayers.length >= this.targetPlayers && !this.mpPlayers.some(p => p.peerId === c.peer)) {
            this.send(c, { type: 'JOIN_DENIED', reason: '猫窝已经满员了。' });
            return;
        }

        let existing = this.mpPlayers.find(p => p.peerId === c.peer);
        if (existing) {
            existing.name = this.sanitizeName(d.name, existing.name || '访客');
            existing.online = true;
            this.send(c, { type: 'JOIN_OK', roomId: this.roomId, roomName: this.roomName, id: existing.id });
            this.updateLobby();
            return;
        }

        let newId = this.mpPlayers.length;
        let name = this.sanitizeName(d.name, '访客');
        this.mpPlayers.push({ id: newId, name, peerId: c.peer, ready: false, isHost: false, online: true });
        this.send(c, { type: 'JOIN_OK', roomId: this.roomId, roomName: this.roomName, id: newId });
        this.setStatus('lobby-status', `${name} 进窝了。`, 'success');
        this.updateLobby();
    },

    acceptHeroSelection: function(c, p, heroId) {
        if (!this.isValidHeroSelection(heroId)) {
            this.send(c, { type: 'HERO_REJECT', reason: this.battleMode === 'team3' ? '请选择三只不同猫将。' : '这个猫将不存在，换一只吧。' });
            return;
        }
        if (this.isHeroTaken(heroId, p.peerId)) {
            this.send(c, { type: 'HERO_REJECT', reason: '这个猫将已经被领养了，换一只吧。' });
            return;
        }

        p.hero = heroId;
        p.ready = true;
        this.send(c, { type: 'NOTICE', message: '选将成功，等其他猫咪准备。', tone: 'success' });
        this.updateSelectCount();
    },

    handleGuestLeft: function(c, reason) {
        if (!this.isHost || !c) return;
        this.connections = this.connections.filter(item => item !== c);
        if (this.connections.some(item => item.peer === c.peer && item.open)) return;

        let lobbyPlayer = this.mpPlayers.find(p => p.peerId === c.peer && !p.isBot);
        if (!lobbyPlayer) return;

        let gamePlayer = Game.gameState.players.find(p => p.peerId === c.peer);
        if (Game.gameState.started && gamePlayer) {
            lobbyPlayer.online = false;
            gamePlayer.disconnected = true;
            gamePlayer.isBot = true;
            Game.log(`${gamePlayer.name} 掉线，已交给机器猫托管`);
            this.announceHostNotice(`${lobbyPlayer.name} 掉线，已自动托管。`, 'warn');
            Game.updateAll();
            return;
        }

        this.mpPlayers = this.mpPlayers.filter(p => p.peerId !== c.peer);
        this.reindexPlayers();
        this.announceHostNotice(`${lobbyPlayer.name} 离开了猫窝。`, 'warn');
        this.updateLobby();
        if (reason) this.setStatus('lobby-status', `${lobbyPlayer.name} ${reason}。`, 'warn');
    },

    handleHostDisconnected: function() {
        if (this.isHost) return;
        if (this.suppressHostClose) {
            this.suppressHostClose = false;
            return;
        }
        if (!this.conn && !Game.gameState.started) return;
        this.setAllStatus('与房主断开了，当前联机已结束。', 'danger');
        if (Game.gameState.started) this.showBlockingNotice('连接断开', '与房主断开了，当前联机已结束。');
    },

    updateLobby: function() {
        this.updateLobbyUI();
        if (this.isHost) {
            document.getElementById('host-controls').style.display = 'block';
            document.getElementById('guest-msg').style.display = 'none';
            let addBotBtn = document.querySelector('#host-controls .btn-warn');
            let removeBotBtn = document.querySelector('#host-controls .btn-danger');
            if (addBotBtn) addBotBtn.style.display = this.targetPlayers === 2 ? 'none' : 'inline-block';
            if (removeBotBtn) removeBotBtn.style.display = this.targetPlayers === 2 ? 'none' : 'inline-block';
            let startBtn = document.getElementById('btn-mp-start');
            startBtn.disabled = this.mpPlayers.length !== this.targetPlayers;
            startBtn.innerText = `开始吸猫(需${this.targetPlayers}位)`;
            this.broadcastLobby();
        } else {
            document.getElementById('host-controls').style.display = 'none';
            document.getElementById('guest-msg').style.display = 'block';
        }
    },

    updateLobbyUI: function() {
        let g = document.getElementById('lobby-list');
        if (!g) return;
        g.innerHTML = '';
        this.mpPlayers.forEach(p => {
            let card = document.createElement('div');
            card.className = `lobby-card ${p.online === false ? 'offline' : ''}`;

            let tag = document.createElement('div');
            tag.className = `lobby-tag ${p.online === false ? 'tag-offline' : (p.isBot ? 'tag-bot' : 'tag-online')}`;
            tag.innerText = p.online === false ? '离线' : (p.isBot ? 'Bot' : '在线');

            let avatar = document.createElement('div');
            avatar.className = 'lobby-avatar';
            avatar.innerText = p.isHost ? '👑' : (p.isBot ? '🤖' : (p.online === false ? '💤' : '🐱'));

            let name = document.createElement('div');
            name.className = 'lobby-name';
            name.innerText = p.name;

            card.appendChild(tag);
            card.appendChild(avatar);
            card.appendChild(name);
            g.appendChild(card);
        });
        document.getElementById('player-count').innerText = this.mpPlayers.length;
        let target = document.getElementById('target-count');
        if (target) target.innerText = this.targetPlayers;
    },

    addBot: function() {
        if (this.targetPlayers === 2) {
            this.setStatus('lobby-status', '双猫对哈只等真人猫友，不塞机器猫。', 'warn');
            return;
        }
        if (!this.isHost || this.mpPlayers.length >= this.targetPlayers) return;
        let ks = this.getAvailableHeroes();
        let randHero = ks[Math.floor(Math.random() * ks.length)];
        let botNo = this.mpPlayers.filter(p => p.isBot).length + 1;
        this.mpPlayers.push({
            id: this.mpPlayers.length,
            name: `Bot${botNo}`,
            peerId: `BOT_${Date.now()}_${Math.random()}`,
            ready: true,
            isBot: true,
            online: true,
            hero: randHero
        });
        this.updateLobby();
    },

    removeBot: function() {
        if (!this.isHost) return;
        for (let i = this.mpPlayers.length - 1; i >= 0; i--) {
            if (this.mpPlayers[i].isBot) {
                this.mpPlayers.splice(i, 1);
                this.reindexPlayers();
                this.updateLobby();
                break;
            }
        }
    },

    hostStartSelect: function() {
        if (!this.isHost) return;
        this.battleMode = this.getBattleMode();
        Game.battleMode = this.battleMode;
        if (this.mpPlayers.length !== this.targetPlayers) {
            this.setStatus('lobby-status', `需要 ${this.targetPlayers} 位玩家或机器猫才能开始。`, 'danger');
            return;
        }

        this.mpPlayers.forEach((p, idx) => {
            p.id = idx;
            if (!p.isBot) {
                p.ready = false;
                p.hero = '';
            }
        });

        this.sendToGuests({ type: 'GOTO_SELECT', count: this.getReadyCount(), battleMode: this.battleMode });
        Game.mode = 'MP';
        Game.myId = 0;
        Game.myTeamId = 0;
        Game.selectedHeroId = null;
        Game.selectedHeroIds = [];
        Game.renderHeroSelect();
        this.updateSelectCount();
    },

    getReadyCount: function() {
        return this.mpPlayers.filter(p => p.ready).length;
    },

    updateSelectCount: function() {
        let count = this.getReadyCount();
        this.updateSelectCountUI(count);
        this.sendToGuests({ type: 'SELECT_COUNT', count });
        this.checkReady();
    },

    updateSelectCountUI: function(c) {
        let el = document.getElementById('ready-count-disp');
        if (el) el.innerText = c;
        let target = document.getElementById('ready-target-count');
        if (target) target.innerText = this.targetPlayers;
    },

    checkReady: function() {
        if (!this.isHost || this.mpPlayers.length !== this.targetPlayers) return;
        if (this.mpPlayers.every(p => p.ready && this.isValidHeroSelection(p.hero))) {
            let ps = this.battleMode === 'team3'
                ? Game.createTeamBattlePlayers(this.mpPlayers)
                : this.mpPlayers.map(p => {
                    let pl = Game.createPlayer(p.id, p.name, !!p.isBot);
                    pl.peerId = p.peerId;
                    pl.hero = p.hero;
                    return pl;
                });
            Game.showScreen('screen-game');
            if (this.battleMode === 'team3') Game.initTeamBattleLogic(ps.players, ps.teams);
            else if (this.battleMode === 'explosion') Game.initExplosionLogic(ps);
            else Game.initGameLogic(ps);
        }
    },

    scheduleBroadcast: function() {
        if (!this.isHost) return;
        if (this.broadcastTimer) return;
        this.broadcastTimer = setTimeout(() => {
            this.broadcastTimer = null;
            this.broadcast();
        }, this.broadcastDelay);
    },

    broadcast: function() {
        if (!this.isHost) return;
        let fullState = this.clone(Game.gameState);
        Game.renderGame(fullState);
        this.connections.forEach(c => {
            if (c.open) this.send(c, { type: 'GAME', state: this.sanitizeStateForPeer(fullState, c.peer) });
        });
    },

    broadcastLobby: function() {
        this.sendToGuests({ type: 'LOBBY', players: this.clone(this.mpPlayers), roomId: this.roomId, roomName: this.roomName, targetPlayers: this.targetPlayers, battleMode: this.battleMode });
    },

    sendAction: function(type, payload) {
        if (Game.mode === 'SP') {
            let me = Game.getControlledPlayer ? Game.getControlledPlayer(Game.gameState) : Game.gameState.players.find(p => p.id === Game.myId);
            Game.handleActionInternal(me, { type, ...(payload || {}) });
        } else if (this.isHost) {
            let me = Game.getControlledPlayer ? Game.getControlledPlayer(Game.gameState) : Game.gameState.players.find(p => p.id === Game.myId);
            if (Game.handleActionInternal(me, { type, ...(payload || {}) })) this.scheduleBroadcast();
        } else if (this.conn && this.conn.open) {
            this.conn.send({ type: 'ACT', payload: { type, ...(payload || {}) } });
        } else {
            this.showBlockingNotice('连接断开', '还没有连上房主，不能出牌。');
        }
    },

    sendResp: function(choice) {
        if (Game.mode === 'SP') {
            Game.resolveResponse(Game.myId, choice);
        } else if (this.isHost) {
            Game.resolveResponse(Game.myId, choice);
            this.scheduleBroadcast();
        } else if (this.conn && this.conn.open) {
            this.conn.send({ type: 'RESP', choice });
        } else {
            this.showBlockingNotice('连接断开', '还没有连上房主，不能响应。');
        }
    },

    sendSelectHero: function(heroId) {
        if (!this.isValidHeroSelection(heroId)) {
            this.setHeroWaitMessage(this.battleMode === 'team3' ? '请选择三只猫将。' : '请选择一个猫将。', true);
            return;
        }

        if (this.isHost) {
            let me = this.mpPlayers[0];
            if (this.isHeroTaken(heroId, me.peerId)) {
                this.setHeroWaitMessage('这个猫将已经被领养了，换一只吧。', true);
                return;
            }
            me.hero = heroId;
            me.ready = true;
            this.setHeroWaitMessage('选将成功，等其他猫咪准备。', false);
            this.updateSelectCount();
        } else if (this.conn && this.conn.open) {
            this.conn.send({ type: 'SELECT_HERO', heroId });
            this.setHeroWaitMessage('已提交，等待房主同步。', false);
        } else {
            this.setHeroWaitMessage('连接断开了，请返回重新加入。', true);
        }
    },

    sanitizeStateForPeer: function(state, peerId) {
        let s = this.clone(state);
        if (s.teamMode && Array.isArray(s.teams)) {
            s.teams.forEach(t => {
                if (t.peerId !== peerId) {
                    let handCount = Array.isArray(t.hand) ? t.hand.length : 0;
                    t.hand = Array.from({ length: handCount }, () => ({ name: '???', type: 'unknown', img: '', suit: '', color: '' }));
                }
            });
        }
        s.players.forEach(p => {
            let isSelf = p.peerId === peerId;
            if (!isSelf) {
                let handCount = Array.isArray(p.hand) ? p.hand.length : 0;
                p.hand = Array.from({ length: handCount }, () => ({ name: '???', type: 'unknown', img: '', suit: '', color: '' }));
                if (!s.teamMode && s.battleMode !== 'explosion' && p.alive && p.role !== '喵皇') p.role = '???';
            }
        });
        return s;
    },

    showBlockingNotice: function(title, message) {
        let panel = document.getElementById('response-panel');
        if (!panel) return alert(message);
        panel.style.display = 'block';
        Game.setTx('resp-title', title);
        Game.setTx('resp-msg', message);
        let btns = document.getElementById('resp-btns');
        btns.innerHTML = '';
        Game.addBtn(btns, '回到主菜单', true, 'primary', () => location.reload());
    },

    announceHostNotice: function(message, tone) {
        this.setStatus('lobby-status', message, tone || 'warn');
        this.sendToGuests({ type: 'NOTICE', message, tone: tone || 'warn' });
    },

    sendToGuests: function(message) {
        this.connections.forEach(c => {
            if (c.open) this.send(c, message);
        });
    },

    send: function(c, message) {
        try {
            if (c && c.open) c.send(message);
        } catch (e) {
            console.warn('Send failed', e);
        }
    },

    setLobbyRoomInfo: function(id, roomName, canCopy) {
        let title = document.getElementById('lobby-room-name');
        if (title) title.innerText = roomName || '猫窝';
        let room = document.getElementById('lobby-room-id');
        if (room) room.innerText = id;
        let copy = document.getElementById('btn-copy-room');
        if (copy) copy.style.display = canCopy ? 'inline-block' : 'none';
    },

    copyRoomId: function() {
        let id = this.roomId || document.getElementById('lobby-room-id')?.innerText || '';
        if (!id || id === '已连接') return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(id).then(() => {
                this.setStatus('lobby-status', '猫窝 ID 已复制。', 'success');
            }).catch(() => prompt('复制猫窝 ID', id));
        } else {
            prompt('复制猫窝 ID', id);
        }
    },

    resetSession: function() {
        this.suppressHostClose = true;
        this.connections.forEach(c => { try { c.close(); } catch (e) {} });
        let oldConn = this.conn;
        this.conn = null;
        if (this.broadcastTimer) {
            clearTimeout(this.broadcastTimer);
            this.broadcastTimer = null;
        }
        if (oldConn) { try { oldConn.close(); } catch (e) {} }
        if (this.peer && !this.peer.destroyed) { try { this.peer.destroy(); } catch (e) {} }
        this.peer = null;
        this.connections = [];
        this.isHost = false;
        this.mpPlayers = [];
        this.roomId = '';
        this.roomName = '';
        this.targetPlayers = 5;
        this.battleMode = 'classic';
        setTimeout(() => { this.suppressHostClose = false; }, 100);
    },

    reindexPlayers: function() {
        this.mpPlayers.forEach((p, idx) => p.id = idx);
    },

    getAvailableHeroes: function() {
        let used = this.mpPlayers.filter(p => p.ready && p.hero).flatMap(p => Array.isArray(p.hero) ? p.hero : [p.hero]);
        let heroes = Object.keys(HEROES).filter(id => !used.includes(id));
        return heroes.length ? heroes : Object.keys(HEROES);
    },

    isHeroTaken: function(heroId, peerId) {
        if (this.battleMode === 'team3') return false;
        return this.mpPlayers.some(p => p.ready && p.hero === heroId && p.peerId !== peerId);
    },

    isValidHero: function(heroId) {
        return !!(heroId && HEROES[heroId]);
    },

    getTargetPlayers: function() {
        let el = document.getElementById('mp-match-size');
        if (el && el.value === 'team3') return 2;
        if (el && String(el.value).startsWith('boom')) return Math.max(2, Math.min(4, Number(String(el.value).replace('boom', '')) || 2));
        let n = Number(el ? el.value : 5);
        return n === 2 ? 2 : 5;
    },
    getBattleMode: function() {
        let el = document.getElementById('mp-match-size');
        if (el && el.value === 'team3') return 'team3';
        return el && String(el.value).startsWith('boom') ? 'explosion' : 'classic';
    },

    isValidHeroSelection: function(hero) {
        if (this.battleMode === 'team3') {
            return Array.isArray(hero) && hero.length === 3 && new Set(hero).size === 3 && hero.every(h => this.isValidHero(h));
        }
        return this.isValidHero(hero);
    },

    getPlayerName: function(fallback) {
        let raw = document.getElementById('mp-username')?.value;
        return this.sanitizeName(raw, fallback || '');
    },

    getRoomName: function() {
        let raw = document.getElementById('mp-room-name')?.value;
        let roomName = String(raw || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
        return (roomName || '基米猫窝').slice(0, 12);
    },

    getDesiredRoomId: function() {
        return this.sanitizeRoomId(document.getElementById('mp-custom-room-id')?.value || '');
    },

    generateRoomId: function() {
        return `kimi-${Math.floor(1000 + Math.random() * 9000)}`;
    },

    sanitizeRoomId: function(raw) {
        return String(raw || '')
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9_-]/g, '')
            .slice(0, 18);
    },

    sanitizeName: function(raw, fallback) {
        let name = String(raw || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
        if (!name) name = fallback;
        return name.slice(0, 8);
    },

    ensurePeerReady: function() {
        if (typeof Peer === 'undefined') {
            this.setStatus('net-status', '联机库没有加载成功，请联网后刷新页面。', 'danger');
            return false;
        }
        return true;
    },

    formatPeerError: function(err) {
        let type = err && err.type;
        if (type === 'peer-unavailable') return '找不到这个猫窝，请检查 ID 是否复制完整。';
        if (type === 'unavailable-id') return '这个猫窝 ID 已被占用，请重新建立。';
        if (type === 'network' || type === 'server-error' || type === 'socket-error') return '中转站连接失败，请检查网络后重试。';
        if (type === 'webrtc') return '点对点连接失败，换个网络或浏览器试试。';
        return '联机出现异常，请刷新后重试。';
    },

    setHeroWaitMessage: function(message, allowRetry) {
        let wait = document.getElementById('wait-msg');
        if (wait) wait.innerText = message;
        let btn = document.getElementById('btn-confirm-hero');
        if (btn && allowRetry) btn.disabled = false;
    },

    setStatus: function(id, message, tone) {
        let el = document.getElementById(id);
        if (!el) return;
        el.innerText = message || '';
        el.className = `net-status ${tone || ''}`.trim();
    },

    setAllStatus: function(message, tone) {
        this.setStatus('net-status', message, tone);
        this.setStatus('lobby-status', message, tone);
    },

    clone: function(value) {
        return JSON.parse(JSON.stringify(value));
    }
};
